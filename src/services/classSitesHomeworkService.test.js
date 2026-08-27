import { describe, expect, it } from 'vitest';
import { seedState } from '../data/seed';
import { parseIsoDate } from '../utils/date';
import {
  buildAssignmentRow,
  buildHomeworkCourseAdmin,
  buildClassSiteAssetPath,
  currentHomeworkImageCount,
  defaultHomeworkDue,
  dueLessonOptions,
  homeworkTemplateTitle,
  homeworkDueOptionLabel,
  homeworkClassStatus,
  homeworkRowDisplay,
  hasMeaningfulHomework,
  listHomeworkSources,
  nextHomeworkAssetSortOrder,
  resolveTargetCourseLesson,
  resolveHomeworkAssignmentSource,
  selectReusableHomeworkTemplate,
  validateHomeworkPublication,
} from './classSitesHomeworkService';

const copy = value => JSON.parse(JSON.stringify(value));
const sourceLesson = {
  id: 'lesson-homework-1', date: '2026-08-17', number: 5, teachingGroupId: 'grade3-a',
  courseMapItemId: 'g3-001', contentSnapshot: { code: 'Starter Lesson a', title: 'Welcome back!', type: 'lesson' },
  homework: 'Read page 10.', homeworkMaterials: [
    { id: 'link-1', type: 'URL', title: 'Practice', url: 'https://example.com' },
    { id: 'image-1', kind: 'image', bucket: 'homework-images', storagePath: 'teacher/homework/image.jpg', mimeType: 'image/jpeg', width: 800, height: 600, size: 12000 },
  ], updatedAt: '2026-08-17T05:00:00.000Z',
};

describe('Class Sites Homework source discovery', () => {
  it('discovers only materialized lesson Homework and never reads the legacy top-level collection', () => {
    const state = copy(seedState);
    state.lessons = [sourceLesson, { ...sourceLesson, id: 'empty', homework: '', homeworkMaterials: [] }];
    state.homeworkMaterials = [{ id: 'legacy', lessonId: 'empty', url: 'https://legacy.example' }];
    const before = JSON.stringify(state);
    const sources = listHomeworkSources(state);
    expect(sources).toHaveLength(1);
    expect(sources[0]).toMatchObject({ id: sourceLesson.id, date: sourceLesson.date, code: 'Starter Lesson a', homework: 'Read page 10.' });
    expect(sources[0].homeworkMaterials).toHaveLength(2);
    expect(JSON.stringify(state)).toBe(before);
  });

  it('builds a student-friendly title only from real lesson snapshots', () => {
    expect(homeworkTemplateTitle(listHomeworkSources({ ...copy(seedState), lessons: [sourceLesson] })[0])).toBe('Starter Lesson a. Welcome back!');
  });
});

describe('Homework due lesson/date planning', () => {
  it('reuses scheduled lesson generation and returns lessons after assigned_date', () => {
    const state = copy(seedState); state.lessons = [sourceLesson];
    const source = listHomeworkSources(state)[0];
    const options = dueLessonOptions(state, source);
    expect(options.length).toBeGreaterThan(0);
    expect(options.every(option => option.date > source.date && option.id && option.lessonNumber)).toBe(true);
    expect(defaultHomeworkDue(state, source)).toMatchObject({ dueDate: options[0].date, dueLessonDate: options[0].date, dueLessonId: options[0].id });
    expect(options[0].label).toMatch(/^[A-Z][a-z]{2}, \d{2}\.\d{2}\.\d{4}$/);
  });

  it('formats selectable actual lessons in day-month-year order', () => {
    expect(homeworkDueOptionLabel({ date: '2026-09-11', number: 1 })).toBe('Fri, 11.09.2026');
  });

  it('resolves each parallel class assigned date from its own Course Map lesson', () => {
    const state = copy(seedState);
    state.lessons = [
      { ...sourceLesson, id: 'a-lesson', teachingGroupId: 'grade3-a', date: '2026-09-14' },
      { ...sourceLesson, id: 'b-lesson', teachingGroupId: 'grade3-b', date: '2026-09-15' },
    ];
    expect(resolveTargetCourseLesson(state, 'grade3-a', 'g3-001').date).toBe('2026-09-14');
    expect(resolveTargetCourseLesson(state, 'grade3-b', 'g3-001').date).toBe('2026-09-15');
  });

  it('builds Due lesson choices from each parallel class schedule', () => {
    const state = copy(seedState);
    const sourceA = { ...sourceLesson, teachingGroupId: 'grade3-a' };
    const sourceB = { ...sourceLesson, teachingGroupId: 'grade3-b' };
    const optionsA = dueLessonOptions(state, sourceA);
    const optionsB = dueLessonOptions(state, sourceB);
    expect(optionsA.length).toBeGreaterThan(0);
    expect(optionsB.length).toBeGreaterThan(0);
    expect(optionsA.every(option => ['Monday', 'Tuesday'].includes(new Intl.DateTimeFormat('en-GB', { weekday: 'long' }).format(parseIsoDate(option.date))))).toBe(true);
    expect(optionsB.every(option => ['Tuesday', 'Friday'].includes(new Intl.DateTimeFormat('en-GB', { weekday: 'long' }).format(parseIsoDate(option.date))))).toBe(true);
  });

  it('requires a due date and preserves scheduled versus custom mappings', () => {
    expect(() => validateHomeworkPublication(sourceLesson, {})).toThrow(/Choose a due/);
    expect(validateHomeworkPublication(sourceLesson, { dueDate: '2026-08-20', dueLessonDate: '2026-08-20', dueLessonId: 'planned-id' })).toEqual({ dueDate: '2026-08-20', dueLessonDate: '2026-08-20', dueLessonId: 'planned-id' });
    expect(validateHomeworkPublication(sourceLesson, { dueDate: '2026-08-21' })).toEqual({ dueDate: '2026-08-21', dueLessonDate: null, dueLessonId: null });
  });
});

