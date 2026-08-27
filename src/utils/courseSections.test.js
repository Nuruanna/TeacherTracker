import { describe, expect, it } from 'vitest';
import { courseSectionDisplayLabel, courseSectionStructuralLabel } from './courseSections';

describe('course section display formatting', () => {
  it.each([
    [{ section_type: 'reading', section_number: 0 }, 'Reading'],
    [{ section_type: 'starter', section_number: 0 }, 'Starter'],
    [{ section_type: 'module', section_number: 3 }, 'Module 3'],
    [{ section_type: 'unit', section_number: 1 }, 'Unit 1'],
  ])('formats the structural label without zero suffixes', (section, expected) => {
    expect(courseSectionStructuralLabel(section)).toBe(expected);
  });

  it.each([
    [{ section_type: 'reading', section_number: 0, display_title: 'My Letters!' }, 'Reading · My Letters!'],
    [{ section_type: 'starter', section_number: 0, display_title: 'Welcome back!' }, 'Starter · Welcome back!'],
    [{ section_type: 'module', section_number: 1, display_title: 'My Home!' }, 'Module 1 · My Home!'],
    [{ section_type: 'unit', section_number: 1, display_title: 'Holidays Are Over' }, 'Unit 1 · Holidays Are Over'],
    [{ section_type: 'unit', section_number: 1, display_title: 'Sport and Outdoor Activities' }, 'Unit 1 · Sport and Outdoor Activities'],
  ])('combines structural and human-friendly titles', (section, expected) => {
    expect(courseSectionDisplayLabel(section)).toBe(expected);
  });

  it('falls back to the structural label when display_title is missing', () => {
    expect(courseSectionDisplayLabel({ section_type: 'module', section_number: 4, display_title: null })).toBe('Module 4');
  });
});
