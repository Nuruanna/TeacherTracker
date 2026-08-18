import { useEffect, useRef, useState } from 'react';
import { loadCachedState, saveState } from '../utils/storage';
import { getCloudState, updateCloudState } from '../services/cloudStateService';
import { createDebouncedCloudSaver, loadCloudPrimaryState } from '../services/cloudPersistenceService';
export function useAppStore(userId) {
  const [state,setState] = useState(null);
  const [cloudStatus,setCloudStatus] = useState('loading');
  const [cloudError,setCloudError] = useState(null);
  const [cloudUpdatedAt,setCloudUpdatedAt] = useState(null);
  const saverRef = useRef(null);
  useEffect(() => {
    let active = true;
    setState(null);
    setCloudStatus('loading');
    setCloudError(null);
    setCloudUpdatedAt(null);
    loadCloudPrimaryState({ fetchCloud: getCloudState, loadCache: loadCachedState, saveCache: saveState })
      .then(result => {
        if (!active) return;
        setState(result.state);
        setCloudStatus(result.status);
        setCloudError(result.error || null);
        setCloudUpdatedAt(result.updatedAt || null);
        if (result.cloudWritable) {
          saverRef.current = createDebouncedCloudSaver({
            saveCloud: async next => {
              const row = await updateCloudState(next);
              if (active) setCloudUpdatedAt(row.updated_at || null);
            },
            onStatus(status,error) { if (active) { setCloudStatus(status); setCloudError(error || null); } },
          });
        }
      });
    return () => { active = false; saverRef.current?.cancel(); saverRef.current = null; };
  }, [userId]);
  const update = updater => setState(current => {
    const next=updater(current);
    saveState(next);
    saverRef.current?.queue(next);
    return next;
  });
  return { state, update, ready: Boolean(state), cloudStatus, cloudError, cloudUpdatedAt };
}
