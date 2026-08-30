import { supabase, supabaseConfigurationError } from '../lib/supabase';
import { addDays, isoDate, parseIsoDate, weekday } from '../utils/date';
import { lessonsForDate } from './lessonViewService';
import { optimizeHomeworkImage } from './homeworkImageService';
import { getAppDate } from '../utils/appTime';

export const CLASS_SITE_ASSET_BUCKET = 'class-site-assets';
export const MAX_HOMEWORK_AUDIO_BYTES = 20 * 1024 * 1024;
const MP3_MIME_TYPES = new Set(['audio/mpeg', 'audio/mp3', 'audio/x-mpeg', '', 'application/octet-stream']);
const SOURCE_IMAGE_BUCKET = 'homework-images';

export class HomeworkPublicationError extends Error {
  constructor(message, cause) {
    super(message, { cause });
    this.name = 'HomeworkPublicationError';
  }
}

const devError = (stage, error) => {
  if (!import.meta.env.DEV) return;
  console.error('[class sites homework] Operation failed', {
    stage,
    code: error?.code || null,
    message: error?.message || String(error),
  });
};

const query = async (stage, operation) => {
  const { data, error } = await operation;
  if (error) {
    devError(stage, error);
    throw new HomeworkPublicationError(`Homework publication could not complete the ${stage} step. Try again.`, error);
  }
  return data;
};

const currentUser = async () => {
  if (!supabase) throw new HomeworkPublicationError(supabaseConfigurationError);
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user?.id) throw new HomeworkPublicationError('Sign in before managing published homework.', error);
  return data.user;
};

const text = value => String(value || '').trim();
const isImage = material => material?.kind === 'image';
const isLink = material => !isImage(material) && Boolean(text(material?.url));

export function hasMeaningfulHomework(value) {
  if (!value) return false;
  const body = value.body ?? value.homework ?? '';
  const assets = value.assets ?? value.homeworkMaterials ?? [];
  return Boolean(text(body) || assets.some(asset => ['image', 'audio'].includes(asset?.asset_type) || ['image', 'audio'].includes(asset?.kind) || Boolean(text(asset?.url))));
}

export function validateHomeworkAudio(file) {
  if (!/\.mp3$/i.test(file?.name || '') || !MP3_MIME_TYPES.has(String(file?.type || '').toLowerCase())) {
    throw new HomeworkPublicationError('Only MP3 audio files are supported.');
  }
  if (Number(file?.size || 0) > MAX_HOMEWORK_AUDIO_BYTES) {
    throw new HomeworkPublicationError('Audio files must be 20 MB or smaller.');
  }
  return file;
}

export function homeworkAudioTitle(filename) {
  return text(String(filename || '').replace(/\.mp3$/i, '')) || 'Audio';
}

export function homeworkRowDisplay(row) {
  const authoritative = row?.record || row?.preparedSource || null;
  return {
    meaningful: hasMeaningfulHomework(authoritative),
    body: hasMeaningfulHomework(authoritative) ? text(authoritative.body ?? authoritative.homework) : '',
    imageCount: hasMeaningfulHomework(authoritative)
      ? (authoritative.assets || authoritative.homeworkMaterials || []).filter(asset => asset?.asset_type === 'image' || asset?.kind === 'image').length
      : 0,
  };
}

