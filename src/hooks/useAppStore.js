import { useEffect, useRef, useState } from 'react';
import { loadCachedState, saveState } from '../utils/storage';
import { getCloudState, subscribeToCloudState, updateCloudState } from '../services/cloudStateService';
import { createDebouncedCloudSaver, createRealtimeStateCoordinator, loadCloudPrimaryState, migrateCloudRow } from '../services/cloudPersistenceService';
export function useAppStore(session) {
  const userId = session?.user?.id;
  const accessToken = session?.access_token;
  const [state,setState] = useState(null);
  const [cloudStatus,setCloudStatus] = useState('loading');
  const [cloudError,setCloudError] = useState(null);
  const [cloudUpdatedAt,setCloudUpdatedAt] = useState(null);
  const [realtimeStatus,setRealtimeStatus] = useState('CONNECTING');
  const [lastRealtimeEvent,setLastRealtimeEvent] = useState(null);
  const [lastRemoteUpdatedAt,setLastRemoteUpdatedAt] = useState(null);
  const saverRef = useRef(null);
  const lastCloudUpdateRef = useRef(null);
  const applyAppState = (nextOrUpdater, { suppressCloudWrite = false } = {}) => {
    setState(current => {
      const next = typeof nextOrUpdater === 'function' ? nextOrUpdater(current) : nextOrUpdater;
      saveState(next);
      if (!suppressCloudWrite) saverRef.current?.queue(next);
      return next;
    });
  };
  useEffect(() => {
    let active = true;
    let removeRealtime = null;
    let subscribedOnce = false;
    setState(null);
    setCloudStatus('loading');
    setCloudError(null);
    setCloudUpdatedAt(null);
    setRealtimeStatus('CONNECTING');
    setLastRealtimeEvent(null);
    setLastRemoteUpdatedAt(null);
    loadCloudPrimaryState({ fetchCloud: getCloudState, loadCache: loadCachedState, saveCache: saveState })
      .then(result => {
        if (!active) return;
        setState(result.state);
        setCloudStatus(result.status);
        setCloudError(result.error || null);
        setCloudUpdatedAt(result.updatedAt || null);
        lastCloudUpdateRef.current = result.updatedAt || null;
        if (result.cloudWritable) {
          saverRef.current = createDebouncedCloudSaver({
            saveCloud: async next => {
              const row = await updateCloudState(next);
              if (active) {
                lastCloudUpdateRef.current = row.updated_at || null;
                setCloudUpdatedAt(row.updated_at || null);
              }
            },
            onStatus(status,error) { if (active) { setCloudStatus(status === 'saved' && subscribedOnce ? 'live' : status); setCloudError(error || null); } },
          });
          const coordinator = createRealtimeStateCoordinator({
            saver: saverRef.current,
            fetchCloud: getCloudState,
            migrateRow: migrateCloudRow,
            getLastUpdatedAt: () => lastCloudUpdateRef.current,
            applyRemote(next, updatedAt) {
              if (!active) return;
              applyAppState(next, { suppressCloudWrite: true });
              lastCloudUpdateRef.current = updatedAt;
              setCloudUpdatedAt(updatedAt);
              setCloudStatus('live');
              setCloudError(null);
            },
            onError(error) {
              if (!active) return;
              console.error('[cloud persistence] Realtime reconciliation failed.', {
                message: error?.message || String(error), code: error?.code, status: error?.status,
              });
              setCloudStatus('sync_error');
              setCloudError(error);
            },
          });
          subscribeToCloudState({
            userId,
            accessToken,
            onUpdate: row => {
              if (!active) return;
              setLastRealtimeEvent(new Date().toISOString());
              setLastRemoteUpdatedAt(row.updated_at || null);
              coordinator.receive(row);
            },
            onStatus: (status, error) => {
              if (!active) return;
              setRealtimeStatus(status);
              if (status === 'SUBSCRIBED') {
                const reconnect = subscribedOnce;
                subscribedOnce = true;
                setCloudStatus('live');
                setCloudError(null);
                if (reconnect) coordinator.refetch();
              } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
                setCloudStatus(status === 'CHANNEL_ERROR' ? 'sync_error' : 'offline');
                setCloudError(error || null);
              }
            },
          }).then(remove => {
            if (active) removeRealtime = remove;
            else remove();
          }).catch(error => {
            if (!active) return;
            console.error('[cloud persistence] Realtime subscription failed.', {
              message: error?.message || String(error), code: error?.code, status: error?.status,
            });
            setCloudStatus('sync_error');
            setCloudError(error);
            setRealtimeStatus('CHANNEL_ERROR');
          });
        }
      });
    return () => { active = false; removeRealtime?.(); saverRef.current?.cancel(); saverRef.current = null; };
  }, [userId, accessToken]);
  const update = updater => applyAppState(updater);
  return { state, update, ready: Boolean(state), cloudStatus, cloudError, cloudUpdatedAt, realtimeStatus, lastRealtimeEvent, lastRemoteUpdatedAt };
}
