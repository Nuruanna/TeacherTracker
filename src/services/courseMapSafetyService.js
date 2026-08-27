import { supabase, supabaseConfigurationError } from '../lib/supabase';

const structuralKey = item => item?.sectionType === 'reading' || item?.sectionType === 'starter'
  ? `${item.sectionType}:0`
  : Number.isInteger(Number(item?.module)) && Number(item.module) > 0
    ? `module:${Number(item.module)}`
    : Number.isInteger(Number(item?.unit)) && Number(item.unit) > 0
      ? `unit:${Number(item.unit)}` : '';

export function localCourseMapItemReferences(state, courseMapId, itemId) {
  const references = [];
  if ((state.lessons || []).some(lesson => lesson.courseMapItemId === itemId)) references.push('materialized lessons');
  for (const group of (state.teachingGroups || []).filter(item => item.courseMapId === courseMapId && !item.archivedAt)) {
    const planned = state.courseMaps?.[courseMapId]?.items?.filter(item => item.type === 'lesson') || [];
    const itemIndex = planned.findIndex(item => item.id === itemId);
    const courseState = state.teachingGroupCourseStates?.[group.id];
    if (itemIndex >= 0 && itemIndex <= (courseState?.currentPosition || 0)) references.push('active class progress');
    if (Object.values(courseState?.lessonAssignments || {}).some(value => value?.courseMapItemId === itemId)) references.push('future lesson assignments');
    if ((courseState?.returnedPlannedLessons || []).some(value => value?.courseMapItemId === itemId)) references.push('returned or continued lessons');
  }
  return [...new Set(references)];
}

export function validateSafeCourseMapImport(state, courseMapId, incoming) {
  const current = state.courseMaps[courseMapId];
  const incomingById = new Map((incoming?.items || []).map(item => [item.id, item]));
  const errors = [];
  const removed = current.items.filter(item => !incomingById.has(item.id));
  if (removed.length) errors.push(`Import would remove existing item IDs: ${removed.map(item => item.id).join(', ')}.`);
  const retainedOrder = incoming.items.filter(item => current.items.some(old => old.id === item.id)).map(item => item.id);
  if (retainedOrder.join('|') !== current.items.map(item => item.id).join('|')) errors.push('Import would reorder or replace existing Course Map item identities.');
  for (const item of current.items) {
    const next = incomingById.get(item.id);
    if (!next) continue;
    if (next.type !== item.type) errors.push(`Import would change the Planned/Reserve type of ${item.id}.`);
    if (item.type === 'lesson' && (!structuralKey(next) || structuralKey(next) !== structuralKey(item))) errors.push(`Import does not preserve required section metadata for ${item.id}.`);
  }
  for (const item of incoming.items.filter(item => item.type === 'lesson')) {
    if (!structuralKey(item)) errors.push(`Imported lesson ${item.id} is missing sectionType/module/unit metadata.`);
  }
  return { safe: errors.length === 0, errors };
}

export async function relationalCourseMapItemReferences(courseMapId, itemId) {
  if (!supabase) throw new Error(supabaseConfigurationError);
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) throw new Error('Sign in before changing a referenced Course Map item.');
  const { data: courses, error: courseError } = await supabase.from('courses').select('id').eq('owner_id', authData.user.id).eq('source_course_map_id', courseMapId).limit(1);
  if (courseError) throw courseError;
  const courseId = courses?.[0]?.id;
  if (!courseId) return [];
  const [templates, assignments] = await Promise.all([
    supabase.from('homework_templates').select('id').eq('owner_id', authData.user.id).eq('course_id', courseId).eq('source_course_item_id', itemId).limit(1),
    supabase.from('homework_assignments').select('id').eq('owner_id', authData.user.id).eq('assigned_course_item_id', itemId).limit(1),
  ]);
  if (templates.error) throw templates.error;
  if (assignments.error) throw assignments.error;
  return [...(templates.data?.length ? ['Homework Templates'] : []), ...(assignments.data?.length ? ['Homework Assignments'] : [])];
}

export async function courseMapItemReferences(state, courseMapId, itemId) {
  return [...new Set([...localCourseMapItemReferences(state, courseMapId, itemId), ...await relationalCourseMapItemReferences(courseMapId, itemId)])];
}
