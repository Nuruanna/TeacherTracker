-- Attendance V1 backend. Prepared locally; apply only after review.

begin;

create extension if not exists pgcrypto with schema extensions;

create table public.attendance_students (
  id uuid primary key default extensions.gen_random_uuid(),
  class_site_id uuid not null references public.class_sites(id) on delete restrict,
  display_name text not null,
  sort_order integer not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attendance_students_display_name_check check (btrim(display_name) <> ''),
  constraint attendance_students_sort_order_check check (sort_order >= 0)
);

create index attendance_students_roster_idx
  on public.attendance_students (class_site_id, is_active, sort_order, id);

create table public.attendance_absences (
  student_id uuid not null references public.attendance_students(id) on delete restrict,
  attendance_date date not null,
  lesson_number smallint not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attendance_absences_pkey primary key (student_id, attendance_date, lesson_number),
  constraint attendance_absences_lesson_number_check check (lesson_number between 1 and 7)
);

create index attendance_absences_date_student_idx
  on public.attendance_absences (attendance_date, student_id);

create table public.attendance_access (
  class_site_id uuid primary key references public.class_sites(id) on delete restrict,
  pin_hash text not null,
  access_version integer not null default 1,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attendance_access_pin_hash_check check (btrim(pin_hash) <> ''),
  constraint attendance_access_version_check check (access_version >= 1)
);

create table public.attendance_sessions (
  id uuid primary key default extensions.gen_random_uuid(),
  class_site_id uuid not null references public.class_sites(id) on delete restrict,
  token_hash text not null unique,
  access_version integer not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint attendance_sessions_token_hash_check check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint attendance_sessions_access_version_check check (access_version >= 1)
);

create index attendance_sessions_class_expiry_idx
  on public.attendance_sessions (class_site_id, expires_at);

create table public.attendance_rate_limits (
  scope_hash text primary key,
  failure_count integer not null,
  window_started_at timestamptz not null,
  blocked_until timestamptz,
  updated_at timestamptz not null default now(),
  constraint attendance_rate_limits_scope_hash_check check (scope_hash ~ '^[0-9a-f]{64}$'),
  constraint attendance_rate_limits_failure_count_check check (failure_count >= 0)
);

alter table public.attendance_students enable row level security;
alter table public.attendance_absences enable row level security;
alter table public.attendance_access enable row level security;
alter table public.attendance_sessions enable row level security;
alter table public.attendance_rate_limits enable row level security;

revoke all on table public.attendance_students from public, anon, authenticated;
revoke all on table public.attendance_absences from public, anon, authenticated;
revoke all on table public.attendance_access from public, anon, authenticated;
revoke all on table public.attendance_sessions from public, anon, authenticated;
revoke all on table public.attendance_rate_limits from public, anon, authenticated;

grant select, insert, update, delete on table public.attendance_students to authenticated;

create policy attendance_students_teacher_select on public.attendance_students
  for select to authenticated
  using (exists (
    select 1 from public.class_sites cs
    where cs.id = class_site_id and cs.owner_id = auth.uid()
      and cs.source_teaching_group_id = 'grade8-a'
  ));
create policy attendance_students_teacher_insert on public.attendance_students
  for insert to authenticated
  with check (exists (
    select 1 from public.class_sites cs
    where cs.id = class_site_id
      and cs.owner_id = auth.uid()
      and cs.source_teaching_group_id = 'grade8-a'
  ));
create policy attendance_students_teacher_update on public.attendance_students
  for update to authenticated
  using (exists (
    select 1 from public.class_sites cs
    where cs.id = class_site_id and cs.owner_id = auth.uid()
      and cs.source_teaching_group_id = 'grade8-a'
  ))
  with check (exists (
    select 1 from public.class_sites cs
    where cs.id = class_site_id
      and cs.owner_id = auth.uid()
      and cs.source_teaching_group_id = 'grade8-a'
  ));
create policy attendance_students_teacher_delete on public.attendance_students
  for delete to authenticated
  using (exists (
    select 1 from public.class_sites cs
    where cs.id = class_site_id and cs.owner_id = auth.uid()
      and cs.source_teaching_group_id = 'grade8-a'
  ));

-- These policies document and enforce ownership if direct authenticated grants are
-- deliberately added later. V1 writes absences through transactional RPCs only.
create policy attendance_absences_teacher_select on public.attendance_absences
  for select to authenticated
  using (exists (
    select 1
    from public.attendance_students ast
    join public.class_sites cs on cs.id = ast.class_site_id
    where ast.id = student_id and cs.owner_id = auth.uid()
  ));
