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

export function migrateCloudState(state) {
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
    const state = migrateCloudState(row.state);
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
  const flush = async () => {
    timer = undefined;
    const state = latest;
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
    }
  };
  return {
    queue(state) {
      latest = state;
      onStatus('saving');
      clearTimeout(timer);
      timer = setTimeout(flush, delay);
    },
    cancel() { clearTimeout(timer); timer = undefined; },
    flush,
  };
}
