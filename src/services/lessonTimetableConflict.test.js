import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { seedState } from '../data/seed';
import { lessonHistoryForGroup } from './classViewService';
import { listHomeworkSources, resolveTargetCourseLesson } from './classSitesHomeworkService';
import { availablePlannedLessons, findLesson, materializeLesson } from './lessonDetailsService';
import { dayLessonSlots, lessonsForDate, weekDates } from './lessonViewService';
import { effectiveStoredLessons, storedLessonMatchesEffectiveTimetable } from './timetableService';

const currentTuesday = [
  ['grade3-a', 1], ['grade3-b', 2], ['grade3-v', 3], ['grade4-a', 4],
  ['grade4-v', 5], ['grade4-b', 6], ['grade8-a', 7],
];
const previousTuesday = [
  ['grade4-v', 1], ['grade5-a', 2], ['grade3-v', 3], ['grade3-a', 4],
  ['grade3-b', 5], ['grade5-b', 6], ['grade8-a', 7],
];
const currentWednesday = [
  ['grade5-a', 1], ['grade5-b', 2], ['grade2-a', 3], ['grade2-b', 4],
  ['grade2-v', 5], ['grade8-a', 7],
];
const previousWednesday = [['grade8-a', 6]];

const entriesFor = (prefix, day, slots) => slots.map(([teachingGroupId, lessonNumber]) => ({
  id: `${prefix}-${day.toLowerCase()}-${lessonNumber}-${teachingGroupId}`,
  day,
  lessonNumber,
  teachingGroupId,
}));

const currentEntries = [
  ...entriesFor('current', 'Tuesday', currentTuesday),
  ...entriesFor('current', 'Wednesday', currentWednesday),
];
const previousEntries = [
  ...entriesFor('previous', 'Tuesday', previousTuesday),
  ...entriesFor('previous', 'Wednesday', previousWednesday),
];

const storedFrom = (date, entry, extra = {}) => ({
  id: `planned-${date}-${entry.id}`,
  date,
  number: entry.lessonNumber,
  start: '08:30',
  end: '09:10',
  teachingGroupId: entry.teachingGroupId,
  courseMapItemId: `${entry.teachingGroupId}-test-item`,
  contentSnapshot: { code: 'Stored test lesson', title: null, type: 'lesson' },
  manualStatus: null,
  planned: false,
  ...extra,
});

function fixture({ dirty = true } = {}) {
  const state = structuredClone(seedState);
  state.academicCalendar = {
    academicYear: { start: '2026-09-01', end: '2027-05-31' },
    schoolBreaks: [], noSchoolDays: [], excludedDates: [],
  };
  state.weeklyTimetable = structuredClone(currentEntries);
  state.weeklyTimetableVersions = [
    { id: 'version-a', effectiveFrom: '2026-09-01', entries: structuredClone(previousEntries) },
    { id: 'version-b', effectiveFrom: '2026-09-08', entries: structuredClone(currentEntries) },
  ];
  state.lessons = dirty ? [
    ...previousEntries
      .filter(entry => entry.day === 'Tuesday')
      .map(entry => storedFrom('2026-09-08', entry, {
        homework: 'Disposable test homework',
        teacherNotes: 'Disposable test note',
        homeworkMaterials: [{ id: `test-${entry.id}`, kind: 'image' }],
      })),
    ...previousEntries
      .filter(entry => entry.day === 'Wednesday')
      .map(entry => storedFrom('2026-09-09', entry)),
  ] : [];
  return state;
}

const idsForDate = (state, date) => lessonsForDate(
  state,
  new Date(`${date}T12:00:00+10:00`),
  new Date('2026-09-08T07:00:00+10:00'),
).map(lesson => lesson.teachingGroupId);

const namesForDate = (state, date) => idsForDate(state, date).map(
  id => state.teachingGroups.find(group => group.id === id)?.displayName,
);

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-08T07:00:00+10:00'));
});
afterAll(() => vi.useRealTimers());

