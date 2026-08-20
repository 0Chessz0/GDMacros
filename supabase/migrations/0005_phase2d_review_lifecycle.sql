-- Phase 2D: the review lifecycle, outcome notifications and submission bans.
--
-- Run with `npx supabase db push` after 0004. 0003 and 0004 are untouched.
--
-- The lifecycle changes from "approve and keep the row forever" to:
--
--   pending -> processing -> (admin publishes by hand) -> Done & Close
--                            row and file deleted, one tiny notification kept
--   pending -> rejected                                 same, immediately
--
-- Nothing here auto-publishes. Approval only ever means "this passed review".
--
-- Design notes live in .claude/reference/phase2.md. The rules that carry over
-- from 2C are unchanged: submissions has no client write policy, every write is
-- a SECURITY DEFINER RPC, private.is_admin() is the only definition of admin,
-- and no email or username appears in any authorisation rule.

begin;

-- ---------------------------------------------------------------------------
-- 1. Existing reviewed rows become notifications, then go
-- ---------------------------------------------------------------------------
-- The new model does not retain reviewed submissions. Production currently
-- holds none, so this is a no-op there, but a database that does have some must
-- not silently lose them: they are converted first and deleted second, inside
-- this transaction. Their Storage objects are NOT touched here, because SQL
-- cannot reach Storage; they become invisible orphans, which is the direction
-- this project prefers and which a sweep can clear later.

-- ---------------------------------------------------------------------------
-- 2. Outcome notifications
-- ---------------------------------------------------------------------------
-- Deliberately tiny. This is what the submitter is told, and nothing else: no
-- file path, no file size, no recorder, no macro author, no level creator, no
-- notes, no video, no email, no admin identity, no copy of the submission.
-- It is NOT an admin history table.

create table if not exists public.submission_notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  level_name text not null,
  outcome    text not null check (outcome in ('accepted', 'rejected')),
  -- Only ever the reason shown to the submitter. The private moderation reason
  -- for a ban is a different thing entirely and lives in the private schema.
  rejection_reason text,
  created_at timestamptz not null default now(),

  constraint notification_level_name_len check (char_length(level_name) between 1 and 100),
  constraint notification_reason_len check (
    rejection_reason is null or char_length(rejection_reason) between 3 and 500
  ),
  -- An accepted notification can never carry a reason, and a rejected one can
  -- never be missing it.
  constraint notification_reason_matches_outcome check (
    (outcome = 'accepted' and rejection_reason is null)
    or (outcome = 'rejected' and rejection_reason is not null)
  )
);

create index if not exists submission_notifications_user_idx
  on public.submission_notifications (user_id, created_at desc);

revoke all on public.submission_notifications from public;
revoke all on public.submission_notifications from anon;
revoke all on public.submission_notifications from authenticated;

-- Read your own, and dismiss your own. No insert grant: only the review RPCs
-- create these. No update grant: there is nothing to edit.
grant select, delete on public.submission_notifications to authenticated;

alter table public.submission_notifications enable row level security;

drop policy if exists "read your own notifications"    on public.submission_notifications;
drop policy if exists "dismiss your own notifications" on public.submission_notifications;

create policy "read your own notifications"
  on public.submission_notifications for select to authenticated
  using ((select auth.uid()) = user_id);

-- Dismissing is deleting. It touches nothing else: notifications are standalone
-- rows with no link to any live submission.
create policy "dismiss your own notifications"
  on public.submission_notifications for delete to authenticated
  using ((select auth.uid()) = user_id);

-- Now convert any reviewed submissions that predate this migration.
insert into public.submission_notifications (user_id, level_name, outcome, rejection_reason)
select s.submitted_by,
       s.level_name,
       case when s.status = 'approved' then 'accepted' else 'rejected' end,
       case when s.status = 'rejected'
            then coalesce(nullif(btrim(s.rejection_reason), ''), 'No reason was recorded.')
            else null end
from public.submissions s
where s.status in ('approved', 'rejected');

delete from public.submissions where status in ('approved', 'rejected');

-- ---------------------------------------------------------------------------
-- 3. The processing state
-- ---------------------------------------------------------------------------

alter table public.submissions
  add column if not exists processing_by uuid references auth.users(id),
  add column if not exists processing_started_at timestamptz;

-- Only two live states remain. Approved and rejected submissions are not kept,
-- so they are no longer valid values.
alter table public.submissions drop constraint if exists submissions_status_check;
alter table public.submissions
  add constraint submissions_status_check check (status in ('pending', 'processing'));

-- The old constraint described approved and rejected rows that can no longer
-- exist. Replaced with one describing the two states that can.
alter table public.submissions drop constraint if exists review_fields_consistent;
alter table public.submissions
  add constraint review_fields_consistent check (
       (status = 'pending'
        and processing_by is null and processing_started_at is null
        and reviewed_by is null and reviewed_at is null and rejection_reason is null)
    or (status = 'processing'
        and processing_by is not null and processing_started_at is not null
        and reviewed_by is null and reviewed_at is null and rejection_reason is null)
  );

