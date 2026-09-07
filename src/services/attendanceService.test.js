import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ supabase: { auth: { getUser: vi.fn() }, from: vi.fn(), rpc: vi.fn() } }));
vi.mock('../lib/supabase', () => ({ supabase: mocks.supabase, supabaseConfigurationError: null }));

const terminal = data => {
  const chain = { data, error: null };
  for (const method of ['select', 'eq', 'limit', 'order', 'insert', 'update']) chain[method] = vi.fn(() => chain);
  chain.then = resolve => Promise.resolve({ data: chain.data, error: chain.error }).then(resolve);
  return chain;
};

describe('Attendance service', () => {
  beforeEach(() => {
    mocks.supabase.auth.getUser.mockReset().mockResolvedValue({ data: { user: { id: 'teacher-1' } }, error: null });
    mocks.supabase.from.mockReset();
    mocks.supabase.rpc.mockReset();
    vi.resetModules();
  });

  it('resolves only the owned grade8-a Class Site', async () => {
    const request = terminal([{ id: 'site-private', display_name: '8A', slug: 'opaque', source_teaching_group_id: 'grade8-a' }]);
    mocks.supabase.from.mockReturnValue(request);
    const { resolveAttendanceClassSite } = await import('./attendanceService');
    const site = await resolveAttendanceClassSite();
    expect(site.display_name).toBe('8A');
    expect(request.eq).toHaveBeenCalledWith('owner_id', 'teacher-1');
    expect(request.eq).toHaveBeenCalledWith('source_teaching_group_id', 'grade8-a');
  });

  it('loads fixed roster fields in student-number order', async () => {
    const request = terminal([{ id: 'student-private', student_number: 2, is_active: true, is_highlighted: false }]);
    mocks.supabase.from.mockReturnValue(request);
    const { loadAttendanceRoster } = await import('./attendanceService');
    await loadAttendanceRoster('site-private');
    expect(request.select).toHaveBeenCalledWith(expect.stringContaining('student_number'));
    expect(request.select).toHaveBeenCalledWith(expect.stringContaining('is_highlighted'));
    expect(request.order).toHaveBeenCalledWith('student_number');
  });

  it('sends one teacher RPC with a normalized full lesson array, including empty Clear all', async () => {
    mocks.supabase.rpc.mockResolvedValue({ data: { studentId: 'student-private' }, error: null });
    const { saveTeacherStudentAbsences } = await import('./attendanceService');
    await saveTeacherStudentAbsences('student-private', '2026-09-05', [2, 1, 2]);
    expect(mocks.supabase.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.supabase.rpc).toHaveBeenCalledWith('set_teacher_student_absences', {
      p_student_id: 'student-private', p_attendance_date: '2026-09-05', p_lesson_numbers: [1, 2],
    });
    mocks.supabase.rpc.mockClear();
    await saveTeacherStudentAbsences('student-private', '2026-09-05', []);
    expect(mocks.supabase.rpc).toHaveBeenCalledWith('set_teacher_student_absences', expect.objectContaining({ p_lesson_numbers: [] }));
  });

  it('validates PIN locally and sends it only to the PIN RPC', async () => {
    mocks.supabase.rpc.mockResolvedValue({ data: { success: true }, error: null });
    const { setAttendancePin } = await import('./attendanceService');
    await expect(setAttendancePin('site-private', '12345')).rejects.toThrow('exactly six digits');
    await setAttendancePin('site-private', '123456');
    expect(mocks.supabase.rpc).toHaveBeenCalledWith('set_attendance_pin', { p_class_site_id: 'site-private', p_new_pin: '123456' });
  });

  it('calls enable and disable through the authenticated RPC', async () => {
    mocks.supabase.rpc.mockResolvedValue({ data: { success: true }, error: null });
    const { setAttendanceEnabled } = await import('./attendanceService');
    await setAttendanceEnabled('site-private', true);
    await setAttendanceEnabled('site-private', false);
    expect(mocks.supabase.rpc.mock.calls.map(call => call[1].p_enabled)).toEqual([true, false]);
  });

  it('updates active and highlighted states without changing student numbers', async () => {
    const activeRequest = terminal([{ id: 'student-private', student_number: 7, is_active: false, is_highlighted: false }]);
    const highlightedRequest = terminal([{ id: 'student-private', student_number: 7, is_active: false, is_highlighted: true }]);
    mocks.supabase.from.mockReturnValueOnce(activeRequest).mockReturnValueOnce(highlightedRequest);
    const { setAttendanceStudentActive, setAttendanceStudentHighlighted } = await import('./attendanceService');
    await setAttendanceStudentActive('student-private', false);
    await setAttendanceStudentHighlighted('student-private', true);
    expect(activeRequest.update).toHaveBeenCalledWith({ is_active: false });
    expect(highlightedRequest.update).toHaveBeenCalledWith({ is_highlighted: true });
    expect(activeRequest.update).not.toHaveBeenCalledWith(expect.objectContaining({ student_number: expect.anything() }));
  });

  it('replaces the Attendance projection with safe per-day output only', async () => {
    mocks.supabase.rpc.mockResolvedValue({ data: { success: true }, error: null });
    const { replaceAttendanceCalendarProjection } = await import('./attendanceService');
    const projection = await replaceAttendanceCalendarProjection('site-private', {
      academicYear: { start: '2026-09-05', end: '2026-09-06' },
      schoolBreaks: [], noSchoolDays: [], excludedDates: [], privateSetting: 'omit',
    });
    expect(projection.days).toEqual([
      { date: '2026-09-05', dayType: 'weekend' },
      { date: '2026-09-06', dayType: 'weekend' },
    ]);
    expect(mocks.supabase.rpc).toHaveBeenCalledWith('replace_attendance_calendar_projection', {
      p_class_site_id: 'site-private', p_academic_year_start: '2026-09-05', p_academic_year_end: '2026-09-06', p_days_json: projection.days,
    });
    expect(JSON.stringify(mocks.supabase.rpc.mock.calls)).not.toContain('privateSetting');
  });
});
