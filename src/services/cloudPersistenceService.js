import { seedState } from '../data/seed';
import { migrateState } from '../utils/storage';

const clone = value => JSON.parse(JSON.stringify(value));
const REQUIRED_COLLECTIONS = ['teachingGroups', 'lessons', 'weeklyTimetable', 'bellSchedules'];

export function validateAppState(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) throw new Error('AppState is not a JSON object.');
  if (Number(state.schemaVersion) !== seedState.schemaVersion) throw new Error('AppState schema version is unsupported.');
  if (!state.academicCalendar || typeof state.academicCalendar !== 'object') throw new Error('AppState has no Academic Calendar.');
  if (!state.courseMaps || typeof state.courseMaps !== 'object' || Array.isArray(state.courseMaps)) throw new Error('AppState has invalid Course Maps.');
  const invalid = REQUIRED_COLLECTIONS.filter(field => !Array.isArray(state[field]));
  if (invalid.length) throw new Error(`AppState has invalid fields: ${invalid.join(', ')}.`);
  return state;
}

function decodeCloudState(row) {
  if (!row || typeof row !== 'object') throw new Error('Cloud AppState row is invalid.');
  let state = row.state;
  if (typeof state === 'string') {
    try { state = JSON.parse(state); }
    catch { throw new Error('Cloud AppState JSON is invalid.'); }
  }
  if (!state || typeof state !== 'object' || Array.isArray(state)) throw new Error('Cloud AppState is not a JSON object.');
  const appVersion = state.schemaVersion;
  const rowVersion = row.schema_version;
  const version = Number(appVersion ?? rowVersion);
  if (appVersion != null && rowVersion != null && Number(appVersion) !== Number(rowVersion)) {
    throw new Error('Cloud row and AppState schema versions do not match.');
  }
  return { ...state, schemaVersion: version };
}

export function migrateCloudRow(row) {
  const state = decodeCloudState(row);
  const version = Number(state?.schemaVersion);
  if (!Number.isInteger(version) || version < 1 || version > seedState.schemaVersion) {
    throw new Error('Cloud AppState schema version is unsupported.');
  }
  return validateAppState(migrateState(clone(state)));
}

export async function loadCloudPrimaryState({ fetchCloud, loadCache, saveCache }) {
  let row;
  try {
    row = await fetchCloud();
  } catch (error) {
    const cached = loadCache();
    const state = cached || clone(seedState);
    if (!cached) saveCache(state);
    return { state, status: 'offline', cloudWritable: false, source: cached ? 'cache' : 'seed', error };
  }
  if (!row) {
    const cached = loadCache();
    const state = cached || clone(seedState);
    if (!cached) saveCache(state);
    return { state, status: 'not_initialized', cloudWritable: false, source: cached ? 'cache' : 'seed' };
  }
  try {
    const state = migrateCloudRow(row);
    saveCache(state);
    return { state, status: 'saved', cloudWritable: true, source: 'cloud', updatedAt: row.updated_at };
  } catch (error) {
    const cached = loadCache();
    const state = cached || clone(seedState);
    if (!cached) saveCache(state);
    return { state, status: 'sync_error', cloudWritable: false, source: cached ? 'cache' : 'seed', error };
  }
}

export function createDebouncedCloudSaver({ saveCloud, delay = 750, onStatus }) {
  let timer;
  let latest;
  let inFlight;
  const flush = () => {
    if (inFlight) return inFlight.then(() => latest === undefined ? undefined : flush());
    if (latest === undefined) return Promise.resolve();
    clearTimeout(timer);
    timer = undefined;
    const state = latest;
    latest = undefined;
    inFlight = (async () => {
      try {
        await saveCloud(state);
        onStatus('saved');
      } catch (error) {
        console.error('[cloud persistence] Save failed.', {
          message: error?.message || String(error),
          code: error?.code,
          status: error?.status,
        });
        onStatus('sync_error', error);
        throw error;
      } finally {
        inFlight = undefined;
      }
    })();
    return inFlight;
  };
  return {
    queue(state) {
      latest = state;
      onStatus('saving');
      clearTimeout(timer);
      timer = setTimeout(() => { flush().catch(() => {}); }, delay);
    },
    cancel() { clearTimeout(timer); timer = undefined; latest = undefined; },
    isPending() { return Boolean(timer || inFlight || latest !== undefined); },
    flush,
  };
}

export function createRealtimeStateCoordinator({ saver, fetchCloud, migrateRow, getLastUpdatedAt, applyRemote, onError }) {
  let chain = Promise.resolve();
  const reconcile = async (receivedRow, refetch = false) => {
    const hadPendingSave = saver.isPending();
    if (hadPendingSave) await saver.flush();
    const row = refetch || hadPendingSave ? await fetchCloud() : receivedRow;
    if (!row) throw new Error('The cloud AppState row was not found during Realtime reconciliation.');
    if (row.updated_at && row.updated_at === getLastUpdatedAt()) return;
    const state = migrateRow(row);
    applyRemote(state, row.updated_at || null);
  };
  const enqueue = operation => {
    chain = chain.then(operation).catch(error => onError(error));
    return chain;
  };
  return {
    receive(row) { return enqueue(() => reconcile(row)); },
    refetch() { return enqueue(() => reconcile(null, true)); },
  };
}