describe('Course Map Homework administration', () => {
  it('builds grade/course/section rows in Course Map order and keeps empty lessons visible', () => {
    const state = copy(seedState); state.lessons = [sourceLesson];
    const admin = buildHomeworkCourseAdmin(state);
    expect(admin.map(course => course.grade)).toEqual([2, 3, 4, 5, 8]);
    const grade2 = admin.find(course => course.grade === 2);
    expect(grade2.sections.map(section => section.label)).toEqual(['Reading', 'Starter', 'Module 1', 'Module 2', 'Module 3', 'Module 4', 'Module 5']);
    const grade3 = admin.find(course => course.grade === 3);
    expect(grade3.sections.map(section => section.label).slice(0, 3)).toEqual(['Starter', 'Module 1', 'Module 2']);
    expect(grade3.sections.flatMap(section => section.rows).map(row => row.item.id)).toEqual(state.courseMaps['grade-3'].items.filter(item => item.type === 'lesson').map(item => item.id));
    expect(grade3.sections.flatMap(section => section.rows).some(row => !row.preparedSource)).toBe(true);
  });

  it('matches prepared Homework by stable Course Map item rather than lesson date', () => {
    const state = copy(seedState); state.lessons = [sourceLesson];
    const publicationData = { records: [{ id: 'template-1', source_course_item_id: 'g3-001', body: 'Published copy', course: { source_course_map_id: 'grade-3' }, assignments: [] }], sites: [] };
    const row = buildHomeworkCourseAdmin(state, publicationData).find(course => course.grade === 3).sections.flatMap(section => section.rows).find(item => item.item.id === 'g3-001');
    expect(row.preparedSource.id).toBe(sourceLesson.id);
    expect(row.record.id).toBe('template-1');
  });

  it('does not copy prepared Homework into parallel-class Lesson Details', () => {
    const state = copy(seedState); state.lessons = [sourceLesson];
    const before = JSON.stringify(state);
    buildHomeworkCourseAdmin(state, { records: [{ source_course_item_id: 'g3-001', body: 'Prepared', course: { source_course_map_id: 'grade-3' }, assignments: [] }], sites: [] });
    expect(state.lessons).toEqual([sourceLesson]);
    expect(JSON.stringify(state)).toBe(before);
  });

  it('derives published, pending and unassigned class-chip states', () => {
    const row = { sources: [{ teachingGroupId: 'grade2-v' }], record: { body: 'Read page 10.', assets: [], assignments: [{ publication_status: 'published', due_date: '2026-08-20', site: { source_teaching_group_id: 'grade2-a' } }, { publication_status: 'draft', due_date: '2026-08-22', site: { source_teaching_group_id: 'grade2-b' } }] } };
    expect(homeworkClassStatus(row, 'grade2-a', '2026-08-22')).toMatchObject({ kind: 'published', symbol: '✓', closed: true });
    expect(homeworkClassStatus(row, 'grade2-b', '2026-08-22')).toMatchObject({ kind: 'pending', symbol: '○', closed: false });
    expect(homeworkClassStatus(row, 'grade2-v', '2026-08-22')).toMatchObject({ kind: 'pending', symbol: '○', closed: false });
    expect(homeworkClassStatus({ sources: [], record: null }, 'grade2-v', '2026-08-22')).toMatchObject({ kind: 'none', symbol: '—', closed: false });
  });

  it('treats an existing empty Template as authoritative over stale lesson Homework', () => {
    const row = { record: { id: 'template', body: '   ', assets: [], assignments: [] }, preparedSource: { homework: 'Old legacy text', homeworkMaterials: [] } };
    expect(homeworkRowDisplay(row)).toEqual({ meaningful: false, body: '', imageCount: 0 });
    expect(homeworkClassStatus(row, 'grade2-a')).toMatchObject({ kind: 'none' });
  });

  it('uses one meaningful-content rule for empty, text-only, image-only and link content', () => {
    expect(hasMeaningfulHomework({ body: '   ', assets: [] })).toBe(false);
    expect(hasMeaningfulHomework({ body: 'Read page 10.', assets: [] })).toBe(true);
    expect(hasMeaningfulHomework({ body: '', assets: [{ asset_type: 'image' }] })).toBe(true);
    expect(hasMeaningfulHomework({ body: '', assets: [{ asset_type: 'link', url: 'https://example.com' }] })).toBe(true);
  });
});

