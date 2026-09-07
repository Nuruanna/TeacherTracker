import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const original = readFileSync(new URL('../../supabase/migrations/202609010001_add_attendance_v1_backend.sql', import.meta.url), 'utf8');
const grantFix = readFileSync(new URL('../../supabase/migrations/202609050001_fix_attendance_v1_function_grants.sql', import.meta.url), 'utf8');
const sql = readFileSync(new URL('../../supabase/migrations/202609050002_refactor_attendance_roster_to_numbers.sql', import.meta.url), 'utf8');

describe('Attendance numbered-roster migration', () => {
  it('preserves both previously applied migrations byte-for-byte', () => {
    expect(createHash('sha256').update(original).digest('hex')).toBe('e8679db1d428e6a552d495604d6d7535d3949185915dbef8f26df46533c6d576');
    expect(createHash('sha256').update(grantFix).digest('hex')).toBe('6227e231d6703523d93502bcc01d872cc86bbcd398d6cdbf66e168f1dd56038d');
  });

  it('adds fixed number and neutral highlight fields with strict constraints', () => {
    expect(sql).toContain('add column student_number smallint');
    expect(sql).toContain('add column is_highlighted boolean not null default false');
    expect(sql).toContain('check (student_number between 1 and 35)');
    expect(sql).toContain('unique (class_site_id, student_number)');
    expect(sql).toContain('alter column student_number set not null');
  });

  it('deterministically numbers existing rows without replacing IDs or deleting absences', () => {
    expect(sql).toContain('row_number() over (partition by class_site_id order by sort_order, id)');
    expect(sql).toContain('where numbered.id = ast.id');
    expect(sql).not.toMatch(/delete from public\.attendance_(?:students|absences)/i);
    expect(sql).not.toMatch(/update public\.attendance_absences/i);
    expect(sql).toContain("having count(*) > 35");
  });

  it('ensures all 35 grade8-a slots and applies the required active state', () => {
    expect(sql).toContain('cross join generate_series(1, 35)');
    expect(sql).toContain("cs.source_teaching_group_id = 'grade8-a'");
    expect(sql.match(/student_number between 1 and 33/g).length).toBeGreaterThanOrEqual(2);
    expect(sql).toContain('is_highlighted = false');
    expect(sql).not.toMatch(/values\s*\([^)]*['"][A-Za-zА-Яа-я]+/);
  });

  it('removes the old free-text and shifting-order schema after migration', () => {
    expect(sql).toContain('drop column display_name');
    expect(sql).toContain('drop column sort_order');
    expect(sql).toContain('drop constraint attendance_students_display_name_check');
    expect(sql).toContain('drop constraint attendance_students_sort_order_check');
    expect(sql).toContain('class_site_id, is_active, student_number, id');
  });

  it('returns only numbered roster fields from Student and Teacher day RPCs', () => {
    const studentRpc = sql.slice(sql.indexOf('create or replace function public.get_today_attendance'), sql.indexOf('create or replace function public.get_teacher_attendance_day'));
    const teacherRpc = sql.slice(sql.indexOf('create or replace function public.get_teacher_attendance_day'), sql.lastIndexOf('commit;'));
    expect(studentRpc).toContain("'studentNumber', ast.student_number");
    expect(studentRpc).toContain("'isHighlighted', ast.is_highlighted");
    expect(studentRpc).not.toContain("'displayName'");
    expect(studentRpc).not.toContain("'sortOrder'");
    expect(teacherRpc).toContain("'studentNumber', ast.student_number");
    expect(teacherRpc).toContain("'isActive', ast.is_active");
    expect(teacherRpc).toContain("'isHighlighted', ast.is_highlighted");
    expect(teacherRpc).not.toContain("'displayName'");
    expect(sql.match(/order by ast\.student_number/g)).toHaveLength(2);
  });

  it('retains active-only Student reads and inactive historical Teacher rows with records', () => {
    expect(sql).toContain('ast.class_site_id = v_site_id and ast.is_active = true');
    expect(sql).toContain('ast.is_active = true or exists');
    expect(sql).toContain('aa.attendance_date = p_attendance_date');
  });
});
