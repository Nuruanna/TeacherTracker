import { supabase, supabaseConfigurationError } from '../lib/supabase';
import { optimizeHomeworkImage } from './homeworkImageService';
import { courseSectionStructuralLabel } from '../utils/courseSections';

export const STUDY_MATERIAL_CATEGORIES = ['vocabulary', 'grammar', 'extra'];
export const STUDY_MATERIAL_BUCKET = 'class-site-assets';
const SELECT_COURSE = 'id,source_course_map_id,display_name,grade';
const SELECT_SECTION = 'id,course_id,section_type,section_number,display_title,sort_order';
const SELECT_BLOCK = 'id,course_section_id,category,title,body,sort_order,publication_status,created_at,updated_at';
const SELECT_ASSET = 'id,study_material_block_id,asset_type,bucket,storage_path,mime_type,width,height,size_bytes,url,title,sort_order,created_at';

export class StudyMaterialsServiceError extends Error {
  constructor(message, cause) { super(message, { cause }); this.name = 'StudyMaterialsServiceError'; }
}

const devError = (stage, error) => {
  if (import.meta.env.DEV) console.error('[study materials] Operation failed', { stage, code: error?.code || null, message: error?.message || String(error) });
};
const requireUser = async () => {
  if (!supabase) throw new StudyMaterialsServiceError(supabaseConfigurationError);
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user?.id) throw new StudyMaterialsServiceError('Sign in before managing Study Materials.', error);
  return data.user;
};
const query = async (stage, operation) => {
  const { data, error } = await operation;
  if (error) { devError(stage, error); throw new StudyMaterialsServiceError(`Study Materials could not complete ${stage}. Try again.`, error); }
  return data || [];
};
const validateCategory = category => {
  if (!STUDY_MATERIAL_CATEGORIES.includes(category)) throw new StudyMaterialsServiceError('Choose Vocabulary, Grammar or Extra.');
};

export const studyMaterialSectionLabel = courseSectionStructuralLabel;
export const sortStudyMaterialSections = sections => [...sections].sort((a, b) => a.sort_order - b.sort_order || a.section_number - b.section_number || studyMaterialSectionLabel(a).localeCompare(studyMaterialSectionLabel(b)));
export const studyMaterialCategoryCounts = blocks => Object.fromEntries(STUDY_MATERIAL_CATEGORIES.map(category => [category, blocks.filter(block => block.category === category).length]));
export const buildStudyMaterialAssetPath = (userId, sectionId, blockId, assetId) => `${userId}/study-materials/${sectionId}/${blockId}/${assetId}.jpg`;
export const reorderedStudyMaterialRows = (blocks, movedId, direction) => {
  const ordered = [...blocks].sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id));
  const index = ordered.findIndex(block => block.id === movedId);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= ordered.length) return ordered.map((block, sort_order) => ({ id: block.id, sort_order }));
  [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
  return ordered.map((block, sort_order) => ({ id: block.id, sort_order }));
};

export async function loadStudyMaterialsAdmin() {
  const user = await requireUser();
  const [courses, sections, blocks, assets] = await Promise.all([
    query('course loading', supabase.from('courses').select(SELECT_COURSE).eq('owner_id', user.id)),
    query('section loading', supabase.from('course_sections').select(SELECT_SECTION).eq('owner_id', user.id)),
    query('block loading', supabase.from('study_material_blocks').select(SELECT_BLOCK).eq('owner_id', user.id)),
    query('asset loading', supabase.from('study_material_assets').select(SELECT_ASSET).eq('owner_id', user.id)),
  ]);
  const enrichedBlocks = blocks.map(block => ({ ...block, assets: assets.filter(asset => asset.study_material_block_id === block.id).map(asset => asset.bucket && asset.storage_path ? { ...asset, publicUrl: supabase.storage.from(asset.bucket).getPublicUrl(asset.storage_path).data.publicUrl } : asset) }));
  return courses.sort((a, b) => a.grade - b.grade).map(course => ({
    ...course,
    sections: sortStudyMaterialSections(sections.filter(section => section.course_id === course.id)).map(section => {
      const sectionBlocks = enrichedBlocks.filter(block => block.course_section_id === section.id);
      return { ...section, label: studyMaterialSectionLabel(section), counts: studyMaterialCategoryCounts(sectionBlocks), blocks: sectionBlocks };
    }),
  }));
}

