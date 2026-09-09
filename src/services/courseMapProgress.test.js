import { describe, expect, it } from 'vitest';
import grade2 from '../../course-maps/grade-2.json';
import grade3 from '../../course-maps/grade-3.json';
import grade4 from '../../course-maps/grade-4.json';
import grade5 from '../../course-maps/grade-5.json';
import grade8 from '../../course-maps/grade-8.json';
import { seedState } from '../data/seed';
import { buildClassSitesFoundation, normalizedStudentProgress } from './classSitesService';
import { rainbowProgressStep } from './courseMapProgress';
import { validateCourseMap } from './courseMapService';

const copy = value => JSON.parse(JSON.stringify(value));
const maps = [
  [grade2, 53, 5, 58],
  [grade3, 58, 6, 64],
  [grade4, 58, 6, 64],
  [grade5, 54, 6, 60],
  [grade8, 89, 6, 95],
];

describe('approved Course Map structure', () => {
  it.each(maps)('$courseMapId has approved counts, identities, order, and Reserve tail', (map, planned, reserve, total) => {
    expect(map).toMatchObject({ plannedItemCount: planned, reserveCount: reserve, totalItemCount: total, reserveScope: 'annual' });
    expect(map.items).toHaveLength(total);
    expect(map.items.filter(item => item.type === 'lesson')).toHaveLength(planned);
    expect(map.items.filter(item => item.type === 'reserve')).toHaveLength(reserve);
    expect(map.items.map(item => item.order)).toEqual(Array.from({ length: total }, (_, index) => index + 1));
    expect(new Set(map.items.map(item => item.id))).toHaveLength(total);
    expect(map.items.slice(planned).every(item => item.type === 'reserve' && item.code === 'Reserve')).toBe(true);
  });

  it('keeps the approved boundary identities for every map', () => {
    expect(grade2.items[0]).toMatchObject({ id: 'g2-001', code: 'Reading Intro', title: 'What’s your name?' });
    expect(grade2.items[52]).toMatchObject({ id: 'g2-053', type: 'lesson' });
    expect(grade2.items.slice(53).map(item => item.id)).toEqual(['g2-054', 'g2-055', 'g2-056', 'g2-057', 'g2-058']);
    expect(grade3.items.slice(58).map(item => item.id)).toEqual(['g3-059', 'g3-060', 'g3-061', 'g3-062', 'g3-063', 'g3-064']);
    expect(grade4.items.slice(58).map(item => item.id)).toEqual(['g4-059', 'g4-060', 'g4-061', 'g4-062', 'g4-063', 'g4-064']);
    expect(grade5.items.slice(54).map(item => item.id)).toEqual(['g5-055', 'g5-056', 'g5-057', 'g5-058', 'g5-059', 'g5-060']);
    expect(grade8.items.slice(89).map(item => item.id)).toEqual(['g8-090', 'g8-091', 'g8-092', 'g8-093', 'g8-094', 'g8-095']);
  });
});

describe('Rainbow progress ranges', () => {
  it('uses an ordinary Step or the end of a valid combined range', () => {
    expect(rainbowProgressStep({ step: 4 })).toBe(4);
    expect(rainbowProgressStep({ stepStart: 4, stepEnd: 5 })).toBe(5);
    expect(rainbowProgressStep({ stepStart: 8, stepEnd: 9 })).toBe(9);
  });

  it('rejects reversed ranges and does not invent a Step for final items', () => {
    expect(rainbowProgressStep({ stepStart: 9, stepEnd: 8 })).toBeNull();
    expect(rainbowProgressStep({ phase: 'final', finalIndex: 1 })).toBeNull();
    const invalid = copy(grade5);
    invalid.items.find(item => item.stepStart === 8).stepEnd = 7;
    expect(validateCourseMap(invalid)).toEqual(expect.objectContaining({ valid: false }));
  });

  it('tracks Unit 4 through combined ranges without turning Final Test into Step 10', () => {
    const unit = grade5.items.filter(item => item.type === 'lesson' && item.unit === 4);
    const progress = unit.map(item => [item.code, normalizedStudentProgress(grade5, item)?.current ?? null]);
    expect(progress).toEqual([
      ['Unit 4 Step 1', 1],
      ['Unit 4 Step 2', 2],
      ['Unit 4 Step 3', 3],
      ['Unit 4 Steps 4–5', 5],
      ['Unit 4 Step 6', 6],
      ['Unit 4 Step 7', 7],
      ['Unit 4 Steps 8–9', 9],
      ['Unit 4 Final Test', null],
    ]);
  });

  it('keeps the combined item identity and visible content in Class Site progress', () => {
    const state = copy(seedState);
    const combined = state.courseMaps['grade-5'].items.find(item => item.code === 'Unit 4 Steps 4–5');
    const lessons = state.courseMaps['grade-5'].items.filter(item => item.type === 'lesson');
    state.teachingGroupCourseStates['grade5-a'].currentPosition = lessons.findIndex(item => item.id === combined.id);
    const site = buildClassSitesFoundation(state).classSites.find(item => item.sourceTeachingGroupId === 'grade5-a');
    expect(combined).toMatchObject({ code: 'Unit 4 Steps 4–5', title: 'Hobbies and Art', stepStart: 4, stepEnd: 5 });
    expect(site).toMatchObject({ currentCourseItemId: combined.id, progress: { kind: 'step', current: 5, total: 9 } });
  });

  it('uses Step 9 for Unit 1 Steps 8–9', () => {
    const combined = grade5.items.find(item => item.code === 'Unit 1 Steps 8–9');
    expect(rainbowProgressStep(combined)).toBe(9);
    expect(normalizedStudentProgress(grade5, combined)).toEqual({ kind: 'step', current: 9, total: 9 });
  });
});
