import { describe, expect, it } from 'vitest';
import { seedState } from '../data/seed';
import { buildClassSiteProgressUpdates, buildClassSiteRows, buildClassSitesFoundation, classSiteProgressSignature, generateClassSiteSlug, normalizedStudentProgress, reconcileClassSiteProgress, resolveCourseSectionTitle } from './classSitesService';

const copy = value => JSON.parse(JSON.stringify(value));
const relationalFoundation = plan => {
  const courses = plan.courses.map((course, index) => ({ id: `course-${index}`, source_course_map_id: course.sourceCourseMapId }));
  const courseBySource = new Map(courses.map(course => [course.source_course_map_id, course]));
  const sections = plan.sections.map((section, index) => ({
    id: `section-${index}`,
    course_id: courseBySource.get(section.sourceCourseMapId).id,
    section_type: section.sectionType,
    section_number: section.sectionNumber,
  }));
  return { courses, sections };
};

describe('Class Sites foundation planning', () => {
  it('computes Spotlight progress by structural planned-item order and excludes Reserve', () => {
    const map = copy(seedState.courseMaps['grade-2']);
    const reading = map.items.filter(item => item.type === 'lesson' && item.sectionType === 'reading');
    expect(normalizedStudentProgress(map, reading[2])).toEqual({ kind: 'lesson', current: 3, total: reading.length });
    const starter = map.items.filter(item => item.type === 'lesson' && item.sectionType === 'starter');
    expect(normalizedStudentProgress(map, starter[0])).toEqual({ kind: 'lesson', current: 1, total: starter.length });
    const moduleItems = map.items.filter(item => item.type === 'lesson' && item.module === 1);
    expect(normalizedStudentProgress(map, moduleItems.at(-1))).toEqual({ kind: 'lesson', current: moduleItems.length, total: moduleItems.length });
    map.items.push({ id: 'reserve-inside', type: 'reserve', module: 1, order: 999 });
    expect(normalizedStudentProgress(map, moduleItems[1]).total).toBe(moduleItems.length);
  });

  it('uses identity rather than 1a/1b labels and transitions sections cleanly', () => {
    const map = { items: [
      { id: 'a', type: 'lesson', sectionType: 'starter', code: 'Lesson 1a' },
      { id: 'b', type: 'lesson', sectionType: 'starter', code: 'Lesson 1b' },
      { id: 'c', type: 'lesson', module: 1, code: 'Lesson 1a' },
    ] };
    expect(normalizedStudentProgress(map, map.items[1])).toEqual({ kind: 'lesson', current: 2, total: 2 });
    expect(normalizedStudentProgress(map, map.items[2])).toEqual({ kind: 'lesson', current: 1, total: 1 });
  });

  it('preserves Rainbow Step position inside the current Unit', () => {
    const map = copy(seedState.courseMaps['grade-8']);
    const item = map.items.find(value => value.type === 'lesson' && value.unit === 2 && value.step === 4);
    expect(normalizedStudentProgress(map, item)).toEqual({ kind: 'step', current: 4, total: 10 });
  });
  it('derives the expected courses, structured sections and class sites without changing AppState', () => {
    const state = copy(seedState);
    const before = JSON.stringify(state);
    const plan = buildClassSitesFoundation(state);

    expect(plan.courses.map(course => course.displayName)).toEqual([
      'Spotlight 2', 'Spotlight 3', 'Spotlight 4', 'Rainbow English 5', 'Rainbow English 8',
    ]);
    expect(Object.fromEntries(plan.courses.map(course => [course.sourceCourseMapId, plan.sections.filter(section => section.sourceCourseMapId === course.sourceCourseMapId).length]))).toEqual({
      'grade-2': 7,
      'grade-3': 9,
      'grade-4': 9,
      'grade-5': 6,
      'grade-8': 4,
    });
    expect(plan.sections).toHaveLength(35);
    expect(plan.sections.filter(section => section.sectionType === 'reading')).toEqual([
      expect.objectContaining({ sourceCourseMapId: 'grade-2', sectionNumber: 0, displayTitle: 'My Letters!', sortOrder: 0 }),
    ]);
    expect(plan.sections.filter(section => section.sectionType === 'starter')).toEqual([
      expect.objectContaining({ sourceCourseMapId: 'grade-2', sectionNumber: 0, displayTitle: 'Hello! My Family!', sortOrder: 0 }),
      expect.objectContaining({ sourceCourseMapId: 'grade-3', sectionNumber: 0, displayTitle: 'Welcome back!', sortOrder: 0 }),
      expect.objectContaining({ sourceCourseMapId: 'grade-4', sectionNumber: 0, displayTitle: 'Back together!', sortOrder: 0 }),
    ]);
    expect(plan.sections.every(section => section.displayTitle)).toBe(true);
    expect(plan.classSites).toHaveLength(13);
    expect(plan.classSites.every(site => site.sourceTeachingGroupId && site.sourceCourseMapId)).toBe(true);
    expect(JSON.stringify(state)).toBe(before);
  });

  it('keeps parallel classes on the same course while deriving their current sections independently', () => {
    const state = copy(seedState);
    const grade4Lessons = state.courseMaps['grade-4'].items.filter(item => item.type === 'lesson');
    state.teachingGroupCourseStates['grade4-a'].currentPosition = grade4Lessons.findIndex(item => item.module === 1);
    state.teachingGroupCourseStates['grade4-b'].currentPosition = grade4Lessons.findIndex(item => item.module === 3);
    state.teachingGroupCourseStates['grade4-v'].currentPosition = grade4Lessons.findIndex(item => item.module === 7);

    const grade4Sites = buildClassSitesFoundation(state).classSites.filter(site => site.sourceCourseMapId === 'grade-4');
    expect(new Set(grade4Sites.map(site => site.sourceCourseMapId))).toEqual(new Set(['grade-4']));
    expect(grade4Sites.map(site => site.currentSectionKey)).toEqual([
      'grade-4:module:1', 'grade-4:module:3', 'grade-4:module:7',
    ]);

    const grade5Lessons = state.courseMaps['grade-5'].items.filter(item => item.type === 'lesson');
    state.teachingGroupCourseStates['grade5-a'].currentPosition = grade5Lessons.findIndex(item => item.unit === 4);
    const grade5Site = buildClassSitesFoundation(state).classSites.find(site => site.sourceTeachingGroupId === 'grade5-a');
    expect(grade5Site.currentSectionKey).toBe('grade-5:unit:4');
  });

  it('maps genuine Reading and Starter lessons but not other module-less items', () => {
    const state = copy(seedState);
    const grade2Lessons = state.courseMaps['grade-2'].items.filter(item => item.type === 'lesson');
    state.teachingGroupCourseStates['grade2-a'].currentPosition = grade2Lessons.findIndex(item => item.sectionType === 'reading');
    state.courseMaps['grade-2'].items.splice(1, 0, { id: 'moduleless-review', order: 1.5, type: 'lesson', code: 'Special', title: null, sectionType: 'review' });
    const updatedGrade2Lessons = state.courseMaps['grade-2'].items.filter(item => item.type === 'lesson');
    state.teachingGroupCourseStates['grade2-b'].currentPosition = updatedGrade2Lessons.findIndex(item => item.sectionType === 'starter');
    state.teachingGroupCourseStates['grade2-v'].currentPosition = updatedGrade2Lessons.findIndex(item => item.id === 'moduleless-review');
    const sites = buildClassSitesFoundation(state).classSites;
    expect(sites.find(item => item.sourceTeachingGroupId === 'grade2-a').currentSectionKey).toBe('grade-2:reading:0');
    expect(sites.find(item => item.sourceTeachingGroupId === 'grade2-b').currentSectionKey).toBe('grade-2:starter:0');
    expect(sites.find(item => item.sourceTeachingGroupId === 'grade2-v')).toMatchObject({ currentSectionKey: null, currentCourseItemId: null, progress: null });
  });

  it('maps the seed class positions to Reading, Starter and Unit 1 as appropriate', () => {
    const sites = buildClassSitesFoundation(copy(seedState)).classSites;
    const sectionFor = groupId => sites.find(site => site.sourceTeachingGroupId === groupId).currentSectionKey;
    expect(['grade2-a', 'grade2-b', 'grade2-v'].map(sectionFor)).toEqual(Array(3).fill('grade-2:reading:0'));
    expect(['grade3-a', 'grade3-b', 'grade3-v'].map(sectionFor)).toEqual(Array(3).fill('grade-3:starter:0'));
    expect(['grade4-a', 'grade4-b', 'grade4-v'].map(sectionFor)).toEqual(Array(3).fill('grade-4:starter:0'));
    expect(['grade5-a', 'grade5-b', 'grade5-v'].map(sectionFor)).toEqual(Array(3).fill('grade-5:unit:1'));
    expect(sectionFor('grade8-a')).toBe('grade-8:unit:1');
  });

  it('creates exactly one Starter per eligible course on repeated planning', () => {
    const first = buildClassSitesFoundation(copy(seedState));
    const second = buildClassSitesFoundation(copy(seedState));
    const starterKeys = plan => plan.sections
      .filter(section => section.sectionType === 'starter')
      .map(section => `${section.sourceCourseMapId}:${section.sectionType}:${section.sectionNumber}`);
    expect(starterKeys(first)).toEqual(['grade-2:starter:0', 'grade-3:starter:0', 'grade-4:starter:0']);
    expect(starterKeys(second)).toEqual(starterKeys(first));
    expect(new Set(starterKeys(second)).size).toBe(3);
  });

  it('creates exactly one Reading section only for Spotlight 2 on repeated planning', () => {
    const first = buildClassSitesFoundation(copy(seedState));
    const second = buildClassSitesFoundation(copy(seedState));
    const readingKeys = plan => plan.sections.filter(section => section.sectionType === 'reading').map(section => `${section.sourceCourseMapId}:${section.sectionType}:${section.sectionNumber}`);
    expect(readingKeys(first)).toEqual(['grade-2:reading:0']);
    expect(readingKeys(second)).toEqual(readingKeys(first));
  });

  it('preserves existing slugs and activation state on a repeated relational upsert', () => {
    const plan = buildClassSitesFoundation(copy(seedState));
    const coursesBySource = new Map(plan.courses.map((course, index) => [course.sourceCourseMapId, { id: `course-${index}` }]));
    const sectionsBySource = new Map(plan.sections.map((section, index) => [`${section.sourceCourseMapId}:${section.sectionType}:${section.sectionNumber}`, { id: `section-${index}` }]));
    let slugNumber = 0;
    const first = buildClassSiteRows({
      ownerId: 'teacher-id', plannedSites: plan.classSites, coursesBySource, sectionsBySource,
      slugFactory: () => `class-random${String(++slugNumber).padStart(3, '0')}`,
    });
    const existing = first.map((row, index) => ({ ...row, id: `site-${index}`, is_active: index === 0 }));
    const second = buildClassSiteRows({
      ownerId: 'teacher-id', plannedSites: plan.classSites, coursesBySource, sectionsBySource, existingSites: existing,
      slugFactory: () => { throw new Error('Existing sites must not receive new slugs.'); },
    });

    expect(new Set(first.map(row => row.source_teaching_group_id)).size).toBe(13);
    expect(new Set(first.map(row => row.slug)).size).toBe(13);
    expect(second.map(row => row.slug)).toEqual(first.map(row => row.slug));
    expect(second[0].is_active).toBe(true);
    expect(second.slice(1).every(row => row.is_active === false)).toBe(true);
  });

  it('does not include archived teaching groups in Foundation reconciliation', () => {
    const state = copy(seedState);
    state.teachingGroups.find(group => group.id === 'grade2-a').archivedAt = '2026-08-25';
    const plan = buildClassSitesFoundation(state);
    expect(plan.classSites).toHaveLength(12);
    expect(plan.classSites.some(site => site.sourceTeachingGroupId === 'grade2-a')).toBe(false);
  });
});

