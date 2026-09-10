import { supabase, supabaseConfigurationError } from '../lib/supabase';
import courseSectionTitles from '../../course-maps/course-section-titles.json';
import { rainbowProgressStep } from './courseMapProgress';
import { coursePlanningContext } from './courseAdjustmentService';

const SELECT_COURSE = 'id,source_course_map_id,display_name,grade';
const SELECT_SECTION = 'id,course_id,section_type,section_number,display_title,sort_order';
const SELECT_SITE = 'id,source_teaching_group_id,course_id,current_course_section_id,current_course_item_id,progress_kind,progress_current,progress_total,display_name,slug,is_active';
const SLUG_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

export class ClassSitesServiceError extends Error {
  constructor(message, cause) {
    super(message, { cause });
    this.name = 'ClassSitesServiceError';
  }
}

const logFailure = (stage, error) => {
  if (!import.meta.env.DEV) return;
  console.error('[class sites foundation] Sync failed', {
    stage,
    code: error?.code || null,
    message: error?.message || String(error),
  });
};

const positiveInteger = value => Number.isInteger(Number(value)) && Number(value) > 0;
const sectionIdentity = (courseMapId, sectionType, sectionNumber) =>
  `${courseMapId}:${sectionType}:${sectionNumber}`;

export const resolveCourseSectionTitle = (courseMapId, sectionType, sectionNumber) =>
  courseSectionTitles[courseMapId]?.[sectionType]?.[String(sectionNumber)] || null;

const sectionFromItem = item => {
  if (item?.type !== 'lesson') return null;
  if (item.sectionType === 'reading') return { sectionType: 'reading', sectionNumber: 0 };
  if (item.sectionType === 'starter') return { sectionType: 'starter', sectionNumber: 0 };
  if (positiveInteger(item.module)) return { sectionType: 'module', sectionNumber: Number(item.module) };
  if (positiveInteger(item.unit)) return { sectionType: 'unit', sectionNumber: Number(item.unit) };
  return null;
};

const sameSection = (item, current) => {
  const itemSection = sectionFromItem(item);
  const currentSection = sectionFromItem(current);
  return Boolean(itemSection && currentSection
    && itemSection.sectionType === currentSection.sectionType
    && itemSection.sectionNumber === currentSection.sectionNumber);
};

export function normalizedStudentProgress(courseMap, currentItem) {
  if (!courseMap || !currentItem || currentItem.type !== 'lesson') return null;
  const sectionItems = (courseMap.items || []).filter(item => item.type === 'lesson' && sameSection(item, currentItem));
  if (!sectionItems.length) return null;
  if (sectionFromItem(currentItem)?.sectionType === 'unit') {
    const steps = sectionItems.map(rainbowProgressStep).filter(positiveInteger);
    const total = steps.length ? Math.max(...steps) : 0;
    const effectiveStep = rainbowProgressStep(currentItem);
    const current = currentItem.phase === 'final'
      ? total
      : effectiveStep;
    return current > 0 ? { kind: 'step', current, total } : null;
  }
  const current = sectionItems.findIndex(item => item.id === currentItem.id) + 1;
  return current > 0 ? { kind: 'lesson', current, total: sectionItems.length } : null;
}

export function buildClassSitesFoundation(state) {
  const courses = Object.values(state.courseMaps || {})
    .filter(map => map?.courseMapId && map?.textbook && positiveInteger(map.grade))
    .map(map => ({
      sourceCourseMapId: map.courseMapId,
      displayName: map.textbook,
      grade: Number(map.grade),
    }))
    .sort((a, b) => a.grade - b.grade || a.sourceCourseMapId.localeCompare(b.sourceCourseMapId));

  const sections = courses.flatMap(course => {
    const map = state.courseMaps[course.sourceCourseMapId];
    const unique = new Map();
    for (const item of map?.items || []) {
      const section = sectionFromItem(item);
      if (!section) continue;
      unique.set(`${section.sectionType}:${section.sectionNumber}`, {
        sourceCourseMapId: course.sourceCourseMapId,
        ...section,
        displayTitle: resolveCourseSectionTitle(course.sourceCourseMapId, section.sectionType, section.sectionNumber),
        sortOrder: section.sectionNumber,
      });
    }
    return [...unique.values()].sort((a, b) => a.sortOrder - b.sortOrder);
  });

  const classSites = (state.teachingGroups || [])
    .filter(group => group?.type === 'class' && group.id && group.courseMapId && !group.archivedAt)
    .map(group => {
      const planning = coursePlanningContext(state, group);
      const currentItem = planning.deterministic ? planning.items[planning.position] || null : null;
      const currentSection = sectionFromItem(currentItem);
      const progress = normalizedStudentProgress(state.courseMaps?.[group.courseMapId], currentItem);
      return {
        sourceTeachingGroupId: group.id,
        sourceCourseMapId: group.courseMapId,
        displayName: group.displayName,
        currentCourseItemId: progress ? currentItem.id : null,
        progress,
        currentSectionKey: currentSection
          ? sectionIdentity(group.courseMapId, currentSection.sectionType, currentSection.sectionNumber)
          : null,
      };
    });

  return { courses, sections, classSites };
}