export function listHomeworkSources(state) {
  const groups = new Map((state.teachingGroups || []).filter(group => group.type === 'class').map(group => [group.id, group]));
  return (state.lessons || [])
    .filter(lesson => groups.has(lesson.teachingGroupId))
    .filter(lesson => text(lesson.homework) || (lesson.homeworkMaterials || []).length > 0)
    .map(lesson => {
      const group = groups.get(lesson.teachingGroupId);
      const snapshot = lesson.contentSnapshot || {};
      return {
        id: lesson.id,
        date: lesson.date,
        teachingGroupId: lesson.teachingGroupId,
        courseMapId: group.courseMapId,
        courseMapItemId: lesson.courseMapItemId || null,
        code: snapshot.code || lesson.code || null,
        title: snapshot.title || null,
        homework: lesson.homework || '',
        homeworkMaterials: (lesson.homeworkMaterials || []).map(material => ({ ...material })),
        updatedAt: lesson.updatedAt || null,
        group: { id: group.id, grade: group.grade, displayName: group.displayName, textbook: group.textbook },
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date) || String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
}

export function homeworkSourceFromLesson(state, lesson, overrides = {}) {
  const group = state.teachingGroups?.find(item => item.id === lesson?.teachingGroupId);
  if (!lesson || group?.type !== 'class') return null;
  const snapshot = lesson.contentSnapshot || {};
  return {
    id: lesson.id, date: lesson.date, teachingGroupId: lesson.teachingGroupId,
    courseMapId: group.courseMapId, courseMapItemId: lesson.courseMapItemId || null,
    code: snapshot.code || lesson.code || null, title: snapshot.title || null,
    homework: overrides.homework ?? lesson.homework ?? '',
    homeworkMaterials: (overrides.homeworkMaterials ?? lesson.homeworkMaterials ?? []).map(material => ({ ...material })),
    updatedAt: lesson.updatedAt || null,
    group: { id: group.id, grade: group.grade, displayName: group.displayName, textbook: group.textbook },
  };
}

export function dueLessonOptions(state, source, limit = 8) {
  const start = parseIsoDate(source.date);
  const end = parseIsoDate(state.academicCalendar?.academicYear?.end);
  if (!start || !end) return [];
  const asOf = new Date(`${source.date}T00:00:00+10:00`);
  const result = [];
  for (let date = addDays(start, 1); date <= end && result.length < limit; date = addDays(date, 1)) {
    for (const lesson of lessonsForDate(state, date, asOf)) {
      if (lesson.teachingGroupId !== source.teachingGroupId) continue;
      if (lesson.manualStatus === 'cancelled' || lesson.manualStatus === 'rescheduled') continue;
      result.push({
        id: lesson.id,
        date: lesson.date,
        lessonNumber: lesson.number,
        label: homeworkDueOptionLabel(lesson),
      });
      if (result.length >= limit) break;
    }
  }
  return result;
}

export function homeworkDueOptionLabel(lesson) {
  const date = parseIsoDate(lesson.date);
  const numericDate = date ? `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}.${date.getFullYear()}` : lesson.date;
  return `${weekday(date).slice(0, 3)}, ${numericDate}`;
}

export function defaultHomeworkDue(state, source) {
  const next = dueLessonOptions(state, source, 1)[0];
  return next ? { mode: `lesson:${next.id}`, dueDate: next.date, dueLessonDate: next.date, dueLessonId: next.id } : { mode: '', dueDate: '', dueLessonDate: null, dueLessonId: null };
}

const mapSection = item => item?.sectionType === 'reading' ? { key: 'reading:0', label: 'Reading' }
  : item?.sectionType === 'starter' ? { key: 'starter:0', label: 'Starter' }
    : Number(item?.module) > 0 ? { key: `module:${Number(item.module)}`, label: `Module ${Number(item.module)}` }
      : Number(item?.unit) > 0 ? { key: `unit:${Number(item.unit)}`, label: `Unit ${Number(item.unit)}` }
        : { key: 'other', label: 'Other lessons' };

export function buildHomeworkCourseAdmin(state, publicationData = { records: [], sites: [] }) {
  const sources = listHomeworkSources(state);
  return Object.values(state.courseMaps || {}).sort((a, b) => a.grade - b.grade).map(courseMap => {
    const groups = (state.teachingGroups || []).filter(group => group.type === 'class' && group.courseMapId === courseMap.courseMapId);
    const sections = [];
    for (const item of (courseMap.items || []).filter(value => value.type === 'lesson')) {
      const section = mapSection(item);
      let target = sections.find(value => value.key === section.key);
      if (!target) { target = { ...section, rows: [] }; sections.push(target); }
      const itemSources = sources.filter(source => source.courseMapId === courseMap.courseMapId && source.courseMapItemId === item.id);
      const record = (publicationData.records || []).find(value => value.course?.source_course_map_id === courseMap.courseMapId && value.source_course_item_id === item.id) || null;
      target.rows.push({ item, sources: itemSources, preparedSource: itemSources[0] || null, record });
    }
    return { courseMapId: courseMap.courseMapId, grade: courseMap.grade, displayName: courseMap.textbook, groups, sections };
  });
}

export const currentHomeworkImageCount = record => (record?.assets || []).filter(asset => asset.asset_type === 'image').length;

export function homeworkClassStatus(row, groupId, today) {
  if (!homeworkRowDisplay(row).meaningful) return { kind: 'none', symbol: '—', assignment: null, closed: false };
  const assignment = row.record?.assignments?.find(item => item.site?.source_teaching_group_id === groupId) || null;
  if (assignment?.publication_status === 'published') return { kind: 'published', symbol: '✓', assignment, closed: Boolean(today && assignment.due_date < today) };
  if (row.record) return { kind: 'pending', symbol: '○', assignment, closed: false };
  return { kind: 'none', symbol: '—', assignment: null, closed: false };
}

export function nextHomeworkAssetSortOrder(rows = []) {
  return Math.min(2147483647, Math.max(-1, ...rows.map(row => Number.isInteger(row.sort_order) ? row.sort_order : -1)) + 1);
}

export const homeworkTemplateTitle = source => [text(source.code), text(source.title)].filter(Boolean).join('. ') || null;

export function selectReusableHomeworkTemplate(rows) {
  if (rows.length > 1) throw new HomeworkPublicationError('Multiple Homework Templates exist for this source lesson. Publication was stopped for review.');
  return rows[0] || null;
}

export function validateHomeworkPublication(source, due) {
  if (!source?.id || !source?.teachingGroupId || !source?.date) throw new HomeworkPublicationError('The source lesson is incomplete and cannot be published.');
  if (!due?.dueDate) throw new HomeworkPublicationError('Choose a due lesson or custom due date before publishing.');
  if (due.dueDate < source.date) throw new HomeworkPublicationError('Due date cannot be before the assigned lesson date.');
  return {
    dueDate: due.dueDate,
    dueLessonDate: due.dueLessonDate || null,
    dueLessonId: due.dueLessonId || null,
  };
}

export function buildClassSiteAssetPath(userId, templateId, assetId, mimeType = 'image/jpeg') {
  const extension = mimeType === 'audio/mpeg' ? 'mp3' : mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
  return `${userId}/homework/${templateId}/${assetId}.${extension}`;
}

export function resolveHomeworkAssignmentSource(state, source) {
  if (!source?.courseMapItemId) return source;
  const item = state?.courseMaps?.[source.courseMapId]?.items?.find(value => value.id === source.courseMapItemId && value.type === 'lesson');
  return item ? { ...source, code: item.code || null, title: item.title || null } : source;
}

export function buildAssignmentRow({ userId, state, source, site, template, due, publishedAt }) {
  const assignmentSource = resolveHomeworkAssignmentSource(state, source);
  const checkedDue = validateHomeworkPublication(assignmentSource, due);
  return {
    owner_id: userId,
    course_id: site.course_id,
    homework_template_id: template.id,
    class_site_id: site.id,
    assigned_lesson_id: assignmentSource.id,
    assigned_course_item_id: assignmentSource.courseMapItemId,
    assigned_lesson_code: assignmentSource.code,
    assigned_lesson_title: assignmentSource.title,
    assigned_date: assignmentSource.date,
    due_date: checkedDue.dueDate,
    due_lesson_date: checkedDue.dueLessonDate,
    due_lesson_id: checkedDue.dueLessonId,
    publication_status: 'published',
    published_at: publishedAt,
  };
}

async function resolveFoundation(userId, source) {
  const sites = await query('class site lookup', supabase.from('class_sites')
    .select('id,course_id,source_teaching_group_id,is_active')
    .eq('owner_id', userId).eq('source_teaching_group_id', source.teachingGroupId).limit(2));
  if (sites.length !== 1) throw new HomeworkPublicationError(sites.length ? 'Multiple Class Sites match this source class.' : 'Sync the Class Sites foundation before publishing this homework.');
  const courseItems = source.courseMapItemId
    ? await query('course item section lookup', supabase.from('course_sections').select('id,section_type,section_number').eq('owner_id', userId).eq('course_id', sites[0].course_id))
    : [];
  return { site: sites[0], sections: courseItems || [] };
}

const sourceSection = (state, source, sections) => {
  const item = state.courseMaps?.[source.courseMapId]?.items?.find(value => value.id === source.courseMapItemId);
  const identity = item?.sectionType === 'reading' ? ['reading', 0]
    : item?.sectionType === 'starter' ? ['starter', 0]
      : Number.isInteger(Number(item?.module)) && Number(item.module) > 0 ? ['module', Number(item.module)]
        : Number.isInteger(Number(item?.unit)) && Number(item.unit) > 0 ? ['unit', Number(item.unit)] : null;
  return identity ? sections.find(section => section.section_type === identity[0] && section.section_number === identity[1])?.id || null : null;
};

async function findOrCreateTemplate(userId, state, source, courseId, sections) {
  const lookup = supabase.from('homework_templates').select('id,course_id,source_lesson_id,source_course_item_id')
    .eq('owner_id', userId).eq('course_id', courseId);
  const existing = await query('template lookup', source.courseMapItemId
    ? lookup.eq('source_course_item_id', source.courseMapItemId).limit(2)
    : lookup.eq('source_lesson_id', source.id).limit(2));
  let reusable;
  try { reusable = selectReusableHomeworkTemplate(existing); }
  catch (error) {
    devError('template duplicate check', error);
    throw error;
  }
  const values = {
    owner_id: userId,
    course_id: courseId,
    course_section_id: sourceSection(state, source, sections),
    source_lesson_id: reusable?.source_lesson_id || source.id,
    source_course_item_id: source.courseMapItemId,
    source_lesson_code: source.code,
    source_lesson_title: source.title,
    title: homeworkTemplateTitle(source),
    body: source.homework,
    content_status: 'ready',
  };
  if (reusable) return { template: reusable, values, created: false };
  const rows = await query('template creation', supabase.from('homework_templates').insert({ ...values, content_status: 'draft' }).select('id,course_id,source_lesson_id'));
  return { template: rows[0], values, created: true };
}

async function copySourceImage(userId, templateId, material) {
  if (material.bucket !== SOURCE_IMAGE_BUCKET || !material.storagePath?.startsWith(`${userId}/`)) {
    throw new HomeworkPublicationError('A source Homework image could not be verified for publication.');
  }
  const blob = await query('source image download', supabase.storage.from(SOURCE_IMAGE_BUCKET).download(material.storagePath));
  const assetId = crypto.randomUUID();
  const mimeType = material.mimeType || blob.type || 'image/jpeg';
  const storagePath = buildClassSiteAssetPath(userId, templateId, assetId, mimeType);
  await query('student-safe image upload', supabase.storage.from(CLASS_SITE_ASSET_BUCKET).upload(storagePath, blob, { contentType: mimeType, upsert: false }));
  return {
    uploadedPath: storagePath,
    row: {
      owner_id: userId, homework_template_id: templateId, asset_type: 'image',
      bucket: CLASS_SITE_ASSET_BUCKET, storage_path: storagePath, mime_type: mimeType,
      width: material.width || null, height: material.height || null,
      size_bytes: material.size || blob.size || null, url: null, title: material.originalName || null,
    },
  };
}

async function removeStoragePaths(paths) {
  if (!paths.length) return;
  await query('published image cleanup', supabase.storage.from(CLASS_SITE_ASSET_BUCKET).remove(paths));
}

async function replaceTemplateAssets(userId, templateId, materials) {
  const oldAssets = await query('published asset lookup', supabase.from('homework_assets').select('id,asset_type,bucket,storage_path,sort_order').eq('owner_id', userId).eq('homework_template_id', templateId));
  const replacedAssets = oldAssets.filter(asset => ['image', 'link'].includes(asset.asset_type));
  const preservedAssets = oldAssets.filter(asset => !['image', 'link'].includes(asset.asset_type));
  const firstSortOrder = nextHomeworkAssetSortOrder(preservedAssets);
  const copied = [];
  try {
    for (const material of materials.filter(isImage)) copied.push(await copySourceImage(userId, templateId, material));
  } catch (error) {
    try { await removeStoragePaths(copied.map(item => item.uploadedPath)); } catch (cleanupError) { devError('staged image rollback', cleanupError); }
    throw error;
  }
  const rows = [
    ...materials.filter(isLink).map((material, index) => ({
      owner_id: userId, homework_template_id: templateId, asset_type: 'link',
      bucket: null, storage_path: null, mime_type: null, width: null, height: null, size_bytes: null,
      url: text(material.url), title: text(material.title) || text(material.type) || null, sort_order: firstSortOrder + index,
    })),
    ...copied.map((item, index) => ({ ...item.row, sort_order: firstSortOrder + materials.filter(isLink).length + index })),
  ];
  let inserted = [];
  try {
    if (rows.length) inserted = await query('published asset creation', supabase.from('homework_assets').insert(rows).select('id'));
    await removeStoragePaths(replacedAssets.filter(asset => asset.asset_type !== 'link' && asset.bucket === CLASS_SITE_ASSET_BUCKET && asset.storage_path).map(asset => asset.storage_path));
    if (replacedAssets.length) await query('old asset metadata cleanup', supabase.from('homework_assets').delete().eq('owner_id', userId).in('id', replacedAssets.map(asset => asset.id)));
  } catch (error) {
    try {
      if (inserted.length) await query('new asset metadata rollback', supabase.from('homework_assets').delete().eq('owner_id', userId).in('id', inserted.map(asset => asset.id)));
      await removeStoragePaths(copied.map(item => item.uploadedPath));
    } catch (cleanupError) { devError('asset replacement rollback', cleanupError); }
    throw error;
  }
  return rows.length;
}

export async function loadHomeworkPublications() {
  const user = await currentUser();
  const [templates, assignments, sites, courses, assets] = await Promise.all([
    query('template loading', supabase.from('homework_templates').select('id,course_id,course_section_id,source_lesson_id,source_course_item_id,source_lesson_code,source_lesson_title,title,body,content_status,updated_at').eq('owner_id', user.id)),
    query('assignment loading', supabase.from('homework_assignments').select('id,homework_template_id,class_site_id,assigned_date,due_date,due_lesson_date,due_lesson_id,publication_status,published_at').eq('owner_id', user.id)),
    query('class site loading', supabase.from('class_sites').select('id,course_id,source_teaching_group_id,display_name,is_active').eq('owner_id', user.id)),
    query('course loading', supabase.from('courses').select('id,source_course_map_id,display_name,grade').eq('owner_id', user.id)),
    query('asset loading', supabase.from('homework_assets').select('id,homework_template_id,asset_type,bucket,storage_path,mime_type,width,height,size_bytes,url,title,sort_order').eq('owner_id', user.id)),
  ]);
  const siteById = new Map(sites.map(site => [site.id, site]));
  const courseById = new Map(courses.map(course => [course.id, course]));
  const records = templates.map(template => {
    const templateAssignments = assignments.filter(assignment => assignment.homework_template_id === template.id).map(assignment => ({ ...assignment, site: siteById.get(assignment.class_site_id) || null }));
    const templateAssets = assets.filter(asset => asset.homework_template_id === template.id).map(asset => asset.bucket && asset.storage_path ? { ...asset, publicUrl: supabase.storage.from(asset.bucket).getPublicUrl(asset.storage_path).data.publicUrl } : asset);
    return {
      ...template,
      course: courseById.get(template.course_id) || null,
      assignments: templateAssignments,
      assets: templateAssets,
      assetCount: currentHomeworkImageCount({ assets: templateAssets }),
    };
  });
  return { records, sites };
}

export async function publishHomeworkToSourceClass(state, source, due) {
  validateHomeworkPublication(source, due);
  const originalState = JSON.stringify(state);
  const user = await currentUser();
  const { site, sections } = await resolveFoundation(user.id, source);
  const { template, values, created } = await findOrCreateTemplate(user.id, state, source, site.course_id, sections);
  const hasLocalContent = Boolean(text(source.homework) || source.homeworkMaterials?.length);
  const assetCount = created || hasLocalContent ? await replaceTemplateAssets(user.id, template.id, source.homeworkMaterials || []) : null;
  if (created || hasLocalContent) await query('template update', supabase.from('homework_templates').update(values).eq('owner_id', user.id).eq('id', template.id));
  const assignment = buildAssignmentRow({ userId: user.id, state, source, site, template, due, publishedAt: new Date().toISOString() });
  const assignments = await query('source assignment publication', supabase.from('homework_assignments').upsert(assignment, {
    onConflict: 'homework_template_id,class_site_id,assigned_date',
  }).select('id,homework_template_id,class_site_id,assigned_date,due_date,due_lesson_date,due_lesson_id,publication_status,published_at'));
  if (JSON.stringify(state) !== originalState) throw new HomeworkPublicationError('Publishing unexpectedly changed the private AppState.');
  return { templateId: template.id, assignment: assignments[0], assetCount, classSiteActive: site.is_active };
}

export async function saveSharedHomeworkDraft(state, source) {
  if (!source?.courseMapItemId || (!text(source.homework) && !source.homeworkMaterials?.length)) throw new HomeworkPublicationError('Enter Homework text or add an image before saving the shared draft.');
  const user = await currentUser();
  const { site, sections } = await resolveFoundation(user.id, source);
  const { template, values, created } = await findOrCreateTemplate(user.id, state, source, site.course_id, sections);
  const assetCount = await replaceTemplateAssets(user.id, template.id, source.homeworkMaterials || []);
  await query('shared template draft save', supabase.from('homework_templates').update({ ...values, content_status: 'draft' }).eq('owner_id', user.id).eq('id', template.id));
  const automaticDue = defaultHomeworkDue(state, source);
  if (automaticDue.dueDate) {
    const draftAssignment = { ...buildAssignmentRow({ userId: user.id, state, source, site, template, due: automaticDue, publishedAt: null }), publication_status: 'draft', published_at: null };
    await query('source draft assignment', supabase.from('homework_assignments').upsert(draftAssignment, { onConflict: 'homework_template_id,class_site_id,assigned_date' }));
  }
  return { templateId: template.id, created, assetCount };
}

export async function saveCentralHomeworkTemplate(courseMapId, item, body, existingTemplateId = null, contentStatus = 'draft') {
  const user = await currentUser();
  const courses = await query('course lookup', supabase.from('courses').select('id,source_course_map_id').eq('owner_id', user.id).eq('source_course_map_id', courseMapId).limit(2));
  if (courses.length !== 1) throw new HomeworkPublicationError('Sync the Class Sites foundation before creating Course Map Homework.');
  const existing = await query('central template lookup', supabase.from('homework_templates').select('id,source_course_item_id').eq('owner_id', user.id).eq('course_id', courses[0].id).eq('source_course_item_id', item.id).limit(2));
  const reusable = selectReusableHomeworkTemplate(existing);
  if (existingTemplateId && reusable?.id !== existingTemplateId) throw new HomeworkPublicationError('The shared Homework Template changed. Reload and try again.');
  const sectionIdentity = item.sectionType === 'reading' ? ['reading', 0] : item.sectionType === 'starter' ? ['starter', 0] : Number(item.module) > 0 ? ['module', Number(item.module)] : Number(item.unit) > 0 ? ['unit', Number(item.unit)] : null;
  const sections = sectionIdentity ? await query('central template section lookup', supabase.from('course_sections').select('id').eq('owner_id', user.id).eq('course_id', courses[0].id).eq('section_type', sectionIdentity[0]).eq('section_number', sectionIdentity[1]).limit(1)) : [];
  const values = { owner_id: user.id, course_id: courses[0].id, course_section_id: sections[0]?.id || null, source_course_item_id: item.id, source_lesson_code: item.code || null, source_lesson_title: item.title || null, title: [item.code, item.title].filter(Boolean).join('. ') || null, body, content_status: contentStatus };
  if (reusable) { await query('central template update', supabase.from('homework_templates').update(values).eq('owner_id', user.id).eq('id', reusable.id)); return reusable.id; }
  const rows = await query('central template creation', supabase.from('homework_templates').insert({ ...values, source_lesson_id: null, source_course_item_id: item.id }).select('id'));
  return rows[0].id;
}

export async function updateHomeworkTemplateBody(templateId, body, contentStatus = 'draft') {
  const user = await currentUser();
  const rows = await query('template text update', supabase.from('homework_templates').update({ body, content_status: contentStatus })
    .eq('owner_id', user.id).eq('id', templateId).select('id,body,content_status,updated_at'));
  if (rows.length !== 1) throw new HomeworkPublicationError('The shared Homework Template could not be found.');
  return rows[0];
}

export async function deleteHomeworkTemplate(templateId) {
  const user = await currentUser();
  const templates = await query('template deletion lookup', supabase.from('homework_templates').select('id').eq('owner_id', user.id).eq('id', templateId).limit(1));
  if (templates.length !== 1) throw new HomeworkPublicationError('The Homework Template could not be found.');
  const assets = await query('template asset deletion lookup', supabase.from('homework_assets').select('id,asset_type,bucket,storage_path').eq('owner_id', user.id).eq('homework_template_id', templateId));
  const ownedPaths = assets.filter(asset => asset.bucket === CLASS_SITE_ASSET_BUCKET && asset.storage_path?.startsWith(`${user.id}/homework/${templateId}/`)).map(asset => asset.storage_path);
  await removeStoragePaths(ownedPaths);
  await query('template assignment deletion', supabase.from('homework_assignments').delete().eq('owner_id', user.id).eq('homework_template_id', templateId));
  await query('template asset metadata deletion', supabase.from('homework_assets').delete().eq('owner_id', user.id).eq('homework_template_id', templateId));
  const deleted = await query('template deletion', supabase.from('homework_templates').delete().eq('owner_id', user.id).eq('id', templateId).select('id'));
  if (deleted.length !== 1) throw new HomeworkPublicationError('The Homework Template could not be deleted.');
  return deleted[0];
}

export async function uploadSharedHomeworkImage(templateId, file) {
  const user = await currentUser();
  const optimized = await optimizeHomeworkImage(file);
  const assetId = crypto.randomUUID();
  const storagePath = buildClassSiteAssetPath(user.id, templateId, assetId, optimized.mimeType);
  await query('shared image upload', supabase.storage.from(CLASS_SITE_ASSET_BUCKET).upload(storagePath, optimized.blob, { contentType: optimized.mimeType, upsert: false }));
  try {
    const existing = await query('shared image ordering', supabase.from('homework_assets').select('sort_order').eq('owner_id', user.id).eq('homework_template_id', templateId).order('sort_order', { ascending: false }).limit(1));
    const rows = await query('shared image metadata', supabase.from('homework_assets').insert({ owner_id: user.id, homework_template_id: templateId, asset_type: 'image', bucket: CLASS_SITE_ASSET_BUCKET, storage_path: storagePath, mime_type: optimized.mimeType, width: optimized.width, height: optimized.height, size_bytes: optimized.blob.size, sort_order: nextHomeworkAssetSortOrder(existing) }).select('id,homework_template_id,asset_type,bucket,storage_path,mime_type,width,height,size_bytes,url,title,sort_order'));
    return { ...rows[0], publicUrl: supabase.storage.from(CLASS_SITE_ASSET_BUCKET).getPublicUrl(storagePath).data.publicUrl };
  } catch (error) { try { await removeStoragePaths([storagePath]); } catch (cleanupError) { devError('shared image rollback', cleanupError); } throw error; }
}

export async function uploadSharedHomeworkAudio(templateId, file) {
  validateHomeworkAudio(file);
  const user = await currentUser();
  const assetId = crypto.randomUUID();
  const storagePath = buildClassSiteAssetPath(user.id, templateId, assetId, 'audio/mpeg');
  await query('shared audio upload', supabase.storage.from(CLASS_SITE_ASSET_BUCKET).upload(storagePath, file, { contentType: 'audio/mpeg', upsert: false }));
  try {
    const existing = await query('shared audio ordering', supabase.from('homework_assets').select('sort_order').eq('owner_id', user.id).eq('homework_template_id', templateId).order('sort_order', { ascending: false }).limit(1));
    const rows = await query('shared audio metadata', supabase.from('homework_assets').insert({
      owner_id: user.id, homework_template_id: templateId, asset_type: 'audio',
      bucket: CLASS_SITE_ASSET_BUCKET, storage_path: storagePath, mime_type: 'audio/mpeg',
      width: null, height: null, size_bytes: file.size, url: null,
      title: homeworkAudioTitle(file.name), sort_order: nextHomeworkAssetSortOrder(existing),
    }).select('id,homework_template_id,asset_type,bucket,storage_path,mime_type,width,height,size_bytes,url,title,sort_order'));
    return { ...rows[0], publicUrl: supabase.storage.from(CLASS_SITE_ASSET_BUCKET).getPublicUrl(storagePath).data.publicUrl };
  } catch (error) {
    try { await removeStoragePaths([storagePath]); } catch (cleanupError) { devError('shared audio rollback', cleanupError); }
    throw error;
  }
}

export async function updateSharedHomeworkAudioTitle(assetId, title) {
  const user = await currentUser();
  const rows = await query('shared audio title update', supabase.from('homework_assets').update({ title: text(title) || null })
    .eq('owner_id', user.id).eq('id', assetId).eq('asset_type', 'audio').select('id,title'));
  if (rows.length !== 1) throw new HomeworkPublicationError('The Homework audio could not be found.');
  return rows[0];
}

export async function deleteSharedHomeworkAudio(asset) {
  const user = await currentUser();
  if (asset.asset_type !== 'audio' || asset.bucket !== CLASS_SITE_ASSET_BUCKET || !asset.storage_path?.startsWith(`${user.id}/homework/${asset.homework_template_id}/`)) {
    throw new HomeworkPublicationError('This Homework audio cannot be removed by the current teacher.');
  }
  await removeStoragePaths([asset.storage_path]);
  await query('shared audio metadata deletion', supabase.from('homework_assets').delete().eq('owner_id', user.id).eq('id', asset.id).eq('asset_type', 'audio'));
}

export async function deleteSharedHomeworkImage(asset) {
  const user = await currentUser();
  if (asset.bucket !== CLASS_SITE_ASSET_BUCKET || !asset.storage_path?.startsWith(`${user.id}/`)) throw new HomeworkPublicationError('This shared image cannot be removed by the current teacher.');
  await removeStoragePaths([asset.storage_path]);
  await query('shared image metadata deletion', supabase.from('homework_assets').delete().eq('owner_id', user.id).eq('id', asset.id));
}

export function resolveTargetCourseLesson(state, groupId, courseMapItemId) {
  const materialized = (state.lessons || []).filter(lesson => lesson.teachingGroupId === groupId && lesson.courseMapItemId === courseMapItemId && lesson.manualStatus !== 'cancelled' && lesson.manualStatus !== 'rescheduled').sort((a, b) => a.date.localeCompare(b.date))[0];
  if (materialized) return materialized;
  const end = parseIsoDate(state.academicCalendar?.academicYear?.end);
  if (!end) return null;
  const today = getAppDate();
  for (let date = today; date <= end; date = addDays(date, 1)) {
    const match = lessonsForDate(state, date).find(lesson => lesson.teachingGroupId === groupId && lesson.courseMapItemId === courseMapItemId && lesson.manualStatus !== 'cancelled' && lesson.manualStatus !== 'rescheduled');
    if (match) return match;
  }
  return null;
}

export async function publishExistingTemplateToClass(state, template, targetLesson, due) {
  const source = { ...homeworkSourceFromLesson(state, targetLesson), date: due.assignedDate || targetLesson.date };
  validateHomeworkPublication(source, due);
  const user = await currentUser();
  const sites = await query('target class site lookup', supabase.from('class_sites').select('id,course_id,is_active').eq('owner_id', user.id).eq('source_teaching_group_id', source.teachingGroupId).limit(2));
  if (sites.length !== 1 || sites[0].course_id !== template.course_id) throw new HomeworkPublicationError('The target class is not safely linked to this Homework course.');
  await query('template ready state', supabase.from('homework_templates').update({ content_status: 'ready' }).eq('owner_id', user.id).eq('id', template.id));
  const row = buildAssignmentRow({ userId: user.id, state, source, site: sites[0], template, due, publishedAt: new Date().toISOString() });
  const assignments = await query('parallel assignment publication', supabase.from('homework_assignments').upsert(row, { onConflict: 'homework_template_id,class_site_id,assigned_date' }).select('id,publication_status,assigned_date,due_date'));
  return assignments[0];
}

export async function archiveHomeworkAssignment(assignmentId) {
  const user = await currentUser();
  const rows = await query('assignment archive', supabase.from('homework_assignments').update({ publication_status: 'archived' })
    .eq('owner_id', user.id).eq('id', assignmentId).select('id,publication_status'));
  if (!rows.length) throw new HomeworkPublicationError('The published assignment could not be found.');
  return rows[0];
}
