-- Prepared locally for manual review. Do not execute as part of Stage S3.1.

begin;

alter table public.class_sites
  add column if not exists current_course_item_id text,
  add column if not exists progress_kind text,
  add column if not exists progress_current integer,
  add column if not exists progress_total integer;

alter table public.class_sites
  drop constraint if exists class_sites_progress_contract_check;

alter table public.class_sites
  add constraint class_sites_progress_contract_check check (
    (
      current_course_item_id is null
      and progress_kind is null
      and progress_current is null
      and progress_total is null
    )
    or
    (
      current_course_item_id is not null
      and btrim(current_course_item_id) <> ''
      and progress_kind is not null
      and progress_kind in ('step', 'lesson')
      and progress_current is not null
      and progress_current >= 1
      and progress_total is not null
      and progress_total > 0
      and progress_current <= progress_total
    )
  );

-- Preserve the established camelCase Class Site contract and add progress only
-- to currentSection. Nested Homework remains during the dedicated-RPC transition.
create or replace function public.get_published_class_site(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'classSite', jsonb_build_object(
      'id', cs.id,
      'displayName', cs.display_name,
      'slug', cs.slug
    ),
    'course', jsonb_build_object(
      'id', course.id,
      'displayName', course.display_name,
      'grade', course.grade
    ),
    'currentSection', case
      when current_section.id is null then null
      else jsonb_build_object(
        'id', current_section.id,
        'type', current_section.section_type,
        'number', current_section.section_number,
        'title', current_section.display_title,
        'progress', case
          when cs.progress_kind is null then null
          else jsonb_build_object(
            'kind', cs.progress_kind,
            'current', cs.progress_current,
            'total', cs.progress_total
          )
        end
      )
    end,
    'availableStudySections', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', section.id,
        'type', section.section_type,
        'number', section.section_number,
        'title', section.display_title,
        'isCurrent', section.id = cs.current_course_section_id
      ) order by section.sort_order, section.section_type, section.section_number)
      from public.course_sections section
      where section.owner_id = cs.owner_id
        and section.course_id = cs.course_id
        and exists (
          select 1
          from public.study_material_blocks block
          where block.owner_id = section.owner_id
            and block.course_section_id = section.id
            and block.publication_status = 'published'
        )
    ), '[]'::jsonb),
    'homework', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', assignment.id,
        'assignedDate', assignment.assigned_date,
        'dueDate', assignment.due_date,
        'dueLessonDate', assignment.due_lesson_date,
        'assignedLessonCode', assignment.assigned_lesson_code,
        'assignedLessonTitle', assignment.assigned_lesson_title,
        'publishedAt', assignment.published_at,
        'template', jsonb_build_object(
          'id', template.id,
          'title', template.title,
          'body', template.body,
          'sourceLessonCode', template.source_lesson_code,
          'sourceLessonTitle', template.source_lesson_title,
          'assets', coalesce((
            select jsonb_agg(jsonb_build_object(
              'id', asset.id,
              'type', asset.asset_type,
              'bucket', asset.bucket,
              'storagePath', asset.storage_path,
              'mimeType', asset.mime_type,
              'width', asset.width,
              'height', asset.height,
              'sizeBytes', asset.size_bytes,
              'url', asset.url,
              'title', asset.title
            ) order by asset.sort_order, asset.id)
            from public.homework_assets asset
            where asset.owner_id = template.owner_id
              and asset.homework_template_id = template.id
              and asset.asset_type = 'image'
              and asset.bucket = 'class-site-assets'
              and asset.storage_path is not null
              and btrim(asset.storage_path) <> ''
          ), '[]'::jsonb)
        )
      ) order by assignment.assigned_date desc, assignment.due_date nulls last, assignment.created_at desc)
      from public.homework_assignments assignment
      join public.homework_templates template
        on template.id = assignment.homework_template_id
       and template.owner_id = assignment.owner_id
       and template.course_id = assignment.course_id
      where assignment.owner_id = cs.owner_id
        and assignment.course_id = cs.course_id
        and assignment.class_site_id = cs.id
        and assignment.publication_status = 'published'
        and assignment.published_at is not null
        and template.content_status = 'ready'
        and (
          btrim(coalesce(template.body, '')) <> ''
          or exists (
            select 1
            from public.homework_assets meaningful_asset
            where meaningful_asset.homework_template_id = template.id
              and meaningful_asset.owner_id = template.owner_id
              and meaningful_asset.asset_type = 'image'
              and meaningful_asset.bucket = 'class-site-assets'
              and meaningful_asset.storage_path is not null
              and btrim(meaningful_asset.storage_path) <> ''
          )
        )
    ), '[]'::jsonb)
  )
  from public.class_sites cs
  join public.courses course
    on course.id = cs.course_id
   and course.owner_id = cs.owner_id
  left join public.course_sections current_section
    on current_section.id = cs.current_course_section_id
   and current_section.course_id = cs.course_id
   and current_section.owner_id = cs.owner_id
  where cs.slug = p_slug
    and cs.is_active = true;
$$;

create or replace function public.get_published_homework(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', ha.id,
    'assigned_date', ha.assigned_date,
    'due_date', ha.due_date,
    'lesson_code', ha.assigned_lesson_code,
    'lesson_title', ha.assigned_lesson_title,
    'body', ht.body,
    'assets', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', asset.id,
        'asset_type', asset.asset_type,
        'bucket', asset.bucket,
        'storage_path', asset.storage_path,
        'title', asset.title,
        'width', asset.width,
        'height', asset.height,
        'sort_order', asset.sort_order
      ) order by asset.sort_order, asset.id)
      from public.homework_assets asset
      where asset.homework_template_id = ht.id
        and asset.owner_id = ht.owner_id
        and asset.asset_type = 'image'
        and asset.bucket = 'class-site-assets'
        and asset.storage_path is not null
        and btrim(asset.storage_path) <> ''
    ), '[]'::jsonb)
  ) order by ha.assigned_date, ha.id), '[]'::jsonb)
  from public.class_sites cs
  join public.homework_assignments ha
    on ha.class_site_id = cs.id
   and ha.owner_id = cs.owner_id
   and ha.course_id = cs.course_id
  join public.homework_templates ht
    on ht.id = ha.homework_template_id
   and ht.owner_id = ha.owner_id
   and ht.course_id = cs.course_id
  where cs.slug = p_slug
    and cs.is_active = true
    and ha.publication_status = 'published'
    and ha.published_at is not null
    and ht.content_status = 'ready'
    and (
      btrim(coalesce(ht.body, '')) <> ''
      or exists (
        select 1
        from public.homework_assets meaningful_asset
        where meaningful_asset.homework_template_id = ht.id
          and meaningful_asset.owner_id = ht.owner_id
          and meaningful_asset.asset_type = 'image'
          and meaningful_asset.bucket = 'class-site-assets'
          and meaningful_asset.storage_path is not null
          and btrim(meaningful_asset.storage_path) <> ''
      )
    )
$$;

revoke all on function public.get_published_class_site(text) from public;
revoke all on function public.get_published_homework(text) from public;
grant execute on function public.get_published_class_site(text) to anon, authenticated;
grant execute on function public.get_published_homework(text) to anon, authenticated;

commit;