export function generateClassSiteSlug(randomValues = values => crypto.getRandomValues(values)) {
  const values = randomValues(new Uint8Array(12));
  const suffix = Array.from(values, value => SLUG_ALPHABET[value % SLUG_ALPHABET.length]).join('');
  return `class-${suffix}`;
}

export function buildClassSiteRows({ ownerId, plannedSites, coursesBySource, sectionsBySource, existingSites = [], slugFactory = generateClassSiteSlug }) {
  const existingBySource = new Map(existingSites.map(site => [site.source_teaching_group_id, site]));
  return plannedSites.map(site => {
    const existing = existingBySource.get(site.sourceTeachingGroupId);
    return {
      owner_id: ownerId,
      source_teaching_group_id: site.sourceTeachingGroupId,
      course_id: coursesBySource.get(site.sourceCourseMapId)?.id,
      current_course_section_id: site.currentSectionKey ? sectionsBySource.get(site.currentSectionKey)?.id || null : null,
      display_name: site.displayName,
      current_course_item_id: site.currentCourseItemId,
      progress_kind: site.progress?.kind || null,
      progress_current: site.progress?.current || null,
      progress_total: site.progress?.total || null,
      slug: existing?.slug || slugFactory(),
      is_active: existing?.is_active ?? false,
    };
  });
}

export function classSiteProgressSignature(state) {
  return JSON.stringify(buildClassSitesFoundation(state).classSites.map(site => [
    site.sourceTeachingGroupId, site.currentSectionKey, site.currentCourseItemId,
    site.progress?.kind || null, site.progress?.current || null, site.progress?.total || null,
  ]));
}

const progressFieldsMatch = (site, values) => (
  (site.current_course_section_id ?? null) === values.current_course_section_id
  && (site.current_course_item_id ?? null) === values.current_course_item_id
  && (site.progress_kind ?? null) === values.progress_kind
  && (site.progress_current ?? null) === values.progress_current
  && (site.progress_total ?? null) === values.progress_total
);

export function buildClassSiteProgressUpdates({ plan, sites, sections, courses }) {
  const sectionBySource = new Map();
  const courseById = new Map(courses.map(course => [course.id, course]));
  for (const section of sections) {
    const course = courseById.get(section.course_id);
    if (course) sectionBySource.set(sectionIdentity(course.source_course_map_id, section.section_type, section.section_number), section);
  }
  const siteBySource = new Map(sites.map(site => [site.source_teaching_group_id, site]));
  return plan.classSites.flatMap(item => {
    const site = siteBySource.get(item.sourceTeachingGroupId);
    if (!site) return [];
    const values = {
      current_course_section_id: item.currentSectionKey ? sectionBySource.get(item.currentSectionKey)?.id || null : null,
      current_course_item_id: item.currentCourseItemId,
      progress_kind: item.progress?.kind || null,
      progress_current: item.progress?.current || null,
      progress_total: item.progress?.total || null,
    };
    return progressFieldsMatch(site, values) ? [] : [{ id: site.id, values }];
  });
}

export async function reconcileClassSiteProgress(updates, writeUpdate) {
  await Promise.all(updates.map(update => writeUpdate(update)));
  return { classSites: updates.length };
}

export async function syncClassSiteProgress(state) {
  const user = await requireUser();
  const plan = buildClassSitesFoundation(state);
  const sites = await runQuery('progress site lookup', supabase.from('class_sites')
    .select(SELECT_SITE).eq('owner_id', user.id));
  const sections = await runQuery('progress section lookup', supabase.from('course_sections')
    .select(SELECT_SECTION).eq('owner_id', user.id));
  const courses = await runQuery('progress course lookup', supabase.from('courses')
    .select(SELECT_COURSE).eq('owner_id', user.id));
  const updates = buildClassSiteProgressUpdates({ plan, sites, sections, courses });
  return reconcileClassSiteProgress(updates, async update => {
    const rows = await runQuery('class site progress', supabase.from('class_sites').update(update.values)
      .eq('owner_id', user.id).eq('id', update.id).select('id'));
    if (rows.length !== 1) throw new ClassSitesServiceError('Class Site progress could not be matched to exactly one owned row.');
  });
}

const requireUser = async () => {
  if (!supabase) throw new ClassSitesServiceError(supabaseConfigurationError);
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new ClassSitesServiceError('Sign in before syncing Class Sites.', error);
  return data.user;
};

