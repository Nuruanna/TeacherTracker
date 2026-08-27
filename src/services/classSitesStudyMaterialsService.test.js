import { describe, expect, it } from 'vitest';
import {
  buildStudyMaterialAssetPath, reorderedStudyMaterialRows, sortStudyMaterialSections,
  studyMaterialCategoryCounts, studyMaterialSectionLabel,
} from './classSitesStudyMaterialsService';

describe('Study Materials overview helpers', () => {
  it('labels and orders real Reading, Starter, Module and Unit sections', () => {
    const sections = [
      { id: 'u2', section_type: 'unit', section_number: 2, sort_order: 2 },
      { id: 'starter', section_type: 'starter', section_number: 0, sort_order: 0 },
      { id: 'm1', section_type: 'module', section_number: 1, sort_order: 1 },
      { id: 'reading', section_type: 'reading', section_number: 0, sort_order: -1 },
    ];
    expect(sortStudyMaterialSections(sections).map(studyMaterialSectionLabel)).toEqual(['Reading', 'Starter', 'Module 1', 'Unit 2']);
  });

  it('keeps category counts separate and includes unpublished preparation', () => {
    const counts = studyMaterialCategoryCounts([
      { category: 'vocabulary', publication_status: 'draft' },
      { category: 'vocabulary', publication_status: 'published' },
      { category: 'grammar', publication_status: 'published' },
    ]);
    expect(counts).toEqual({ vocabulary: 2, grammar: 1, extra: 0 });
  });
});

describe('Study Materials ordering and storage ownership', () => {
  const blocks = [
    { id: 'a', sort_order: 0 }, { id: 'b', sort_order: 1 }, { id: 'c', sort_order: 2 },
  ];
  it('moves one block without changing category membership or duplicating rows', () => {
    expect(reorderedStudyMaterialRows(blocks, 'b', -1)).toEqual([
      { id: 'b', sort_order: 0 }, { id: 'a', sort_order: 1 }, { id: 'c', sort_order: 2 },
    ]);
    expect(reorderedStudyMaterialRows(blocks, 'a', -1)).toEqual(blocks.map(({ id }, sort_order) => ({ id, sort_order })));
  });

  it('builds a student-safe path separate from Homework ownership', () => {
    expect(buildStudyMaterialAssetPath('teacher', 'section', 'block', 'asset')).toBe('teacher/study-materials/section/block/asset.jpg');
    expect(buildStudyMaterialAssetPath('teacher', 'section', 'block', 'asset')).not.toContain('/homework/');
  });
});