create policy attendance_absences_teacher_insert on public.attendance_absences
  for insert to authenticated
  with check (exists (
    select 1
    from public.attendance_students ast
    join public.class_sites cs on cs.id = ast.class_site_id
    where ast.id = student_id
      and cs.owner_id = auth.uid()
      and cs.source_teaching_group_id = 'grade8-a'
  ));
create policy attendance_absences_teacher_update on public.attendance_absences
  for update to authenticated
  using (exists (
    select 1
    from public.attendance_students ast
    join public.class_sites cs on cs.id = ast.class_site_id
    where ast.id = student_id and cs.owner_id = auth.uid()
  ))
  with check (exists (
    select 1
    from public.attendance_students ast
    join public.class_sites cs on cs.id = ast.class_site_id
    where ast.id = student_id
      and cs.owner_id = auth.uid()
      and cs.source_teaching_group_id = 'grade8-a'
  ));
create policy attendance_absences_teacher_delete on public.attendance_absences
  for delete to authenticated
  using (exists (
    select 1
    from public.attendance_students ast
    join public.class_sites cs on cs.id = ast.class_site_id
    where ast.id = student_id and cs.owner_id = auth.uid()
  ));

create or replace function public.set_attendance_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger attendance_students_updated_at
before update on public.attendance_students
for each row execute function public.set_attendance_updated_at();
create trigger attendance_absences_updated_at
before update on public.attendance_absences
for each row execute function public.set_attendance_updated_at();
create trigger attendance_access_updated_at
before update on public.attendance_access
for each row execute function public.set_attendance_updated_at();

create or replace function public.attendance_lesson_set_is_valid(p_lessons smallint[])
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select p_lessons is not null
    and coalesce(cardinality(p_lessons), 0) <= 7
    and not exists (select 1 from unnest(p_lessons) lesson where lesson not between 1 and 7)
    and cardinality(p_lessons) = (select count(distinct lesson) from unnest(p_lessons) lesson);
$$;

