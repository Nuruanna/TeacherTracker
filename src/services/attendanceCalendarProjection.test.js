import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildAttendanceCalendarProjection } from './academicCalendarService';

const migration = readFileSync(new URL('../../supabase/migrations/202609060001_add_attendance_calendar_projection.sql', import.meta.url), 'utf8');
const original = readFileSync(new URL('../../supabase/migrations/202609010001_add_attendance_v1_backend.sql', import.meta.url), 'utf8');
const grantFix = readFileSync(new URL('../../supabase/migrations/202609050001_fix_attendance_v1_function_grants.sql', import.meta.url), 'utf8');
const numbered = readFileSync(new URL('../../supabase/migrations/202609050002_refactor_attendance_roster_to_numbers.sql', import.meta.url), 'utf8');
const attendanceService = readFileSync(new URL('./attendanceService.js', import.meta.url), 'utf8');
const attendanceAdmin = readFileSync(new URL('../components/AttendanceAdmin.jsx', import.meta.url), 'utf8');
const settings = readFileSync(new URL('../pages/Settings.jsx', import.meta.url), 'utf8');

const calendar = {
  academicYear: { start: '2026-09-04', end: '2026-09-10' },
  schoolBreaks: [{ start: '2026-09-07', end: '2026-09-07', label: 'Private break label' }],
  noSchoolDays: [{ date: '2026-09-08', label: 'Private holiday label' }],
  excludedDates: ['2026-09-09'],
  privateSetting: 'never project this',
};

describe('Attendance calendar projection builder', () => {
  const projection = buildAttendanceCalendarProjection(calendar);

  it('emits every academic-year date exactly once including both boundaries', () => {
    expect(projection.startDate).toBe('2026-09-04');
    expect(projection.endDate).toBe('2026-09-10');
    expect(projection.days.map(day => day.date)).toEqual([
      '2026-09-04', '2026-09-05', '2026-09-06', '2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10',
    ]);
    expect(new Set(projection.days.map(day => day.date)).size).toBe(projection.days.length);
  });

  it('reuses classification for weekdays, both weekend days, vacation and holiday forms', () => {
    expect(projection.days.map(day => day.dayType)).toEqual([
      'instructional', 'weekend', 'weekend', 'vacation', 'holiday', 'holiday', 'instructional',
    ]);
  });

  it('contains only safe fields and approved day types', () => {
    expect(Object.keys(projection)).toEqual(['startDate', 'endDate', 'days']);
    expect(projection.days.every(day => Object.keys(day).join(',') === 'date,dayType')).toBe(true);
    expect(new Set(projection.days.map(day => day.dayType)).isSubsetOf(new Set(['instructional', 'weekend', 'vacation', 'holiday']))).toBe(true);
    expect(JSON.stringify(projection)).not.toMatch(/label|privateSetting|Private/);
  });

  it('rejects an unreasonable academic-year span before producing rows', () => {
    expect(() => buildAttendanceCalendarProjection({
      academicYear: { start: '2026-01-01', end: '2027-02-06' },
      schoolBreaks: [], noSchoolDays: [], excludedDates: [],
    })).toThrow('cannot exceed 400 days');
  });
});