-- reviewed_by, reviewed_at and rejection_reason are left on the table but are
-- now always null: an outcome ends the row's life rather than being recorded on
-- it. Dropping them is a separate cleanup, not worth doing in the same
-- migration that changes behaviour.

create index if not exists submissions_processing_idx
  on public.submissions (status, processing_started_at desc);

-- The freeze trigger needs no change: processing_by and processing_started_at
-- are new columns and were never in its frozen list, so the review RPCs can set
-- them while every content and ownership field stays immutable.

-- ---------------------------------------------------------------------------
-- 4. Submission bans
-- ---------------------------------------------------------------------------
-- In the PRIVATE schema, which PostgREST does not expose, because this is the
-- one place email addresses are stored outside auth.users. No client can read
-- it, enumerate it, or learn whether an address is on it.

create table if not exists private.submission_bans (
  id          uuid primary key default gen_random_uuid(),
  -- Normalised on the way in, so matching is case-insensitive.
  email_lower text not null unique,
  -- Filled in when the address belongs to an account at ban time. Kept so the
  -- ban survives that person changing their email later.
  user_id     uuid references auth.users(id) on delete set null,
  -- The moderator's private note. NEVER shown to the banned person.
  reason      text not null,
  banned_by   uuid not null references auth.users(id),
  created_at  timestamptz not null default now(),

  constraint ban_reason_len check (char_length(btrim(reason)) between 3 and 500),
  constraint ban_email_shape check (char_length(email_lower) between 3 and 320
                                and email_lower = lower(email_lower))
);

create index if not exists submission_bans_user_idx on private.submission_bans (user_id);

revoke all on private.submission_bans from public;
revoke all on private.submission_bans from anon;
revoke all on private.submission_bans from authenticated;

alter table private.submission_bans enable row level security;
-- RLS on with zero policies: deny all. Only SECURITY DEFINER functions read it.

/**
 * Whether the CURRENT caller is banned from submitting.
 *
 * Identity comes from auth.uid() and the email is read from auth.users here,
 * never accepted as a parameter, so a caller cannot ask about somebody else or
 * lie about their own address.
 *
 * Matches on either the address or the account id, which is what makes a ban
 * survive an email change and also lets an address be banned before anyone
 * signs up with it.
 */
create or replace function private.is_submission_banned()
  returns boolean
  language sql
  security definer
  stable
  set search_path = ''
as $$
  select exists (
    select 1
    from private.submission_bans b
    where b.user_id = (select auth.uid())
       or b.email_lower = (select lower(u.email) from auth.users u where u.id = (select auth.uid()))
  );
$$;

revoke all on function private.is_submission_banned() from public;
revoke all on function private.is_submission_banned() from anon;
revoke all on function private.is_submission_banned() from authenticated;
-- Not granted to anyone. Only create_submission calls it, and that runs as the
-- owner. A banned person cannot even probe whether they are banned.

-- ---------------------------------------------------------------------------
-- 5. create_submission now refuses a banned submitter
-- ---------------------------------------------------------------------------
-- Enforced HERE rather than in the route, so calling PostgREST directly is
-- refused too.

create or replace function public.create_submission(
  p_id            uuid,
  p_level_name    text,
  p_level_id      text,
  p_level_creator text,
  p_video_url     text,
  p_recorder      text,
  p_macro_author  text,
  p_notes         text,
  p_file_size     integer
)
  returns uuid
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  if not exists (select 1 from public.profiles where id = v_uid) then
    raise exception 'choose a username first';
  end if;

  -- The message is deliberately the same one the visitor sees, and says
  -- nothing about why or for how long.
  if private.is_submission_banned() then
    raise exception 'submission ban';
  end if;

  if not private.submission_object_exists(v_uid, p_id) then
    raise exception 'no uploaded file for this submission';
  end if;

  insert into public.submissions (
    id, submitted_by, level_name, level_id, level_creator,
    video_url, recorder, macro_author, notes, file_size
  ) values (
    p_id, v_uid, p_level_name, p_level_id, p_level_creator,
    p_video_url, p_recorder, p_macro_author, p_notes, p_file_size
  );

  return p_id;
end;
$$;

