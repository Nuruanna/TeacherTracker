import { beforeEach, describe, expect, it, vi } from 'vitest';
import { seedState } from '../data/seed';

const calls = vi.hoisted(() => ({ assignmentUpserts: [], templateUpserts: [], templates: [] }));

vi.mock('../lib/supabase', () => ({
  supabaseConfigurationError: '',
  supabase: {
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'teacher-1' } }, error: null })) },
    from: vi.fn(table => {
      if (table === 'class_sites') {
        const query = {
          select: () => query, eq: () => query, limit: async () => ({
            data: [{ id: 'site-8b', course_id: 'course-8', is_active: true }], error: null,
          }),
        };
        return query;
      }
      if (table === 'courses') {
        const query = { select: () => query, eq: () => query, limit: async () => ({ data: [{ id: 'course-8', source_course_map_id: 'grade-8' }], error: null }) };
        return query;
      }
      if (table === 'course_sections') {
        const query = { select: () => query, eq: () => query, limit: async () => ({ data: [{ id: 'section-8' }], error: null }) };
        return query;
      }
      if (table === 'homework_templates') {
        const query = {
          select: () => query,
          update: () => query,
          eq: () => query,
          limit: async () => ({ data: [], error: null }),
          upsert: (values, options) => {
            calls.templateUpserts.push({ values, options });
            return { select: async () => {
              if (!calls.templates.length) calls.templates.push({ id: 'canonical-template', ...values });
              return { data: [{ id: calls.templates[0].id }], error: null };
            } };
          },
          then: resolve => resolve({ data: null, error: null }),
        };
        return query;
      }
      if (table === 'homework_assignments') {
        return {
          upsert: (row, options) => {
            calls.assignmentUpserts.push({ row, options });
            return { select: async () => ({ data: [{ id: 'existing-assignment', ...row }], error: null }) };
          },
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    }),
  },
}));

import { publishExistingTemplateToClass, saveCentralHomeworkTemplate } from './classSitesHomeworkService';

const copy = value => JSON.parse(JSON.stringify(value));

describe('existing Homework Assignment publication reconciliation', () => {
  beforeEach(() => {
    calls.assignmentUpserts.length = 0;
    calls.templateUpserts.length = 0;
    calls.templates.length = 0;
  });

  it('converges simultaneous logical Template creation on one canonical row', async () => {
    const item = { id: 'g8-003', code: 'Unit 1 Step 2a', title: 'Laila Ali', unit: 1 };
    const [first, second] = await Promise.all([
      saveCentralHomeworkTemplate('grade-8', item, 'Read page 10.'),
      saveCentralHomeworkTemplate('grade-8', item, 'Read page 10.'),
    ]);
    expect(first).toBe('canonical-template');
    expect(second).toBe('canonical-template');
    expect(calls.templates).toHaveLength(1);
    expect(calls.templateUpserts).toHaveLength(2);
    expect(calls.templateUpserts.every(call => call.options.onConflict === 'owner_id,course_id,source_course_item_id')).toBe(true);
  });

  it('updates the existing future assignment in place with current Course Map snapshots', async () => {
    const state = copy(seedState);
    const lesson = {
      id: 'planned-grade-8', date: '2026-09-07', teachingGroupId: 'grade8-a', courseMapItemId: 'g8-001',
      contentSnapshot: { code: 'Unit 1 Step 1 Lesson 1', title: 'Old Summer Holidays', type: 'lesson' },
    };
    const result = await publishExistingTemplateToClass(
      state,
      { id: 'template-1', course_id: 'course-8' },
      lesson,
      { assignedDate: '2026-09-07', dueDate: '2026-09-11' },
    );

    expect(result.id).toBe('existing-assignment');
    expect(calls.assignmentUpserts).toHaveLength(1);
    expect(calls.assignmentUpserts[0].options).toEqual({ onConflict: 'homework_template_id,class_site_id,assigned_date' });
    expect(calls.assignmentUpserts[0].row).toMatchObject({
      homework_template_id: 'template-1', class_site_id: 'site-8b', assigned_date: '2026-09-07',
      assigned_course_item_id: 'g8-001', assigned_lesson_code: 'Unit 1 Step 1a', assigned_lesson_title: 'Summer Holidays',
      publication_status: 'published',
    });
  });

  it('publishes a covered item against the real Course Adjustment lesson identity', async () => {
    const state = copy(seedState);
    const actualLesson = {
      id: 'planned-2026-09-10-group-1787638966698-thursday-7', date: '2026-09-10',
      teachingGroupId: 'grade8-a', courseMapItemId: 'g8-001', homeworkCourseMapItemId: 'g8-002',
      contentSnapshot: { code: 'Unit 1 Step 1a', title: 'Summer Holidays', type: 'lesson' },
    };
    await publishExistingTemplateToClass(
      state,
      { id: 'template-1', course_id: 'course-8' },
      actualLesson,
      { dueDate: '2026-09-14' },
    );
    expect(calls.assignmentUpserts.at(-1).row).toMatchObject({
      assigned_lesson_id: actualLesson.id,
      assigned_course_item_id: 'g8-002',
      assigned_lesson_code: 'Unit 1 Step 1b',
    });
  });
});