describe('Attendance calendar projection migration', () => {
  it('is a new atomic follow-up and preserves every previous migration', () => {
    expect(migration).toMatch(/^-- Add a private,[\s\S]*\bbegin;[\s\S]*\bcommit;\s*$/);
    expect(createHash('sha256').update(original).digest('hex')).toBe('e8679db1d428e6a552d495604d6d7535d3949185915dbef8f26df46533c6d576');
    expect(createHash('sha256').update(grantFix).digest('hex')).toBe('6227e231d6703523d93502bcc01d872cc86bbcd398d6cdbf66e168f1dd56038d');
    expect(createHash('sha256').update(numbered).digest('hex')).toBe('99e37837035b3d60c2aff4730562604bfdb5698bb5b41236d5a7e19fbf4c318c');
  });

  it('creates private projection metadata and complete per-day storage', () => {
    expect(migration).toContain('create table public.attendance_calendar_projection');
    expect(migration).toContain('references public.class_sites(id) on delete restrict');
    expect(migration).toContain('create table public.attendance_calendar_days');
    expect(migration).toContain('primary key (class_site_id, school_date)');
    expect(migration).toContain("day_type in ('instructional', 'weekend', 'vacation', 'holiday')");
    for (const table of ['attendance_calendar_projection', 'attendance_calendar_days']) {
      expect(migration).toContain(`alter table public.${table} enable row level security`);
      expect(migration).toContain(`revoke all on table public.${table} from public, anon, authenticated`);
    }
  });

  it('validates ownership, grade, span, range, uniqueness, enum and complete coverage before replacement', () => {
    const replace = migration.slice(migration.indexOf('create or replace function public.replace_attendance_calendar_projection'), migration.indexOf('create or replace function public.attendance_calendar_day_type'));
    expect(replace).toContain('cs.owner_id = auth.uid()');
    expect(replace).toContain("cs.source_teaching_group_id = 'grade8-a'");
    expect(replace).toContain('p_academic_year_end - p_academic_year_start > 400');
    expect(replace).toContain('v_supplied_days <> v_expected_days');
    expect(replace).toContain('calendar day is outside academic year');
    expect(replace).toContain('count(distinct');
    expect(replace).toContain("not in ('instructional', 'weekend', 'vacation', 'holiday')");
    expect(replace).toContain("item - 'date' - 'dayType' <> '{}'::jsonb");
    expect(replace.indexOf('duplicate calendar date')).toBeLessThan(replace.indexOf('insert into public.attendance_calendar_projection'));
    expect(replace.indexOf('calendar day is outside academic year')).toBeLessThan(replace.indexOf('delete from public.attendance_calendar_days'));
  });

  it('keeps replacement authenticated-only and explicitly hardens every function grant', () => {
    expect(migration).toContain('grant execute on function public.replace_attendance_calendar_projection(uuid, date, date, jsonb) to authenticated, service_role');
    expect(migration).not.toContain('grant execute on function public.replace_attendance_calendar_projection(uuid, date, date, jsonb) to anon');
    for (const signature of [
      'public.replace_attendance_calendar_projection(uuid, date, date, jsonb)',
      'public.attendance_calendar_day_type(uuid, date)',
      'public.get_today_attendance(text)',
      'public.set_today_student_absences(text, uuid, smallint[])',
    ]) expect(migration).toContain(`revoke execute on function ${signature} from public, anon, authenticated;`);
    expect(migration).toContain('grant execute on function public.attendance_calendar_day_type(uuid, date) to service_role');
  });

  it('returns only today state and roster on instructional days', () => {
    const read = migration.slice(migration.indexOf('create or replace function public.get_today_attendance'), migration.indexOf('create or replace function public.set_today_student_absences'));
    expect(read).toContain("timezone('Asia/Vladivostok', now())::date");
    expect(read).toContain("'hasLessons', v_day_type = 'instructional'");
    expect(read).toContain("'dayType', v_day_type");
    expect(read).toContain("case when v_day_type = 'instructional'");
    expect(read).toContain("else '[]'::jsonb end");
    expect(read).toContain("v_day_type = 'calendar_unavailable'");
    expect(read).not.toMatch(/academic_year_(?:start|end)|schoolBreaks|noSchoolDays|owner_id|label/);
    expect(read).not.toMatch(/p_(?:date|school_date|attendance_date)/);
  });

  it('derives unavailable, outside-year and stored in-year day states internally', () => {
    const helper = migration.slice(migration.indexOf('create or replace function public.attendance_calendar_day_type'), migration.indexOf('create or replace function public.get_today_attendance'));
    expect(helper).toContain("if not found then return 'calendar_unavailable'");
    expect(helper).toContain("then return 'outside_academic_year'");
    expect(helper).toContain("return coalesce(v_day_type, 'calendar_unavailable')");
    expect(helper).not.toContain('grant execute');
  });

  it('enforces instructional today before every Student absence mutation', () => {
    const write = migration.slice(migration.indexOf('create or replace function public.set_today_student_absences'), migration.indexOf('revoke execute on function public.replace_attendance_calendar_projection'));
    expect(write).toContain("timezone('Asia/Vladivostok', now())::date");
    expect(write).toContain("if v_day_type <> 'instructional'");
    expect(write.indexOf("if v_day_type <> 'instructional'")).toBeLessThan(write.indexOf('delete from public.attendance_absences'));
    expect(write).not.toMatch(/p_(?:date|school_date|attendance_date)/);
  });
});

describe('Teacher Attendance projection synchronization', () => {
  it('sends only the built projection through the authenticated RPC', () => {
    expect(attendanceService).toContain('buildAttendanceCalendarProjection(academicCalendar)');
    expect(attendanceService).toContain("supabase.rpc('replace_attendance_calendar_projection'");
    expect(attendanceService).toContain('p_days_json: projection.days');
    expect(attendanceService).not.toContain('p_owner_id');
  });

  it('syncs after calendar save and self-heals on Attendance load without destroying saved state on failure', () => {
    expect(settings).toMatch(/update\(\(current\) => \(next = applyAcademicCalendar[\s\S]*setMessage\(savedMessage\)[\s\S]*replaceAttendanceCalendarProjection/);
    expect(settings).toContain('Warning: ${syncError.message}');
    expect(attendanceAdmin).toContain('replaceAttendanceCalendarProjection(resolved.id, academicCalendar)');
    expect(attendanceAdmin).toContain(".catch(cause => cause)");
    expect(attendanceAdmin).toContain('Student Attendance calendar could not be synchronized');
  });
});
