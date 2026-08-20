-- Phase 2C: roles, submissions and the private upload bucket.
--
-- Run this once with `npx supabase db push`. It is written to be re-runnable:
-- every object is created with "if not exists", "or replace", or dropped first,
-- so a partial run can be repeated safely.
--
-- Design notes live in .claude/reference/phase2.md. The short version:
--
--   * public.submissions has NO insert, update or delete policy, for anyone,
--     including admins. Four SECURITY DEFINER RPCs are the only way in, so
--     calling PostgREST directly cannot skip validation.
--   * public.user_roles has no write path at all through the API. Admin is
--     granted once, by hand, in SQL. There is no self-promotion path to close
--     because there is no path.
--   * private.is_admin() is the single database-side definition of admin.
--     No email and no username appears in any authorisation rule.
--   * The macro-submissions bucket gets NO storage policies, so anon and
--     authenticated clients cannot touch objects at all. Object operations run
--     server-side through a secret key. That is what stops a client uploading
--     directly and skipping magic-byte validation.
--   * Postgres grants EXECUTE to PUBLIC by default. Every function revokes that
--     before granting anything.

begin;

-- ---------------------------------------------------------------------------
-- 1. Roles
-- ---------------------------------------------------------------------------

create table if not exists public.user_roles (
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null check (role in ('admin')),
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

-- Identity is the user id and only the user id. Deliberately no email column
-- and no username column: usernames are mutable, and an email is a login
-- credential rather than an authorisation subject.

revoke all on public.user_roles from public;
revoke all on public.user_roles from anon;
revoke all on public.user_roles from authenticated;

-- Read only, and even that is narrowed by the policy below. There is no
-- insert, update or delete grant, so a policy added carelessly later still
-- could not open a write path.
grant select on public.user_roles to authenticated;

alter table public.user_roles enable row level security;

drop policy if exists "read your own roles" on public.user_roles;

-- Own rows only. An admin does not need to enumerate other admins for anything
-- in this stage, and keeping the rule this simple removes any question of the
-- policy recursing through private.is_admin() back into this same table.
create policy "read your own roles"
  on public.user_roles for select to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- 2. The single definition of "admin"
-- ---------------------------------------------------------------------------

create or replace function private.is_admin()
  returns boolean
  language sql
  security definer
  stable
  set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = (select auth.uid()) and role = 'admin'
  );
$$;