const runQuery = async (stage, query) => {
  const { data, error } = await query;
  if (error) {
    logFailure(stage, error);
    throw new ClassSitesServiceError(`Class Sites sync could not complete the ${stage} step. Try again.`, error);
  }
  return data || [];
};

export async function loadClassSitesFoundation() {
  const user = await requireUser();
  const [courses, sections, sites] = await Promise.all([
    runQuery('course loading', supabase.from('courses').select(SELECT_COURSE).eq('owner_id', user.id)),
    runQuery('section loading', supabase.from('course_sections').select(SELECT_SECTION).eq('owner_id', user.id)),
    runQuery('class site loading', supabase.from('class_sites').select(SELECT_SITE).eq('owner_id', user.id)),
  ]);
  const courseById = new Map(courses.map(course => [course.id, course]));
  const sectionById = new Map(sections.map(section => [section.id, section]));
  return sites
    .map(site => ({ ...site, course: courseById.get(site.course_id) || null, currentSection: sectionById.get(site.current_course_section_id) || null }))
    .sort((a, b) => a.display_name.localeCompare(b.display_name, undefined, { numeric: true }));
}

export async function setClassSiteActive(siteId, isActive) {
  const user = await requireUser();
  const rows = await runQuery('class site activation', supabase.from('class_sites')
    .update({ is_active: Boolean(isActive) })
    .eq('owner_id', user.id).eq('id', siteId).select(SELECT_SITE));
  if (rows.length !== 1) {
    throw new ClassSitesServiceError('Class Site availability could not be changed. Refresh and try again.');
  }
  return rows[0];
}

export async function syncClassSitesFoundation(state) {
  const user = await requireUser();
  const plan = buildClassSitesFoundation(state);
  const untitledSections = plan.sections.filter(section => !section.displayTitle);
  if (untitledSections.length) {
    const identities = untitledSections.map(section => sectionIdentity(section.sourceCourseMapId, section.sectionType, section.sectionNumber));
    throw new ClassSitesServiceError(`Class Sites sync is missing approved titles for: ${identities.join(', ')}.`);
  }

  const courses = await runQuery('courses', supabase.from('courses').upsert(
    plan.courses.map(course => ({
      owner_id: user.id,
      source_course_map_id: course.sourceCourseMapId,
      display_name: course.displayName,
      grade: course.grade,
    })),
    { onConflict: 'owner_id,source_course_map_id' },
  ).select(SELECT_COURSE));
  const courseBySource = new Map(courses.map(course => [course.source_course_map_id, course]));

  const sectionRows = plan.sections.map(section => ({
    owner_id: user.id,
    course_id: courseBySource.get(section.sourceCourseMapId)?.id,
    section_type: section.sectionType,
    section_number: section.sectionNumber,
    display_title: section.displayTitle,
    sort_order: section.sortOrder,
  }));
  if (sectionRows.some(row => !row.course_id)) {
    throw new ClassSitesServiceError('Class Sites sync could not match every section to a course.');
  }
  const sections = await runQuery('course sections', supabase.from('course_sections').upsert(
    sectionRows,
    { onConflict: 'course_id,section_type,section_number' },
  ).select(SELECT_SECTION));
  const sectionBySource = new Map();
  for (const section of sections) {
    const sourceCourseMapId = courses.find(course => course.id === section.course_id)?.source_course_map_id;
    if (sourceCourseMapId) sectionBySource.set(sectionIdentity(sourceCourseMapId, section.section_type, section.section_number), section);
  }

  const existingSites = await runQuery('existing class sites', supabase.from('class_sites').select(SELECT_SITE).eq('owner_id', user.id));
  const siteRows = buildClassSiteRows({
    ownerId: user.id,
    plannedSites: plan.classSites,
    coursesBySource: courseBySource,
    sectionsBySource: sectionBySource,
    existingSites,
  });
  if (siteRows.some(row => !row.course_id)) {
    throw new ClassSitesServiceError('Class Sites sync could not match every class to a course.');
  }
  const sites = await runQuery('class sites', supabase.from('class_sites').upsert(
    siteRows,
    { onConflict: 'owner_id,source_teaching_group_id' },
  ).select(SELECT_SITE));

  if (import.meta.env.DEV) console.info('[class sites foundation] Sync complete', {
    courses: courses.length,
    sections: sections.length,
    classSites: sites.length,
  });
  return { courses: courses.length, sections: sections.length, classSites: sites.length };
}

export async function deactivateClassSiteForTeachingGroup(teachingGroupId) {
  const user = await requireUser();
  const rows = await runQuery('class site deactivation', supabase.from('class_sites').update({ is_active: false })
    .eq('owner_id', user.id).eq('source_teaching_group_id', teachingGroupId).select(SELECT_SITE));
  return rows[0] || null;
}
