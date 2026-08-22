-- Legal document acceptance, and resumable legal notice delivery.
--
-- Run with `npx supabase db push` after 0006. Migrations 0001 to 0006 are
-- production history and are untouched.
--
-- WHAT THIS IS FOR
-- ----------------
-- Two separate things, both of which need state the browser cannot influence:
--
--   1. A record of which Terms and Privacy version each new account agreed to
--      at signup. The version must be stamped by the DATABASE, from the
--      database's own copy of the current versions. If the browser sent the
--      version it claimed to accept, the record would be worth nothing.
--
--   2. Delivery state for an important Terms/Privacy/service notice sent to
--      every account. Sending thousands of emails cannot happen inside one
--      serverless request, so the run has to survive a refresh, a timeout, a
--      failed batch and the admin closing the page. That requires durable,
--      resumable state with FIXED batch membership.
--
-- WHERE IT LIVES, AND WHY
-- -----------------------
-- All of it in the PRIVATE schema, which PostgREST does not expose. Who was
-- sent a legal notice, and when, is operational data about every account
-- holder: it must never become enumerable. Everything a client legitimately
-- needs comes back through a hardened SECURITY DEFINER RPC returning a
-- deliberately small shape, and none of those shapes contains an email address.
--
-- The rules from 2C, 2D and 3A carry over unchanged: no client write policy on
-- anything that matters, no function takes a user id as an authorisation
-- parameter, identity is always auth.uid(), and no username or email appears in
-- any authorisation rule.

begin;

-- ---------------------------------------------------------------------------
-- 1. The current legal versions, database side
-- ---------------------------------------------------------------------------