create or replace function public.get_attendance_availability(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object('enabled', exists (
    select 1
    from public.class_sites cs
    join public.attendance_access aa on aa.class_site_id = cs.id
    where cs.slug = p_slug
      and cs.is_active = true
      and cs.source_teaching_group_id = 'grade8-a'
      and aa.enabled = true
  ));
$$;

create or replace function public.set_attendance_pin(p_class_site_id uuid, p_new_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_version integer;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if p_new_pin is null or p_new_pin !~ '^[0-9]{6}$' then raise exception 'PIN must contain exactly six digits' using errcode = '22023'; end if;
  if not exists (
    select 1 from public.class_sites cs
    where cs.id = p_class_site_id and cs.owner_id = auth.uid()
      and cs.source_teaching_group_id = 'grade8-a'
  ) then raise exception 'class site not found' using errcode = '42501'; end if;

  insert into public.attendance_access (class_site_id, pin_hash, access_version, enabled)
  values (p_class_site_id, extensions.crypt(p_new_pin, extensions.gen_salt('bf', 10)), 1, true)
  on conflict (class_site_id) do update set
    pin_hash = excluded.pin_hash,
    access_version = public.attendance_access.access_version + 1,
    enabled = true
  returning access_version into v_version;

  update public.attendance_sessions set revoked_at = now()
  where class_site_id = p_class_site_id and revoked_at is null;
  return jsonb_build_object('success', true, 'enabled', true, 'accessVersion', v_version);
end;
$$;

create or replace function public.set_attendance_enabled(p_class_site_id uuid, p_enabled boolean)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if p_enabled is null then raise exception 'enabled is required' using errcode = '22023'; end if;
  if not exists (
    select 1 from public.class_sites cs
    where cs.id = p_class_site_id and cs.owner_id = auth.uid()
      and cs.source_teaching_group_id = 'grade8-a'
  ) then raise exception 'class site not found' using errcode = '42501'; end if;
  update public.attendance_access set enabled = p_enabled where class_site_id = p_class_site_id;
  if not found then raise exception 'set a PIN before enabling Attendance' using errcode = '22023'; end if;
  if not p_enabled then
    update public.attendance_sessions set revoked_at = now()
    where class_site_id = p_class_site_id and revoked_at is null;
  end if;
  return jsonb_build_object('success', true, 'enabled', p_enabled);
end;
$$;

-- service_role-only: rate-limit and PIN verification are atomic with session issuance.
create or replace function public.issue_attendance_session(
  p_slug text,
  p_pin text,
  p_token_hash text,
  p_expires_at timestamptz,
  p_client_scope_hash text,
  p_slug_scope_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_now timestamptz := now();
  v_site_id uuid;
  v_pin_hash text;
  v_version integer;
  v_scope text;
  v_limit integer;
  v_row public.attendance_rate_limits%rowtype;
begin
  if p_slug is null or btrim(p_slug) = '' or p_pin is null or p_pin !~ '^[0-9]{6}$'
    or p_token_hash !~ '^[0-9a-f]{64}$'
    or (p_client_scope_hash is not null and p_client_scope_hash !~ '^[0-9a-f]{64}$')
    or p_slug_scope_hash !~ '^[0-9a-f]{64}$'
    or p_expires_at < v_now + interval '29 days 23 hours'
    or p_expires_at > v_now + interval '30 days 5 minutes'
  then return jsonb_build_object('status', 'denied'); end if;

  foreach v_scope in array case when p_client_scope_hash is null
    then array[p_slug_scope_hash]
    else array[p_client_scope_hash, p_slug_scope_hash]
  end loop
    v_limit := case when v_scope = p_client_scope_hash then 8 else 50 end;
    insert into public.attendance_rate_limits(scope_hash, failure_count, window_started_at)
    values (v_scope, 0, v_now) on conflict (scope_hash) do nothing;
    select * into v_row from public.attendance_rate_limits where scope_hash = v_scope for update;
    if v_row.blocked_until is not null and v_row.blocked_until > v_now then
      return jsonb_build_object('status', 'rate_limited');
    end if;
    if v_row.window_started_at <= v_now - interval '15 minutes' then
      update public.attendance_rate_limits set failure_count = 0, window_started_at = v_now,
        blocked_until = null, updated_at = v_now where scope_hash = v_scope;
    elsif v_row.failure_count >= v_limit then
      update public.attendance_rate_limits set blocked_until = v_now + interval '15 minutes',
        updated_at = v_now where scope_hash = v_scope;
      return jsonb_build_object('status', 'rate_limited');
    end if;
  end loop;

  select cs.id, aa.pin_hash, aa.access_version into v_site_id, v_pin_hash, v_version
  from public.class_sites cs join public.attendance_access aa on aa.class_site_id = cs.id
  where cs.slug = p_slug and cs.is_active = true and aa.enabled = true
    and cs.source_teaching_group_id = 'grade8-a';

  if v_site_id is null or extensions.crypt(p_pin, v_pin_hash) <> v_pin_hash then
    update public.attendance_rate_limits set
      failure_count = failure_count + 1,
      blocked_until = case
        when failure_count + 1 >= case when scope_hash = p_client_scope_hash then 8 else 50 end
        then v_now + interval '15 minutes' else blocked_until end,
      updated_at = v_now
    where scope_hash in (p_client_scope_hash, p_slug_scope_hash);
    return jsonb_build_object('status', 'denied');
  end if;

  delete from public.attendance_rate_limits where scope_hash = p_client_scope_hash;
  insert into public.attendance_sessions(class_site_id, token_hash, access_version, expires_at)
  values (v_site_id, p_token_hash, v_version, p_expires_at);
  return jsonb_build_object('status', 'issued');
end;
$$;

create or replace function public.attendance_session_class_site(p_token text)
returns table(class_site_id uuid, class_name text)
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select cs.id, cs.display_name
  from public.attendance_sessions ses
  join public.class_sites cs on cs.id = ses.class_site_id
  join public.attendance_access aa on aa.class_site_id = cs.id
  where ses.token_hash = encode(extensions.digest(convert_to(p_token, 'UTF8'), 'sha256'), 'hex')
    and ses.expires_at > now() and ses.revoked_at is null
    and ses.access_version = aa.access_version
    and aa.enabled = true and cs.is_active = true
    and cs.source_teaching_group_id = 'grade8-a';
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
begin
  select session.class_site_id, session.class_name into v_site_id, v_class_name
  from public.attendance_session_class_site(p_token) session;
  if v_site_id is null then raise exception 'attendance access denied' using errcode = '42501'; end if;
  return jsonb_build_object(
    'date', v_today,
    'className', v_class_name,
    'students', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', ast.id, 'displayName', ast.display_name, 'sortOrder', ast.sort_order,
        'absentLessons', coalesce((select jsonb_agg(aa.lesson_number order by aa.lesson_number)
          from public.attendance_absences aa where aa.student_id = ast.id and aa.attendance_date = v_today), '[]'::jsonb)
      ) order by ast.sort_order, ast.display_name, ast.id)
      from public.attendance_students ast where ast.class_site_id = v_site_id and ast.is_active = true
    ), '[]'::jsonb)
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
begin
  if not public.attendance_lesson_set_is_valid(p_lesson_numbers) then raise exception 'invalid lesson set' using errcode = '22023'; end if;
  select session.class_site_id into v_site_id from public.attendance_session_class_site(p_token) session;
  if v_site_id is null then raise exception 'attendance access denied' using errcode = '42501'; end if;
  if not exists (select 1 from public.attendance_students ast where ast.id = p_student_id and ast.class_site_id = v_site_id and ast.is_active = true)
    then raise exception 'student not found' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_student_id::text || ':' || v_today::text, 0));
  delete from public.attendance_absences where student_id = p_student_id and attendance_date = v_today;
  insert into public.attendance_absences(student_id, attendance_date, lesson_number)
    select p_student_id, v_today, lesson from unnest(p_lesson_numbers) lesson;
  return jsonb_build_object('studentId', p_student_id, 'absentLessons', to_jsonb(p_lesson_numbers));
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
        'id', ast.id, 'displayName', ast.display_name, 'sortOrder', ast.sort_order, 'isActive', ast.is_active,
        'absentLessons', coalesce((select jsonb_agg(aa.lesson_number order by aa.lesson_number)
          from public.attendance_absences aa where aa.student_id = ast.id and aa.attendance_date = p_attendance_date), '[]'::jsonb)
      ) order by ast.sort_order, ast.display_name, ast.id)
      from public.attendance_students ast
      where ast.class_site_id = p_class_site_id and (
        ast.is_active = true or exists (select 1 from public.attendance_absences aa where aa.student_id = ast.id and aa.attendance_date = p_attendance_date)
      )
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.set_teacher_student_absences(p_student_id uuid, p_attendance_date date, p_lesson_numbers smallint[])
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_today date := timezone('Asia/Vladivostok', now())::date;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if p_attendance_date is null or p_attendance_date > v_today then raise exception 'future attendance dates are not allowed' using errcode = '22023'; end if;
  if not public.attendance_lesson_set_is_valid(p_lesson_numbers) then raise exception 'invalid lesson set' using errcode = '22023'; end if;
  if not exists (
    select 1 from public.attendance_students ast join public.class_sites cs on cs.id = ast.class_site_id
    where ast.id = p_student_id and cs.owner_id = auth.uid() and cs.source_teaching_group_id = 'grade8-a'
  ) then raise exception 'student not found' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_student_id::text || ':' || p_attendance_date::text, 0));
  delete from public.attendance_absences where student_id = p_student_id and attendance_date = p_attendance_date;
  insert into public.attendance_absences(student_id, attendance_date, lesson_number)
    select p_student_id, p_attendance_date, lesson from unnest(p_lesson_numbers) lesson;
  return jsonb_build_object('studentId', p_student_id, 'date', p_attendance_date, 'absentLessons', to_jsonb(p_lesson_numbers));
