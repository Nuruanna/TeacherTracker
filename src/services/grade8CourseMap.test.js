import { describe, expect, it } from 'vitest';
import grade8 from '../../course-maps/grade-8.json';
import grade5 from '../../course-maps/grade-5.json';
import { seedState } from '../data/seed';
import { buildClassSitesFoundation, normalizedStudentProgress } from './classSitesService';
import { migrateAuthoritativeGrade8Map, migrateState } from '../utils/storage';

const copy = value => JSON.parse(JSON.stringify(value));
const planned = map => map.items.filter(item => item.type === 'lesson');

describe('authoritative Grade 8 Course Map', () => {
  it('contains exactly 89 planned lessons, 6 Reserve lessons and 95 unique items', () => {
    expect(grade8).toMatchObject({ plannedItemCount: 89, reserveCount: 6, totalItemCount: 95, reserveScope: 'annual' });
    expect(planned(grade8)).toHaveLength(89);
    expect(grade8.items.filter(item => item.type === 'reserve')).toHaveLength(6);
    expect(grade8.items).toHaveLength(95);
    expect(new Set(grade8.items.map(item => item.id))).toHaveLength(95);
    expect(new Set(grade8.items.map(item => item.order))).toHaveLength(95);
  });

  it.each([[1, 22], [2, 22], [3, 22], [4, 23]])('Unit %i has the authoritative lesson and Step counts', (unit, lessonCount) => {
    const items = planned(grade8).filter(item => item.unit === unit);
    expect(items).toHaveLength(lessonCount);
    expect(new Set(items.filter(item => item.sectionType === 'step').map(item => item.step))).toEqual(new Set([1,2,3,4,5,6,7,8,9,10]));
  });

  it('represents a/b/c as lesson parts sharing one numeric structural Step', () => {
    const step = planned(grade8).filter(item => item.unit === 4 && item.step === 4);
    expect(step.map(item => ({ code: item.code, step: item.step, part: item.part }))).toEqual([
      { code: 'Unit 4 Step 4a', step: 4, part: 'a' },
      { code: 'Unit 4 Step 4b', step: 4, part: 'b' },
      { code: 'Unit 4 Step 4c', step: 4, part: 'c' },
    ]);
  });

  it('keeps Final Block in its Unit, outside Steps, and preserves existing Step progress', () => {
    const final = grade8.items.find(item => item.code === 'Unit 1 Final Block 2');
    expect(final).toMatchObject({ id: 'g8-021', type: 'lesson', unit: 1, phase: 'final', finalIndex: 2, sectionType: 'final' });
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

  it('contains representative approved lesson and Reserve identities', () => {
    const byId = new Map(grade8.items.map(item => [item.id, item]));
    expect(byId.get('g8-001')).toMatchObject({ title: 'Summer Holidays', type: 'lesson' });
    expect(byId.get('g8-004')).toMatchObject({ title: 'Popular Sports', type: 'lesson' });
    expect(byId.get('g8-032')).toMatchObject({ title: 'The Great Bard', type: 'lesson' });
    expect(byId.get('g8-069')).toMatchObject({ title: 'World-Famous Scientists', type: 'lesson' });
    expect(byId.get('g8-089')).toMatchObject({ title: 'Final Review', type: 'lesson' });
    expect(byId.get('g8-090')).toMatchObject({ type: 'reserve' });
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

  it('uses the approved Grade 5 Rainbow structure and progress', () => {
    expect(grade5).toMatchObject({ plannedItemCount: 54, reserveCount: 6, totalItemCount: 60 });
    expect(normalizedStudentProgress(grade5, grade5.items.find(item => item.unit === 1 && item.step === 4))).toEqual({ kind: 'step', current: 4, total: 9 });
  });
});
