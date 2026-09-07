-- Add a private, per-day Academic Calendar projection for Student Attendance.

begin;

create table public.attendance_calendar_projection (
  class_site_id uuid primary key references public.class_sites(id) on delete restrict,
  academic_year_start date not null,
  academic_year_end date not null,
  updated_at timestamptz not null default now(),
  constraint attendance_calendar_projection_year_check check (academic_year_end >= academic_year_start)
);

create table public.attendance_calendar_days (
  class_site_id uuid not null references public.attendance_calendar_projection(class_site_id) on delete cascade,
  school_date date not null,
  day_type text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (class_site_id, school_date),
  constraint attendance_calendar_days_type_check check (day_type in ('instructional', 'weekend', 'vacation', 'holiday'))
);

create trigger attendance_calendar_projection_updated_at
before update on public.attendance_calendar_projection
for each row execute function public.set_attendance_updated_at();

create trigger attendance_calendar_days_updated_at
before update on public.attendance_calendar_days
for each row execute function public.set_attendance_updated_at();

alter table public.attendance_calendar_projection enable row level security;
alter table public.attendance_calendar_days enable row level security;

revoke all on table public.attendance_calendar_projection from public, anon, authenticated;
revoke all on table public.attendance_calendar_days from public, anon, authenticated;
grant select, insert, update, delete on table public.attendance_calendar_projection to service_role;
grant select, insert, update, delete on table public.attendance_calendar_days to service_role;

create or replace function public.replace_attendance_calendar_projection(
  p_class_site_id uuid,
  p_academic_year_start date,
  p_academic_year_end date,
  p_days_json jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_expected_days integer;
  v_supplied_days integer;
begin
  if auth.uid() is null and auth.role() <> 'service_role'
  then raise exception 'authentication required' using errcode = '42501'; end if;
  if not exists (
    select 1 from public.class_sites cs
    where cs.id = p_class_site_id
      and (cs.owner_id = auth.uid() or auth.role() = 'service_role')
      and cs.source_teaching_group_id = 'grade8-a'
  ) then raise exception 'class site not found' using errcode = '42501'; end if;

  if p_academic_year_start is null or p_academic_year_end is null
    or p_academic_year_end < p_academic_year_start
  then raise exception 'invalid academic year' using errcode = '22023'; end if;
  if p_academic_year_end - p_academic_year_start > 400
  then raise exception 'academic year exceeds 400 days' using errcode = '22023'; end if;
  if p_days_json is null or jsonb_typeof(p_days_json) <> 'array'
  then raise exception 'calendar days must be an array' using errcode = '22023'; end if;

  v_expected_days := p_academic_year_end - p_academic_year_start + 1;
  v_supplied_days := jsonb_array_length(p_days_json);
  if v_supplied_days <> v_expected_days
  then raise exception 'calendar projection must cover every academic-year date' using errcode = '22023'; end if;

  if exists (
    select 1 from jsonb_array_elements(p_days_json) item
    where jsonb_typeof(item) <> 'object'
      or item - 'date' - 'dayType' <> '{}'::jsonb
      or coalesce(item->>'date', '') !~ '^\d{4}-\d{2}-\d{2}$'
      or coalesce(item->>'dayType', '') not in ('instructional', 'weekend', 'vacation', 'holiday')
  ) then raise exception 'invalid calendar day' using errcode = '22023'; end if;

  if exists (
    select 1 from jsonb_array_elements(p_days_json) item
    where (item->>'date')::date < p_academic_year_start
       or (item->>'date')::date > p_academic_year_end
  ) then raise exception 'calendar day is outside academic year' using errcode = '22023'; end if;

  if (select count(distinct (item->>'date')::date) from jsonb_array_elements(p_days_json) item) <> v_supplied_days
  then raise exception 'duplicate calendar date' using errcode = '22023'; end if;

  insert into public.attendance_calendar_projection(class_site_id, academic_year_start, academic_year_end)
  values (p_class_site_id, p_academic_year_start, p_academic_year_end)
  on conflict (class_site_id) do update set
    academic_year_start = excluded.academic_year_start,
    academic_year_end = excluded.academic_year_end,
    updated_at = now();

  delete from public.attendance_calendar_days where class_site_id = p_class_site_id;
  insert into public.attendance_calendar_days(class_site_id, school_date, day_type)
  select p_class_site_id, (item->>'date')::date, item->>'dayType'
  from jsonb_array_elements(p_days_json) item;

  return jsonb_build_object('success', true, 'dayCount', v_supplied_days);
end;
$$;

create or replace function public.attendance_calendar_day_type(p_class_site_id uuid, p_school_date date)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_projection public.attendance_calendar_projection%rowtype;
  v_day_type text;
begin
  select * into v_projection from public.attendance_calendar_projection
  where class_site_id = p_class_site_id;
  if not found then return 'calendar_unavailable'; end if;
  if p_school_date < v_projection.academic_year_start or p_school_date > v_projection.academic_year_end
  then return 'outside_academic_year'; end if;
  select day_type into v_day_type from public.attendance_calendar_days
  where class_site_id = p_class_site_id and school_date = p_school_date;
  return coalesce(v_day_type, 'calendar_unavailable');
end;
$$;

create or replace function public.get_today_attendance(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_site_id uuid;
  v_class_name text;
  v_today date := timezone('Asia/Vladivostok', now())::date;
  v_day_type text;
begin
  select session.class_site_id, session.class_name into v_site_id, v_class_name
  from public.attendance_session_class_site(p_token) session;
  if v_site_id is null then raise exception 'attendance access denied' using errcode = '42501'; end if;
  v_day_type := public.attendance_calendar_day_type(v_site_id, v_today);
  if v_day_type = 'calendar_unavailable'
  then raise exception 'attendance calendar unavailable' using errcode = '55000'; end if;
  return jsonb_build_object(
    'date', v_today,
    'hasLessons', v_day_type = 'instructional',
    'dayType', v_day_type,
    'className', v_class_name,
    'students', case when v_day_type = 'instructional' then coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', ast.id, 'studentNumber', ast.student_number, 'isHighlighted', ast.is_highlighted,
        'absentLessons', coalesce((select jsonb_agg(aa.lesson_number order by aa.lesson_number)
          from public.attendance_absences aa where aa.student_id = ast.id and aa.attendance_date = v_today), '[]'::jsonb)
      ) order by ast.student_number)
      from public.attendance_students ast where ast.class_site_id = v_site_id and ast.is_active = true
    ), '[]'::jsonb) else '[]'::jsonb end
  );
