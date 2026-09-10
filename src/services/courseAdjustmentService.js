import { lessonStatus } from '../utils/lessons';

export const COVERED_WITHOUT_LESSON = 'coveredWithoutSeparateLesson';
export const COURSE_ADJUSTMENT_REASONS = [
  { value: 'combined', label: 'Combined with this lesson', status: 'combined' },
  { value: 'already-covered', label: 'Already covered', status: 'covered' },
  { value: 'course-compression', label: 'Course compression', status: 'covered' },
  { value: 'other', label: 'Other', status: 'covered' },
];

const reasonValues = new Set(COURSE_ADJUSTMENT_REASONS.map(item => item.value));
const courseLessons = (state, group) =>
  (state.courseMaps?.[group?.courseMapId]?.items || []).filter(item => item.type === 'lesson');
const courseStateFor = (state, groupId) => state.teachingGroupCourseStates?.[groupId] || null;
export const courseAdjustmentsForGroup = (state, groupId) => {
  const value = courseStateFor(state, groupId)?.courseAdjustments;
  return Array.isArray(value) ? value : [];
};

const adjustmentIsValid = (adjustment, lessons) => {
  const coveredIndex = lessons.findIndex(item => item.id === adjustment?.courseMapItemId);
  const withIndex = lessons.findIndex(item => item.id === adjustment?.withCourseMapItemId);
  return Boolean(
    adjustment &&
      typeof adjustment.id === 'string' && adjustment.id &&
      adjustment.type === COVERED_WITHOUT_LESSON &&
      reasonValues.has(adjustment.reason) &&
      typeof adjustment.withLessonId === 'string' && adjustment.withLessonId &&
      /^\d{4}-\d{2}-\d{2}$/.test(adjustment.withLessonDate || '') &&
      typeof adjustment.createdAt === 'string' && adjustment.createdAt &&
      Number.isInteger(adjustment.previousCurrentPosition) &&
      Number.isInteger(adjustment.resultingCurrentPosition) &&
      coveredIndex === withIndex + 1 &&
      adjustment.previousCurrentPosition === withIndex &&
      adjustment.resultingCurrentPosition === coveredIndex + 1
  );
};

export function coursePlanningContext(state, group) {
  const lessons = courseLessons(state, group);
  const courseState = courseStateFor(state, group?.id);
  const adjustments = courseAdjustmentsForGroup(state, group?.id);
  const uniqueIds = new Set(adjustments.map(item => item.id));
  const uniqueItems = new Set(adjustments.map(item => item.courseMapItemId));
  const deterministic = Boolean(courseState) &&
    uniqueIds.size === adjustments.length &&
    uniqueItems.size === adjustments.length &&
    adjustments.every(item => adjustmentIsValid(item, lessons));
  const coveredIds = deterministic
    ? new Set(adjustments.map(item => item.courseMapItemId))
    : new Set();
  const items = lessons.filter(item => !coveredIds.has(item.id));
  const rawPosition = Math.max(0, Number(courseState?.currentPosition) || 0);
  const anchor = lessons.slice(rawPosition).find(item => !coveredIds.has(item.id)) || null;
  const position = anchor ? items.findIndex(item => item.id === anchor.id) : items.length;
  return { adjustments, coveredIds, deterministic, items, lessons, position, rawPosition };
}

export const courseAdjustmentForItem = (state, groupId, courseMapItemId) => {
  const group = state.teachingGroups?.find(item => item.id === groupId);
  const context = coursePlanningContext(state, group);
  return context.deterministic
    ? context.adjustments.find(item => item.courseMapItemId === courseMapItemId) || null
    : null;
};

export function courseAdjustmentForLesson(state, group, lessonId) {
  const context = coursePlanningContext(state, group);
  if (!context.deterministic) return null;
  return context.adjustments.find(item => item.withLessonId === lessonId) || null;
}

export const courseAdjustmentReason = reason =>
  COURSE_ADJUSTMENT_REASONS.find(item => item.value === reason) || null;

const transitionIsSafe = (state, group, lesson, context, now) => {
  const courseState = courseStateFor(state, group.id);
  if (!context.deterministic || courseState?.recalculationRequired) return false;
  if (['customLessons', 'cancelledEventIds', 'rescheduledEvents', 'returnedPlannedLessons']
    .some(field => Array.isArray(courseState?.[field]) && courseState[field].length)) return false;
  const assignments = Object.entries(courseState?.lessonAssignments || {});
  if (assignments.some(([eventId, value]) => eventId !== lesson.id || value?.courseMapItemId !== lesson.courseMapItemId)) return false;
  return !state.lessons.some(item =>
    item.teachingGroupId === group.id &&
    item.courseMapItemId === context.lessons[context.rawPosition + 1]?.id &&
    item.manualStatus !== 'cancelled' &&
    item.manualStatus !== 'rescheduled' &&
    lessonStatus(item, now) === 'completed');
};