describe('Class Site progress reconciliation', () => {
  it('writes a missing startup mirror even when the in-memory signature has not changed', async () => {
    const state = copy(seedState);
    const reading = state.courseMaps['grade-2'].items.filter(item => item.type === 'lesson' && item.sectionType === 'reading');
    state.teachingGroupCourseStates['grade2-a'].currentPosition = 2;
    const signatureBeforeStartup = classSiteProgressSignature(state);
    const plan = buildClassSitesFoundation(state);
    const { courses, sections } = relationalFoundation(plan);
    const sites = [{ id: 'site-2a', source_teaching_group_id: 'grade2-a', current_course_section_id: null, current_course_item_id: null, progress_kind: null, progress_current: null, progress_total: null }];
    const updates = buildClassSiteProgressUpdates({ plan, sites, sections, courses });
    const writes = [];
    await reconcileClassSiteProgress(updates, update => writes.push(update));

    expect(classSiteProgressSignature(state)).toBe(signatureBeforeStartup);
    expect(writes).toEqual([{ id: 'site-2a', values: expect.objectContaining({
      current_course_item_id: reading[2].id, progress_kind: 'lesson', progress_current: 3, progress_total: reading.length,
    }) }]);
  });

  it('writes Rainbow Step 4 of 10 using stable item identity', () => {
    const state = copy(seedState);
    const lessons = state.courseMaps['grade-8'].items.filter(item => item.type === 'lesson');
    const position = lessons.findIndex(item => item.unit === 2 && item.step === 4);
    state.teachingGroupCourseStates['grade8-a'].currentPosition = position;
    const plan = buildClassSitesFoundation(state);
    const { courses, sections } = relationalFoundation(plan);
    const updates = buildClassSiteProgressUpdates({ plan, sites: [{ id: 'site-8a', source_teaching_group_id: 'grade8-a' }], sections, courses });
    expect(updates[0]).toEqual({ id: 'site-8a', values: expect.objectContaining({
      current_course_item_id: lessons[position].id, progress_kind: 'step', progress_current: 4, progress_total: 10,
    }) });
  });

  it('does not write again when the mirror matches and unrelated Homework text changes', async () => {
    const state = copy(seedState);
    const plan = buildClassSitesFoundation(state);
    const { courses, sections } = relationalFoundation(plan);
    const plannedSite = plan.classSites.find(item => item.sourceTeachingGroupId === 'grade2-a');
    const section = sections.find(item => item.section_type === 'reading' && item.course_id === courses.find(course => course.source_course_map_id === 'grade-2').id);
    const sites = [{
      id: 'site-2a', source_teaching_group_id: 'grade2-a', current_course_section_id: section.id,
      current_course_item_id: plannedSite.currentCourseItemId, progress_kind: plannedSite.progress.kind,
      progress_current: plannedSite.progress.current, progress_total: plannedSite.progress.total,
    }];
    const before = classSiteProgressSignature(state);
    state.lessons = [{ id: 'lesson-note', homework: 'Unrelated text edit' }];
    expect(classSiteProgressSignature(state)).toBe(before);
    const updates = buildClassSiteProgressUpdates({ plan: buildClassSitesFoundation(state), sites, sections, courses });
    const writes = [];
    await reconcileClassSiteProgress(updates, update => writes.push(update));
    expect(writes).toEqual([]);
  });
});