-- security definer matters twice here. It lets the check see rows the caller's
-- own policy would hide, and because the owner bypasses RLS (the table is not
-- FORCE'd), the lookup cannot recurse back through a policy.
revoke all on function private.is_admin() from public;
revoke all on function private.is_admin() from anon;
grant execute on function private.is_admin() to authenticated;

-- Lives in `private`, which PostgREST does not expose, so it is not callable as
-- an RPC. Policies and other functions can still reach it.

-- ---------------------------------------------------------------------------
-- 3. Submissions
-- ---------------------------------------------------------------------------

create table if not exists public.submissions (
  id           uuid primary key default gen_random_uuid(),
  submitted_by uuid not null references auth.users(id) on delete cascade,

  level_name    text not null,
  level_id      text not null,
  level_creator text,
  video_url     text,
  recorder      text not null check (recorder in ('xdBot', 'Mega Hack')),
  -- NOT the uploader. Whoever recorded the macro usually has no account, so
  -- this is free text and deliberately not a foreign key.
  macro_author  text not null,
  notes         text,

  -- Generated, so no caller can point a row at somebody else's object.
  storage_path text generated always as (
    submitted_by::text || '/' || id::text || '.gdr2'
  ) stored,
  file_size integer not null check (file_size between 1 and 2097152),

  status           text not null default 'pending'
                     check (status in ('pending', 'approved', 'rejected')),
  rejection_reason text,
  reviewed_by      uuid references auth.users(id),
  reviewed_at      timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Nothing user-controlled is unbounded.
  constraint level_name_len    check (char_length(level_name) between 1 and 100),
  constraint level_id_format   check (level_id ~ '^[0-9]{1,12}$'),
  constraint level_creator_len check (level_creator is null
                                   or char_length(level_creator) between 1 and 50),
  constraint macro_author_len  check (char_length(macro_author) between 1 and 50),
  constraint notes_len         check (notes is null or char_length(notes) <= 1000),

  -- Scheme-checked in the DATABASE, so a javascript: or data: value cannot be
  -- stored at all, let alone later rendered into an href.
  constraint video_url_safe check (
    video_url is null
    or (video_url ~* '^https?://' and char_length(video_url) <= 500)
  ),

  constraint reason_len check (rejection_reason is null
                            or char_length(rejection_reason) between 3 and 500),

  -- A row can never sit in a half-reviewed state.
  constraint review_fields_consistent check (
       (status = 'pending'  and reviewed_by is null and reviewed_at is null
                            and rejection_reason is null)
    or (status = 'approved' and reviewed_by is not null and reviewed_at is not null
                            and rejection_reason is null)
    or (status = 'rejected' and reviewed_by is not null and reviewed_at is not null
                            and rejection_reason is not null)
  )
);

create index if not exists submissions_status_created_idx
  on public.submissions (status, created_at desc);
create index if not exists submissions_submitted_by_idx
  on public.submissions (submitted_by);

revoke all on public.submissions from public;
revoke all on public.submissions from anon;
revoke all on public.submissions from authenticated;

-- SELECT only. Every write goes through an RPC, so there is deliberately no
-- insert, update or delete grant for anybody, admins included.
grant select on public.submissions to authenticated;

alter table public.submissions enable row level security;

drop policy if exists "read your own submissions, or all as an admin" on public.submissions;

create policy "read your own submissions, or all as an admin"
  on public.submissions for select to authenticated
  using ((select auth.uid()) = submitted_by or private.is_admin());

-- No insert, update or delete policy. None. That is the design.

-- ---------------------------------------------------------------------------
-- 4. Immutability, as defence in depth
-- ---------------------------------------------------------------------------
-- The RPCs already refuse to touch these fields. The trigger means that even a
-- careless future edit to one of them cannot mutate content or ownership.

create or replace function private.freeze_submission_fields()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
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
  or new.storage_path  is distinct from old.storage_path
  or new.created_at    is distinct from old.created_at
  then
    raise exception 'submission content is immutable';
  end if;

  -- Only status, the three review fields and this timestamp may ever change.
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.freeze_submission_fields() from public;
revoke all on function private.freeze_submission_fields() from anon;
revoke all on function private.freeze_submission_fields() from authenticated;

drop trigger if exists freeze_submission_fields on public.submissions;
create trigger freeze_submission_fields
  before update on public.submissions
  for each row execute function private.freeze_submission_fields();

-- ---------------------------------------------------------------------------
-- 5. The bucket
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit)
values ('macro-submissions', 'macro-submissions', false, 2097152)
on conflict (id) do update
  set public = false,
      file_size_limit = 2097152;

-- allowed_mime_types is left null on purpose. A .gdr2 file has no registered
-- MIME type, so a browser sends whatever it likes and the value proves nothing.
-- The real gate is the magic-byte check the upload route performs before the
-- object is ever written.
--
-- NO POLICIES ARE CREATED ON storage.objects FOR THIS BUCKET. RLS is already
-- enabled on that table by Supabase, so zero policies means anon and
-- authenticated are denied every operation: no upload, no download, no list,
-- no delete, not even under their own user id. Every object operation happens
-- server-side with the secret key. This is the whole point: without it a
-- client could upload directly and skip validation entirely.

create or replace function private.submission_object_exists(p_uid uuid, p_id uuid)
  returns boolean
  language sql
  security definer
  stable
  set search_path = ''
as $$
  select exists (
    select 1 from storage.objects
    where bucket_id = 'macro-submissions'
      and name = p_uid::text || '/' || p_id::text || '.gdr2'
  );
$$;

revoke all on function private.submission_object_exists(uuid, uuid) from public;
revoke all on function private.submission_object_exists(uuid, uuid) from anon;
revoke all on function private.submission_object_exists(uuid, uuid) from authenticated;
-- Not granted to anyone: only create_submission calls it, and that function is
-- SECURITY DEFINER so it runs as the owner.

-- ---------------------------------------------------------------------------
-- 6. Creating a submission
-- ---------------------------------------------------------------------------

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

  -- A submission is attributed publicly, so it needs a public identity.
  if not exists (select 1 from public.profiles where id = v_uid) then
    raise exception 'choose a username first';
  end if;

  -- The file must already be there. Combined with a bucket that has no client
  -- policies, the only way to get an object in place is through the trusted
  -- server route, so a direct caller of this function has nothing to point at.
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

