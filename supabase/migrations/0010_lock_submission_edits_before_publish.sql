-- Fix: serialize review edits with the pending -> processing claim.
--
-- 0009 made the editor compatible with the immutable-content trigger, but it
-- still allowed a row whose status was `processing` to be edited while its
-- publish state was `not_started`. `begin_publish` returns a trusted snapshot
-- of that row before the server performs any GitHub work. A second admin could
-- therefore edit the names after that snapshot was returned but before publish
-- intent was recorded, leaving the asset, catalog and database with different
-- metadata.
--
-- This replacement takes a row lock while checking the status and only permits
-- edits while the submission is `pending`. `start_processing` performs the
-- pending -> processing UPDATE under the same row lock. Whichever transaction
-- gets the lock first wins cleanly:
--
--   * edit first: the claim waits, then publishes the edited values;
--   * claim first: the edit waits, sees `processing`, and is refused.
--
-- A pending row should never have publish state (release_processing deletes a
-- not_started state row), but the explicit existence check fails closed if the
-- database is ever left inconsistent.

begin;

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
begin
  if not private.is_admin() then
    raise exception 'not authorised';
  end if;

  -- The lock is the concurrency boundary shared with start_processing's
  -- pending -> processing UPDATE. Do not split this check from the lock.
  select s.status into v_status
    from public.submissions s
   where s.id = p_id
     for update;

  if v_status is null then
    raise exception 'not found';
  end if;

  if v_status <> 'pending' then
    raise exception 'this submission can no longer be edited';
  end if;

  if exists (
    select 1
      from private.submission_publish_state ps
     where ps.submission_id = p_id
  ) then
    raise exception 'publishing has already started, so the details are fixed';
  end if;

  -- This transaction-local flag opens the narrow exception in
  -- private.freeze_submission_fields() for this update only.
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