-- Mirrors src/lib/legal.ts. Two copies exist because each side needs one it can
-- trust: the app renders from TypeScript, and the trigger below stamps from
-- here. `npm run test:legal` asserts the two agree, so a version bumped in one
-- place and not the other fails the suite instead of silently recording a
-- version nobody ever published.
create table if not exists private.legal_documents (
  doc            text primary key check (doc in ('terms', 'privacy')),
  version        text not null check (version ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  effective_date date not null,
  updated_at     timestamptz not null default now()
);

alter table private.legal_documents enable row level security;
revoke all on private.legal_documents from public;
revoke all on private.legal_documents from anon;
revoke all on private.legal_documents from authenticated;

insert into private.legal_documents (doc, version, effective_date) values
  ('terms',   '2026-08-22', '2026-08-22'),
  ('privacy', '2026-08-22', '2026-08-22')
on conflict (doc) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Acceptance records
-- ---------------------------------------------------------------------------

-- Append only. There is no update or delete path anywhere in this migration,
-- and no grant that would allow one: an acceptance record that can be edited
-- afterwards is not evidence of anything.
--
-- Deliberately NOT stored: email, IP address, user agent, or any browser
-- fingerprint. The account uuid identifies the person, and the uuid is stable
-- where an email is not. Nothing else is needed to answer "which version did
-- this account agree to, and when".
create table if not exists private.legal_acceptances (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  terms_version    text not null,
  privacy_version  text not null,
  source           text not null default 'account_creation'
                     check (source in ('account_creation')),
  accepted_at      timestamptz not null default now(),

  -- One record per account per version pair per source. Makes the trigger
  -- naturally idempotent if it ever runs twice for the same insert.
  unique (user_id, terms_version, privacy_version, source)
);

alter table private.legal_acceptances enable row level security;
revoke all on private.legal_acceptances from public;
revoke all on private.legal_acceptances from anon;
revoke all on private.legal_acceptances from authenticated;

create index if not exists legal_acceptances_user_idx
  on private.legal_acceptances (user_id);

/**
 * Stamps an acceptance when an account is created.
 *
 * Fires on auth.users insert, which is the only moment that is genuinely
 * "account creation". The versions come from private.legal_documents, so the
 * browser has no way to influence what is recorded: it never sends a version,
 * and there is no RPC that accepts one.
 *
 * EVERY failure is swallowed. This trigger must never be able to prevent
 * somebody signing up: a missing acceptance row is an administrative gap, while
 * a signup that fails because of a logging trigger is an outage. The exception
 * block is the entire reason this is a plpgsql function rather than a plain
 * insert.
 */
create or replace function private.record_signup_acceptance()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_terms   text;
  v_privacy text;
begin
  select d.version into v_terms   from private.legal_documents d where d.doc = 'terms';
  select d.version into v_privacy from private.legal_documents d where d.doc = 'privacy';

  if v_terms is null or v_privacy is null then
    return new;
  end if;

  insert into private.legal_acceptances (user_id, terms_version, privacy_version, source)
  values (new.id, v_terms, v_privacy, 'account_creation')
  on conflict do nothing;

  return new;
exception
  when others then
    -- Never block account creation.
    return new;
end;
$$;

revoke all on function private.record_signup_acceptance() from public;
revoke all on function private.record_signup_acceptance() from anon;
revoke all on function private.record_signup_acceptance() from authenticated;

drop trigger if exists record_legal_acceptance on auth.users;
create trigger record_legal_acceptance
  after insert on auth.users
  for each row execute function private.record_signup_acceptance();

-- Existing accounts are deliberately NOT backfilled. They signed up before this
-- text existed, and inventing a record saying otherwise would be a fabrication.
-- They remain legacy accounts with no acceptance row, which is the truthful
-- state and is distinguishable from "accepted" by the absence of the row.

-- ---------------------------------------------------------------------------
-- 3. Authorisation for sending a notice
-- ---------------------------------------------------------------------------

/**
 * Who may send an email to every account holder.
 *
 * Today this is exactly private.is_admin(), because the only administrators are
 * the owners and there is no second tier of reviewer yet. It exists as its own
 * function anyway, rather than calling is_admin() at each site, because mailing
 * every account is a categorically larger power than approving one macro. When
 * a non-owner reviewer role is added, narrowing this to a separate capability
 * is a one line change here and nothing else has to move.
 */
create or replace function private.can_send_legal_notice()
  returns boolean
  language sql
  security definer
  stable
  set search_path = ''
as $$
  select private.is_admin();
$$;

revoke all on function private.can_send_legal_notice() from public;
revoke all on function private.can_send_legal_notice() from anon;
grant execute on function private.can_send_legal_notice() to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Notice runs and deliveries
-- ---------------------------------------------------------------------------

create table if not exists private.legal_notice_runs (
  id              uuid primary key default gen_random_uuid(),
  notice_type     text not null
                    check (notice_type in ('terms', 'privacy', 'terms_and_privacy', 'service')),
  subject         text not null check (char_length(subject) between 3 and 200),
  -- Plain text as the admin typed it. Rendered and escaped at send time; no
  -- markup is ever accepted or stored.
  message         text not null check (char_length(message) between 3 and 5000),
  terms_version   text not null,
  privacy_version text not null,
  effective_date  date,

  status text not null default 'prepared'
    check (status in ('prepared', 'sending', 'completed', 'needs_review')),

  recipient_count integer not null default 0 check (recipient_count >= 0),
  batch_count     integer not null default 0 check (batch_count >= 0),

  -- The admin who created it, as a uuid. Never a name or an email.
  created_by uuid not null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table private.legal_notice_runs enable row level security;
revoke all on private.legal_notice_runs from public;
revoke all on private.legal_notice_runs from anon;
revoke all on private.legal_notice_runs from authenticated;

/**
 * One row per recipient, with FIXED batch membership.
 *
 * batch_number is assigned when the run is prepared and never recalculated.
 * That is the property that makes retrying safe: a retry of batch 3 sends to
 * exactly the same accounts as the first attempt did, under the same
 * idempotency key. A "next 100 pending" query would instead produce a different
 * group on every attempt, which is how one person receives a legal notice twice
 * and another never receives it at all.
 *
 * Deliberately stores the user uuid and NOT the email address. The address is
 * resolved from auth.users at send time and discarded; this table never becomes
 * a second permanent copy of every account's email.
 */
create table if not exists private.legal_notice_deliveries (
  run_id       uuid not null references private.legal_notice_runs(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  batch_number integer not null check (batch_number >= 0),

  status text not null default 'pending'
    check (status in ('pending', 'sent', 'failed', 'needs_review')),

  -- Resend's id for the message, when it gave us one.
  provider_message_id text,
  -- A short category, never a raw provider payload.
  error text check (error is null or char_length(error) <= 200),

  sent_at    timestamptz,
  updated_at timestamptz not null default now(),

  primary key (run_id, user_id)
);

alter table private.legal_notice_deliveries enable row level security;
revoke all on private.legal_notice_deliveries from public;
revoke all on private.legal_notice_deliveries from anon;
revoke all on private.legal_notice_deliveries from authenticated;

create index if not exists legal_notice_deliveries_batch_idx
  on private.legal_notice_deliveries (run_id, batch_number, status);

-- ---------------------------------------------------------------------------
-- 5. RPCs
-- ---------------------------------------------------------------------------

/**
 * Creates a run and freezes its recipient list into numbered batches.
 *
 * The caller supplies candidate account ids, enumerated server side. They are
 * intersected with auth.users here, so an id that does not belong to a real
 * account simply produces no row: the database, not the caller, decides who is
 * a valid recipient.
 *
 * The versions are read from private.legal_documents rather than accepted as
 * parameters, for the same reason the acceptance trigger does: the record of
 * what was announced should not be something the sender can mistype.
 */
create or replace function public.legal_notice_prepare(
  p_type           text,
  p_subject        text,
  p_message        text,
  p_effective_date date,
  p_user_ids       uuid[],
  p_batch_size     integer default 100
)
  returns table (run_id uuid, recipient_count integer, batch_count integer)
  language plpgsql
  security definer
  set search_path = ''
as $$
#variable_conflict use_column
declare
  v_run     uuid;
  v_terms   text;
  v_privacy text;
  v_size    integer := least(greatest(coalesce(p_batch_size, 100), 1), 100);
  v_count   integer;
  v_batches integer;
begin
  if not private.can_send_legal_notice() then
    raise exception 'not authorised';
  end if;

  select d.version into v_terms   from private.legal_documents d where d.doc = 'terms';
  select d.version into v_privacy from private.legal_documents d where d.doc = 'privacy';
  if v_terms is null or v_privacy is null then
    raise exception 'legal versions are not configured';
  end if;

  insert into private.legal_notice_runs
    (notice_type, subject, message, terms_version, privacy_version, effective_date, created_by)
  values
    (p_type, p_subject, p_message, v_terms, v_privacy, p_effective_date, (select auth.uid()))
  returning id into v_run;

  -- Deterministic membership: ordered by uuid, numbered in fixed blocks. The
  -- same population always yields the same batches, whatever order the caller
  -- enumerated them in.
  insert into private.legal_notice_deliveries (run_id, user_id, batch_number)
  select v_run,
         u.id,
         ((row_number() over (order by u.id) - 1) / v_size)::int
    from auth.users u
   where u.id = any(p_user_ids)
     and u.email is not null
     and u.email <> ''
  on conflict do nothing;

  select count(*)::int into v_count
    from private.legal_notice_deliveries d where d.run_id = v_run;

  v_batches := case when v_count = 0 then 0 else ((v_count - 1) / v_size) + 1 end;

  update private.legal_notice_runs r
     set recipient_count = v_count,
         batch_count = v_batches,
         updated_at = now()
   where r.id = v_run;

  return query select v_run, v_count, v_batches;
end;
$$;

revoke all on function public.legal_notice_prepare(text, text, text, date, uuid[], integer) from public;
revoke all on function public.legal_notice_prepare(text, text, text, date, uuid[], integer) from anon;
grant execute on function public.legal_notice_prepare(text, text, text, date, uuid[], integer) to authenticated;

/**
 * Hands back the next batch that still has work, with its member account ids.
 *
 * Returns ids only. Resolving them to email addresses happens server side, in
 * the process that is about to send, and the addresses never touch this
 * database or any response the browser can see.
 */
create or replace function public.legal_notice_claim_batch(p_run uuid)
  returns table (batch_number integer, user_ids uuid[], attempt_of integer)
  language plpgsql
  security definer
  set search_path = ''
as $$
#variable_conflict use_column
declare
  v_batch integer;
begin
  if not private.can_send_legal_notice() then
    raise exception 'not authorised';
  end if;

  select d.batch_number into v_batch
    from private.legal_notice_deliveries d
   where d.run_id = p_run
     and d.status in ('pending', 'failed')
   order by d.batch_number
   limit 1;

  if v_batch is null then
    return;
  end if;

  update private.legal_notice_runs r
     set status = case when r.status = 'prepared' then 'sending' else r.status end,
         updated_at = now()
   where r.id = p_run;

  return query
  select v_batch,
         array_agg(d.user_id order by d.user_id),
         (select r2.batch_count from private.legal_notice_runs r2 where r2.id = p_run)
    from private.legal_notice_deliveries d
   where d.run_id = p_run
     and d.batch_number = v_batch
     and d.status in ('pending', 'failed');
end;
$$;

revoke all on function public.legal_notice_claim_batch(uuid) from public;
revoke all on function public.legal_notice_claim_batch(uuid) from anon;
grant execute on function public.legal_notice_claim_batch(uuid) to authenticated;

/**
 * Records the outcome of one batch.
 *
 * Only ever moves a delivery forward into a resolved state. A row already
 * marked 'sent' is never touched again, so a duplicate call, a double click or
 * a resumed page cannot cause a second send.
 */
create or replace function public.legal_notice_record_batch(
  p_run     uuid,
  p_batch   integer,
  p_status  text,
  p_message_ids text[] default null,
  p_error   text default null
)
  returns table (sent integer, pending integer, failed integer, needs_review integer)
  language plpgsql
  security definer
  set search_path = ''
as $$
#variable_conflict use_column
begin
  if not private.can_send_legal_notice() then
    raise exception 'not authorised';
  end if;

  if p_status not in ('sent', 'failed', 'needs_review') then
    raise exception 'invalid status';
  end if;

  update private.legal_notice_deliveries d
     set status = p_status,
         sent_at = case when p_status = 'sent' then now() else d.sent_at end,
         error = case when p_status = 'sent' then null else left(coalesce(p_error, ''), 200) end,
         provider_message_id = coalesce(
           p_message_ids[
             (array_position(
                (select array_agg(d2.user_id order by d2.user_id)
                   from private.legal_notice_deliveries d2
                  where d2.run_id = p_run and d2.batch_number = p_batch),
                d.user_id))
           ],
           d.provider_message_id
         ),
         updated_at = now()
   where d.run_id = p_run
     and d.batch_number = p_batch
     -- Never re-resolve an already sent delivery.
     and d.status <> 'sent';

  update private.legal_notice_runs r
     set status = case
                    when exists (select 1 from private.legal_notice_deliveries d
                                  where d.run_id = p_run and d.status = 'needs_review')
                      then 'needs_review'
                    when not exists (select 1 from private.legal_notice_deliveries d
                                      where d.run_id = p_run and d.status in ('pending', 'failed'))
                      then 'completed'
                    else 'sending'
                  end,
         updated_at = now()
   where r.id = p_run;

  return query
  select count(*) filter (where d.status = 'sent')::int,
         count(*) filter (where d.status = 'pending')::int,
         count(*) filter (where d.status = 'failed')::int,
         count(*) filter (where d.status = 'needs_review')::int
    from private.legal_notice_deliveries d
   where d.run_id = p_run;
end;
$$;

revoke all on function public.legal_notice_record_batch(uuid, integer, text, text[], text) from public;
revoke all on function public.legal_notice_record_batch(uuid, integer, text, text[], text) from anon;
grant execute on function public.legal_notice_record_batch(uuid, integer, text, text[], text) to authenticated;

/**
 * The most recent run, as a small summary.
 *
 * Counts only. No account id, no email, nothing that identifies a recipient.
 */
create or replace function public.legal_notice_latest()
  returns table (
    id uuid,
    notice_type text,
    subject text,
    status text,
    recipient_count integer,
    batch_count integer,
    sent integer,
    pending integer,
    failed integer,
    needs_review integer,
    created_at timestamptz
  )
  language plpgsql
  security definer
  set search_path = ''
as $$
#variable_conflict use_column
begin
  if not private.can_send_legal_notice() then
    raise exception 'not authorised';
  end if;

  return query
  select r.id, r.notice_type, r.subject, r.status, r.recipient_count, r.batch_count,
         (select count(*) filter (where d.status = 'sent')::int
            from private.legal_notice_deliveries d where d.run_id = r.id),
         (select count(*) filter (where d.status = 'pending')::int
            from private.legal_notice_deliveries d where d.run_id = r.id),
         (select count(*) filter (where d.status = 'failed')::int
            from private.legal_notice_deliveries d where d.run_id = r.id),
         (select count(*) filter (where d.status = 'needs_review')::int
            from private.legal_notice_deliveries d where d.run_id = r.id),
         r.created_at
    from private.legal_notice_runs r
   order by r.created_at desc
   limit 1;
end;
$$;

revoke all on function public.legal_notice_latest() from public;
revoke all on function public.legal_notice_latest() from anon;
grant execute on function public.legal_notice_latest() to authenticated;

/**
 * The stored content of one run, for the process that is about to send it.
 *
 * The run's own copy is the source of truth for every batch, including retries.
 * If the sender rebuilt the message from whatever is currently in the admin's
 * browser, a half-sent run could go out saying two different things to two
 * halves of the account list.
 *
 * Returns content only. No recipient, no count, no address.
 */
create or replace function public.legal_notice_content(p_run uuid)
  returns table (
    notice_type text,
    subject text,
    message text,
    terms_version text,
    privacy_version text,
    effective_date date
  )
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if not private.can_send_legal_notice() then
    raise exception 'not authorised';
  end if;

  return query
  select r.notice_type, r.subject, r.message, r.terms_version, r.privacy_version, r.effective_date
    from private.legal_notice_runs r
   where r.id = p_run;
end;
$$;

revoke all on function public.legal_notice_content(uuid) from public;
revoke all on function public.legal_notice_content(uuid) from anon;
grant execute on function public.legal_notice_content(uuid) to authenticated;

/** The versions the database will stamp. Admin only, and only versions. */
create or replace function public.legal_current_versions()
  returns table (doc text, version text, effective_date date)
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if not private.can_send_legal_notice() then
    raise exception 'not authorised';
  end if;
  return query select d.doc, d.version, d.effective_date from private.legal_documents d order by d.doc;
end;
$$;

revoke all on function public.legal_current_versions() from public;
revoke all on function public.legal_current_versions() from anon;
grant execute on function public.legal_current_versions() to authenticated;

commit;