end;
$$;

create or replace function public.set_today_student_absences(p_token text, p_student_id uuid, p_lesson_numbers smallint[])
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_site_id uuid;
  v_today date := timezone('Asia/Vladivostok', now())::date;
  v_day_type text;
begin
  if not public.attendance_lesson_set_is_valid(p_lesson_numbers) then raise exception 'invalid lesson set' using errcode = '22023'; end if;
  select session.class_site_id into v_site_id from public.attendance_session_class_site(p_token) session;
  if v_site_id is null then raise exception 'attendance access denied' using errcode = '42501'; end if;
  v_day_type := public.attendance_calendar_day_type(v_site_id, v_today);
  if v_day_type <> 'instructional'
  then raise exception 'attendance is unavailable for this date' using errcode = '55000'; end if;
  if not exists (select 1 from public.attendance_students ast where ast.id = p_student_id and ast.class_site_id = v_site_id and ast.is_active = true)
  then raise exception 'student not found' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_student_id::text || ':' || v_today::text, 0));
  delete from public.attendance_absences where student_id = p_student_id and attendance_date = v_today;
  insert into public.attendance_absences(student_id, attendance_date, lesson_number)
  select p_student_id, v_today, lesson from unnest(p_lesson_numbers) lesson;
  return jsonb_build_object('studentId', p_student_id, 'absentLessons', to_jsonb(p_lesson_numbers));
end;
$$;

revoke execute on function public.replace_attendance_calendar_projection(uuid, date, date, jsonb) from public, anon, authenticated;
revoke execute on function public.attendance_calendar_day_type(uuid, date) from public, anon, authenticated;
revoke execute on function public.get_today_attendance(text) from public, anon, authenticated;
revoke execute on function public.set_today_student_absences(text, uuid, smallint[]) from public, anon, authenticated;

grant execute on function public.replace_attendance_calendar_projection(uuid, date, date, jsonb) to authenticated, service_role;
grant execute on function public.attendance_calendar_day_type(uuid, date) to service_role;
grant execute on function public.get_today_attendance(text) to anon, authenticated, service_role;
grant execute on function public.set_today_student_absences(text, uuid, smallint[]) to anon, authenticated, service_role;

commit;
