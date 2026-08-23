-- Account-facing publication history, result preferences, richer in-app
-- notifications, and durable submission-result email delivery.
--
-- Run with `npx supabase db push` after 0010. Migrations 0001 to 0010 are
-- history and are deliberately not rewritten here.
--
-- The important boundaries in this migration are:
--
--   * an accepted submission is linked to its account by the immutable user
--     uuid, never by the mutable username or the free-text macro author;
--   * the published ledger and account settings are readable only by their
--     owner, and neither table has a direct client write path;
--   * an in-app notification and its email job are created in the same
--     transaction as the review outcome;
--   * the private email job freezes the exact recipient and payload before any
--     provider call, then scrubs them as soon as delivery is resolved;
--   * provider delivery never runs inside a database transaction. The caller
--     claims a durable job, sends it with the notification-derived idempotency
--     key, and records the outcome afterwards.

begin;

-- ---------------------------------------------------------------------------
-- 1. Richer in-app result notifications
-- ---------------------------------------------------------------------------

alter table public.submission_notifications
  add column if not exists submission_id uuid,
  add column if not exists level_id text,
  add column if not exists macro_author text,
  add column if not exists recorder text,
  add column if not exists read_at timestamptz;

-- Old notifications legitimately have null detail columns. Every notification
-- created after this migration fills them, and the individual constraints keep
-- even nullable values bounded and well shaped.
alter table public.submission_notifications
  drop constraint if exists submission_notification_level_id_format,
  drop constraint if exists submission_notification_macro_author_len,
  drop constraint if exists submission_notification_recorder_check,
  add constraint submission_notification_level_id_format
    check (level_id is null or level_id ~ '^[0-9]{1,12}$'),
  add constraint submission_notification_macro_author_len
    check (macro_author is null or char_length(macro_author) between 1 and 50),
  add constraint submission_notification_recorder_check
    check (recorder is null or recorder in ('xdBot', 'Mega Hack'));

-- A submission can have one final outcome. Nulls remain unrestricted so the
-- pre-0011 rows, for which the source submission id was not retained, coexist.
create unique index if not exists submission_notifications_submission_key
  on public.submission_notifications (submission_id)
  where submission_id is not null;

create index if not exists submission_notifications_unread_idx
  on public.submission_notifications (user_id, created_at desc)
  where read_at is null;

-- 0005 granted SELECT and DELETE only. Keep UPDATE absent even though read_at
-- is mutable: the narrowly scoped RPC below is the sole update path.
revoke update on public.submission_notifications from public;
revoke update on public.submission_notifications from anon;
revoke update on public.submission_notifications from authenticated;

/**
 * Marks one notification, or all notifications, read for the signed-in owner.
 *
 * No user id is accepted. A guessed notification uuid belonging to another
 * account simply matches nothing, and the function returns zero.
 */
