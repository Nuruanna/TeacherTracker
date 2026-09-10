import { describe, expect, it } from 'vitest';
import { seedState } from '../data/seed';
import { migrateState } from '../utils/storage';
import { buildClassSitesFoundation } from './classSitesService';
import { courseMapItemState, currentCourseItem } from './classViewService';
import { calculateTeachingGroupCapacity } from './courseCapacityService';
import {
  coursePlanningContext,
  skipNextCourseLesson,
  skipNextCourseLessonPreview,
  undoCourseAdjustment,
} from './courseAdjustmentService';
import { lessonsForDate } from './lessonViewService';

const asOfThursday = new Date('2026-09-10T12:00:00+10:00');
const asOfFriday = new Date('2026-09-11T12:00:00+10:00');
const clone = value => structuredClone(value);

function grade8BFixture() {
  const state = clone(seedState);
  const template = state.teachingGroups.find(group => group.id === 'grade8-a');
  const group = { ...template, id: 'grade8-b', displayName: '8Б', section: 'Б', activeFrom: '2026-09-08' };
  state.teachingGroups.push(group);
  state.academicCalendar = {
    academicYear: { start: '2026-09-08', end: '2027-05-25' },
    schoolBreaks: [], noSchoolDays: [], excludedDates: [],
  };
  state.weeklyTimetable = [
    { id: 'grade8-b-thursday-7', day: 'Thursday', lessonNumber: 7, teachingGroupId: group.id },
    { id: 'grade8-b-friday-5', day: 'Friday', lessonNumber: 5, teachingGroupId: group.id },
    { id: 'grade8-b-monday-7', day: 'Monday', lessonNumber: 7, teachingGroupId: group.id },
  ];
  state.weeklyTimetableVersions = [];
  state.teachingGroupCourseStates[group.id] = {
    teachingGroupId: group.id,
    courseMapId: group.courseMapId,
    currentPosition: 0,
    lessonAssignments: {},
    customLessons: [],
    cancelledEventIds: [],
    rescheduledEvents: [],
    returnedPlannedLessons: [],
    courseAdjustments: [],
  };
  state.lessons = [];
  const thursday = lessonsForDate(state, new Date('2026-09-10T12:00:00+10:00'), asOfThursday)[0];
  return { state, group, thursday };
}

