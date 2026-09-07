import { describe, expect, it, vi } from 'vitest';
import { seedState } from '../data/seed';
import { nextLessonForGroup, classOverview } from './classViewService';
import { lessonsForDate } from './lessonViewService';
import { calculateTeachingGroupCapacity } from './courseCapacityService';

vi.mock('./lessonViewService', async importOriginal => {
  const actual = await importOriginal();
  return { ...actual, lessonsForDate: vi.fn(actual.lessonsForDate) };
});
vi.mock('./courseCapacityService', async importOriginal => {
  const actual = await importOriginal();
  return { ...actual, calculateTeachingGroupCapacity: vi.fn(actual.calculateTeachingGroupCapacity) };
});
const now = new Date('2026-09-07T03:00:00Z');
function fixture() {
  const state = structuredClone(seedState);
  state.academicCalendar = { academicYear: { start: '2026-09-01', end: '2027-05-31' }, schoolBreaks: [], noSchoolDays: [], excludedDates: [] };
  state.weeklyTimetable = state.weeklyTimetable.filter(entry => entry.teachingGroupId !== 'grade8-a');
  state.weeklyTimetableVersions = [];
  state.lessons = [];
  return { state, group: state.teachingGroups.find(group => group.id === 'grade8-a') };
}

describe('Classes next-lesson search CPU regression', () => {
  it('does not generate other classes lessons for an unscheduled class across the academic year', () => {
    const { state, group } = fixture();
    vi.clearAllMocks();
    expect(classOverview(state, group, now, { includeCapacity: false }).nextLesson).toBeNull();
    expect(lessonsForDate).not.toHaveBeenCalled();
    expect(calculateTeachingGroupCapacity).not.toHaveBeenCalled();
  });

  it('honours a future timetable version without materializing lessons for intervening dates', () => {
    const { state, group } = fixture();
    state.weeklyTimetableVersions = [{ effectiveFrom: '2027-02-01', entries: [
      ...state.weeklyTimetable, { id: 'future-slot', teachingGroupId: group.id, day: 'Monday', lessonNumber: 7 },
    ] }];
    vi.clearAllMocks();
    const next = nextLessonForGroup(state, group, now);
    expect(next).toMatchObject({ date: '2027-02-01', teachingGroupId: group.id, number: 7 });
    expect(lessonsForDate).toHaveBeenCalledTimes(1);
  });

  it('preserves stored lessons on excluded dates without a timetable slot, skipping cancelled/rescheduled records', () => {
    const { state, group } = fixture();
    state.academicCalendar.excludedDates = ['2026-09-10'];
    state.lessons = ['cancelled', 'rescheduled', null].map((manualStatus, index) => ({
      id: `stored-${index}`, teachingGroupId: group.id, date: '2026-09-10', number: index + 1,
      start: '09:00', end: '09:40', manualStatus, contentSnapshot: { code: 'Stored' },
    }));
    expect(nextLessonForGroup(state, group, now)?.id).toBe('stored-2');
  });

  it('retains capacity for existing consumers that request the complete overview', () => {
    const { state, group } = fixture();
    vi.clearAllMocks();
    expect(classOverview(state, group, now).capacity).not.toBeNull();
    expect(calculateTeachingGroupCapacity).toHaveBeenCalledExactlyOnceWith(state, group.id);
  });
});