describe('Homework relational publication rows', () => {
  it('uses current Course Map metadata for a stable item instead of its stale materialized lesson snapshot', () => {
    const state = copy(seedState);
    const item = state.courseMaps['grade-8'].items.find(value => value.id === 'g8-001');
    expect(item).toMatchObject({ code: 'Unit 1 Step 1a', title: 'Summer Holidays' });
    const historicalLesson = {
      id: 'grade-8-old-snapshot', date: '2026-09-07', teachingGroupId: 'grade8-a', courseMapItemId: 'g8-001',
      contentSnapshot: { code: 'Unit 1 Step 1 Lesson 1', title: 'Summer Holidays', type: 'lesson' },
    };
    const source = { ...historicalLesson, courseMapId: 'grade-8', code: historicalLesson.contentSnapshot.code, title: historicalLesson.contentSnapshot.title };
    const before = copy(historicalLesson);
    const row = buildAssignmentRow({ userId: 'teacher-1', state, source, site: { id: 'site-1', course_id: 'course-8' }, template: { id: 'template-1' }, due: { dueDate: '2026-09-11' }, publishedAt: '2026-08-26T00:00:00Z' });
    expect(row).toMatchObject({ assigned_course_item_id: 'g8-001', assigned_lesson_code: 'Unit 1 Step 1a', assigned_lesson_title: 'Summer Holidays' });
    expect(historicalLesson).toEqual(before);
  });

  it('applies current title corrections by stable Course Map item ID', () => {
    const state = copy(seedState);
    const item = state.courseMaps['grade-3'].items.find(value => value.id === 'g3-001');
    item.title = 'Corrected welcome title';
    expect(resolveHomeworkAssignmentSource(state, { courseMapId: 'grade-3', courseMapItemId: 'g3-001', code: 'Old code', title: 'Old title' }))
      .toMatchObject({ code: item.code, title: 'Corrected welcome title' });
  });

  it('preserves exact authoritative Final Block assignment metadata', () => {
    const state = copy(seedState);
    const item = state.courseMaps['grade-8'].items.find(value => value.code === 'Unit 1 Final Block 2');
    expect(item).toMatchObject({ title: 'Correction / Error Analysis' });
    const resolved = resolveHomeworkAssignmentSource(state, { courseMapId: 'grade-8', courseMapItemId: item.id, code: 'Unit 1 Lesson 22', title: 'Old title' });
    expect(resolved).toMatchObject({ code: 'Unit 1 Final Block 2', title: 'Correction / Error Analysis' });
  });

  it('counts only current image assets for the Template', () => {
    const image = id => ({ id, asset_type: 'image' });
    expect(currentHomeworkImageCount({ assets: [] })).toBe(0);
    expect(currentHomeworkImageCount({ assets: [image('one')] })).toBe(1);
    expect(currentHomeworkImageCount({ assets: [image('one'), image('two'), { id: 'link', asset_type: 'link' }] })).toBe(2);
    expect(currentHomeworkImageCount({ assets: [image('remaining')] })).toBe(1);
    expect(currentHomeworkImageCount(null)).toBe(0);
  });

  it('uses the source school date and published editorial state without activating the class site', () => {
    const site = { id: 'site-1', course_id: 'course-1', is_active: false };
    const row = buildAssignmentRow({ userId: 'teacher-1', source: sourceLesson, site, template: { id: 'template-1' }, due: { dueDate: '2026-08-20' }, publishedAt: '2026-08-17T06:00:00Z' });
    expect(row).toMatchObject({ owner_id: 'teacher-1', assigned_date: '2026-08-17', due_date: '2026-08-20', due_lesson_date: null, due_lesson_id: null, publication_status: 'published' });
    expect(site.is_active).toBe(false);
  });

  it('builds owner-first student-safe paths without exposing the source path', () => {
    expect(buildClassSiteAssetPath('teacher-1', 'template-1', 'asset-1', 'image/png')).toBe('teacher-1/homework/template-1/asset-1.png');
  });

  it('uses PostgreSQL-safe sequential image sort_order values instead of millisecond timestamps', () => {
    expect(Date.now()).toBeGreaterThan(2147483647);
    expect(nextHomeworkAssetSortOrder([])).toBe(0);
    expect(nextHomeworkAssetSortOrder([{ sort_order: 0 }, { sort_order: 3 }])).toBe(4);
    expect(nextHomeworkAssetSortOrder([{ sort_order: 2147483646 }])).toBe(2147483647);
  });

  it('reuses one template and rejects ambiguous historical duplicates', () => {
    const template = { id: 'template-1', source_lesson_id: sourceLesson.id };
    expect(selectReusableHomeworkTemplate([template])).toBe(template);
    expect(selectReusableHomeworkTemplate([])).toBeNull();
    expect(() => selectReusableHomeworkTemplate([template, { ...template, id: 'template-2' }])).toThrow(/Multiple Homework Templates/);
  });
});
