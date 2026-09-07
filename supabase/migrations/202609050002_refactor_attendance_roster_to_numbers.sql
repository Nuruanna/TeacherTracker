-- Replace the temporary free-text Attendance roster with fixed class numbers.

begin;

alter table public.attendance_students
  add column student_number smallint,
  add column is_highlighted boolean not null default false;

do $$
begin
  if exists (
    select 1
    from public.attendance_students
    group by class_site_id
    having count(*) > 35
  ) then
    raise exception 'Attendance roster refactor cannot number a Class Site with more than 35 existing rows.';
  end if;
end;
$$;

with numbered as (
  select id, row_number() over (partition by class_site_id order by sort_order, id)::smallint as student_number
  from public.attendance_students
)
update public.attendance_students ast
set student_number = numbered.student_number,
    is_highlighted = false
from numbered
where numbered.id = ast.id;

alter table public.attendance_students alter column display_name drop not null;

insert into public.attendance_students (class_site_id, display_name, sort_order, student_number, is_active, is_highlighted)
select cs.id, null, slot.student_number, slot.student_number::smallint,
  slot.student_number between 1 and 33, false
from public.class_sites cs
cross join generate_series(1, 35) as slot(student_number)
where cs.source_teaching_group_id = 'grade8-a'
  and not exists (
    select 1 from public.attendance_students ast
    where ast.class_site_id = cs.id and ast.student_number = slot.student_number
  );

update public.attendance_students ast
set is_active = ast.student_number between 1 and 33,
    is_highlighted = false
from public.class_sites cs
where cs.id = ast.class_site_id
  and cs.source_teaching_group_id = 'grade8-a';

drop index public.attendance_students_roster_idx;
alter table public.attendance_students
  drop constraint attendance_students_display_name_check,
  drop constraint attendance_students_sort_order_check,
  drop column display_name,
  drop column sort_order,
  alter column student_number set not null,
  add constraint attendance_students_student_number_check check (student_number between 1 and 35),
  add constraint attendance_students_class_number_key unique (class_site_id, student_number);

create index attendance_students_roster_idx
  on public.attendance_students (class_site_id, is_active, student_number, id);

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
begin
  select session.class_site_id, session.class_name into v_site_id, v_class_name
  from public.attendance_session_class_site(p_token) session;
  if v_site_id is null then raise exception 'attendance access denied' using errcode = '42501'; end if;
  return jsonb_build_object(
    'date', v_today,
    'className', v_class_name,
    'students', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', ast.id, 'studentNumber', ast.student_number, 'isHighlighted', ast.is_highlighted,
        'absentLessons', coalesce((select jsonb_agg(aa.lesson_number order by aa.lesson_number)
          from public.attendance_absences aa where aa.student_id = ast.id and aa.attendance_date = v_today), '[]'::jsonb)
      ) order by ast.student_number)
      from public.attendance_students ast where ast.class_site_id = v_site_id and ast.is_active = true
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.get_teacher_attendance_day(p_class_site_id uuid, p_attendance_date date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_class_name text;
  v_today date := timezone('Asia/Vladivostok', now())::date;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if p_attendance_date is null or p_attendance_date > v_today then raise exception 'future attendance dates are not allowed' using errcode = '22023'; end if;
  select cs.display_name into v_class_name from public.class_sites cs
  where cs.id = p_class_site_id and cs.owner_id = auth.uid() and cs.source_teaching_group_id = 'grade8-a';
  if v_class_name is null then raise exception 'class site not found' using errcode = '42501'; end if;
  return jsonb_build_object(
    'date', p_attendance_date, 'className', v_class_name,
    'students', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', ast.id, 'studentNumber', ast.student_number, 'isActive', ast.is_active,
        'isHighlighted', ast.is_highlighted,
        'absentLessons', coalesce((select jsonb_agg(aa.lesson_number order by aa.lesson_number)
          from public.attendance_absences aa where aa.student_id = ast.id and aa.attendance_date = p_attendance_date), '[]'::jsonb)
      ) order by ast.student_number)
      from public.attendance_students ast
      where ast.class_site_id = p_class_site_id and (
        ast.is_active = true or exists (select 1 from public.attendance_absences aa where aa.student_id = ast.id and aa.attendance_date = p_attendance_date)
      )
    ), '[]'::jsonb)
  );
end;
$$;

commit;