export function skipNextCourseLessonPreview(state, lesson, now = new Date()) {
  const group = state.teachingGroups?.find(item => item.id === lesson?.teachingGroupId);
  if (!group || group.type !== 'class' || !group.courseMapId)
    return { available: false, reason: 'This action is available for classes with a Course Map.' };
  const context = coursePlanningContext(state, group);
  const currentIndex = context.lessons.findIndex(item => item.id === lesson?.courseMapItemId);
  const currentItem = context.items[context.position] || null;
  if (currentIndex < 0 || currentItem?.id !== lesson.courseMapItemId)
    return { available: false, reason: 'The opened lesson is not the current Course Map item.' };
  if (context.adjustments.some(item => item.withLessonId === lesson.id))
    return { available: false, reason: 'This lesson already has a course adjustment.' };
  const targetItem = context.lessons[currentIndex + 1] || null;
  if (!targetItem)
    return { available: false, reason: 'There is no next Course Map lesson to cover.' };
  if (context.coveredIds.has(targetItem.id))
    return { available: false, reason: 'The next Course Map item is already covered.' };
  if (!transitionIsSafe(state, group, lesson, context, now))
    return { available: false, reason: 'Existing course changes make this adjustment unsafe.' };
  const nextSeparateItem = context.lessons.slice(currentIndex + 2)
    .find(item => !context.coveredIds.has(item.id)) || null;
  return { available: true, group, currentItem, targetItem, nextSeparateItem, context };
}

export function skipNextCourseLesson(state, lesson, { reason = 'combined', note = '', createdAt = new Date().toISOString(), now = new Date() } = {}) {
  if (!reasonValues.has(reason)) throw new Error('Choose a valid course adjustment reason.');
  const preview = skipNextCourseLessonPreview(state, lesson, now);
  if (!preview.available) throw new Error(preview.reason);
  const current = courseStateFor(state, preview.group.id);
  const adjustment = {
    id: `course-adjustment-${preview.targetItem.id}`,
    type: COVERED_WITHOUT_LESSON,
    courseMapItemId: preview.targetItem.id,
    reason,
    withLessonId: lesson.id,
    withLessonDate: lesson.date,
    withCourseMapItemId: preview.currentItem.id,
    previousCurrentPosition: preview.context.rawPosition,
    resultingCurrentPosition: preview.context.rawPosition + 2,
    note: String(note || '').trim(),
    createdAt,
  };
  return {
    ...state,
    teachingGroupCourseStates: {
      ...state.teachingGroupCourseStates,
      [preview.group.id]: {
        ...current,
        currentPosition: adjustment.resultingCurrentPosition,
        courseAdjustments: [...preview.context.adjustments, adjustment],
      },
    },
  };
}

export function undoCourseAdjustment(state, groupId, adjustmentId) {
  const group = state.teachingGroups?.find(item => item.id === groupId);
  const current = courseStateFor(state, groupId);
  const context = coursePlanningContext(state, group);
  const adjustment = context.adjustments.find(item => item.id === adjustmentId);
  if (!group || !current || !context.deterministic || !adjustment)
    throw new Error('Course adjustment not found or invalid.');
  const dependentAdjustment = context.adjustments.some(item =>
    item.id !== adjustment.id && item.previousCurrentPosition >= adjustment.resultingCurrentPosition);
  const dependentAssignment = Object.keys(current.lessonAssignments || {}).some(eventId => eventId !== adjustment.withLessonId);
  const dependentLesson = (state.lessons || []).some(item =>
    item.teachingGroupId === groupId &&
    item.id !== adjustment.withLessonId &&
    item.date > adjustment.withLessonDate &&
    item.manualStatus !== 'cancelled' &&
    item.manualStatus !== 'rescheduled' &&
    context.lessons.findIndex(courseItem => courseItem.id === item.courseMapItemId) >= adjustment.resultingCurrentPosition);
  if (current.currentPosition !== adjustment.resultingCurrentPosition || dependentAdjustment || dependentAssignment || dependentLesson)
    throw new Error('Later course progress depends on this adjustment. Use Change current position for a manual correction.');
  return {
    ...state,
    teachingGroupCourseStates: {
      ...state.teachingGroupCourseStates,
      [groupId]: {
        ...current,
        currentPosition: adjustment.previousCurrentPosition,
        courseAdjustments: context.adjustments.filter(item => item.id !== adjustment.id),
      },
    },
  };
}
