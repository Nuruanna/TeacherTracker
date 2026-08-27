import { describe, expect, it } from 'vitest';
import grade8 from '../../course-maps/grade-8.json';
import grade5 from '../../course-maps/grade-5.json';
import { seedState } from '../data/seed';
import { buildClassSitesFoundation, normalizedStudentProgress } from './classSitesService';
import { migrateAuthoritativeGrade8Map, migrateState } from '../utils/storage';

const copy = value => JSON.parse(JSON.stringify(value));
const planned = map => map.items.filter(item => item.type === 'lesson');

describe('authoritative Grade 8 Course Map', () => {
  it('contains exactly 95 planned lessons, 7 Reserve lessons and 102 unique items', () => {
    expect(grade8).toMatchObject({ plannedItemCount: 95, reserveCount: 7, totalItemCount: 102, reserveScope: 'annual' });
    expect(planned(grade8)).toHaveLength(95);
    expect(grade8.items.filter(item => item.type === 'reserve')).toHaveLength(7);
    expect(grade8.items).toHaveLength(102);
    expect(new Set(grade8.items.map(item => item.id))).toHaveLength(102);
    expect(new Set(grade8.items.map(item => item.order))).toHaveLength(102);
  });

  it.each([[1, 23], [2, 24], [3, 24], [4, 24]])('Unit %i has the authoritative lesson and Step counts', (unit, lessonCount) => {
    const items = planned(grade8).filter(item => item.unit === unit);
    expect(items).toHaveLength(lessonCount);
    expect(new Set(items.filter(item => item.sectionType === 'step').map(item => item.step))).toEqual(new Set([1,2,3,4,5,6,7,8,9,10]));
  });

  it('represents a/b/c as lesson parts sharing one numeric structural Step', () => {
    const step = planned(grade8).filter(item => item.unit === 1 && item.step === 9);
    expect(step.map(item => ({ code: item.code, step: item.step, part: item.part }))).toEqual([
      { code: 'Unit 1 Step 9a', step: 9, part: 'a' },
      { code: 'Unit 1 Step 9b', step: 9, part: 'b' },
      { code: 'Unit 1 Step 9c', step: 9, part: 'c' },
    ]);
  });

  it('keeps Final Block in its Unit, outside Steps, and resolves it as Step 10 of 10', () => {
    const final = grade8.items.find(item => item.code === 'Unit 1 Final Block 2');
    expect(final).toMatchObject({ id: 'g8-024', type: 'lesson', unit: 1, phase: 'final', finalIndex: 2, sectionType: 'final' });
    expect(final.step).toBeUndefined();
    expect(normalizedStudentProgress(grade8, final)).toEqual({ kind: 'step', current: 10, total: 10 });
  });

  it('transitions from Unit 1 Final Block to Unit 2 Step 1a through normal section/progress planning', () => {
    const state = copy(seedState);
    const lessons = planned(state.courseMaps['grade-8']);
    const groupState = state.teachingGroupCourseStates['grade8-a'];
    groupState.currentPosition = lessons.findIndex(item => item.code === 'Unit 1 Final Block 3');
    let site = buildClassSitesFoundation(state).classSites.find(item => item.sourceTeachingGroupId === 'grade8-a');
    expect(site).toMatchObject({ currentSectionKey: 'grade-8:unit:1', progress: { kind: 'step', current: 10, total: 10 } });
    groupState.currentPosition = lessons.findIndex(item => item.code === 'Unit 2 Step 1a');
    site = buildClassSitesFoundation(state).classSites.find(item => item.sourceTeachingGroupId === 'grade8-a');
    expect(site).toMatchObject({ currentSectionKey: 'grade-8:unit:2', progress: { kind: 'step', current: 1, total: 10 } });
  });

  it('does not derive student progress from Reserve items', () => {
    const reserve = grade8.items.find(item => item.type === 'reserve');
    expect(normalizedStudentProgress(grade8, reserve)).toBeNull();
  });

  it('preserves stable IDs for representative surviving Homework lesson references', () => {
    const byId = new Map(grade8.items.map(item => [item.id, item]));
    expect(byId.get('g8-001')).toMatchObject({ title: 'Summer Holidays', type: 'lesson' });
    expect(byId.get('g8-004')).toMatchObject({ title: 'Popular Sports', type: 'lesson' });
    expect(byId.get('g8-032')).toMatchObject({ title: 'Liza’s First Visit to the Bolshoi Theatre', type: 'lesson' });
    expect(byId.get('g8-069')).toMatchObject({ title: 'Test Yourself', type: 'lesson' });
    expect(byId.get('g8-095')).toMatchObject({ title: 'Final Test', type: 'lesson' });
    expect(byId.get('g8-022')).toMatchObject({ type: 'reserve' });
  });

  it('migrates existing Grade 8 currentPosition by stable item ID instead of array index', () => {
    const saved = copy(seedState);
    const provisional = copy(grade8);
    provisional.items = [...provisional.items].sort((a, b) => a.id.localeCompare(b.id));
    const oldPlanned = planned(provisional);
    saved.courseMaps['grade-8'] = provisional;
    saved.teachingGroupCourseStates['grade8-a'].currentPosition = oldPlanned.findIndex(item => item.id === 'g8-045');
    const migrated = migrateAuthoritativeGrade8Map(saved);
    expect(planned(migrated.courseMaps['grade-8'])[migrated.teachingGroupCourseStates['grade8-a'].currentPosition].id).toBe('g8-045');
    expect(migrated.teachingGroupCourseStates['grade8-a']).toMatchObject({ lessonAssignments: {}, recalculationRequired: true });
  });

  it('upgrades schema 10 cloud state to the authoritative map', () => {
    const saved = copy(seedState);
    saved.schemaVersion = 10;
    saved.courseMaps['grade-8'].plannedItemCount = 96;
    const migrated = migrateState(saved);
    expect(migrated.schemaVersion).toBe(11);
    expect(migrated.courseMaps['grade-8']).toEqual(grade8);
  });

  it('leaves Grade 5 Rainbow structure and progress unchanged', () => {
    expect(grade5).toMatchObject({ plannedItemCount: 60, reserveCount: 6, totalItemCount: 66 });
    expect(normalizedStudentProgress(grade5, grade5.items.find(item => item.unit === 1 && item.step === 4))).toEqual({ kind: 'step', current: 4, total: 10 });
  });
});
