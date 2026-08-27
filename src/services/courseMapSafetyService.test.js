import { describe, expect, it } from 'vitest';
import { seedState } from '../data/seed';
import { localCourseMapItemReferences, validateSafeCourseMapImport } from './courseMapSafetyService';

const copy = value => JSON.parse(JSON.stringify(value));

describe('Course Map structural safety', () => {
  it('accepts every current Course Map without modification', () => {
    const state = copy(seedState);
    for (const id of Object.keys(state.courseMaps)) expect(validateSafeCourseMapImport(state, id, copy(state.courseMaps[id]))).toEqual({ safe: true, errors: [] });
  });

  it('allows identity-preserving text edits but blocks removed IDs and missing metadata', () => {
    const state = copy(seedState);
    const incoming = copy(state.courseMaps['grade-2']);
    incoming.items[0].code = 'Renamed lesson';
    incoming.items[0].title = 'Renamed topic';
    expect(validateSafeCourseMapImport(state, 'grade-2', incoming)).toEqual({ safe: true, errors: [] });
    const removed = copy(incoming); removed.items.shift();
    expect(validateSafeCourseMapImport(state, 'grade-2', removed).safe).toBe(false);
    const metadata = copy(incoming); delete metadata.items.find(item => item.type === 'lesson').sectionType;
    expect(validateSafeCourseMapImport(state, 'grade-2', metadata).safe).toBe(false);
  });

  it('detects materialized, progress, assignment and returned-lesson references', () => {
    const state = copy(seedState);
    const itemId = state.courseMaps['grade-3'].items.find(item => item.type === 'lesson').id;
    state.lessons.push({ id: 'stored', courseMapItemId: itemId });
    state.teachingGroupCourseStates['grade3-a'].lessonAssignments.future = { courseMapItemId: itemId };
    state.teachingGroupCourseStates['grade3-a'].returnedPlannedLessons = [{ courseMapItemId: itemId }];
    expect(localCourseMapItemReferences(state, 'grade-3', itemId)).toEqual(expect.arrayContaining([
      'materialized lessons', 'active class progress', 'future lesson assignments', 'returned or continued lessons',
    ]));
  });

  it('allows an unused future item to be deleted or converted', () => {
    const state = copy(seedState);
    const planned = state.courseMaps['grade-3'].items.filter(item => item.type === 'lesson');
    const future = planned.at(-1);
    expect(localCourseMapItemReferences(state, 'grade-3', future.id)).toEqual([]);
  });
});