describe('covered-without-separate-lesson course adjustments', () => {
  it('treats currentPosition as the ordered current/next anchor and previews exactly the following lesson item', () => {
    const { state, group, thursday } = grade8BFixture();
    expect(currentCourseItem(state, group).id).toBe('g8-001');
    expect(thursday).toMatchObject({
      id: 'planned-2026-09-10-grade8-b-thursday-7',
      courseMapItemId: 'g8-001',
    });
    expect(skipNextCourseLessonPreview(state, thursday, asOfThursday)).toMatchObject({
      available: true,
      currentItem: { id: 'g8-001' },
      targetItem: { id: 'g8-002', code: 'Unit 1 Step 1b', title: 'Mr Wilson: Then and Now' },
      nextSeparateItem: { id: 'g8-003', code: 'Unit 1 Step 2a', title: 'Laila Ali' },
    });
  });

  it('covers g8-002 with Thursday and allocates g8-003 to Friday without timetable, lesson, or Homework mutation', () => {
    const { state, group, thursday } = grade8BFixture();
    const beforeTimetable = JSON.stringify(state.weeklyTimetable);
    const beforeHomework = JSON.stringify({ homeworkMaterials: state.homeworkMaterials, lessons: state.lessons });
    const beforeCapacity = calculateTeachingGroupCapacity(state, group.id);
    const next = skipNextCourseLesson(state, thursday, {
      reason: 'combined', note: 'Covered together', createdAt: '2026-09-10T04:30:00.000Z', now: asOfThursday,
    });
    const adjustment = next.teachingGroupCourseStates[group.id].courseAdjustments[0];

    expect(adjustment).toEqual({
      id: 'course-adjustment-g8-002',
      type: 'coveredWithoutSeparateLesson',
      courseMapItemId: 'g8-002',
      reason: 'combined',
      withLessonId: thursday.id,
      withLessonDate: '2026-09-10',
      withCourseMapItemId: 'g8-001',
      previousCurrentPosition: 0,
      resultingCurrentPosition: 2,
      note: 'Covered together',
      createdAt: '2026-09-10T04:30:00.000Z',
    });
    expect(next.teachingGroupCourseStates[group.id].currentPosition).toBe(2);
    expect(currentCourseItem(next, group).id).toBe('g8-003');
    expect(lessonsForDate(next, new Date('2026-09-11T12:00:00+10:00'), asOfThursday)[0]).toMatchObject({ courseMapItemId: 'g8-003' });
    expect(JSON.stringify(next.weeklyTimetable)).toBe(beforeTimetable);
    expect(JSON.stringify({ homeworkMaterials: next.homeworkMaterials, lessons: next.lessons })).toBe(beforeHomework);
    expect(calculateTeachingGroupCapacity(next, group.id).requiredPlannedLessons).toBe(beforeCapacity.requiredPlannedLessons - 1);
    expect(buildClassSitesFoundation(next).classSites.find(site => site.sourceTeachingGroupId === group.id).currentCourseItemId).toBe('g8-003');
    expect(courseMapItemState(next, group, state.courseMaps['grade-8'].items.find(item => item.id === 'g8-002'), asOfThursday)).toBe('combined');
  });

  it('keeps Thursday g8-001 and historical Friday g8-003 deterministic after the adjustment', () => {
    const { state, thursday } = grade8BFixture();
    const next = skipNextCourseLesson(state, thursday, { createdAt: '2026-09-10T04:30:00.000Z', now: asOfThursday });
    expect(lessonsForDate(next, new Date('2026-09-10T12:00:00+10:00'), asOfFriday)[0]).toMatchObject({ courseMapItemId: 'g8-001' });
    expect(lessonsForDate(next, new Date('2026-09-11T12:00:00+10:00'), asOfFriday)[0]).toMatchObject({ courseMapItemId: 'g8-003' });
  });

  it('undoes safely before later persisted work and restores Friday g8-002', () => {
    const { state, group, thursday } = grade8BFixture();
    const adjusted = skipNextCourseLesson(state, thursday, { now: asOfThursday });
    const restored = undoCourseAdjustment(adjusted, group.id, 'course-adjustment-g8-002');
    expect(restored.teachingGroupCourseStates[group.id]).toMatchObject({ currentPosition: 0, courseAdjustments: [] });
    expect(lessonsForDate(restored, new Date('2026-09-11T12:00:00+10:00'), asOfThursday)[0]).toMatchObject({ courseMapItemId: 'g8-002' });
    expect(restored.weeklyTimetable).toEqual(state.weeklyTimetable);
    expect(restored.lessons).toEqual([]);
  });

  it('blocks unsafe undo when a later mapped lesson has persisted', () => {
    const { state, group, thursday } = grade8BFixture();
    const adjusted = skipNextCourseLesson(state, thursday, { now: asOfThursday });
    const friday = lessonsForDate(adjusted, new Date('2026-09-11T12:00:00+10:00'), asOfThursday)[0];
    adjusted.lessons.push({ ...friday, planned: false });
    expect(() => undoCourseAdjustment(adjusted, group.id, 'course-adjustment-g8-002')).toThrow(/Later course progress/);
  });

  it('rejects duplicate, ambiguous, Reserve, and beyond-course transitions', () => {
    const { state, group, thursday } = grade8BFixture();
    const adjusted = skipNextCourseLesson(state, thursday, { now: asOfThursday });
    expect(() => skipNextCourseLesson(adjusted, thursday, { now: asOfThursday })).toThrow();
    const ambiguous = clone(state);
    ambiguous.teachingGroupCourseStates[group.id].customLessons.push({ id: 'custom' });
    expect(skipNextCourseLessonPreview(ambiguous, thursday, asOfThursday).available).toBe(false);
    const lessons = state.courseMaps[group.courseMapId].items.filter(item => item.type === 'lesson');
    const finalState = clone(state);
    finalState.teachingGroupCourseStates[group.id].currentPosition = lessons.length - 1;
    expect(skipNextCourseLessonPreview(finalState, { ...thursday, courseMapItemId: lessons.at(-1).id }, asOfThursday).available).toBe(false);
    const reserve = state.courseMaps[group.courseMapId].items.find(item => item.type === 'reserve');
    expect(skipNextCourseLessonPreview(state, { ...thursday, courseMapItemId: reserve.id }, asOfThursday).available).toBe(false);
  });

  it('uses ordered item identity for Spotlight and treats a Rainbow 5 step range as one item', () => {
    for (const courseMapId of ['grade-3', 'grade-5']) {
      const state = clone(seedState);
      const group = state.teachingGroups.find(item => item.courseMapId === courseMapId);
      const lessons = state.courseMaps[courseMapId].items.filter(item => item.type === 'lesson');
      const targetIndex = courseMapId === 'grade-5'
        ? lessons.findIndex(item => item.stepStart && item.stepEnd)
        : 1;
      state.teachingGroupCourseStates[group.id].currentPosition = targetIndex - 1;
      const lesson = {
        id: `planned-2026-09-10-${group.id}-test`, date: '2026-09-10', teachingGroupId: group.id,
        courseMapItemId: lessons[targetIndex - 1].id, contentSnapshot: { type: 'lesson' },
      };
      const adjusted = skipNextCourseLesson(state, lesson, { reason: 'course-compression', now: asOfThursday });
      expect(adjusted.teachingGroupCourseStates[group.id].courseAdjustments).toHaveLength(1);
      expect(adjusted.teachingGroupCourseStates[group.id].courseAdjustments[0].courseMapItemId).toBe(lessons[targetIndex].id);
      expect(coursePlanningContext(adjusted, group).items).toHaveLength(lessons.length - 1);
    }
  });

  it.each(['combined', 'already-covered', 'course-compression', 'other'])('keeps %s as metadata with identical progression behavior', reason => {
    const { state, group, thursday } = grade8BFixture();
    const adjusted = skipNextCourseLesson(state, thursday, { reason, now: asOfThursday });
    expect(adjusted.teachingGroupCourseStates[group.id]).toMatchObject({ currentPosition: 2 });
    expect(coursePlanningContext(adjusted, group).items.some(item => item.id === 'g8-002')).toBe(false);
    expect(lessonsForDate(adjusted, new Date('2026-09-11T12:00:00+10:00'), asOfThursday)[0]).toMatchObject({ courseMapItemId: 'g8-003' });
    expect(courseMapItemState(adjusted, group, state.courseMaps['grade-8'].items.find(item => item.id === 'g8-002'), asOfThursday)).toBe(reason === 'combined' ? 'combined' : 'covered');
  });

  it('preserves explicit assignment priority and treats an invalid adjustment as ambiguous', () => {
    const { state, group, thursday } = grade8BFixture();
    state.teachingGroupCourseStates[group.id].lessonAssignments[thursday.id] = {
      courseMapItemId: 'g8-001', contentSnapshot: { id: 'g8-001', code: 'Explicit', title: 'Assignment', type: 'lesson' },
    };
    const adjusted = skipNextCourseLesson(state, { ...thursday, code: 'Explicit', contentSnapshot: state.teachingGroupCourseStates[group.id].lessonAssignments[thursday.id].contentSnapshot }, { now: asOfThursday });
    expect(lessonsForDate(adjusted, new Date('2026-09-10T12:00:00+10:00'), asOfFriday)[0]).toMatchObject({ code: 'Explicit', courseMapItemId: 'g8-001' });
    adjusted.teachingGroupCourseStates[group.id].courseAdjustments[0].reason = 'unknown';
    delete adjusted.teachingGroupCourseStates[group.id].lessonAssignments[thursday.id];
    expect(lessonsForDate(adjusted, new Date('2026-09-10T12:00:00+10:00'), asOfFriday)[0]).toMatchObject({ courseMapItemId: null });
  });

  it('normalizes older schema-11 course states to an empty optional array and preserves adjustments through JSON reload', () => {
    const older = clone(seedState);
    delete older.teachingGroupCourseStates['grade8-a'].courseAdjustments;
    expect(migrateState(older).teachingGroupCourseStates['grade8-a'].courseAdjustments).toEqual([]);
    const { state, group, thursday } = grade8BFixture();
    const adjusted = skipNextCourseLesson(state, thursday, { now: asOfThursday });
    const reloaded = migrateState(JSON.parse(JSON.stringify(adjusted)));
    expect(reloaded.teachingGroupCourseStates[group.id].courseAdjustments).toEqual(adjusted.teachingGroupCourseStates[group.id].courseAdjustments);
    expect(reloaded.schemaVersion).toBe(11);
  });
});
