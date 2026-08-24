-- Signed-in support tickets, closure notifications/email, 30-day transcript
-- retention, review activity, and random catalog quality checks.
--
-- Apply after 0013. Existing migrations are production history and are not
-- rewritten. Browser roles receive read access only; every mutation is a
-- narrowly scoped SECURITY DEFINER RPC that derives identity from auth.uid().

begin;

-- ---------------------------------------------------------------------------
-- 1. Support tickets and threaded messages
-- ---------------------------------------------------------------------------

create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_number bigint generated always as identity unique,
  opened_by uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('suggestion', 'broken_macro')),
  title text not null check (char_length(title) between 5 and 120),
  macro_slug text check (macro_slug is null or macro_slug ~ '^[a-z0-9][a-z0-9-]{0,119}$'),
  macro_name text check (macro_name is null or char_length(macro_name) between 1 and 100),
  macro_level_id text check (macro_level_id is null or macro_level_id ~ '^[0-9]{1,12}$'),
  status text not null default 'open' check (status in ('open', 'resolved', 'closed')),
  close_reason text check (close_reason is null or char_length(close_reason) between 3 and 500),
  closed_by uuid references auth.users(id) on delete set null,
  closed_at timestamptz,
  delete_after timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint support_ticket_macro_context check (
    (kind = 'suggestion' and macro_slug is null and macro_name is null and macro_level_id is null)
    or
    (kind = 'broken_macro' and macro_slug is not null and macro_name is not null and macro_level_id is not null)
  ),
  constraint support_ticket_close_state check (
    (status = 'open' and close_reason is null and closed_by is null and closed_at is null and delete_after is null)
    or
    (status in ('resolved', 'closed') and close_reason is not null
      and closed_at is not null and delete_after is not null)
  )
);

create index support_tickets_owner_status_idx
  on public.support_tickets (opened_by, status, updated_at desc);
create index support_tickets_admin_queue_idx
  on public.support_tickets (status, updated_at desc);
create index support_tickets_retention_idx
  on public.support_tickets (delete_after)
  where delete_after is not null;

create table public.support_ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  -- Keep an admin's contribution in the transcript if that admin account is
  -- later removed. The role is snapshotted and the UI has a safe fallback.
  author_id uuid references auth.users(id) on delete set null,
  author_role text not null check (author_role in ('user', 'admin')),
  body text not null check (char_length(body) between 1 and 5000),
  created_at timestamptz not null default now()
);

create index support_ticket_messages_thread_idx
  on public.support_ticket_messages (ticket_id, created_at, id);

alter table public.support_tickets enable row level security;
alter table public.support_ticket_messages enable row level security;

revoke all on public.support_tickets from public, anon, authenticated;
revoke all on public.support_ticket_messages from public, anon, authenticated;
grant select on public.support_tickets to authenticated;
grant select on public.support_ticket_messages to authenticated;

create policy "read your support tickets, or all as admin"
  on public.support_tickets for select to authenticated
  using (
    (delete_after is null or delete_after > now())
    and ((select auth.uid()) = opened_by or private.is_admin())
  );

create policy "read messages in your support tickets, or all as admin"
  on public.support_ticket_messages for select to authenticated
  using (exists (
    select 1
      from public.support_tickets t
     where t.id = support_ticket_messages.ticket_id
       and (t.delete_after is null or t.delete_after > now())
       and (t.opened_by = (select auth.uid()) or private.is_admin())
  ));

-- Blocks opening new tickets only. Existing threads stay readable and may be
-- replied to, so a block cannot silently cut off an ongoing resolution.
create table private.support_ticket_bans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  reason text not null check (char_length(reason) between 3 and 500),
  banned_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table private.support_ticket_bans enable row level security;
revoke all on private.support_ticket_bans from public, anon, authenticated;

