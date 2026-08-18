import { supabase, supabaseConfigurationError } from '../lib/supabase';

const TABLE = 'app_states';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const realtimeChannels = new Map();
const REQUIRED_STATE_FIELDS = [
  'schemaVersion',
  'academicCalendar',
  'teachingGroups',
  'courseMaps',
  'lessons',
  'weeklyTimetable',
  'bellSchedules',
  'teachingGroupCourseStates',
  'notes',
  'homeworkMaterials',
  'statusChanges',
];
const ARRAY_STATE_FIELDS = ['teachingGroups', 'lessons', 'weeklyTimetable', 'bellSchedules', 'homeworkMaterials', 'statusChanges'];
const OBJECT_STATE_FIELDS = ['academicCalendar', 'courseMaps', 'teachingGroupCourseStates', 'notes'];

async function authenticatedUserId() {
  if (!supabase) throw new Error(supabaseConfigurationError);
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!data.user?.id) throw new Error('You must be signed in to use cloud backup.');
  return data.user.id;
}

const recordFor = (userId, state) => ({
  user_id: userId,
  schema_version: Number(state.schemaVersion),
  state,
});

export async function getCloudState() {
  const userId = await authenticatedUserId();
  const { data, error } = await supabase
    .from(TABLE)
    .select('schema_version,state,updated_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function createCloudState(state) {
  const userId = await authenticatedUserId();
  const { data, error } = await supabase
    .from(TABLE)
    .insert(recordFor(userId, state))
    .select('schema_version,state,updated_at')
    .single();
  if (error) throw error;
  return data;
}

export async function updateCloudState(state) {
  const userId = await authenticatedUserId();
  const updatedAt = new Date().toISOString();
  const { data, error } = await supabase
    .from(TABLE)
    .update({ schema_version: Number(state.schemaVersion), state, updated_at: updatedAt })
    .eq('user_id', userId)
    .select('schema_version,state,updated_at')
    .single();
  if (error) throw error;
  verifyCloudState(data, state);
  return data;
}

export async function upsertCloudState(state) {
  const userId = await authenticatedUserId();
  const { data, error } = await supabase
    .from(TABLE)
    .upsert(recordFor(userId, state), { onConflict: 'user_id' })
    .select('schema_version,state,updated_at')
    .single();
  if (error) throw error;
  return data;
}

export async function subscribeToCloudState({ userId, accessToken, onUpdate, onStatus }) {
  if (!UUID.test(userId || '')) throw new Error('Cannot subscribe without a valid authenticated user ID.');
  if (!accessToken) throw new Error('Cannot subscribe without the authenticated session token.');
  await supabase.realtime.setAuth(accessToken);
  const existing = realtimeChannels.get(userId);
  if (existing) supabase.removeChannel(existing);
  const channel = supabase
    .channel(`app-state-${userId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: TABLE },
      payload => {
        if (payload.new?.user_id !== userId) return;
        if (import.meta.env.DEV) console.info('[cloud persistence] Realtime app_states UPDATE received');
        onUpdate(payload.new);
      },
    )
    .subscribe((status, error) => {
      if (import.meta.env.DEV) {
        const safeError = error ? { message: error.message || String(error), code: error.code, status: error.status } : undefined;
        console.info(`[cloud persistence] Realtime status: ${status}`, safeError);
      }
      onStatus(status, error);
    });
  realtimeChannels.set(userId, channel);
  return () => {
    if (realtimeChannels.get(userId) !== channel) return;
    realtimeChannels.delete(userId);
    return supabase.removeChannel(channel);
  };
}

export function cloudStateSummary(state) {
  return {
    teachingGroups: state.teachingGroups.length,
    courseMaps: Object.keys(state.courseMaps).length,
    lessons: state.lessons.length,
    weeklyTimetable: state.weeklyTimetable.length,
    bellSchedules: state.bellSchedules.length,
  };
}

export function verifyCloudState(row, localState) {
  if (!row?.state || typeof row.state !== 'object' || Array.isArray(row.state)) {
    throw new Error('The cloud copy does not contain a valid AppState object.');
  }
  const missing = REQUIRED_STATE_FIELDS.filter(field => !(field in row.state));
  if (missing.length) throw new Error(`The cloud copy is missing: ${missing.join(', ')}.`);
  const invalidCollections = [
    ...ARRAY_STATE_FIELDS.filter(field => !Array.isArray(row.state[field])),
    ...OBJECT_STATE_FIELDS.filter(field => !row.state[field] || typeof row.state[field] !== 'object' || Array.isArray(row.state[field])),
  ];
  if (invalidCollections.length) throw new Error(`The cloud copy has invalid fields: ${invalidCollections.join(', ')}.`);
  const local = cloudStateSummary(localState);
  const cloud = cloudStateSummary(row.state);
  if (Number(row.schema_version) !== Number(localState.schemaVersion)
    || Number(row.state.schemaVersion) !== Number(localState.schemaVersion)
    || Object.keys(local).some(key => local[key] !== cloud[key])) {
    throw new Error('Cloud verification failed because structural values do not match this device.');
  }
  if (canonicalJson(row.state) !== canonicalJson(localState)) {
    throw new Error('Cloud verification failed because the returned AppState does not match this device.');
  }
  return cloud;
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
