-- Enforce one central Homework Template per owner, course, and Course Map item.
-- Existing duplicate rows must be reviewed and cleaned up in a separate guarded step
-- before this migration is applied.

begin;

alter table public.homework_templates
  add constraint homework_templates_owner_course_item_key
  unique (owner_id, course_id, source_course_item_id);

commit;