describe('effective timetable versus stale materialized lessons', () => {
  it('keeps the exact current Tuesday order through opening, materialization, and repeated Day/Week reads', () => {
    let state = fixture();
    const expected = ['3А', '3Б', '3В', '4А', '4В', '4Б', '8А'];
    expect(namesForDate(state, '2026-09-08')).toEqual(expected);

    const firstId = 'planned-2026-09-08-current-tuesday-1-grade3-a';
    expect(findLesson(state, firstId)).toMatchObject({ teachingGroupId: 'grade3-a', number: 1, planned: true });
    expect(namesForDate(state, '2026-09-08')).toEqual(expected);

    state = materializeLesson(state, findLesson(state, firstId));
    expect(namesForDate(state, '2026-09-08')).toEqual(expected);

    for (const number of [2, 4, 7]) {
      const lesson = lessonsForDate(state, new Date('2026-09-08T12:00:00+10:00')).find(item => item.number === number);
      state = materializeLesson(state, lesson);
    }
    expect(namesForDate(state, '2026-09-08')).toEqual(expected);

    const dayRows = dayLessonSlots(
      state,
      new Date('2026-09-08T12:00:00+10:00'),
      lessonsForDate(state, new Date('2026-09-08T12:00:00+10:00')),
    ).map(slot => slot.lesson?.teachingGroupId || null);
    expect(dayRows).toEqual(currentTuesday.map(([groupId]) => groupId));

    const week = weekDates(new Date('2026-09-07T12:00:00+10:00'));
    const firstWeekRead = week.map(date => lessonsForDate(state, date).map(item => item.teachingGroupId));
    const secondWeekRead = week.map(date => lessonsForDate(state, date).map(item => item.teachingGroupId));
    expect(secondWeekRead).toEqual(firstWeekRead);
    expect(namesForDate(state, '2026-09-08')).toEqual(expected);
  });

  it('does not show the obsolete Wednesday L6 8A beside the current L7 8A', () => {
    const state = fixture();
    const lessons = lessonsForDate(state, new Date('2026-09-09T12:00:00+10:00'));
    expect(lessons.filter(item => item.teachingGroupId === 'grade8-a').map(item => item.number)).toEqual([7]);
    expect(lessons.map(item => item.number)).toEqual([1, 2, 3, 4, 5, 7]);
  });

  it('renders version B after version A lessons were materialized and does not resurrect A', () => {
    const date = '2026-09-08';
    let state = fixture({ dirty: false });
    state.weeklyTimetableVersions = [{ id: 'version-a', effectiveFrom: '2026-09-01', entries: previousEntries }];
    state.weeklyTimetable = previousEntries;
    state.lessons = lessonsForDate(state, new Date(`${date}T12:00:00+10:00`)).map(lesson => ({ ...lesson, planned: false }));

    state.weeklyTimetableVersions.push({ id: 'version-b', effectiveFrom: date, entries: currentEntries });
    state.weeklyTimetable = currentEntries;
    expect(idsForDate(state, date)).toEqual(currentTuesday.map(([groupId]) => groupId));

    const current = lessonsForDate(state, new Date(`${date}T12:00:00+10:00`));
    state = current.slice(0, 3).reduce((next, lesson) => materializeLesson(next, lesson), state);
    expect(idsForDate(state, date)).toEqual(currentTuesday.map(([groupId]) => groupId));
  });

  it('generates and materializes the same current timetable from a clean lesson state', () => {
    let state = fixture({ dirty: false });
    expect(idsForDate(state, '2026-09-08')).toEqual(currentTuesday.map(([groupId]) => groupId));
    expect(idsForDate(state, '2026-09-09')).toEqual(currentWednesday.map(([groupId]) => groupId));
    const current = lessonsForDate(state, new Date('2026-09-08T12:00:00+10:00'));
    state = current.reduce((next, lesson) => materializeLesson(next, lesson), state);
    expect(idsForDate(state, '2026-09-08')).toEqual(currentTuesday.map(([groupId]) => groupId));
    expect(state.lessons).toHaveLength(7);
  });

  it('keeps legacy, moved, and current special records while excluding only stale planned occurrences', () => {
    const state = fixture({ dirty: false });
    const canonical = storedFrom('2026-09-08', currentEntries[0], { manualStatus: 'cancelled' });
    const canonicalCustom = storedFrom('2026-09-08', currentEntries[1], {
      contentSnapshot: { code: 'Custom', type: 'custom' },
      unfinished: 'Continue next lesson', carryForward: true,
    });
    const stale = storedFrom('2026-09-08', previousEntries[0], { manualStatus: 'cancelled' });
    const moved = { ...stale, id: 'moved-test-lesson', number: 6, rescheduled: true, rescheduledSourceId: stale.id };
    const legacyCustom = { ...stale, id: 'legacy-custom', number: 6, contentSnapshot: { code: 'Custom', type: 'custom' } };
    state.lessons = [canonical, canonicalCustom, stale, moved, legacyCustom];

    expect(storedLessonMatchesEffectiveTimetable(state, canonical)).toBe(true);
    expect(storedLessonMatchesEffectiveTimetable(state, canonicalCustom)).toBe(true);
    expect(storedLessonMatchesEffectiveTimetable(state, stale)).toBe(false);
    expect(effectiveStoredLessons(state).map(item => item.id)).toEqual([canonical.id, canonicalCustom.id, moved.id, legacyCustom.id]);
    expect(state.lessons).toHaveLength(5);
  });

  it('keeps stale occurrences out of Course Map history, assignment choices, and homework sources', () => {
    const state = fixture({ dirty: false });
    const staleEntry = previousEntries.find(entry => entry.teachingGroupId === 'grade4-v');
    const stale = storedFrom('2026-09-08', staleEntry, {
      courseMapItemId: 'g4-001',
      homework: 'Disposable test homework',
      updatedAt: '2026-09-08T01:00:00Z',
    });
    state.lessons = [stale];
    const group = state.teachingGroups.find(item => item.id === 'grade4-v');
    const currentLesson = { teachingGroupId: group.id, courseMapItemId: 'g4-002' };

    expect(lessonHistoryForGroup(state, group)).toEqual([]);
    expect(availablePlannedLessons(state, currentLesson).map(item => item.id)).toContain('g4-001');
    expect(listHomeworkSources(state)).toEqual([]);
    expect(resolveTargetCourseLesson(state, group.id, 'g4-001')?.id).not.toBe(stale.id);
  });
});
