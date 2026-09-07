-- Record the Attendance V1 function privilege hotfix already applied in production.

begin;

revoke execute on function public.set_attendance_updated_at() from public, anon, authenticated;
revoke execute on function public.attendance_lesson_set_is_valid(smallint[]) from public, anon, authenticated;
revoke execute on function public.attendance_session_class_site(text) from public, anon, authenticated;
grant execute on function public.set_attendance_updated_at() to service_role;
grant execute on function public.attendance_lesson_set_is_valid(smallint[]) to service_role;
grant execute on function public.attendance_session_class_site(text) to service_role;

revoke execute on function public.issue_attendance_session(text, text, text, timestamptz, text, text) from public, anon, authenticated;
grant execute on function public.issue_attendance_session(text, text, text, timestamptz, text, text) to service_role;

revoke execute on function public.get_attendance_availability(text) from public, anon, authenticated;
revoke execute on function public.get_today_attendance(text) from public, anon, authenticated;
revoke execute on function public.set_today_student_absences(text, uuid, smallint[]) from public, anon, authenticated;
grant execute on function public.get_attendance_availability(text) to anon, authenticated, service_role;
grant execute on function public.get_today_attendance(text) to anon, authenticated, service_role;
grant execute on function public.set_today_student_absences(text, uuid, smallint[]) to anon, authenticated, service_role;

revoke execute on function public.set_attendance_pin(uuid, text) from public, anon, authenticated;
revoke execute on function public.set_attendance_enabled(uuid, boolean) from public, anon, authenticated;
revoke execute on function public.get_teacher_attendance_day(uuid, date) from public, anon, authenticated;
revoke execute on function public.set_teacher_student_absences(uuid, date, smallint[]) from public, anon, authenticated;
grant execute on function public.set_attendance_pin(uuid, text) to authenticated, service_role;
grant execute on function public.set_attendance_enabled(uuid, boolean) to authenticated, service_role;
grant execute on function public.get_teacher_attendance_day(uuid, date) to authenticated, service_role;
grant execute on function public.set_teacher_student_absences(uuid, date, smallint[]) to authenticated, service_role;

commit;
