-- Fix: 0008's editor could never succeed, because the freeze trigger blocked it.
--
-- Run with `npx supabase db push` after 0008. Migrations 0001 to 0008 are
-- applied history and are untouched; this replaces two functions in place, the
-- same way 0004 fixed 0003's trigger.
--
-- WHAT WENT WRONG
-- ---------------
-- 0003 added `private.freeze_submission_fields()`, a BEFORE UPDATE trigger that
-- raises 'submission content is immutable' if any of id, submitted_by,
-- level_name, level_id, level_creator, video_url, recorder, macro_author,
-- notes, file_size or created_at changes.
--
-- 0008's `admin_update_submission` updates six of exactly those columns. Every
-- call therefore raised, and the UI reported a generic failure. The migration
-- parsed, the logic was right, and it could not work.
--
-- THE FIX, AND WHY IT IS NARROW
-- -----------------------------
-- The obvious repair is "let the trigger allow admins through". That is wider
-- than it needs to be: it would unfreeze those columns for EVERY present and
-- future code path that happens to run as an admin, including ones written
-- later by someone who never read this file.
--
-- Instead the trigger looks for a transaction-local flag that exactly one
-- function sets, immediately after it has checked `private.is_admin()` and
-- confirmed publishing has not started. Nothing else in the schema sets it.
--
-- Why the flag cannot be forged:
--
--   * `public.submissions` grants only SELECT to `authenticated`, and there is
--     no UPDATE policy. No client can update the table at all, whatever any
--     session setting says.
--   * setting a GUC requires executing SQL, which PostgREST does not expose.
--   * `set_config(..., true)` is transaction-local, so it cannot outlive the
--     call that set it or leak into another request.
--
-- The columns that stay frozen unconditionally are the ones that are not the
-- reviewer's to change: id, submitted_by, notes (the submitter's own words),
-- file_size and created_at.

begin;

-- ---------------------------------------------------------------------------
-- 1. The trigger, with one narrow exception
-- ---------------------------------------------------------------------------

create or replace function private.freeze_submission_fields()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  -- Set only by public.admin_update_submission, and only after it has verified
  -- the caller is an admin and that publishing has not begun.
  v_editing boolean := coalesce(
    current_setting('gdmacros.content_edit', true), ''
  ) = 'on';
begin
  -- storage_path is deliberately NOT compared: it is a generated column, so in
  -- a BEFORE trigger NEW holds null for it rather than the computed value. It
  -- is derived from submitted_by and id, both frozen here, and Postgres forbids
  -- writing a generated column directly, so it is protected either way.
  --
  -- Always frozen, flag or no flag. None of these is a "detail" a reviewer
  -- corrects: reassigning a submission, rewriting the submitter's notes or
  -- restating the file's size would each be a different thing entirely.
  if new.id           is distinct from old.id
  or new.submitted_by is distinct from old.submitted_by
  or new.notes        is distinct from old.notes
  or new.file_size    is distinct from old.file_size
  or new.created_at   is distinct from old.created_at
  then
    raise exception 'submission content is immutable';
  end if;

  -- Frozen unless an admin correction is in progress.
  if not v_editing then
    if new.level_name    is distinct from old.level_name
    or new.level_id      is distinct from old.level_id
    or new.level_creator is distinct from old.level_creator
    or new.video_url     is distinct from old.video_url
    or new.recorder      is distinct from old.recorder
    or new.macro_author  is distinct from old.macro_author
    then
      raise exception 'submission content is immutable';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.freeze_submission_fields() from public;
revoke all on function private.freeze_submission_fields() from anon;
revoke all on function private.freeze_submission_fields() from authenticated;

-- ---------------------------------------------------------------------------
-- 2. The editor, now raising the flag around its own update
-- ---------------------------------------------------------------------------

/**
 * Updates the details of a submission that has not started publishing.
 *
 * Identical to 0008 apart from the set_config call: the checks, the fields and
 * the refusals are unchanged. See 0008 for why editing is refused once the
 * asset has been uploaded.
 */
create or replace function public.admin_update_submission(
  p_id            uuid,
  p_level_name    text default null,
  p_level_id      text default null,
  p_level_creator text default null,
  p_video_url     text default null,
  p_recorder      text default null,
  p_macro_author  text default null
)
  returns table (
    id uuid,
    level_name text,
    level_id text,
    level_creator text,
    video_url text,
    recorder text,
    macro_author text,
    status text
  )
  language plpgsql
  security definer
  set search_path = ''
as $$
#variable_conflict use_column
declare
  v_status text;
  v_state  text;
begin
  if not private.is_admin() then
    raise exception 'not authorised';
  end if;

  select s.status into v_status
    from public.submissions s
   where s.id = p_id;

  if v_status is null then
    raise exception 'not found';
  end if;

  if v_status not in ('pending', 'processing') then
    raise exception 'this submission can no longer be edited';
  end if;

  -- Anything past not_started means a file already exists publicly under a name
  -- derived from these fields.
  select ps.state into v_state
    from private.submission_publish_state ps
   where ps.submission_id = p_id;

  if v_state is not null and v_state <> 'not_started' then
    raise exception 'publishing has already started, so the details are fixed';
  end if;

  -- Raised only now, after every check has passed. `true` makes it
  -- transaction-local, so it is gone the moment this call returns and cannot
  -- affect anything else.
  perform set_config('gdmacros.content_edit', 'on', true);

  update public.submissions s
     set level_name    = coalesce(nullif(trim(p_level_name), ''), s.level_name),
         level_id      = coalesce(nullif(trim(p_level_id), ''), s.level_id),
         level_creator = case
                           when p_level_creator is null then s.level_creator
                           when trim(p_level_creator) = '' then null
                           else trim(p_level_creator)
                         end,
         video_url     = case
                           when p_video_url is null then s.video_url
                           when trim(p_video_url) = '' then null
                           else trim(p_video_url)
                         end,
         recorder      = coalesce(nullif(trim(p_recorder), ''), s.recorder),
         macro_author  = coalesce(nullif(trim(p_macro_author), ''), s.macro_author),
         updated_at    = now()
   where s.id = p_id;

  -- Lowered immediately, so the flag covers this one statement and nothing
  -- that might run after it in the same transaction.
  perform set_config('gdmacros.content_edit', 'off', true);

  return query
  select s.id, s.level_name, s.level_id, s.level_creator,
         s.video_url, s.recorder, s.macro_author, s.status
    from public.submissions s
   where s.id = p_id;
end;
$$;

revoke all on function public.admin_update_submission(uuid, text, text, text, text, text, text) from public;
revoke all on function public.admin_update_submission(uuid, text, text, text, text, text, text) from anon;
grant execute on function public.admin_update_submission(uuid, text, text, text, text, text, text) to authenticated;

commit;
