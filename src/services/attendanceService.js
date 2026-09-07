import { supabase, supabaseConfigurationError } from '../lib/supabase';
import { buildAttendanceCalendarProjection } from './academicCalendarService';

export const ATTENDANCE_TEACHING_GROUP_ID = 'grade8-a';
const ROSTER_FIELDS = 'id,class_site_id,student_number,is_active,is_highlighted,created_at,updated_at';

export class AttendanceServiceError extends Error {
  constructor(message, cause) {
    super(message, { cause });
    this.name = 'AttendanceServiceError';
  }
}

async function requireUser() {
  if (!supabase) throw new AttendanceServiceError(supabaseConfigurationError);
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new AttendanceServiceError('Sign in to manage Attendance.', error);
  return data.user;
}

async function query(message, request) {
  const { data, error } = await request;
  if (error) throw new AttendanceServiceError(message, error);
  return data;
}

export async function resolveAttendanceClassSite() {
  const user = await requireUser();
  const rows = await query('Unable to find the 8A Class Site.', supabase.from('class_sites')
    .select('id,display_name,slug,source_teaching_group_id')
    .eq('owner_id', user.id)
    .eq('source_teaching_group_id', ATTENDANCE_TEACHING_GROUP_ID)
    .limit(2));
  if (rows.length !== 1) throw new AttendanceServiceError('The owned 8A Class Site could not be resolved.');
  return rows[0];
}

export async function loadAttendanceRoster(classSiteId) {
  await requireUser();
  return await query('Unable to load the Attendance roster.', supabase.from('attendance_students')
    .select(ROSTER_FIELDS).eq('class_site_id', classSiteId)
    .order('student_number').order('id')) || [];
}

export async function setAttendanceStudentActive(studentId, isActive) {
  await requireUser();
  const rows = await query('Unable to change this student status.', supabase.from('attendance_students')
    .update({ is_active: Boolean(isActive) }).eq('id', studentId).select(ROSTER_FIELDS));
  if (rows?.length !== 1) throw new AttendanceServiceError('The roster student could not be matched.');
  return rows[0];
}

export async function setAttendanceStudentHighlighted(studentId, isHighlighted) {
  await requireUser();
  const rows = await query('Unable to change this number highlight.', supabase.from('attendance_students')
    .update({ is_highlighted: Boolean(isHighlighted) }).eq('id', studentId).select(ROSTER_FIELDS));
  if (rows?.length !== 1) throw new AttendanceServiceError('The roster number could not be matched.');
  return rows[0];
}

export async function loadTeacherAttendanceDay(classSiteId, attendanceDate) {
  await requireUser();
  return await query('Unable to load Attendance for this date.', supabase.rpc('get_teacher_attendance_day', {
    p_class_site_id: classSiteId, p_attendance_date: attendanceDate,
  }));
}

export async function saveTeacherStudentAbsences(studentId, attendanceDate, lessonNumbers) {
  await requireUser();
  const lessons = [...new Set(lessonNumbers)].sort((a, b) => a - b);
  if (lessons.some(value => !Number.isInteger(value) || value < 1 || value > 7)) throw new AttendanceServiceError('Lessons must be between 1 and 7.');
  return await query('Unable to save this Attendance row.', supabase.rpc('set_teacher_student_absences', {
    p_student_id: studentId, p_attendance_date: attendanceDate, p_lesson_numbers: lessons,
  }));
}

export async function setAttendancePin(classSiteId, pin) {
  await requireUser();
  if (!/^[0-9]{6}$/.test(pin || '')) throw new AttendanceServiceError('PIN must contain exactly six digits.');
  return await query('Unable to update the Attendance PIN.', supabase.rpc('set_attendance_pin', {
    p_class_site_id: classSiteId, p_new_pin: pin,
  }));
}

export async function setAttendanceEnabled(classSiteId, enabled) {
  await requireUser();
  return await query(`Unable to ${enabled ? 'enable' : 'disable'} Attendance.`, supabase.rpc('set_attendance_enabled', {
    p_class_site_id: classSiteId, p_enabled: Boolean(enabled),
  }));
}

export async function getAttendanceAvailability(slug) {
  const data = await query('Unable to load Attendance access status.', supabase.rpc('get_attendance_availability', { p_slug: slug }));
  return Boolean(data?.enabled);
}

export async function replaceAttendanceCalendarProjection(classSiteId, academicCalendar) {
  await requireUser();
  const projection = buildAttendanceCalendarProjection(academicCalendar);
  await query('Student Attendance calendar could not be synchronized.', supabase.rpc('replace_attendance_calendar_projection', {
    p_class_site_id: classSiteId,
    p_academic_year_start: projection.startDate,
    p_academic_year_end: projection.endDate,
    p_days_json: projection.days,
  }));
  return projection;
}
