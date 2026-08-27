import { beforeEach, describe, expect, it, vi } from 'vitest';
import { seedState } from '../data/seed';

const calls = vi.hoisted(() => ({ assignmentUpserts: [] }));

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
      if (table === 'homework_templates') {
        const query = { update: () => query, eq: () => query, then: resolve => resolve({ data: null, error: null }) };
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

import { publishExistingTemplateToClass } from './classSitesHomeworkService';

const copy = value => JSON.parse(JSON.stringify(value));

describe('existing Homework Assignment publication reconciliation', () => {
  beforeEach(() => { calls.assignmentUpserts.length = 0; });

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
});