create or replace function public.create_support_ticket(
  p_kind text,
  p_title text,
  p_body text,
  p_macro_slug text default null,
  p_macro_name text default null,
  p_macro_level_id text default null
)
  returns table (ticket_id uuid, ticket_number bigint)
  language plpgsql
  security definer
  set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := (select auth.uid());
  v_kind text := lower(btrim(coalesce(p_kind, '')));
  v_title text := btrim(coalesce(p_title, ''));
  v_body text := btrim(coalesce(p_body, ''));
  v_id uuid;
  v_number bigint;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if not exists (select 1 from public.profiles p where p.id = v_uid) then
    raise exception 'choose a username first';
  end if;
  if exists (select 1 from private.support_ticket_bans b where b.user_id = v_uid) then
    raise exception 'support tickets blocked';
  end if;
  if (select count(*) from public.support_tickets t where t.opened_by = v_uid and t.status = 'open') >= 5 then
    raise exception 'too many open tickets';
  end if;
  if v_kind not in ('suggestion', 'broken_macro') then raise exception 'invalid ticket kind'; end if;
  if char_length(v_title) not between 5 and 120 then raise exception 'invalid title'; end if;
  if char_length(v_body) not between 3 and 5000 then raise exception 'invalid message'; end if;

  insert into public.support_tickets as t (
    opened_by, kind, title, macro_slug, macro_name, macro_level_id
  ) values (
    v_uid,
    v_kind,
    v_title,
    case when v_kind = 'broken_macro' then nullif(btrim(p_macro_slug), '') else null end,
    case when v_kind = 'broken_macro' then nullif(btrim(p_macro_name), '') else null end,
    case when v_kind = 'broken_macro' then nullif(btrim(p_macro_level_id), '') else null end
  ) returning t.id, t.ticket_number into v_id, v_number;

  insert into public.support_ticket_messages (ticket_id, author_id, author_role, body)
  values (v_id, v_uid, 'user', v_body);

  return query select v_id, v_number;
end;
$$;

create or replace function public.add_support_ticket_message(p_ticket uuid, p_body text)
  returns uuid
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_body text := btrim(coalesce(p_body, ''));
  v_admin boolean;
  v_id uuid;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if char_length(v_body) not between 1 and 5000 then raise exception 'invalid message'; end if;
  v_admin := private.is_admin();

  if not exists (
    select 1 from public.support_tickets t
     where t.id = p_ticket and t.status = 'open'
       and (t.opened_by = v_uid or v_admin)
  ) then
    raise exception 'ticket unavailable or closed';
  end if;
  if (select count(*) from public.support_ticket_messages m where m.ticket_id = p_ticket) >= 500 then
    raise exception 'ticket message limit';
  end if;
  if (
    select count(*) from public.support_ticket_messages m
     where m.ticket_id = p_ticket and m.author_id = v_uid
       and m.created_at > now() - interval '1 hour'
  ) >= 30 then
    raise exception 'message rate limit';
  end if;

  insert into public.support_ticket_messages (ticket_id, author_id, author_role, body)
  values (p_ticket, v_uid, case when v_admin then 'admin' else 'user' end, v_body)
  returning id into v_id;

  update public.support_tickets set updated_at = now() where id = p_ticket;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Ticket closure notifications and durable email
-- ---------------------------------------------------------------------------

create table public.account_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('support_ticket_closed')),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  title text not null check (char_length(title) between 3 and 160),
  message text not null check (char_length(message) between 3 and 1000),
  read_at timestamptz,
  dismissed_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (ticket_id, kind)
);

create index account_notifications_unread_idx
  on public.account_notifications (user_id, created_at desc)
  where read_at is null;

alter table public.account_notifications enable row level security;
revoke all on public.account_notifications from public, anon, authenticated;
grant select on public.account_notifications to authenticated;

create policy "read your account notifications"
  on public.account_notifications for select to authenticated
  using ((select auth.uid()) = user_id and dismissed_at is null and expires_at > now());