create or replace function public.mark_submission_notifications_read(
  p_id uuid default null
)
  returns integer
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_uid   uuid := (select auth.uid());
  v_count integer;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  update public.submission_notifications n
     set read_at = now()
   where n.user_id = v_uid
     and n.read_at is null
     and (p_id is null or n.id = p_id);

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.mark_submission_notifications_read(uuid) from public;
revoke all on function public.mark_submission_notifications_read(uuid) from anon;
grant execute on function public.mark_submission_notifications_read(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Owner-only account settings
-- ---------------------------------------------------------------------------

create table if not exists public.account_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email_submission_accepted boolean not null default true,
  email_submission_rejected boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.account_settings enable row level security;

revoke all on public.account_settings from public;
revoke all on public.account_settings from anon;
revoke all on public.account_settings from authenticated;

-- Direct reads are harmless and useful for defence-in-depth RLS verification.
-- Writes remain RPC-only so a future setting can gain validation without
-- opening a second mutation path.
grant select on public.account_settings to authenticated;

drop policy if exists "read your own account settings" on public.account_settings;
create policy "read your own account settings"
  on public.account_settings for select to authenticated
  using ((select auth.uid()) = user_id);

/** Returns effective preferences. A missing row means both defaults are on. */
create or replace function public.get_account_settings()
  returns table (
    email_submission_accepted boolean,
    email_submission_rejected boolean
  )
  language plpgsql
  security definer
  stable
  set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  return query
  select coalesce(s.email_submission_accepted, true),
         coalesce(s.email_submission_rejected, true)
    from (select 1) seed
    left join public.account_settings s on s.user_id = v_uid;
end;
$$;

/** Upserts both preferences for the signed-in account, and no other account. */
create or replace function public.set_submission_email_preferences(
  p_accepted boolean,
  p_rejected boolean
)
  returns table (
    email_submission_accepted boolean,
    email_submission_rejected boolean
  )
  language plpgsql
  security definer
  set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if p_accepted is null or p_rejected is null then
    raise exception 'both email preferences are required';
  end if;

  insert into public.account_settings as existing
    (user_id, email_submission_accepted, email_submission_rejected)
  values
    (v_uid, p_accepted, p_rejected)
  on conflict (user_id) do update
     set email_submission_accepted = excluded.email_submission_accepted,
         email_submission_rejected = excluded.email_submission_rejected,
         updated_at = now();

  return query
  select s.email_submission_accepted, s.email_submission_rejected
    from public.account_settings s
   where s.user_id = v_uid;
end;
$$;

revoke all on function public.get_account_settings() from public;
revoke all on function public.get_account_settings() from anon;
grant execute on function public.get_account_settings() to authenticated;

revoke all on function public.set_submission_email_preferences(boolean, boolean) from public;
revoke all on function public.set_submission_email_preferences(boolean, boolean) from anon;
grant execute on function public.set_submission_email_preferences(boolean, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Durable, owner-only accepted-submission ledger
-- ---------------------------------------------------------------------------

create table if not exists public.published_submissions (
  -- The source submission uuid survives after public.submissions is deleted.
  -- It is not a foreign key for exactly that reason.
  submission_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,

  level_name text not null,
  level_id text not null,
  macro_author text not null,
  recorder text not null,

  -- The verified public GitHub asset URL is also the catalog macro's stable
  -- identity. Names and slugs can change; this URL identifies the exact macro.
  download_url text not null unique,
  published_at timestamptz not null default now(),

  constraint published_submission_level_name_len
    check (char_length(level_name) between 1 and 100),
  constraint published_submission_level_id_format
    check (level_id ~ '^[0-9]{1,12}$'),
  constraint published_submission_macro_author_len
    check (char_length(macro_author) between 1 and 50),
  constraint published_submission_recorder_check
    check (recorder in ('xdBot', 'Mega Hack')),
  constraint published_submission_download_url_safe
    check (download_url ~* '^https://' and char_length(download_url) <= 1000)
);

create index if not exists published_submissions_user_idx
  on public.published_submissions (user_id, published_at desc);

alter table public.published_submissions enable row level security;

revoke all on public.published_submissions from public;
revoke all on public.published_submissions from anon;
revoke all on public.published_submissions from authenticated;
grant select on public.published_submissions to authenticated;

drop policy if exists "read your own published submissions" on public.published_submissions;
create policy "read your own published submissions"
  on public.published_submissions for select to authenticated
  using ((select auth.uid()) = user_id);

-- No INSERT, UPDATE or DELETE policy or grant. finish_processing is the only
-- writer, so a browser cannot invent, reassign or erase accepted history.

-- ---------------------------------------------------------------------------
-- 4. Private durable email jobs
-- ---------------------------------------------------------------------------

/** HTML escaping for the frozen result-email template. */
create or replace function private.escape_result_email_html(p_value text)
  returns text
  language sql
  immutable
  strict
  set search_path = ''
as $$
  select replace(
           replace(
             replace(
               replace(
                 replace(p_value, '&', '&amp;'),
                 '<', '&lt;'),
               '>', '&gt;'),
             '"', '&quot;'),
           chr(39), '&#39;');
$$;

revoke all on function private.escape_result_email_html(text) from public;
revoke all on function private.escape_result_email_html(text) from anon;
revoke all on function private.escape_result_email_html(text) from authenticated;

create table if not exists private.submission_result_email_jobs (
  -- One notification, one provider idempotency identity, one job forever.
  notification_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  outcome text not null check (outcome in ('accepted', 'rejected')),
  idempotency_key text not null unique
    check (idempotency_key = 'submission-result/' || notification_id::text
           and char_length(idempotency_key) <= 80),

  status text not null default 'pending'
    check (status in (
      'pending', 'sending', 'retryable',
      'sent', 'failed', 'needs_review', 'cancelled'
    )),

  -- Frozen together before the first send, and reused byte-for-byte on every
  -- retry. All four are scrubbed once the job reaches a terminal state.
  recipient_email text,
  subject text,
  html_body text,
  text_body text,

  attempts integer not null default 0 check (attempts >= 0),
  first_attempt_at timestamptz,
  claimed_at timestamptz,
  lease_id uuid,
  next_attempt_at timestamptz,
  resolved_at timestamptz,
  sent_at timestamptz,

  provider_message_id text
    check (provider_message_id is null or char_length(provider_message_id) <= 200),
  -- A coarse category only, never a raw provider response or payload.
  last_error text check (last_error is null or char_length(last_error) <= 200),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint result_email_recipient_len check (
    recipient_email is null or char_length(recipient_email) between 3 and 320
  ),
  constraint result_email_subject_len check (
    subject is null or char_length(subject) between 3 and 200
  ),
  constraint result_email_html_len check (
    html_body is null or char_length(html_body) between 3 and 10000
  ),
  constraint result_email_text_len check (
    text_body is null or char_length(text_body) between 3 and 5000
  ),
  constraint result_email_payload_matches_state check (
       (status in ('pending', 'sending', 'retryable')
        and recipient_email is not null
        and subject is not null and html_body is not null and text_body is not null)
    or (status in ('sent', 'failed', 'needs_review', 'cancelled')
        and recipient_email is null
        and subject is null and html_body is null and text_body is null)
  ),
  constraint result_email_claim_matches_state check (
       (status = 'sending' and claimed_at is not null and lease_id is not null)
    or (status <> 'sending' and claimed_at is null and lease_id is null)
  )
);

create index if not exists submission_result_email_jobs_claim_idx
  on private.submission_result_email_jobs (user_id, status, next_attempt_at, created_at);

alter table private.submission_result_email_jobs enable row level security;
revoke all on private.submission_result_email_jobs from public;
revoke all on private.submission_result_email_jobs from anon;
revoke all on private.submission_result_email_jobs from authenticated;

/**
 * Queues the exact result message in the same transaction that writes the
 * in-app notification.
 *
 * The preference and current auth email are read here, not supplied by a
 * browser. A missing settings row means the documented default of enabled. A
 * missing email creates an already-cancelled, scrubbed job rather than making
 * the review outcome fail or leaving an ambiguous absence in the queue.
 */
create or replace function private.queue_submission_result_email()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_enabled   boolean;
  v_recipient text;
  v_subject   text;
  v_html      text;
  v_text      text;
  v_level     text := private.escape_result_email_html(new.level_name);
  v_reason    text := private.escape_result_email_html(coalesce(new.rejection_reason, ''));
  v_author    text := private.escape_result_email_html(coalesce(new.macro_author, ''));
  v_recorder  text := private.escape_result_email_html(coalesce(new.recorder, ''));
begin
  select case
           when new.outcome = 'accepted' then s.email_submission_accepted
           else s.email_submission_rejected
         end
    into v_enabled
    from public.account_settings s
   where s.user_id = new.user_id;

  -- No row means both defaults are enabled.
  if not coalesce(v_enabled, true) then
    return new;
  end if;

  select nullif(btrim(u.email), '')
    into v_recipient
    from auth.users u
   where u.id = new.user_id;

  if new.outcome = 'accepted' then
    v_subject := 'Your GDMacros submission was accepted';
    v_text := 'Good news! Your submission for ' || new.level_name
      || ' was accepted and is now live on GDMacros.'
      || case when new.macro_author is not null
              then E'\n\nMacro author: ' || new.macro_author else '' end
      || case when new.recorder is not null
              then E'\nRecorder: ' || new.recorder else '' end
      || E'\n\nView your submissions: https://www.gdmacros.com/submissions';

    v_html := '<!doctype html><html><body>'
      || '<p>Good news! Your submission for <strong>' || v_level
      || '</strong> was accepted and is now live on GDMacros.</p>'
      || case when new.macro_author is not null
              then '<p>Macro author: <strong>' || v_author || '</strong>'
                   || case when new.recorder is not null
                           then '<br>Recorder: ' || v_recorder else '' end
                   || '</p>'
              when new.recorder is not null
              then '<p>Recorder: ' || v_recorder || '</p>'
              else '' end
      || '<p><a href="https://www.gdmacros.com/submissions">View your submissions</a></p>'
      || '</body></html>';
  else
    v_subject := 'Your GDMacros submission was not accepted';
    v_text := 'Your submission for ' || new.level_name || ' was not accepted.'
      || E'\n\nReason: ' || coalesce(new.rejection_reason, 'No reason was recorded.')
      || E'\n\nView your submissions: https://www.gdmacros.com/submissions';

    v_html := '<!doctype html><html><body>'
      || '<p>Your submission for <strong>' || v_level || '</strong> was not accepted.</p>'
      || '<p>Reason: ' || case when new.rejection_reason is null
                               then 'No reason was recorded.' else v_reason end || '</p>'
      || '<p><a href="https://www.gdmacros.com/submissions">View your submissions</a></p>'
      || '</body></html>';
  end if;

  if v_recipient is null then
    insert into private.submission_result_email_jobs (
      notification_id, user_id, outcome, idempotency_key,
      status, resolved_at, last_error
    ) values (
      new.id, new.user_id, new.outcome, 'submission-result/' || new.id::text,
      'cancelled', now(), 'recipient_missing'
    )
    on conflict (notification_id) do nothing;
  else
    insert into private.submission_result_email_jobs (
      notification_id, user_id, outcome, idempotency_key,
      recipient_email, subject, html_body, text_body
    ) values (
      new.id, new.user_id, new.outcome, 'submission-result/' || new.id::text,
      v_recipient, v_subject, v_html, v_text
    )
    on conflict (notification_id) do nothing;
  end if;

  return new;
end;
$$;

revoke all on function private.queue_submission_result_email() from public;
revoke all on function private.queue_submission_result_email() from anon;
revoke all on function private.queue_submission_result_email() from authenticated;

drop trigger if exists queue_submission_result_email
  on public.submission_notifications;
create trigger queue_submission_result_email
  after insert on public.submission_notifications
  for each row execute function private.queue_submission_result_email();

/**
 * Claims one frozen email payload under a five-minute lease.
 *
 * This RPC is executable only by the server's service role. An exact id claims
 * that job; a null id must carry the account UUID that the server authenticated
 * before making the call. No browser role can read a frozen recipient or body.
 * FOR UPDATE SKIP LOCKED prevents simultaneous ordinary claims; a sender that
 * disappeared while holding a job is recoverable after five minutes, with
 * byte-identical fields.
 *
 * Resend's idempotency protection is time bounded. Twenty-three hours is the
 * deliberate safety margin: an unresolved job past it is parked for human
 * review and its frozen recipient and bodies are scrubbed instead of risking a
 * duplicate with an expired key.
 */
create or replace function public.claim_submission_result_email(
  p_notification uuid default null,
  p_user uuid default null
)
  returns table (
    notification_id uuid,
    user_id uuid,
    recipient_email text,
    subject text,
    html_body text,
    text_body text,
    first_attempt_at timestamptz,
    lease_id uuid
  )
  language plpgsql
  security definer
  set search_path = ''
as $$
#variable_conflict use_column
declare
  v_job uuid;
begin
  -- Every queue visit also sweeps ALL attempted jobs whose safe retry window
  -- elapsed. This is service-role-only, so it can minimise retained payloads
  -- without exposing a global queue operation to a signed-in browser.
  update private.submission_result_email_jobs j
     set status = 'needs_review',
         recipient_email = null,
         subject = null,
         html_body = null,
         text_body = null,
         claimed_at = null,
         lease_id = null,
         next_attempt_at = null,
         resolved_at = now(),
         last_error = 'idempotency_window_expired',
         updated_at = now()
   where j.status in ('sending', 'retryable')
     and j.first_attempt_at is not null
     and j.first_attempt_at <= now() - interval '23 hours';

  -- A null notification must be bounded to one server-verified account.
  if p_notification is null and p_user is null then
    return;
  end if;

  select j.notification_id into v_job
    from private.submission_result_email_jobs j
   where (
          (p_notification is not null and j.notification_id = p_notification)
       or (p_notification is null and j.user_id = p_user)
     )
     and (p_user is null or j.user_id = p_user)
     and (
          j.status = 'pending'
       or (j.status = 'retryable'
           and coalesce(j.next_attempt_at, '-infinity'::timestamptz) <= now())
       or (j.status = 'sending'
           and j.claimed_at <= now() - interval '5 minutes')
     )
     and (j.first_attempt_at is null
          or j.first_attempt_at > now() - interval '23 hours')
   order by j.created_at, j.notification_id
   limit 1
   for update skip locked;

  if v_job is null then
    return;
  end if;

  return query
  update private.submission_result_email_jobs j
     set status = 'sending',
         attempts = j.attempts + 1,
         first_attempt_at = coalesce(j.first_attempt_at, now()),
         claimed_at = now(),
         lease_id = gen_random_uuid(),
         next_attempt_at = null,
         updated_at = now()
   where j.notification_id = v_job
  returning j.notification_id,
            j.user_id,
            j.recipient_email,
            j.subject,
            j.html_body,
            j.text_body,
            j.first_attempt_at,
            j.lease_id;
end;
$$;

revoke all on function public.claim_submission_result_email(uuid, uuid) from public;
revoke all on function public.claim_submission_result_email(uuid, uuid) from anon;
revoke all on function public.claim_submission_result_email(uuid, uuid) from authenticated;
grant execute on function public.claim_submission_result_email(uuid, uuid) to service_role;

/**
 * Records one provider attempt. Only the server service role can execute this,
 * and only the exact currently leased `sending` row can move. The lease UUID
 * prevents a timed-out worker from overwriting a newer worker's result.
 *
 * Retryable preserves the exact frozen payload. Every terminal result scrubs
 * the recipient, subject and bodies immediately. A late retryable result that
 * has crossed the safety window is converted to needs_review and scrubbed.
 */
create or replace function public.record_submission_result_email(
  p_notification uuid,
  p_lease uuid,
  p_status text,
  p_provider_message_id text,
  p_error text
)
  returns boolean
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_status   text := lower(btrim(coalesce(p_status, '')));
  v_provider text := left(nullif(btrim(coalesce(p_provider_message_id, '')), ''), 200);
  v_error    text := left(nullif(btrim(coalesce(p_error, '')), ''), 200);
begin
  if v_status not in ('sent', 'retryable', 'failed', 'needs_review', 'cancelled') then
    raise exception 'invalid status';
  end if;

  -- Once the safe idempotency window has elapsed, even a nominally retryable
  -- result must stop. The frozen payload is destroyed before returning.
  if v_status = 'retryable' and exists (
    select 1
      from private.submission_result_email_jobs j
     where j.notification_id = p_notification
       and j.status = 'sending'
       and j.lease_id = p_lease
       and j.first_attempt_at is not null
       and j.first_attempt_at <= now() - interval '23 hours'
  ) then
    v_status := 'needs_review';
    v_error := 'idempotency_window_expired';
  end if;

  if v_status = 'retryable' then
    update private.submission_result_email_jobs j
       set status = 'retryable',
           claimed_at = null,
           lease_id = null,
           next_attempt_at = now() + interval '1 minute',
           provider_message_id = coalesce(v_provider, j.provider_message_id),
           last_error = coalesce(v_error, 'retryable'),
           updated_at = now()
     where j.notification_id = p_notification
       and j.status = 'sending'
       and j.lease_id = p_lease;
    return found;
  end if;

  update private.submission_result_email_jobs j
     set status = v_status,
         recipient_email = null,
         subject = null,
         html_body = null,
         text_body = null,
         claimed_at = null,
         lease_id = null,
         next_attempt_at = null,
         resolved_at = now(),
         sent_at = case when v_status = 'sent' then now() else j.sent_at end,
         provider_message_id = coalesce(v_provider, j.provider_message_id),
         last_error = case when v_status = 'sent' then null
                           else coalesce(v_error, v_status) end,
         updated_at = now()
   where j.notification_id = p_notification
     and j.status = 'sending'
     and j.lease_id = p_lease;

  return found;
end;
$$;

revoke all on function public.record_submission_result_email(uuid, uuid, text, text, text) from public;
revoke all on function public.record_submission_result_email(uuid, uuid, text, text, text) from anon;
revoke all on function public.record_submission_result_email(uuid, uuid, text, text, text) from authenticated;
grant execute on function public.record_submission_result_email(uuid, uuid, text, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 5. Final review outcomes, with atomic ledger + notification creation
-- ---------------------------------------------------------------------------

/**
 * Finalises an accepted submission only after production is verified live.
 *
 * The ledger row, detailed in-app notification, email job trigger, submission
 * deletion and publish-state cascade all share this transaction. A failure in
 * any database step rolls all of them back. The public asset already being live
 * is represented by the still-processing submission and remains safely
 * retryable, matching the pre-0011 lifecycle.
 *
 * The SQL return type remains text for compatibility. Its content is now a
 * small JSON object carrying the trusted storage path and notification id.
 */
create or replace function public.finish_processing(p_id uuid)
  returns text
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_path         text;
  v_owner        uuid;
  v_name         text;
  v_level_id     text;
  v_macro_author text;
  v_recorder     text;
  v_state        text;
  v_download_url text;
  v_notification uuid;
begin
  if not private.is_admin() then
    raise exception 'not authorised';
  end if;

  -- Lock the submission first. Two finalisers cannot both pass this point, and
  -- every value copied into the durable ledger comes from trusted database
  -- state rather than from the browser.
  select s.storage_path, s.submitted_by, s.level_name, s.level_id,
         s.macro_author, s.recorder
    into v_path, v_owner, v_name, v_level_id, v_macro_author, v_recorder
    from public.submissions s
   where s.id = p_id
     and s.status = 'processing'
   for update;

  if v_path is null then
    raise exception 'not found or not being processed';
  end if;

  -- Lock and verify the durable publish checkpoint before recording acceptance.
  select ps.state, ps.asset_url
    into v_state, v_download_url
    from private.submission_publish_state ps
   where ps.submission_id = p_id
   for update;

  if v_state is distinct from 'live_verified' then
    raise exception 'not published yet';
  end if;

  -- History and notification are deliberately written BEFORE the live row is
  -- removed. They are still in this transaction, so any later failure rolls
  -- them back together with the deletion.
  insert into public.published_submissions (
    submission_id, user_id, level_name, level_id,
    macro_author, recorder, download_url
  ) values (
    p_id, v_owner, v_name, v_level_id,
    v_macro_author, v_recorder, v_download_url
  );

  insert into public.submission_notifications (
    user_id, submission_id, level_name, level_id,
    macro_author, recorder, outcome
  ) values (
    v_owner, p_id, v_name, v_level_id,
    v_macro_author, v_recorder, 'accepted'
  )
  returning id into v_notification;

  delete from public.submissions s
   where s.id = p_id
     and s.status = 'processing';

  if not found then
    raise exception 'not found or not being processed';
  end if;

  return jsonb_build_object(
    'storage_path', v_path,
    'notification_id', v_notification
  )::text;
end;
$$;

/** Rejects a pending submission and atomically creates its detailed result. */
create or replace function public.reject_submission(p_id uuid, p_reason text)
  returns text
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_reason       text := btrim(coalesce(p_reason, ''));
  v_path         text;
  v_owner        uuid;
  v_name         text;
  v_level_id     text;
  v_macro_author text;
  v_recorder     text;
  v_notification uuid;
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

  delete from public.submissions s
   where s.id = p_id
     and s.status = 'pending'
  returning s.storage_path, s.submitted_by, s.level_name, s.level_id,
            s.macro_author, s.recorder
       into v_path, v_owner, v_name, v_level_id, v_macro_author, v_recorder;

  if v_path is null then
    raise exception 'not found or already reviewed';
  end if;

  insert into public.submission_notifications (
    user_id, submission_id, level_name, level_id,
    macro_author, recorder, outcome, rejection_reason
  ) values (
    v_owner, p_id, v_name, v_level_id,
    v_macro_author, v_recorder, 'rejected', v_reason
  )
  returning id into v_notification;

  return jsonb_build_object(
    'storage_path', v_path,
    'notification_id', v_notification
  )::text;
end;
$$;

revoke all on function public.finish_processing(uuid) from public;
revoke all on function public.finish_processing(uuid) from anon;
grant execute on function public.finish_processing(uuid) to authenticated;

revoke all on function public.reject_submission(uuid, text) from public;
revoke all on function public.reject_submission(uuid, text) from anon;
grant execute on function public.reject_submission(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Database-side privacy version
-- ---------------------------------------------------------------------------

-- Mirrors the account-experience disclosure in src/lib/legal.ts. The app-side
-- constant and privacy copy are updated with the feature; test:legal asserts
-- that this database value and the rendered document agree.
insert into private.legal_documents (doc, version, effective_date, updated_at)
values ('privacy', '2026-08-23', '2026-08-23', now())
on conflict (doc) do update
   set version = excluded.version,
       effective_date = excluded.effective_date,
       updated_at = now();

commit;
