-- Phase 3A: durable publish state for the automated macro publisher.
--
-- Run with `npx supabase db push` after 0005. Migrations 0001 to 0005 are
-- production history and are untouched.
--
-- WHAT THIS IS FOR
-- ----------------
-- Publishing a macro now performs external, irreversible side effects in a
-- fixed order:
--
--   1. upload the .gdr2 as a GitHub Release asset   (irreversible)
--   2. commit data/macros.json to GDMacros main     (irreversible)
--   3. wait for production to actually serve it     (observation)
--   4. finalise: delete the submission, notify the submitter
--
-- Steps 1 and 2 cannot participate in a database transaction. If the process
-- dies between them, a retry must NOT upload a second asset or add the macro to
-- the catalog twice. That requires trusted state that survives a crash, which
-- is what this table is.
--
-- WHERE IT LIVES, AND WHY
-- -----------------------
-- The PRIVATE schema, which PostgREST does not expose. GitHub release ids,
-- asset ids, commit shas and retry internals are operational plumbing. A
-- submitter has no use for them, and an attacker should not be able to
-- enumerate them. Everything a client legitimately needs comes back through a
-- hardened SECURITY DEFINER RPC that returns a deliberately small shape.
--
-- The rules from 2C and 2D carry over unchanged: no client write policy on
-- anything that matters, private.is_admin() is the only definition of admin, no
-- function takes a user id as a parameter, identity is always auth.uid(), and
-- no username or email appears in any authorisation rule.

begin;

-- ---------------------------------------------------------------------------
-- 1. The state table
-- ---------------------------------------------------------------------------

