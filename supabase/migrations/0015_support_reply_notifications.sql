-- In-app notifications for replies inside support-ticket threads.
--
-- Run with `npx supabase db push` after 0014. Reply alerts deliberately use
-- the existing account notification centre. They do not enter the Resend
-- queue: closure notifications remain the only support-ticket email.

begin;

-- A reply notification may be sent to several admins for the same ticket, so
-- the original ticket/kind key is too broad. One row per recipient and kind
-- also lets repeated replies coalesce into a single unread alert.
alter table public.account_notifications
  drop constraint account_notifications_ticket_id_kind_key;

alter table public.account_notifications
  drop constraint account_notifications_kind_check;

alter table public.account_notifications
  add constraint account_notifications_kind_check
  check (kind in ('support_ticket_closed', 'support_ticket_reply'));

alter table public.account_notifications
  add constraint account_notifications_user_ticket_kind_key
  unique (user_id, ticket_id, kind);

-- Open tickets do not have a retention deadline yet. Their reply alert gains
-- the ticket's exact deletion deadline when an admin closes the thread.
alter table public.account_notifications
  alter column expires_at drop not null;

drop policy "read your account notifications" on public.account_notifications;

create policy "read your account notifications"
  on public.account_notifications for select to authenticated
  using (
    (select auth.uid()) = user_id
    and dismissed_at is null
    and (expires_at is null or expires_at > now())
  );

-- The existing email trigger predates reply alerts and assumes every inserted
-- account notification represents a closure. Restrict it before reply rows can
-- be inserted so comments never generate misleading closure email.
drop trigger queue_support_ticket_email on public.account_notifications;

create trigger queue_support_ticket_email
  after insert on public.account_notifications
  for each row
  when (new.kind = 'support_ticket_closed')
  execute function private.queue_support_ticket_email();

create or replace function private.queue_support_ticket_reply_notification()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_owner uuid;
  v_number bigint;
  v_ticket_title text;
  v_author_username text;
begin
  select t.opened_by, t.ticket_number, t.title
    into v_owner, v_number, v_ticket_title
    from public.support_tickets t
   where t.id = new.ticket_id;

  if v_owner is null then return new; end if;

  -- The first message opens the ticket. It is already represented by the admin
  -- inbox and is not a reply to an existing conversation.
  if not exists (
    select 1
      from public.support_ticket_messages m
     where m.ticket_id = new.ticket_id and m.id <> new.id
  ) then
    return new;
  end if;

  -- Replying proves the author has seen the conversation. Hide their previous
  -- alert for this ticket; a later response from the other side resurfaces it.
  if new.author_id is not null then
    update public.account_notifications n
       set read_at = coalesce(n.read_at, now()),
           dismissed_at = coalesce(n.dismissed_at, now())
     where n.user_id = new.author_id
       and n.ticket_id = new.ticket_id
       and n.kind = 'support_ticket_reply';
  end if;

  if new.author_role = 'admin' then
    -- An admin replying to their own support ticket must not notify themselves.
    if new.author_id is distinct from v_owner then
      insert into public.account_notifications as n (
        user_id, kind, ticket_id, title, message, expires_at
      ) values (
        v_owner,
        'support_ticket_reply',
        new.ticket_id,
        'New reply on support ticket #' || v_number::text,
        'A GDMacros admin replied to “' || v_ticket_title || '”.',
        null
      )
      on conflict (user_id, ticket_id, kind) do update
        set title = excluded.title,
            message = excluded.message,
            read_at = null,
            dismissed_at = null,
            expires_at = null,
            created_at = excluded.created_at;
    end if;
  else
    select coalesce(p.username, 'The ticket owner') into v_author_username
      from public.profiles p where p.id = new.author_id;

    insert into public.account_notifications as n (
      user_id, kind, ticket_id, title, message, expires_at
    )
    select
      r.user_id,
      'support_ticket_reply',
      new.ticket_id,
      'New reply on support ticket #' || v_number::text,
      coalesce(v_author_username, 'The ticket owner') || ' replied to “' || v_ticket_title || '”.',
      null
    from public.user_roles r
    where r.role = 'admin' and r.user_id is distinct from new.author_id
    on conflict (user_id, ticket_id, kind) do update
      set title = excluded.title,
          message = excluded.message,
          read_at = null,
          dismissed_at = null,
          expires_at = null,
          created_at = excluded.created_at;
  end if;

  return new;
end;
$$;

create trigger queue_support_ticket_reply_notification
  after insert on public.support_ticket_messages
  for each row execute function private.queue_support_ticket_reply_notification();

-- Once a ticket closes, its reply alerts follow the same 30-day deadline as
-- the thread and are deleted by the existing ticket cascade.
create or replace function private.expire_support_ticket_reply_notifications()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if old.status = 'open' and new.status in ('resolved', 'closed') and new.delete_after is not null then
    update public.account_notifications n
       set expires_at = new.delete_after
     where n.ticket_id = new.id and n.kind = 'support_ticket_reply';
  end if;
  return new;
end;
$$;

create trigger expire_support_ticket_reply_notifications
  after update of status on public.support_tickets
  for each row execute function private.expire_support_ticket_reply_notifications();

revoke all on function private.queue_support_ticket_reply_notification() from public, anon, authenticated;
revoke all on function private.expire_support_ticket_reply_notifications() from public, anon, authenticated;

commit;