end;
$$;

revoke all on function public.set_attendance_updated_at() from public;
revoke all on function public.attendance_lesson_set_is_valid(smallint[]) from public;
revoke all on function public.get_attendance_availability(text) from public;
revoke all on function public.set_attendance_pin(uuid, text) from public;
revoke all on function public.set_attendance_enabled(uuid, boolean) from public;
revoke all on function public.issue_attendance_session(text, text, text, timestamptz, text, text) from public;
revoke all on function public.attendance_session_class_site(text) from public;
revoke all on function public.get_today_attendance(text) from public;
revoke all on function public.set_today_student_absences(text, uuid, smallint[]) from public;
revoke all on function public.get_teacher_attendance_day(uuid, date) from public;
revoke all on function public.set_teacher_student_absences(uuid, date, smallint[]) from public;

grant execute on function public.get_attendance_availability(text) to anon, authenticated;
grant execute on function public.set_attendance_pin(uuid, text) to authenticated;
grant execute on function public.set_attendance_enabled(uuid, boolean) to authenticated;
grant execute on function public.issue_attendance_session(text, text, text, timestamptz, text, text) to service_role;
grant execute on function public.get_today_attendance(text) to anon, authenticated;
grant execute on function public.set_today_student_absences(text, uuid, smallint[]) to anon, authenticated;
grant execute on function public.get_teacher_attendance_day(uuid, date) to authenticated;
grant execute on function public.set_teacher_student_absences(uuid, date, smallint[]) to authenticated;

commit;
