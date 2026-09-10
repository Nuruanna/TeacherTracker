import { describe, expect, it } from 'vitest';
import { seedState } from '../data/seed';
import { dayLessonSlots, lessonsForDate, weekDates } from './lessonViewService';

const clone = value => structuredClone(value);
const asOf = new Date('2026-09-10T12:00:00+10:00');

const entriesFor = (day, rows) => rows.map(([teachingGroupId, lessonNumber, suffix = '']) => ({
  id: `${teachingGroupId}-${day.toLowerCase()}-${lessonNumber}${suffix}`,
  day,
  lessonNumber,
  teachingGroupId,
}));

function productionLikeState() {
  const state = clone(seedState);
  const grade5Template = state.teachingGroups.find(group => group.id === 'grade5-v');
  const grade8Template = state.teachingGroups.find(group => group.id === 'grade8-a');
  state.teachingGroups.push(
    { ...grade5Template, id: 'grade5-g', displayName: '5Г', section: 'Г', activeFrom: '2026-09-01' },
    { ...grade8Template, id: 'grade8-b', displayName: '8Б', section: 'Б', activeFrom: '2026-09-07' },
  );
  const currentEntries = [
    ...entriesFor('Monday', [
      ['grade2-a', 2], ['grade2-b', 3], ['grade2-v', 4], ['grade5-a', 5], ['grade5-b', 6], ['grade8-b', 7],
    ]),
    ...entriesFor('Tuesday', [
      ['grade3-a', 1], ['grade3-b', 2], ['grade3-v', 3], ['grade4-a', 4], ['grade4-v', 5], ['grade4-b', 6], ['grade8-a', 7],
    ]),
    ...entriesFor('Wednesday', [
      ['grade5-a', 1], ['grade5-b', 2], ['grade2-a', 3], ['grade2-b', 4], ['grade2-v', 5], ['grade8-a', 7],
    ]),
    ...entriesFor('Thursday', [
      ['grade3-a', 1], ['grade3-b', 2], ['grade3-v', 3], ['grade5-v', 4], ['grade5-g', 5, '-0'], ['grade8-a', 6], ['grade8-b', 7],
    ]),
    ...entriesFor('Friday', [
      ['grade4-a', 1], ['grade4-v', 2], ['grade5-v', 3], ['grade5-g', 4, '-1'], ['grade8-b', 5], ['grade4-b', 6],
    ]),
  ];
  const previousEntries = [
    ...entriesFor('Monday', [['grade2-a', 2]]),
    { id: 'old-grade3-a-tuesday-4', day: 'Tuesday', lessonNumber: 4, teachingGroupId: 'grade3-a' },
  ];
  state.weeklyTimetable = currentEntries;
  state.weeklyTimetableVersions = [
    { id: 'version-a', effectiveFrom: '2026-09-07', entries: previousEntries },
    { id: 'version-b', effectiveFrom: '2026-09-08', entries: currentEntries },
  ];
  state.academicCalendar = {
    academicYear: { start: '2026-09-08', end: '2027-05-25' },
    schoolBreaks: [], noSchoolDays: [], excludedDates: [],
  };
  state.lessons = [];
  const positions = {
    'grade2-a': 1, 'grade2-b': 1, 'grade2-v': 1,
    'grade3-a': 1, 'grade3-b': 1, 'grade3-v': 1,
    'grade4-a': 1, 'grade4-b': 1, 'grade4-v': 1,
    'grade5-a': 1, 'grade5-b': 1, 'grade5-v': 0, 'grade5-g': 0,
    'grade8-a': 2, 'grade8-b': 0,
  };
  for (const [teachingGroupId, currentPosition] of Object.entries(positions)) {
    const group = state.teachingGroups.find(item => item.id === teachingGroupId);
    state.teachingGroupCourseStates[teachingGroupId] = {
      teachingGroupId,
      courseMapId: group.courseMapId,
      currentPosition,
      lessonAssignments: {},
      customLessons: [],
      cancelledEventIds: [],
      rescheduledEvents: [],
      returnedPlannedLessons: [],
      recalculationRequired: false,
    };
  }
  return state;
}

const on = (state, date) => lessonsForDate(state, new Date(`${date}T12:00:00+10:00`), asOf);
const lessonFor = (lessons, teachingGroupId) => lessons.find(lesson => lesson.teachingGroupId === teachingGroupId);

