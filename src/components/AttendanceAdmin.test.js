import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { attendanceDateAllowed, attendanceNoLessonsReason, LESSON_NUMBERS, toggleAbsentLesson, validAttendancePin } from './AttendanceAdmin';
import { getAcademicDayStatus } from '../services/academicCalendarService';

const component = readFileSync(new URL('./AttendanceAdmin.jsx', import.meta.url), 'utf8');
const classes = readFileSync(new URL('../pages/Classes.jsx', import.meta.url), 'utf8');
const service = readFileSync(new URL('../services/attendanceService.js', import.meta.url), 'utf8');
const calendarService = readFileSync(new URL('../services/academicCalendarService.js', import.meta.url), 'utf8');

describe('numbered Teacher Attendance UI contract', () => {
  it('keeps the Attendance Classes tab and stable 8A resolution', () => {
    expect(classes).toContain("{id:'attendance',label:'Attendance'}");
    expect(classes).toContain('<AttendanceAdmin academicCalendar={state.academicCalendar} />');
    expect(service).toContain("ATTENDANCE_TEACHING_GROUP_ID = 'grade8-a'");
  });

  it('places daily work before collapsed settings and keeps PIN/access below it', () => {
    const work = component.indexOf('attendance-primary-work');
    const settings = component.indexOf('<details className="attendance-settings">');
    expect(work).toBeGreaterThan(0);
    expect(settings).toBeGreaterThan(work);
    expect(component.indexOf('New six-digit PIN')).toBeGreaterThan(settings);
    expect(component.indexOf('Disable Attendance')).toBeGreaterThan(settings);
    expect(component).not.toContain('<details className="attendance-settings" open');
  });

  it('uses fixed student numbers and removes free-text roster controls', () => {
    expect(component).toContain('№{student.studentNumber}');
    expect(component).toContain('№{student.student_number}');
    expect(component).not.toMatch(/Add student|Rename|Move .* up|Move .* down|Surname and name/);
    expect(service).not.toMatch(/addAttendanceStudent|renameAttendanceStudent|reorderAttendanceStudents/);
    expect(component).not.toContain('displayName');
  });

  it('defaults to Vladivostok today, permits history, and blocks future dates', () => {
    expect(component).toContain('const today = getAppTodayISO()');
    expect(attendanceDateAllowed('2026-09-05', '2026-09-05')).toBe(true);
    expect(attendanceDateAllowed('2026-09-04', '2026-09-05')).toBe(true);
    expect(attendanceDateAllowed('2026-09-06', '2026-09-05')).toBe(false);
    expect(component).toContain('max={today}');
  });

  it('renders seven numbered circles and saves one complete set, including Clear all', () => {
    expect(LESSON_NUMBERS).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(component).toContain('await controller.save(student.id, date, draft, generation)');
    expect(component).toContain("draft.includes(lesson) ? 'absent' : ''");
    expect(toggleAbsentLesson([1, 2], 2)).toEqual([1]);
    expect(toggleAbsentLesson([1], 1)).toEqual([]);
  });

  it('supports active and highlight toggles and a neutral highlighted marker', () => {
    expect(component).toContain("setAttendanceStudentActive(student.id, !student.is_active)");
    expect(component).toContain("setAttendanceStudentHighlighted(student.id, !student.is_highlighted)");
    expect(component).toContain('checked={student.is_active}');
    expect(component).toContain('checked={student.is_highlighted}');
    expect(component).toContain("student.isHighlighted ? 'highlighted' : ''");
    expect(component).toContain('title="Highlighted"');
    expect(component).not.toMatch(/Problem|Truant|At risk|On control/i);
  });

  it('uses the RPC result as the active/historical list without exposing UUID text', () => {
    expect(component).toContain('day.students.map(student => <AttendanceRow');
    expect(component).toContain('student.isActive === false');
    expect(component).not.toMatch(/<code|>\{student\.id\}</);
  });

  it('retains safe PIN validation without local persistence', () => {
    expect(validAttendancePin('123456')).toBe(true);
    expect(validAttendancePin('12345')).toBe(false);
    expect(component).toContain("if (pin !== pinConfirm) throw new Error('PIN confirmation does not match.')");
    expect(component).not.toMatch(/localStorage|sessionStorage/);
  });

  it('connects date clearing, loaded-date rendering and save guards to the request controller', () => {
    expect(component).toContain('controller.clear(next); setDate(next)');
    expect(component).toContain('dayState.date === date && dayState.day?.date === date');
    expect(component).toContain('date={day.date} generation={dayState.generation}');
    expect(component).toContain('key={`${dayState.generation}:${day.date}:${student.id}`}');
    expect(component).toContain('savingRef.current || !controller.canSave(student.id, date, generation)');
    expect(component).toContain('disabled={!changed || saving || !controller.canSave(student.id, date, generation)}');
    expect(component).toContain('if (mounted.current) setError(cause.message)');
    expect(component).toContain('{dayState.error}</p>');
    expect(component).not.toContain('setDay(nextDay)');
  });

  it('classifies instructional and non-instructional dates from the shared academic calendar', () => {
    const calendar = {
      academicYear: { start: '2026-09-01', end: '2027-05-31' },
      schoolBreaks: [{ start: '2026-10-26', end: '2026-10-30' }],
      noSchoolDays: [{ date: '2026-11-04' }],
      excludedDates: ['2026-12-01'],
    };
    expect(getAcademicDayStatus(calendar, '2026-09-02')).toEqual({ hasLessons: true, reason: 'instructional' });
    expect(getAcademicDayStatus(calendar, '2026-09-05')).toEqual({ hasLessons: false, reason: 'weekend' });
    expect(getAcademicDayStatus(calendar, '2026-09-06')).toEqual({ hasLessons: false, reason: 'weekend' });
    expect(getAcademicDayStatus(calendar, '2026-10-28')).toEqual({ hasLessons: false, reason: 'vacation' });
    expect(getAcademicDayStatus(calendar, '2026-11-04')).toEqual({ hasLessons: false, reason: 'holiday' });
    expect(getAcademicDayStatus(calendar, '2026-12-01')).toEqual({ hasLessons: false, reason: 'holiday' });
    expect(getAcademicDayStatus(calendar, '2026-08-31')).toEqual({ hasLessons: false, reason: 'outside-academic-year' });
    expect(getAcademicDayStatus(calendar, '2027-06-01')).toEqual({ hasLessons: false, reason: 'outside-academic-year' });
  });

  it('shows a compact no-lessons state while keeping date navigation and settings', () => {
    expect(component).toContain('!schoolDay.hasLessons ? <div className="attendance-no-lessons">');
    expect(component).toContain('<strong>No lessons</strong>');
    expect(attendanceNoLessonsReason('weekend')).toBe('Weekend');
    expect(attendanceNoLessonsReason('vacation')).toBe('School vacation');
    expect(component.indexOf('attendance-date-controls')).toBeLessThan(component.indexOf('!schoolDay.hasLessons'));
    expect(component.indexOf('!schoolDay.hasLessons')).toBeLessThan(component.indexOf('day.students.map'));
    expect(component.indexOf('<details className="attendance-settings">')).toBeGreaterThan(component.indexOf('!schoolDay.hasLessons'));
    expect(calendarService).toContain('isAcademicDateExcluded(calendar,date)');
    expect(component).not.toMatch(/deleteAttendance|removeAttendance/);
  });
});