create or replace function public.mark_account_notifications_read(p_id uuid default null)
  returns integer
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_count integer;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  update public.account_notifications n
     set read_at = now()
   where n.user_id = v_uid and n.read_at is null and (p_id is null or n.id = p_id);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.dismiss_account_notification(p_id uuid)
  returns boolean
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if (select auth.uid()) is null then raise exception 'not authenticated'; end if;
  update public.account_notifications n
     set dismissed_at = now(), read_at = coalesce(n.read_at, now())
   where n.id = p_id and n.user_id = (select auth.uid()) and n.dismissed_at is null;
  return found;
end;
$$;

create table private.support_ticket_email_jobs (
  notification_id uuid primary key references public.account_notifications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  idempotency_key text not null unique,
  status text not null default 'pending'
    check (status in ('pending', 'sending', 'retryable', 'sent', 'failed', 'needs_review', 'cancelled')),
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
  provider_message_id text check (provider_message_id is null or char_length(provider_message_id) <= 200),
  last_error text check (last_error is null or char_length(last_error) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint support_email_payload_state check (
    (status in ('pending', 'sending', 'retryable') and recipient_email is not null
      and subject is not null and html_body is not null and text_body is not null)
    or
    (status in ('sent', 'failed', 'needs_review', 'cancelled') and recipient_email is null
      and subject is null and html_body is null and text_body is null)
  ),
  constraint support_email_claim_state check (
    (status = 'sending' and claimed_at is not null and lease_id is not null)
    or (status <> 'sending' and claimed_at is null and lease_id is null)
  )
);

create index support_ticket_email_jobs_claim_idx
  on private.support_ticket_email_jobs (status, next_attempt_at, created_at);
alter table private.support_ticket_email_jobs enable row level security;
revoke all on private.support_ticket_email_jobs from public, anon, authenticated;

create or replace function private.queue_support_ticket_email()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_recipient text;
  v_number bigint;
  v_status text;
  v_reason text;
  v_link text;
  v_expiry text;
  v_subject text;
  v_text text;
  v_html text;
begin
  select nullif(btrim(u.email), '') into v_recipient
    from auth.users u where u.id = new.user_id;
  select t.ticket_number, t.status, t.close_reason
    into v_number, v_status, v_reason
    from public.support_tickets t where t.id = new.ticket_id;

  v_link := 'https://www.gdmacros.com/support/tickets/' || new.ticket_id::text;
  v_expiry := to_char(new.expires_at at time zone 'UTC', 'YYYY-MM-DD');
  v_subject := 'GDMacros support ticket #' || v_number::text || ' was ' || v_status;
  v_text := 'Your GDMacros support ticket #' || v_number::text || ' was ' || v_status || '.'
    || E'\n\nReason: ' || v_reason
    || E'\n\nTranscript: ' || v_link
    || E'\n\nThe ticket and transcript will be permanently deleted after ' || v_expiry || ' (UTC).';
  v_html := '<!doctype html><html><body><p>Your GDMacros support ticket <strong>#'
    || v_number::text || '</strong> was ' || private.escape_result_email_html(v_status) || '.</p>'
    || '<p>Reason: ' || private.escape_result_email_html(v_reason) || '</p>'
    || '<p><a href="' || v_link || '">Read the transcript</a></p>'
    || '<p>The ticket and transcript will be permanently deleted after <strong>'
    || v_expiry || ' (UTC)</strong>.</p></body></html>';

  if v_recipient is null then
    insert into private.support_ticket_email_jobs (
      notification_id, user_id, ticket_id, idempotency_key, status, resolved_at, last_error
    ) values (
      new.id, new.user_id, new.ticket_id, 'support-ticket/' || new.id::text,
      'cancelled', now(), 'recipient_missing'
    );
  else
    insert into private.support_ticket_email_jobs (
      notification_id, user_id, ticket_id, idempotency_key,
      recipient_email, subject, html_body, text_body
    ) values (
      new.id, new.user_id, new.ticket_id, 'support-ticket/' || new.id::text,
      v_recipient, v_subject, v_html, v_text
    );
  end if;
  return new;
end;
$$;

create trigger queue_support_ticket_email
  after insert on public.account_notifications
  for each row execute function private.queue_support_ticket_email();

create or replace function public.close_support_ticket(
  p_ticket uuid,
  p_status text,
  p_reason text
)
  returns uuid
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_status text := lower(btrim(coalesce(p_status, '')));
  v_reason text := btrim(coalesce(p_reason, ''));
  v_owner uuid;
  v_number bigint;
  v_expiry timestamptz := now() + interval '30 days';
  v_notification uuid;
begin
  if not private.is_admin() then raise exception 'not authorised'; end if;
  if v_status not in ('resolved', 'closed') then raise exception 'invalid close status'; end if;
  if char_length(v_reason) not between 3 and 500 then raise exception 'invalid close reason'; end if;

  update public.support_tickets t
     set status = v_status,
         close_reason = v_reason,
         closed_by = (select auth.uid()),
         closed_at = now(),
         delete_after = v_expiry,
         updated_at = now()
   where t.id = p_ticket and t.status = 'open'
  returning t.opened_by, t.ticket_number into v_owner, v_number;

  if v_owner is null then raise exception 'ticket not found or already closed'; end if;

  insert into public.account_notifications (
    user_id, kind, ticket_id, title, message, expires_at
  ) values (
    v_owner,
    'support_ticket_closed',
    p_ticket,
    'Support ticket #' || v_number::text || ' ' || v_status,
    'Your ticket was ' || v_status || '. The transcript is available for 30 days, then it is permanently deleted.',
    v_expiry
  ) returning id into v_notification;

  return v_notification;
end;
$$;

create or replace function public.claim_support_ticket_email(p_notification uuid default null)
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
  update private.support_ticket_email_jobs j
     set status = 'needs_review', recipient_email = null, subject = null,
         html_body = null, text_body = null, claimed_at = null, lease_id = null,
         next_attempt_at = null, resolved_at = now(),
         last_error = 'idempotency_window_expired', updated_at = now()
   where j.status in ('sending', 'retryable')
     and j.first_attempt_at is not null
     and j.first_attempt_at <= now() - interval '23 hours';

  select j.notification_id into v_job
    from private.support_ticket_email_jobs j
   where (p_notification is null or j.notification_id = p_notification)
     and (
       j.status = 'pending'
       or (j.status = 'retryable' and coalesce(j.next_attempt_at, '-infinity'::timestamptz) <= now())
       or (j.status = 'sending' and j.claimed_at <= now() - interval '5 minutes')
     )
     and (j.first_attempt_at is null or j.first_attempt_at > now() - interval '23 hours')
   order by j.created_at, j.notification_id
   limit 1 for update skip locked;

  if v_job is null then return; end if;

  return query
  update private.support_ticket_email_jobs j
     set status = 'sending', attempts = j.attempts + 1,
         first_attempt_at = coalesce(j.first_attempt_at, now()),
         claimed_at = now(), lease_id = gen_random_uuid(), next_attempt_at = null, updated_at = now()
   where j.notification_id = v_job
  returning j.notification_id, j.user_id, j.recipient_email, j.subject,
            j.html_body, j.text_body, j.first_attempt_at, j.lease_id;
end;
$$;

create or replace function public.record_support_ticket_email(
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
  v_status text := lower(btrim(coalesce(p_status, '')));
  v_provider text := left(nullif(btrim(coalesce(p_provider_message_id, '')), ''), 200);
  v_error text := left(nullif(btrim(coalesce(p_error, '')), ''), 200);
begin
  if v_status not in ('sent', 'retryable', 'failed') then raise exception 'invalid status'; end if;
  if v_status = 'retryable' then
    update private.support_ticket_email_jobs j
       set status = 'retryable', claimed_at = null, lease_id = null,
           next_attempt_at = now() + interval '1 minute',
           provider_message_id = coalesce(v_provider, j.provider_message_id),
           last_error = coalesce(v_error, 'retryable'), updated_at = now()
     where j.notification_id = p_notification and j.status = 'sending' and j.lease_id = p_lease;
    return found;
  end if;

  update private.support_ticket_email_jobs j
     set status = v_status, recipient_email = null, subject = null, html_body = null, text_body = null,
         claimed_at = null, lease_id = null, next_attempt_at = null, resolved_at = now(),
         sent_at = case when v_status = 'sent' then now() else j.sent_at end,
         provider_message_id = coalesce(v_provider, j.provider_message_id),
         last_error = case when v_status = 'sent' then null else coalesce(v_error, v_status) end,
         updated_at = now()
   where j.notification_id = p_notification and j.status = 'sending' and j.lease_id = p_lease;
  return found;
end;
$$;

create or replace function public.purge_expired_support_tickets()
  returns integer
  language plpgsql
  security definer
  set search_path = ''
as $$
declare v_count integer;
begin
  delete from public.support_tickets t
   where t.delete_after is not null and t.delete_after <= now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- The application also invokes this purge from its daily maintenance route,
-- but that cadence cannot enforce an exact 30-day ceiling. Supabase Cron runs
-- the indexed delete every minute inside Postgres. RLS stops exposing an
-- expired transcript at the exact timestamp even if a cron run is a few
-- seconds late, and the next run physically removes the rows and messages.
create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule(
  'gdmacros-purge-expired-support-tickets',
  '* * * * *',
  $cron$ select public.purge_expired_support_tickets(); $cron$
);

-- ---------------------------------------------------------------------------
-- 3. Ticket administration
-- ---------------------------------------------------------------------------

create or replace function public.ban_support_ticket_user(p_ticket uuid, p_reason text)
  returns uuid
  language plpgsql
  security definer
  set search_path = ''
as $$
declare v_uid uuid; v_id uuid;
begin
  if not private.is_admin() then raise exception 'not authorised'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) not between 3 and 500 then raise exception 'invalid reason'; end if;
  select t.opened_by into v_uid from public.support_tickets t where t.id = p_ticket;
  if v_uid is null then raise exception 'ticket not found'; end if;
  if exists (select 1 from public.user_roles r where r.user_id = v_uid and r.role = 'admin') then
    raise exception 'cannot ban an administrator';
  end if;
  insert into private.support_ticket_bans (user_id, reason, banned_by)
  values (v_uid, btrim(p_reason), (select auth.uid()))
  on conflict (user_id) do update
    set reason = excluded.reason, banned_by = excluded.banned_by, created_at = now()
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.unban_support_ticket_user(p_ban uuid)
  returns boolean
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if not private.is_admin() then raise exception 'not authorised'; end if;
  delete from private.support_ticket_bans b where b.id = p_ban;
  return found;
end;
$$;

create or replace function public.list_support_ticket_bans()
  returns table (ban_id uuid, username text, reason text, created_at timestamptz)
  language sql
  security definer
  stable
  set search_path = ''
as $$
  select b.id, coalesce(p.username, '(no username)'), b.reason, b.created_at
    from private.support_ticket_bans b
    left join public.profiles p on p.id = b.user_id
   where private.is_admin()
   order by b.created_at desc;
$$;

-- ---------------------------------------------------------------------------
-- 4. Review activity timeline
-- ---------------------------------------------------------------------------

create table private.admin_review_activity (
  id bigint generated always as identity primary key,
  event text not null check (char_length(event) between 3 and 60),
  submission_id uuid,
  level_name text check (level_name is null or char_length(level_name) <= 100),
  actor_id uuid references auth.users(id) on delete set null,
  detail text check (detail is null or char_length(detail) <= 500),
  created_at timestamptz not null default now()
);

create index admin_review_activity_created_idx
  on private.admin_review_activity (created_at desc);
alter table private.admin_review_activity enable row level security;
revoke all on private.admin_review_activity from public, anon, authenticated;

create or replace function private.capture_submission_activity()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare v_event text;
begin
  if tg_op = 'INSERT' then
    v_event := 'submitted';
  elsif old.status = 'pending' and new.status = 'processing' then
    v_event := 'review_started';
  elsif old.status = 'processing' and new.status = 'pending' then
    v_event := 'review_released';
  elsif old.status = new.status and (
    old.level_name is distinct from new.level_name or old.level_id is distinct from new.level_id
    or old.level_creator is distinct from new.level_creator or old.video_url is distinct from new.video_url
    or old.recorder is distinct from new.recorder or old.macro_author is distinct from new.macro_author
    or old.notes is distinct from new.notes
  ) then
    v_event := 'details_edited';
  else
    return new;
  end if;

  insert into private.admin_review_activity (event, submission_id, level_name, actor_id)
  values (v_event, new.id, new.level_name, (select auth.uid()));
  return new;
end;
$$;

create trigger capture_submission_activity
  after insert or update on public.submissions
  for each row execute function private.capture_submission_activity();

create or replace function private.capture_submission_outcome_activity()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  insert into private.admin_review_activity (event, submission_id, level_name, actor_id, detail)
  values (new.outcome, new.submission_id, new.level_name, (select auth.uid()), new.rejection_reason);
  return new;
end;
$$;

create trigger capture_submission_outcome_activity
  after insert on public.submission_notifications
  for each row execute function private.capture_submission_outcome_activity();

create or replace function private.capture_publish_activity()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare v_level text;
begin
  select s.level_name into v_level from public.submissions s where s.id = new.submission_id;
  if tg_op = 'INSERT' or old.state is distinct from new.state then
    insert into private.admin_review_activity (event, submission_id, level_name, actor_id)
    values ('publish_' || new.state, new.submission_id, v_level, (select auth.uid()));
  end if;
  if new.last_error is not null and (tg_op = 'INSERT' or old.last_error is distinct from new.last_error) then
    insert into private.admin_review_activity (event, submission_id, level_name, actor_id, detail)
    values ('publish_error', new.submission_id, v_level, (select auth.uid()), left(new.last_error, 500));
  end if;
  return new;
end;
$$;

create trigger capture_publish_activity
  after insert or update on private.submission_publish_state
  for each row execute function private.capture_publish_activity();

create or replace function public.admin_review_activity(p_limit integer default 100)
  returns table (
    activity_id bigint, event text, submission_id uuid, level_name text,
    actor_username text, detail text, created_at timestamptz
  )
  language sql
  security definer
  stable
  set search_path = ''
as $$
  select a.id, a.event, a.submission_id, a.level_name,
         coalesce(p.username, 'System'), a.detail, a.created_at
    from private.admin_review_activity a
    left join public.profiles p on p.id = a.actor_id
   where private.is_admin()
   order by a.created_at desc
   limit greatest(1, least(coalesce(p_limit, 100), 250));
$$;

-- ---------------------------------------------------------------------------
-- 5. Random quality-check records
-- ---------------------------------------------------------------------------

create table private.macro_quality_checks (
  id uuid primary key default gen_random_uuid(),
  download_url text not null check (download_url ~* '^https://' and char_length(download_url) <= 1000),
  level_name text not null check (char_length(level_name) between 1 and 100),
  level_id text not null check (level_id ~ '^[0-9]{1,12}$'),
  macro_author text not null check (char_length(macro_author) between 1 and 50),
  recorder text not null check (recorder in ('xdBot', 'Mega Hack')),
  outcome text not null check (outcome in ('good', 'issue')),
  note text check (note is null or char_length(note) between 3 and 1000),
  checked_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint quality_issue_note check (outcome = 'good' or note is not null)
);

create index macro_quality_checks_recent_idx
  on private.macro_quality_checks (download_url, created_at desc);
alter table private.macro_quality_checks enable row level security;
revoke all on private.macro_quality_checks from public, anon, authenticated;

create or replace function public.record_macro_quality_check(
  p_download_url text, p_level_name text, p_level_id text,
  p_macro_author text, p_recorder text, p_outcome text, p_note text
)
  returns uuid
  language plpgsql
  security definer
  set search_path = ''
as $$
declare v_id uuid; v_outcome text := lower(btrim(coalesce(p_outcome, '')));
begin
  if not private.is_admin() then raise exception 'not authorised'; end if;
  if v_outcome not in ('good', 'issue') then raise exception 'invalid outcome'; end if;
  insert into private.macro_quality_checks (
    download_url, level_name, level_id, macro_author, recorder, outcome, note, checked_by
  ) values (
    btrim(p_download_url), btrim(p_level_name), btrim(p_level_id), btrim(p_macro_author),
    btrim(p_recorder), v_outcome, nullif(btrim(coalesce(p_note, '')), ''), (select auth.uid())
  ) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.list_macro_quality_checks(p_limit integer default 20)
  returns table (
    check_id uuid, download_url text, level_name text, level_id text,
    macro_author text, recorder text, outcome text, note text,
    checked_by_username text, created_at timestamptz
  )
  language sql
  security definer
  stable
  set search_path = ''
as $$
  select q.id, q.download_url, q.level_name, q.level_id, q.macro_author, q.recorder,
         q.outcome, q.note, coalesce(p.username, 'Admin'), q.created_at
    from private.macro_quality_checks q
    left join public.profiles p on p.id = q.checked_by
   where private.is_admin()
   order by q.created_at desc
   limit greatest(1, least(coalesce(p_limit, 20), 100));
$$;

-- ---------------------------------------------------------------------------
-- 6. Grants
-- ---------------------------------------------------------------------------

revoke all on function public.create_support_ticket(text, text, text, text, text, text) from public, anon;
grant execute on function public.create_support_ticket(text, text, text, text, text, text) to authenticated;
revoke all on function public.add_support_ticket_message(uuid, text) from public, anon;
grant execute on function public.add_support_ticket_message(uuid, text) to authenticated;
revoke all on function public.close_support_ticket(uuid, text, text) from public, anon;
grant execute on function public.close_support_ticket(uuid, text, text) to authenticated;
revoke all on function public.mark_account_notifications_read(uuid) from public, anon;
grant execute on function public.mark_account_notifications_read(uuid) to authenticated;
revoke all on function public.dismiss_account_notification(uuid) from public, anon;
grant execute on function public.dismiss_account_notification(uuid) to authenticated;
revoke all on function public.ban_support_ticket_user(uuid, text) from public, anon;
grant execute on function public.ban_support_ticket_user(uuid, text) to authenticated;
revoke all on function public.unban_support_ticket_user(uuid) from public, anon;
grant execute on function public.unban_support_ticket_user(uuid) to authenticated;
revoke all on function public.list_support_ticket_bans() from public, anon;
grant execute on function public.list_support_ticket_bans() to authenticated;
revoke all on function public.admin_review_activity(integer) from public, anon;
grant execute on function public.admin_review_activity(integer) to authenticated;
revoke all on function public.record_macro_quality_check(text, text, text, text, text, text, text) from public, anon;
grant execute on function public.record_macro_quality_check(text, text, text, text, text, text, text) to authenticated;
revoke all on function public.list_macro_quality_checks(integer) from public, anon;
grant execute on function public.list_macro_quality_checks(integer) to authenticated;

revoke all on function public.claim_support_ticket_email(uuid) from public, anon, authenticated;
grant execute on function public.claim_support_ticket_email(uuid) to service_role;
revoke all on function public.record_support_ticket_email(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.record_support_ticket_email(uuid, uuid, text, text, text) to service_role;
revoke all on function public.purge_expired_support_tickets() from public, anon, authenticated;
grant execute on function public.purge_expired_support_tickets() to service_role;

revoke all on function private.queue_support_ticket_email() from public, anon, authenticated;
revoke all on function private.capture_submission_activity() from public, anon, authenticated;
revoke all on function private.capture_submission_outcome_activity() from public, anon, authenticated;
revoke all on function private.capture_publish_activity() from public, anon, authenticated;

commit;
