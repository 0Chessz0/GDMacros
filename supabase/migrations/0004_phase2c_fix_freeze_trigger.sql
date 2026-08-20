-- Phase 2C fix: the freeze trigger blocked every legitimate review.
--
-- Run this with `npx supabase db push` after 0003.
--
--
-- What went wrong
-- ---------------
-- 0003's private.freeze_submission_fields() compared storage_path:
--
--   if ... or new.storage_path is distinct from old.storage_path then
--     raise exception 'submission content is immutable';
--
-- public.submissions.storage_path is a GENERATED ALWAYS ... STORED column, and
-- Postgres computes generated columns AFTER before-row triggers have run. So
-- inside a BEFORE UPDATE trigger, NEW.storage_path is null while OLD.storage_path
-- holds the stored value. `null is distinct from '<path>'` is true, so the
-- comparison fired on EVERY update, including the two review RPCs that are
-- supposed to be allowed.
--
-- The symptom was that approve_submission and reject_submission both failed with
-- 'submission content is immutable' and no submission could ever be reviewed.
--
--
-- The fix, and why dropping the check loses nothing
-- ------------------------------------------------
-- storage_path is not an independent field. It is defined as:
--
--   submitted_by::text || '/' || id::text || '.gdr2'
--
-- Both of those ARE still frozen by this trigger, and Postgres refuses a direct
-- write to a generated column at all. So storage_path cannot change unless
-- submitted_by or id changes, which the trigger already rejects. The clause was
-- redundant as well as wrong.
--
-- Everything else the trigger freezes is unchanged: id, submitted_by,
-- level_name, level_id, level_creator, video_url, recorder, macro_author,
-- notes, file_size and created_at. Only status, the three review fields and
-- updated_at may ever change.

begin;

create or replace function private.freeze_submission_fields()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  -- storage_path is deliberately NOT compared: it is a generated column, so in
  -- a BEFORE trigger NEW holds null for it rather than the computed value. It
  -- is derived from submitted_by and id, both frozen here, and Postgres forbids
  -- writing a generated column directly, so it is protected either way.
  if new.id            is distinct from old.id
  or new.submitted_by  is distinct from old.submitted_by
  or new.level_name    is distinct from old.level_name
  or new.level_id      is distinct from old.level_id
  or new.level_creator is distinct from old.level_creator
  or new.video_url     is distinct from old.video_url
  or new.recorder      is distinct from old.recorder
  or new.macro_author  is distinct from old.macro_author
  or new.notes         is distinct from old.notes
  or new.file_size     is distinct from old.file_size
  or new.created_at    is distinct from old.created_at
  then
    raise exception 'submission content is immutable';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.freeze_submission_fields() from public;
revoke all on function private.freeze_submission_fields() from anon;
revoke all on function private.freeze_submission_fields() from authenticated;

commit;

-- The trigger itself does not need recreating: it already points at this
-- function by name, and CREATE OR REPLACE keeps that binding.
--
-- After applying, a review should succeed and content should still be frozen.
-- Both halves are covered by the Stage 2C admin test pass.