create table if not exists private.submission_publish_state (
  submission_id uuid primary key
    references public.submissions(id) on delete cascade,

  -- The furthest point reached. Ordered, and only ever moves forward.
  --
  --   not_started      nothing external has happened yet
  --   asset_uploaded   the .gdr2 exists publicly on a GitHub Release
  --   catalog_committed  data/macros.json on main contains the macro
  --   live_verified    production is serving that exact commit
  --
  -- There is no 'finished' state: finalising deletes the submission, and this
  -- row goes with it via the cascade above.
  state text not null default 'not_started'
    check (state in ('not_started', 'asset_uploaded', 'catalog_committed', 'live_verified')),

  -- GitHub release identity, recorded once the release is known.
  release_id  bigint,
  release_tag text,

  -- Asset identity. asset_sha256 is what makes crash recovery able to recognise
  -- its own earlier upload by CONTENT rather than by filename, which matters
  -- because a filename collision is a legitimate, different situation.
  asset_id     bigint,
  asset_name   text,
  asset_url    text,
  asset_sha256 text,

  -- The commit this publication created, and therefore the commit production
  -- must be serving before the submission may be finalised.
  catalog_commit_sha text,

  -- Operator-facing diagnostics. Never shown to a submitter.
  last_error       text,
  last_error_stage text,
  attempts integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint publish_tag_shape check (
    release_tag is null or release_tag ~ '^level-[0-9]{1,12}$'
  ),
  constraint publish_sha_shape check (
    catalog_commit_sha is null or catalog_commit_sha ~ '^[0-9a-f]{40}$'
  ),
  constraint publish_digest_shape check (
    asset_sha256 is null or asset_sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint publish_error_len check (
    last_error is null or char_length(last_error) <= 500
  ),

  -- A state can never claim more progress than it has evidence for.
  constraint publish_state_consistent check (
       (state = 'not_started')
    or (state = 'asset_uploaded'
        and release_id is not null and asset_id is not null
        and asset_url is not null)
    or (state = 'catalog_committed'
        and release_id is not null and asset_id is not null
        and asset_url is not null and catalog_commit_sha is not null)
    or (state = 'live_verified'
        and release_id is not null and asset_id is not null
        and asset_url is not null and catalog_commit_sha is not null)
  )
);

-- Belt and braces. The private schema is not exposed through PostgREST at all,
-- but a table with RLS on and no policies denies everything even if that ever
-- changed, and the revokes mean a mistaken policy later still grants nothing.
alter table private.submission_publish_state enable row level security;

revoke all on private.submission_publish_state from public;
revoke all on private.submission_publish_state from anon;
revoke all on private.submission_publish_state from authenticated;

create index if not exists submission_publish_state_state_idx
  on private.submission_publish_state (state);

-- ---------------------------------------------------------------------------
-- 2. Begin, or resume, a publication
-- ---------------------------------------------------------------------------

/**
 * Claims a submission for publishing and hands back everything the publisher
 * needs, all of it read from the database rather than from the browser.
 *
 * The browser sends one thing: a submission id. Level name, level id, creator,
 * recorder, macro author, video and storage path are all returned from the
 * trusted row here, so a modified request cannot change what gets published or
 * what the asset is called.
 *
 * Requires status = 'processing'. A pending submission has not been picked up,
 * and there is no other live state, so this cannot publish something that was
 * never reviewed.
 *
 * Safe to call repeatedly: it creates the state row on first use and returns
 * the existing one afterwards, which is what makes resuming and retrying work.
 */
create or replace function public.begin_publish(p_id uuid)
  returns table (
    submission_id uuid,
    level_name text,
    level_id text,
    level_creator text,
    video_url text,
    recorder text,
    macro_author text,
    storage_path text,
    submitted_by uuid,
    state text,
    release_id bigint,
    release_tag text,
    asset_id bigint,
    asset_name text,
    asset_url text,
    asset_sha256 text,
    catalog_commit_sha text,
    attempts integer
  )
  language plpgsql
  security definer
  set search_path = ''
as $$
-- This function RETURNS TABLE, so every output column name is also a PL/pgSQL
-- variable in scope: `state`, `submission_id`, `attempts` and the rest. Any
-- unqualified use of one of those names inside the body would be ambiguous, and
-- by default PL/pgSQL raises that as a RUNTIME error the first time the
-- statement executes, which is exactly the kind of failure that passes every
-- static check and then breaks the feature.
--
-- Every reference below is table-qualified, so this directive changes nothing
-- today. It is here so that a later edit which forgets to qualify one resolves
-- to the column, which is always what is meant in this function, instead of
-- silently comparing an output variable against itself.
#variable_conflict use_column
declare
  v_exists boolean;
begin
  if not private.is_admin() then
    raise exception 'not authorised';
  end if;

  select true into v_exists
    from public.submissions s
   where s.id = p_id
     and s.status = 'processing';

  if v_exists is not true then
    raise exception 'not found or not being processed';
  end if;

  insert into private.submission_publish_state as ps (submission_id)
  values (p_id)
  on conflict (submission_id) do update
     set attempts = ps.attempts + 1,
         updated_at = now();

  return query
  select s.id,
         s.level_name,
         s.level_id,
         s.level_creator,
         s.video_url,
         s.recorder,
         s.macro_author,
         s.storage_path,
         s.submitted_by,
         ps2.state,
         ps2.release_id,
         ps2.release_tag,
         ps2.asset_id,
         ps2.asset_name,
         ps2.asset_url,
         ps2.asset_sha256,
         ps2.catalog_commit_sha,
         ps2.attempts
    from public.submissions s
    join private.submission_publish_state ps2 on ps2.submission_id = s.id
   where s.id = p_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Recording each irreversible step
-- ---------------------------------------------------------------------------

-- Each of these is called immediately AFTER the external side effect it
-- describes. They only ever move the state forward, so a late or duplicated
-- call from a retry cannot walk it backwards.

/**
 * Records the filename this submission is ABOUT to upload, before uploading it.
 *
 * This is the intent log, and it is what makes crash recovery unambiguous.
 *
 * Without it, a retry can only recognise its own earlier upload by looking for
 * matching content on the release, and that is genuinely ambiguous: two
 * different submissions of the same macro file would both match, so the second
 * would adopt the first one's asset and then find its catalog entry "already
 * present", finalising without ever being added to the catalog. That is a
 * silent lost publication, and it is exactly what this prevents.
 *
 * With intent recorded, recovery is exact: on retry the publisher looks for the
 * name IT reserved, and adopts that asset only if the content also matches. A
 * submission with no recorded intent never adopts anything and always takes a
 * fresh name.
 *
 * The state stays `not_started`, because nothing external has happened yet.
 */
create or replace function public.record_publish_intent(
  p_id           uuid,
  p_release_id   bigint,
  p_release_tag  text,
  p_asset_name   text,
  p_asset_sha256 text
)
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'not authorised';
  end if;

  update private.submission_publish_state
     set release_id = p_release_id,
         release_tag = p_release_tag,
         asset_name = p_asset_name,
         asset_sha256 = p_asset_sha256,
         updated_at = now()
   where submission_id = p_id
     and state = 'not_started';

  if not found then
    raise exception 'no publish state for that submission, or it has already progressed';
  end if;
end;
$$;

create or replace function public.record_publish_asset(
  p_id       uuid,
  p_release_id bigint,
  p_release_tag text,
  p_asset_id bigint,
  p_asset_name text,
  p_asset_url text,
  p_asset_sha256 text
)
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'not authorised';
  end if;

  update private.submission_publish_state
     set release_id = p_release_id,
         release_tag = p_release_tag,
         asset_id = p_asset_id,
         asset_name = p_asset_name,
         asset_url = p_asset_url,
         asset_sha256 = p_asset_sha256,
         state = case when state = 'not_started' then 'asset_uploaded' else state end,
         last_error = null,
         last_error_stage = null,
         updated_at = now()
   where submission_id = p_id;

  if not found then
    raise exception 'no publish state for that submission';
  end if;
end;
$$;

create or replace function public.record_publish_commit(p_id uuid, p_commit_sha text)
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'not authorised';
  end if;

  update private.submission_publish_state
     set catalog_commit_sha = p_commit_sha,
         state = case when state in ('not_started', 'asset_uploaded')
                      then 'catalog_committed' else state end,
         last_error = null,
         last_error_stage = null,
         updated_at = now()
   where submission_id = p_id;

  if not found then
    raise exception 'no publish state for that submission';
  end if;
end;
$$;

create or replace function public.record_publish_live(p_id uuid)
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'not authorised';
  end if;

  update private.submission_publish_state
     set state = 'live_verified',
         last_error = null,
         last_error_stage = null,
         updated_at = now()
   where submission_id = p_id
     and state = 'catalog_committed';

  if not found then
    raise exception 'not ready to be marked live';
  end if;
end;
$$;

/**
 * Records why an attempt stopped, without changing the state.
 *
 * Failure never rolls the state back: whatever external work already succeeded
 * still succeeded, and pretending otherwise is what would cause a duplicate on
 * the next attempt.
 */
create or replace function public.record_publish_error(
  p_id uuid,
  p_stage text,
  p_error text
)
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'not authorised';
  end if;

  update private.submission_publish_state
     set last_error = left(coalesce(p_error, ''), 500),
         last_error_stage = left(coalesce(p_stage, ''), 60),
         updated_at = now()
   where submission_id = p_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Reading state back, for the admin UI
-- ---------------------------------------------------------------------------

/**
 * The small shape the publishing screen needs to resume.
 *
 * Deliberately does NOT return the private key material of the operation: no
 * internal error stack, no storage path, no submitter identity. The commit sha
 * is public information (it is in a public repository) and the asset url is the
 * public download itself, so neither is sensitive.
 */
create or replace function public.get_publish_state(p_id uuid)
  returns table (
    state text,
    asset_name text,
    asset_url text,
    catalog_commit_sha text,
    last_error text,
    last_error_stage text,
    attempts integer,
    updated_at timestamptz
  )
  language plpgsql
  security definer
  set search_path = ''
as $$
-- Same reasoning as begin_publish: RETURNS TABLE puts every output column name
-- into scope as a variable, so resolve any ambiguity to the column.
#variable_conflict use_column
begin
  if not private.is_admin() then
    raise exception 'not authorised';
  end if;

  return query
  select ps.state,
         ps.asset_name,
         ps.asset_url,
         ps.catalog_commit_sha,
         ps.last_error,
         ps.last_error_stage,
         ps.attempts,
         ps.updated_at
    from private.submission_publish_state ps
   where ps.submission_id = p_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Releasing a claim is no longer unconditional
-- ---------------------------------------------------------------------------

/**
 * processing -> pending, but ONLY while nothing has been published.
 *
 * Before 3A, releasing a claim was always safe: nothing outside the database
 * had happened. That is no longer true. Once a .gdr2 is a public GitHub Release
 * asset, handing the submission back to the Pending queue would leave a public
 * file with nothing tracking it, and a second admin would happily publish a
 * second copy.
 *
 * The simple safe option was chosen over a rollback. Deleting a published
 * release asset is possible but is a destructive operation on public data, and
 * building that path to serve an uncommon case would add more risk than it
 * removes. So: release freely before publishing starts, and once it has
 * started, finish it or retry it. Any admin can do either.
 */
create or replace function public.release_processing(p_id uuid)
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_state text;
begin
  if not private.is_admin() then
    raise exception 'not authorised';
  end if;

  select ps.state into v_state
    from private.submission_publish_state ps
   where ps.submission_id = p_id;

  if v_state is not null and v_state <> 'not_started' then
    raise exception 'publishing has already started for this submission';
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

  -- A row that never got past not_started carries no useful history.
  delete from private.submission_publish_state
   where submission_id = p_id
     and state = 'not_started';
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Finalising requires proof that the macro is actually live
-- ---------------------------------------------------------------------------

/**
 * Replaces the 2D version, which finalised on an admin's word that they had
 * published by hand. Now the database itself refuses to finalise until the
 * publisher has recorded that production is serving the catalog commit.
 *
 * Everything else about it is unchanged and deliberately so: the row is deleted
 * and exactly one notification written in the same transaction, so a second
 * call finds no row and creates no second notification. Double clicking stays
 * safe with no extra locking. Any admin may finish, not only the claimant.
 *
 * The publish state row disappears with the submission through the cascade.
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
  v_state text;
begin
  if not private.is_admin() then
    raise exception 'not authorised';
  end if;

  select ps.state into v_state
    from private.submission_publish_state ps
   where ps.submission_id = p_id;

  if v_state is distinct from 'live_verified' then
    raise exception 'not published yet';
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
-- 7. Grants
-- ---------------------------------------------------------------------------

-- Postgres grants EXECUTE to PUBLIC by default, which is the trap every
-- migration in this project revokes before granting anything.

revoke all on function public.begin_publish(uuid) from public, anon;
revoke all on function public.record_publish_intent(uuid, bigint, text, text, text)
  from public, anon;
revoke all on function public.record_publish_asset(uuid, bigint, text, bigint, text, text, text)
  from public, anon;
revoke all on function public.record_publish_commit(uuid, text) from public, anon;
revoke all on function public.record_publish_live(uuid) from public, anon;
revoke all on function public.record_publish_error(uuid, text, text) from public, anon;
revoke all on function public.get_publish_state(uuid) from public, anon;

grant execute on function public.begin_publish(uuid) to authenticated;
grant execute on function public.record_publish_intent(uuid, bigint, text, text, text)
  to authenticated;
grant execute on function public.record_publish_asset(uuid, bigint, text, bigint, text, text, text)
  to authenticated;
grant execute on function public.record_publish_commit(uuid, text) to authenticated;
grant execute on function public.record_publish_live(uuid) to authenticated;
grant execute on function public.record_publish_error(uuid, text, text) to authenticated;
grant execute on function public.get_publish_state(uuid) to authenticated;

-- Granting EXECUTE to `authenticated` is not authorisation. Every one of these
-- calls private.is_admin() as its first statement, exactly as the 2C and 2D
-- functions do. The grant only decides who may attempt the call.

commit;