describe('historical virtual lessons', () => {
  it('renders the production-like school week without materializing lessons', () => {
    const state = productionLikeState();
    const before = JSON.stringify(state);
    const dates = weekDates(new Date('2026-09-07T12:00:00+10:00'));
    const days = dates.map(date => lessonsForDate(state, date, asOf));

    expect(days.map(lessons => lessons.length)).toEqual([0, 7, 6, 7, 6]);
    expect(dayLessonSlots(state, dates[1], days[1]).filter(slot => slot.lesson)).toHaveLength(7);
    expect(JSON.stringify(state)).toBe(before);

    for (const lesson of days[1].filter(item => item.teachingGroupId.startsWith('grade3-'))) {
      expect(lesson).toMatchObject({ courseMapItemId: 'g3-001', code: 'Starter Lesson', contentSnapshot: { title: 'Welcome back!' } });
    }
    for (const lesson of days[1].filter(item => item.teachingGroupId.startsWith('grade4-'))) {
      expect(lesson).toMatchObject({ courseMapItemId: 'g4-001', code: 'Starter Lesson', contentSnapshot: { title: 'Back together!' } });
    }

    expect(lessonFor(days[1], 'grade8-a')).toMatchObject({ courseMapItemId: 'g8-001', code: 'Unit 1 Step 1a', contentSnapshot: { title: 'Summer Holidays' } });
    expect(lessonFor(days[2], 'grade8-a')).toMatchObject({ courseMapItemId: 'g8-002', code: 'Unit 1 Step 1b', contentSnapshot: { title: 'Mr Wilson: Then and Now' } });
    expect(lessonFor(days[3], 'grade8-a')).toMatchObject({ courseMapItemId: 'g8-003', code: 'Unit 1 Step 2a', contentSnapshot: { title: 'Laila Ali' } });
    expect(lessonFor(days[2], 'grade5-a')).toMatchObject({ courseMapItemId: 'g5-001', code: 'Unit 1 Starter', contentSnapshot: { title: 'Past Simple Review' } });
    expect(state.courseMaps['grade-5'].items.filter(item => item.type === 'lesson')[state.teachingGroupCourseStates['grade5-a'].currentPosition]).toMatchObject({ id: 'g5-002', code: 'Unit 1 Step 1', title: 'Summer Holidays' });
  });

  it('keeps a canonical stored historical snapshot instead of regenerated content', () => {
    const state = productionLikeState();
    const virtual = lessonFor(on(state, '2026-09-08'), 'grade8-a');
    state.lessons = [{
      ...virtual,
      planned: false,
      code: 'Stored original code',
      contentSnapshot: { code: 'Stored original code', title: 'Stored original title', type: 'lesson' },
    }];
    state.courseMaps['grade-8'].items.find(item => item.id === 'g8-001').title = 'Changed map title';

    expect(lessonFor(on(state, '2026-09-08'), 'grade8-a')).toMatchObject({
      planned: false,
      code: 'Stored original code',
      contentSnapshot: { title: 'Stored original title' },
    });
  });

  it('uses an explicit historical assignment before backward inference', () => {
    const state = productionLikeState();
    const eventId = 'planned-2026-09-08-grade8-a-tuesday-7';
    state.teachingGroupCourseStates['grade8-a'].lessonAssignments[eventId] = { courseMapItemId: 'g8-004' };

    expect(lessonFor(on(state, '2026-09-08'), 'grade8-a')).toMatchObject({
      courseMapItemId: 'g8-004',
      code: 'Unit 1 Step 2b',
      contentSnapshot: { title: 'Popular Sports' },
    });
  });

  it('keeps the slot neutral when modified course state makes inference ambiguous', () => {
    const state = productionLikeState();
    state.teachingGroupCourseStates['grade8-a'].customLessons.push({ id: 'custom-history' });

    expect(lessonFor(on(state, '2026-09-08'), 'grade8-a')).toMatchObject({
      courseMapItemId: null,
      code: 'Rainbow English 8 · Lesson',
      contentSnapshot: { title: null },
    });
  });

  it('rejects an old-version stored row without suppressing the canonical virtual slot', () => {
    const state = productionLikeState();
    state.lessons = [{
      id: 'planned-2026-09-08-old-grade3-a-tuesday-4',
      date: '2026-09-08',
      number: 4,
      start: '11:10',
      end: '11:50',
      teachingGroupId: 'grade3-a',
      courseMapItemId: 'g3-001',
      code: 'Stale stored lesson',
      contentSnapshot: { code: 'Stale stored lesson', title: null, type: 'lesson' },
      planned: false,
    }];

    const lessons = on(state, '2026-09-08');
    expect(lessons.some(lesson => lesson.id === state.lessons[0].id)).toBe(false);
    expect(lessonFor(lessons, 'grade3-a')).toMatchObject({
      id: 'planned-2026-09-08-grade3-a-tuesday-1',
      number: 1,
      courseMapItemId: 'g3-001',
    });
  });
});