-- status, reviewed_by, reviewed_at and rejection_reason are NOT parameters, so
-- they take their defaults and cannot be forged by the caller.

revoke all on function public.create_submission(uuid, text, text, text, text, text, text, text, integer) from public;
revoke all on function public.create_submission(uuid, text, text, text, text, text, text, text, integer) from anon;
grant execute on function public.create_submission(uuid, text, text, text, text, text, text, text, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Withdrawing your own pending submission
-- ---------------------------------------------------------------------------

create or replace function public.withdraw_submission(p_id uuid)
  returns text
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_uid  uuid := (select auth.uid());
  v_path text;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  -- Ownership and status are both in the WHERE clause, so somebody else's row,
  -- or an already-reviewed one, simply does not match. A reviewed submission is
  -- evidence of a decision and cannot be erased by the person who sent it.
  delete from public.submissions
   where id = p_id
     and submitted_by = v_uid
     and status = 'pending'
  returning storage_path into v_path;

  if v_path is null then
    raise exception 'not found, not yours, or already reviewed';
  end if;

  -- The caller deletes the object next. Row first, then file: an orphaned file
  -- is invisible and sweepable, whereas a row with no file is a visible broken
  -- submission an admin cannot download.
  return v_path;
end;
$$;

revoke all on function public.withdraw_submission(uuid) from public;
revoke all on function public.withdraw_submission(uuid) from anon;
grant execute on function public.withdraw_submission(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Review
-- ---------------------------------------------------------------------------
-- Granted to `authenticated` because that is the only role a signed-in person
-- has. Authorisation is INSIDE the functions, via private.is_admin(), so a
-- normal user calling these directly is refused.

create or replace function public.approve_submission(p_id uuid)
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
     set status = 'approved',
         rejection_reason = null,
         reviewed_by = (select auth.uid()),
         reviewed_at = now()
   where id = p_id
     and status = 'pending';

  -- Only pending rows transition, so a decision cannot be quietly rewritten.
  if not found then
    raise exception 'not found or already reviewed';
  end if;
end;
$$;

create or replace function public.reject_submission(p_id uuid, p_reason text)
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'not authorised';
  end if;

  if p_reason is null or char_length(btrim(p_reason)) < 3 then
    raise exception 'a rejection reason is required';
  end if;

  update public.submissions
     set status = 'rejected',
         rejection_reason = btrim(p_reason),
         reviewed_by = (select auth.uid()),
         reviewed_at = now()
   where id = p_id
     and status = 'pending';

  if not found then
    raise exception 'not found or already reviewed';
  end if;
end;
$$;

-- reviewed_by is always auth.uid() and reviewed_at is always now(). Neither is
-- ever supplied by the caller.

revoke all on function public.approve_submission(uuid) from public;
revoke all on function public.approve_submission(uuid) from anon;
grant execute on function public.approve_submission(uuid) to authenticated;

revoke all on function public.reject_submission(uuid, text) from public;
revoke all on function public.reject_submission(uuid, text) from anon;
grant execute on function public.reject_submission(uuid, text) to authenticated;

commit;

-- ---------------------------------------------------------------------------
-- Granting admin
-- ---------------------------------------------------------------------------
-- Deliberately NOT done here. Roles are granted once, by hand, using
-- supabase/snippets/grant-admin-roles.sql, so that a migration can never
-- silently create an administrator.
--
-- ---------------------------------------------------------------------------
-- Verifying afterwards
-- ---------------------------------------------------------------------------
-- Through the API as a normal signed-in user, never in the SQL editor: the
-- editor connects as a privileged role and bypasses RLS, so it proves nothing
-- about what a real client can do.
--
--   insert/update/delete on submissions -> 42501, no grant
--   insert/update/delete on user_roles  -> 42501, no grant
--   select another user's submission    -> empty
--   rpc/is_admin, rpc/submission_object_exists -> 404, not routable
--   approve_submission as a normal user -> 'not authorised'
--   upload/download/delete in macro-submissions -> refused, no policies
--
-- Bucket policies should be empty. To confirm:
--   select policyname from pg_policies
--    where schemaname = 'storage' and tablename = 'objects';