export async function createStudyMaterialBlock(sectionId, category, values) {
  validateCategory(category);
  if (!values.title?.trim()) throw new StudyMaterialsServiceError('Enter a title before adding this material.');
  const user = await requireUser();
  const existing = await query('block ordering', supabase.from('study_material_blocks').select('sort_order').eq('owner_id', user.id).eq('course_section_id', sectionId).eq('category', category).order('sort_order', { ascending: false }).limit(1));
  const rows = await query('block creation', supabase.from('study_material_blocks').insert({ owner_id: user.id, course_section_id: sectionId, category, title: values.title.trim(), body: values.body?.trim() || null, sort_order: (existing[0]?.sort_order ?? -1) + 1, publication_status: 'draft' }).select(SELECT_BLOCK));
  return rows[0];
}

export async function updateStudyMaterialBlock(blockId, values) {
  const user = await requireUser();
  if (!values.title?.trim()) throw new StudyMaterialsServiceError('A material title is required.');
  await query('block update', supabase.from('study_material_blocks').update({ title: values.title.trim(), body: values.body?.trim() || null }).eq('owner_id', user.id).eq('id', blockId));
}

export async function setStudyMaterialPublication(blockId, published) {
  const user = await requireUser();
  await query('publication update', supabase.from('study_material_blocks').update({ publication_status: published ? 'published' : 'draft' }).eq('owner_id', user.id).eq('id', blockId));
}

export async function reorderStudyMaterialBlocks(blocks, movedId, direction) {
  const user = await requireUser();
  const rows = reorderedStudyMaterialRows(blocks, movedId, direction);
  await Promise.all(rows.map(row => query('block reorder', supabase.from('study_material_blocks').update({ sort_order: row.sort_order }).eq('owner_id', user.id).eq('id', row.id))));
}

const removeStorage = async paths => {
  if (!paths.length) return;
  const { error } = await supabase.storage.from(STUDY_MATERIAL_BUCKET).remove(paths);
  if (error) { devError('Storage deletion', error); throw new StudyMaterialsServiceError('Study Material images could not be removed. No content records were deleted.', error); }
};

export async function deleteStudyMaterialBlock(block) {
  const user = await requireUser();
  const paths = (block.assets || []).filter(asset => asset.bucket === STUDY_MATERIAL_BUCKET && asset.storage_path?.startsWith(`${user.id}/study-materials/`)).map(asset => asset.storage_path);
  await removeStorage(paths);
  await query('asset metadata deletion', supabase.from('study_material_assets').delete().eq('owner_id', user.id).eq('study_material_block_id', block.id));
  await query('block deletion', supabase.from('study_material_blocks').delete().eq('owner_id', user.id).eq('id', block.id));
}

export async function uploadStudyMaterialImage(sectionId, blockId, file) {
  const user = await requireUser();
  const assetId = crypto.randomUUID();
  const optimized = await optimizeHomeworkImage(file, `${assetId}.jpg`);
  const storagePath = buildStudyMaterialAssetPath(user.id, sectionId, blockId, assetId);
  await query('image upload', supabase.storage.from(STUDY_MATERIAL_BUCKET).upload(storagePath, optimized.blob, { contentType: 'image/jpeg', upsert: false }));
  try {
    const existing = await query('image ordering', supabase.from('study_material_assets').select('sort_order').eq('owner_id', user.id).eq('study_material_block_id', blockId).order('sort_order', { ascending: false }).limit(1));
    const rows = await query('image metadata creation', supabase.from('study_material_assets').insert({ owner_id: user.id, study_material_block_id: blockId, asset_type: 'image', bucket: STUDY_MATERIAL_BUCKET, storage_path: storagePath, mime_type: 'image/jpeg', width: optimized.width, height: optimized.height, size_bytes: optimized.blob.size, sort_order: (existing[0]?.sort_order ?? -1) + 1 }).select(SELECT_ASSET));
    return rows[0];
  } catch (error) { try { await removeStorage([storagePath]); } catch (rollbackError) { devError('image rollback', rollbackError); } throw error; }
}

export async function deleteStudyMaterialImage(asset) {
  const user = await requireUser();
  if (asset.bucket !== STUDY_MATERIAL_BUCKET || !asset.storage_path?.startsWith(`${user.id}/study-materials/`)) throw new StudyMaterialsServiceError('This Study Material image cannot be removed by the current teacher.');
  await removeStorage([asset.storage_path]);
  await query('image metadata deletion', supabase.from('study_material_assets').delete().eq('owner_id', user.id).eq('id', asset.id));
}