revoke all on function public.create_submission(uuid, text, text, text, text, text, text, text, integer) from public;
revoke all on function public.create_submission(uuid, text, text, text, text, text, text, text, integer) from anon;
grant execute on function public.create_submission(uuid, text, text, text, text, text, text, text, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Claiming a submission for processing
-- ---------------------------------------------------------------------------

/**
 * pending -> processing, atomically.
 *
 * The status is in the WHERE clause, so two admins clicking Accept at the same
 * instant cannot both succeed: the first UPDATE moves the row out of 'pending'
 * and the second matches nothing. No advisory lock is needed; the row lock the
 * UPDATE already takes does the work.
 *
 * The submitter is told nothing at this point. They are not accepted yet.
 */
create or replace function public.start_processing(p_id uuid)
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'not authorised';
  end if;

  update public.submissions
     set status = 'processing',
         processing_by = (select auth.uid()),
         processing_started_at = now()
   where id = p_id
     and status = 'pending';

  if not found then
    raise exception 'not found or already being handled';
  end if;
end;
$$;

/**
 * processing -> pending, so a submission someone stopped working on can be
 * handed back to the queue.
 *
 * Deliberately explicit. Nothing releases a claim automatically: a stale claim
 * that quietly reopened itself while an admin was mid-publish is exactly the
 * failure this design is trying to avoid.
 */
create or replace function public.release_processing(p_id uuid)
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'not authorised';
  end if;

  update public.submissions
     set status = 'pending',
         processing_by = null,
         processing_started_at = null
   where id = p_id
     and status = 'processing';

  if not found then
    raise exception 'not found or not being processed';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Done and Close
-- ---------------------------------------------------------------------------

/**
 * The only thing that finishes an accepted submission.
 *
 * Closing the dialog, refreshing, navigating away and closing the browser all
 * do nothing, because none of them calls this.
 *
 * IDEMPOTENT BY CONSTRUCTION. The row is deleted and the notification inserted
 * in the same statement pair inside one transaction, so a second call finds no
 * row, matches nothing, and creates no second notification. Double-clicking is
 * therefore safe without any extra locking or dedupe key.
 *
 * Any admin may finish, not only the one who claimed it. Requiring the original
 * claimant would strand a submission whenever that person was unavailable, and
 * release_processing already exists for a deliberate handover.
 *
 * Returns the storage path so the caller can delete the object next. Row first,
 * then file: a failed file delete leaves an invisible orphan, which is the
 * direction this project prefers over a visible row pointing at nothing.
 */
create or replace function public.finish_processing(p_id uuid)
  returns text
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_path  text;
  v_owner uuid;
  v_name  text;
begin
  if not private.is_admin() then
    raise exception 'not authorised';
  end if;

  delete from public.submissions
   where id = p_id
     and status = 'processing'
  returning storage_path, submitted_by, level_name
      into v_path, v_owner, v_name;

  if v_path is null then
    raise exception 'not found or not being processed';
  end if;

  insert into public.submission_notifications (user_id, level_name, outcome)
  values (v_owner, v_name, 'accepted');

  return v_path;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Rejection
-- ---------------------------------------------------------------------------

-- 0003 created this as `returns void`. CREATE OR REPLACE cannot change a
-- return type, so replacing it in place would abort the migration with
-- "cannot change return type of existing function". It has to be dropped
-- first. Dropping is safe: it is recreated immediately below, inside the same
-- transaction, so there is no window where it does not exist.
drop function if exists public.reject_submission(uuid, text);

/**
 * Rejects a PENDING submission, tells the submitter why, and deletes the row.
 *
 * Same idempotency as finish_processing: the row is gone after the first call,
 * so a duplicate finds nothing and cannot produce a second notification.
 *
 * A submission already being processed cannot be rejected. Whoever claimed it
 * should release it first, so the two paths never race.
 */
create or replace function public.reject_submission(p_id uuid, p_reason text)
  returns text
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_reason text := btrim(coalesce(p_reason, ''));
  v_path   text;
  v_owner  uuid;
  v_name   text;
begin
  if not private.is_admin() then
    raise exception 'not authorised';
  end if;

  if char_length(v_reason) < 3 then
    raise exception 'a rejection reason is required';
  end if;
  if char_length(v_reason) > 500 then
    raise exception 'that reason is too long';
  end if;

  delete from public.submissions
   where id = p_id
     and status = 'pending'
  returning storage_path, submitted_by, level_name
      into v_path, v_owner, v_name;

  if v_path is null then
    raise exception 'not found or already reviewed';
  end if;

  insert into public.submission_notifications (user_id, level_name, outcome, rejection_reason)
  values (v_owner, v_name, 'rejected', v_reason);

  return v_path;
end;
$$;

-- approve_submission belonged to the old lifecycle, where approving was the end
-- of the story. It is replaced by start_processing plus finish_processing.
drop function if exists public.approve_submission(uuid);

-- ---------------------------------------------------------------------------
-- 9. Ban administration
-- ---------------------------------------------------------------------------
-- Granted to `authenticated` because that is the only role a signed-in person
-- has. Authorisation is inside each function via private.is_admin(), so a
-- normal user calling them directly is refused.

/**
 * Bans an address from creating new submissions.
 *
 * The address is normalised and the matching account id is resolved here, from
 * auth.users, so the ban keeps working if that person later changes their
 * email. An address with no account yet can be banned in advance; whoever signs
 * up with it later is matched on the address.
 *
 * Re-banning an address updates the reason rather than failing, so a moderator
 * can correct a note without an unban first.
 */
create or replace function public.ban_submission_email(p_email text, p_reason text)
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_email  text := lower(btrim(coalesce(p_email, '')));
  v_reason text := btrim(coalesce(p_reason, ''));
  v_user   uuid;
begin
  if not private.is_admin() then
    raise exception 'not authorised';
  end if;

  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'that does not look like an email address';
  end if;
  if char_length(v_reason) < 3 or char_length(v_reason) > 500 then
    raise exception 'a reason of 3 to 500 characters is required';
  end if;

  select u.id into v_user from auth.users u where lower(u.email) = v_email;

  -- An administrator cannot be banned from submitting. Removing the role is a
  -- separate, deliberate act, and this stops a mistake locking out an owner.
  if v_user is not null and exists (
    select 1 from public.user_roles r where r.user_id = v_user and r.role = 'admin'
  ) then
    raise exception 'that account is an administrator';
  end if;

  -- Aliased, because ON CONFLICT DO UPDATE refers to the existing row by
  -- relation name or alias rather than by a schema-qualified name.
  insert into private.submission_bans as existing (email_lower, user_id, reason, banned_by)
  values (v_email, v_user, v_reason, (select auth.uid()))
  on conflict (email_lower) do update
    set reason    = excluded.reason,
        banned_by = excluded.banned_by,
        -- Never lose an id already recorded, but fill one in if the account
        -- has been created since the ban was first written.
        user_id   = coalesce(existing.user_id, excluded.user_id);
end;
$$;

create or replace function public.unban_submission_email(p_email text)
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
begin
  if not private.is_admin() then
    raise exception 'not authorised';
  end if;

  delete from private.submission_bans where email_lower = v_email;

  if not found then
    raise exception 'that address is not banned';
  end if;
end;
$$;

/**
 * The ban list, for the admin panel.
 *
 * This is the ONLY way an email address ever reaches a page, and only for
 * addresses a moderator typed in themselves. It is not an account directory:
 * it cannot list anyone who has not been banned.
 */
create or replace function public.list_submission_bans()
  returns table (
    email_lower text,
    reason      text,
    created_at  timestamptz,
    banned_by_username text,
    has_account boolean
  )
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'not authorised';
  end if;

  return query
    select b.email_lower,
           b.reason,
           b.created_at,
           coalesce(p.username, 'unknown'),
           b.user_id is not null
    from private.submission_bans b
    left join public.profiles p on p.id = b.banned_by
    order by b.created_at desc;
end;
$$;

revoke all on function public.ban_submission_email(text, text)   from public;
revoke all on function public.ban_submission_email(text, text)   from anon;
revoke all on function public.unban_submission_email(text)       from public;
revoke all on function public.unban_submission_email(text)       from anon;
revoke all on function public.list_submission_bans()             from public;
revoke all on function public.list_submission_bans()             from anon;

grant execute on function public.ban_submission_email(text, text) to authenticated;
grant execute on function public.unban_submission_email(text)     to authenticated;
grant execute on function public.list_submission_bans()           to authenticated;

revoke all on function public.start_processing(uuid)   from public;
revoke all on function public.start_processing(uuid)   from anon;
revoke all on function public.release_processing(uuid) from public;
revoke all on function public.release_processing(uuid) from anon;
revoke all on function public.finish_processing(uuid)  from public;
revoke all on function public.finish_processing(uuid)  from anon;
revoke all on function public.reject_submission(uuid, text) from public;
revoke all on function public.reject_submission(uuid, text) from anon;

grant execute on function public.start_processing(uuid)   to authenticated;
grant execute on function public.release_processing(uuid) to authenticated;
grant execute on function public.finish_processing(uuid)  to authenticated;
grant execute on function public.reject_submission(uuid, text) to authenticated;

commit;

-- ---------------------------------------------------------------------------
-- Verifying afterwards
-- ---------------------------------------------------------------------------
-- Through the API as a real signed-in user, never in the SQL editor, which
-- bypasses RLS and proves nothing about a client:
--
--   private.is_submission_banned, rpc/list_submission_bans as a normal user
--     -> 404 and 'not authorised' respectively
--   insert/update/delete on submission_notifications  -> 42501 for insert and
--     update, delete only your own
--   another user's notifications                      -> empty
--   start_processing twice from two sessions          -> exactly one succeeds
--   finish_processing twice                           -> one notification
--   create_submission while banned                    -> 'submission ban'
