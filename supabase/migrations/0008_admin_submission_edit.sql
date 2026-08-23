-- Let an admin correct a submission's details before it is published.
--
-- Run with `npx supabase db push` after 0007. Migrations 0001 to 0007 are
-- untouched.
--
-- WHAT THIS IS FOR
-- ----------------
-- A submitter is not required to provide a showcase video, and that is fine for
-- them, but the catalog wants one. The same goes for a level creator typed
-- slightly wrong, or a macro author credited under the wrong spelling. Until
-- now the only options were to publish it wrong or reject somebody's perfectly
-- good macro over a missing link.
--
-- THE CONSTRAINT THAT MATTERS
-- ---------------------------
-- Editing is only allowed while publishing has NOT STARTED.
--
-- The public asset filename is derived from macro_author, level_name and
-- recorder. Once the .gdr2 has been uploaded to a GitHub Release, that name is
-- fixed and the publisher's crash recovery identifies its own earlier upload by
-- that name plus a content hash. Changing any of those three fields mid-publish
-- would make a resumed run look for a file that does not exist, upload a second
-- copy under the new name, and leave an orphan behind.
--
-- So the guard is not "is this row still editable" in the loose sense. It is
-- "has anything irreversible happened yet", which is exactly what
-- private.submission_publish_state records.

begin;

/**
 * Updates the details of a submission that has not started publishing.
 *
 * Every field is optional: passing null leaves the existing value alone, which
 * is what lets the UI send only what changed. Clearing a nullable field is done
 * with an explicit empty string rather than null, so "leave alone" and "remove"
 * stay distinguishable.
 *
 * Deliberately NOT editable here:
 *   * the submitter, because reassigning someone else's submission is not a
 *     correction;
 *   * the uploaded file, which is the thing being reviewed;
 *   * the status, which has its own transitions in 0005;
 *   * the notes, which are the submitter's own words to the reviewer and are
 *     not ours to rewrite.
 *
 * The table's own constraints still apply: level_id shape, name and author
 * lengths, the recorder enum, and the video_url scheme check that makes a
 * javascript: or data: value impossible to store.
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

  -- 'approved' and 'rejected' rows are deleted by the 2D lifecycle, so in
  -- practice only these two exist. Named explicitly anyway, so a future status
  -- does not silently become editable.
  if v_status not in ('pending', 'processing') then
    raise exception 'this submission can no longer be edited';
  end if;

  -- The real guard. Anything past not_started means a file already exists
  -- publicly under a name derived from these fields.
  select ps.state into v_state
    from private.submission_publish_state ps
   where ps.submission_id = p_id;

  if v_state is not null and v_state <> 'not_started' then
    raise exception 'publishing has already started, so the details are fixed';
  end if;

  update public.submissions s
     set level_name    = coalesce(nullif(trim(p_level_name), ''), s.level_name),
         level_id      = coalesce(nullif(trim(p_level_id), ''), s.level_id),
         -- Nullable fields: an empty string means "clear it", null means
         -- "leave it".
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