describe('Class Sites slugs', () => {
  it('creates lowercase, non-sequential slugs satisfying the database format', () => {
    const first = generateClassSiteSlug(values => values.fill(1));
    const second = generateClassSiteSlug(values => values.fill(2));
    expect(first).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    expect(first.length).toBeGreaterThanOrEqual(8);
    expect(first).not.toBe(second);
    expect(first).not.toContain('grade');
  });
});

describe('Course section editorial titles', () => {
  it('resolves approved Reading, Starter, Module and Unit titles', () => {
    expect(resolveCourseSectionTitle('grade-2', 'reading', 0)).toBe('My Letters!');
    expect(resolveCourseSectionTitle('grade-3', 'starter', 0)).toBe('Welcome back!');
    expect(resolveCourseSectionTitle('grade-4', 'module', 3)).toBe('Tasty treats!');
    expect(resolveCourseSectionTitle('grade-8', 'unit', 2)).toBe('Performing Arts: Theatre');
    expect(resolveCourseSectionTitle('grade-8', 'unit', 99)).toBeNull();
  });

  it('covers all 35 current relational sections without duplicate identities', () => {
    const plan = buildClassSitesFoundation(copy(seedState));
    const identities = plan.sections.map(section => `${section.sourceCourseMapId}:${section.sectionType}:${section.sectionNumber}`);
    expect(plan.sections).toHaveLength(35);
    expect(new Set(identities).size).toBe(35);
    expect(plan.sections.filter(section => section.displayTitle)).toHaveLength(35);
    expect(buildClassSitesFoundation(copy(seedState)).sections).toEqual(plan.sections);
  });
});
