import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('../../supabase/migrations/202608250001_complete_public_student_data_contract.sql', import.meta.url), 'utf8');
const allowsProgress = ({ item = null, kind = null, current = null, total = null }) => (
  (item === null && kind === null && current === null && total === null)
  || (typeof item === 'string' && item.trim() !== ''
    && ['step', 'lesson'].includes(kind)
    && Number.isInteger(current) && current >= 1
    && Number.isInteger(total) && total > 0
    && current <= total)
);
const isMeaningfulHomework = ({ body = '', assets = [], templateId = 'template-1', ownerId = 'teacher-1' }) => (
  String(body ?? '').trim() !== ''
  || assets.some(asset => asset.homeworkTemplateId === templateId
    && asset.ownerId === ownerId
    && asset.assetType === 'image'
    && asset.bucket === 'class-site-assets'
    && typeof asset.storagePath === 'string'
    && asset.storagePath.trim() !== '')
);

describe('public Student data contract migration', () => {
  it.each([
    ['all null', {}, true],
    ['valid step', { item: 'g8-031', kind: 'step', current: 4, total: 10 }, true],
    ['valid lesson', { item: 'g2-003', kind: 'lesson', current: 3, total: 12 }, true],
    ['kind only', { kind: 'lesson' }, false],
    ['current only', { current: 1 }, false],
    ['total only', { total: 12 }, false],
    ['missing current', { item: 'g2-003', kind: 'lesson', total: 12 }, false],
    ['missing total', { item: 'g2-003', kind: 'lesson', current: 3 }, false],
    ['current above total', { item: 'g2-013', kind: 'lesson', current: 13, total: 12 }, false],
    ['current below one', { item: 'g2-001', kind: 'lesson', current: 0, total: 12 }, false],
    ['blank item ID', { item: '   ', kind: 'lesson', current: 1, total: 12 }, false],
  ])('enforces the all-null/all-valid progress contract: %s', (_label, value, allowed) => {
    expect(allowsProgress(value)).toBe(allowed);
  });

  it('expresses the strict four-field contract in SQL without nullable valid-branch operands', () => {
    expect(sql).toContain('current_course_item_id is null');
    expect(sql).toContain("btrim(current_course_item_id) <> ''");
    expect(sql).toContain('progress_kind is not null');
    expect(sql).toContain('progress_current is not null');
    expect(sql).toContain('progress_total is not null');
    expect(sql).toContain('progress_current <= progress_total');
  });

  it('preserves the established Class Site topology and makes progress additive', () => {
    for (const key of ['classSite', 'course', 'currentSection', 'availableStudySections', 'homework']) expect(sql).toContain(`'${key}'`);
    for (const key of ['id', 'type', 'number', 'title', 'progress']) expect(sql).toContain(`'${key}'`);
    expect(sql).toContain('left join public.course_sections current_section');
    expect(sql).toContain('when current_section.id is null then null');
    expect(sql).toContain("block.publication_status = 'published'");
    expect(sql).toContain('section.id = cs.current_course_section_id');
    expect(sql).not.toMatch(/'ownerId'|'owner_id'|'teacherEmail'|'privateNotes'/);
  });

  it('keeps inactive, unpublished, stale-template and cross-class Homework outside both contracts', () => {
    expect(sql.match(/cs\.is_active = true/g)).toHaveLength(2);
    expect(sql).toContain("assignment.publication_status = 'published'");
    expect(sql).toContain('assignment.published_at is not null');
    expect(sql).toContain("template.content_status = 'ready'");
    expect(sql).toContain('assignment.class_site_id = cs.id');
    expect(sql).toContain("ha.publication_status = 'published'");
    expect(sql).toContain('ha.published_at is not null');
    expect(sql).toContain("ht.content_status = 'ready'");
    expect(sql).toContain('ha.class_site_id = cs.id');
    expect(sql).toContain('ha.course_id = cs.course_id');
  });

  it('returns semantic Homework snapshots without internal Course Map identity or a fabricated label', () => {
    expect(sql).toContain("'lesson_code', ha.assigned_lesson_code");
    expect(sql).toContain("'lesson_title', ha.assigned_lesson_title");
    expect(sql).not.toContain("'assigned_course_item_id'");
    expect(sql).not.toContain("'lesson_label'");
  });

  it('returns only public copied image assets with nonblank paths', () => {
    expect(sql).toContain("asset.bucket = 'class-site-assets'");
    expect(sql).toContain("asset.asset_type = 'image'");
    expect(sql).toContain('asset.storage_path is not null');
    expect(sql).toContain("btrim(asset.storage_path) <> ''");
    expect(sql).not.toContain("asset.bucket = 'homework-images'");
  });

  it.each([
    ['text only', { body: 'Read page 10.' }, true],
    ['image only', { assets: [{ homeworkTemplateId: 'template-1', ownerId: 'teacher-1', assetType: 'image', bucket: 'class-site-assets', storagePath: 'teacher-1/homework/template-1/image.jpg' }] }, true],
    ['blank with no assets', { body: '' }, false],
    ['whitespace with no assets', { body: ' \t\n ' }, false],
    ['source image only', { assets: [{ homeworkTemplateId: 'template-1', ownerId: 'teacher-1', assetType: 'image', bucket: 'homework-images', storagePath: 'private.jpg' }] }, false],
    ['non-image only', { assets: [{ homeworkTemplateId: 'template-1', ownerId: 'teacher-1', assetType: 'link', bucket: 'class-site-assets', storagePath: 'link' }] }, false],
    ['null public path', { assets: [{ homeworkTemplateId: 'template-1', ownerId: 'teacher-1', assetType: 'image', bucket: 'class-site-assets', storagePath: null }] }, false],
    ['blank public path', { assets: [{ homeworkTemplateId: 'template-1', ownerId: 'teacher-1', assetType: 'image', bucket: 'class-site-assets', storagePath: '  ' }] }, false],
    ['wrong Template', { assets: [{ homeworkTemplateId: 'template-2', ownerId: 'teacher-1', assetType: 'image', bucket: 'class-site-assets', storagePath: 'image.jpg' }] }, false],
    ['wrong owner', { assets: [{ homeworkTemplateId: 'template-1', ownerId: 'teacher-2', assetType: 'image', bucket: 'class-site-assets', storagePath: 'image.jpg' }] }, false],
  ])('applies the meaningful Homework rule: %s', (_label, value, expected) => {
    expect(isMeaningfulHomework(value)).toBe(expected);
  });

  it('uses the same meaningful-content predicate in both public Homework paths', () => {
    expect(sql.match(/btrim\(coalesce\((?:template|ht)\.body, ''\)\) <> ''/g)).toHaveLength(2);
    expect(sql.match(/from public\.homework_assets meaningful_asset/g)).toHaveLength(2);
    expect(sql.match(/meaningful_asset\.asset_type = 'image'/g)).toHaveLength(2);
    expect(sql.match(/meaningful_asset\.bucket = 'class-site-assets'/g)).toHaveLength(2);
    expect(sql.match(/meaningful_asset\.storage_path is not null/g)).toHaveLength(2);
    expect(sql.match(/btrim\(meaningful_asset\.storage_path\) <> ''/g)).toHaveLength(2);
  });

  it('is atomic and keeps the SECURITY DEFINER boundary narrow', () => {
    expect(sql.trimStart().indexOf('begin;')).toBeGreaterThanOrEqual(0);
    expect(sql.trimEnd().endsWith('commit;')).toBe(true);
    expect(sql.match(/security definer/g)).toHaveLength(2);
    expect(sql.match(/set search_path = public, pg_temp/g)).toHaveLength(2);
    expect(sql).toContain('revoke all on function public.get_published_class_site(text) from public');
    expect(sql).toContain('revoke all on function public.get_published_homework(text) from public');
    expect(sql).toContain('grant execute on function public.get_published_homework(text) to anon, authenticated');
    expect(sql).not.toMatch(/grant\s+select[\s\S]*to\s+anon/i);
    expect(sql).not.toContain('service_role');
    expect(sql).not.toContain('app_states');
  });
});
