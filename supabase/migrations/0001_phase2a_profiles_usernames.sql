-- Phase 2A: profiles, usernames and the two username RPCs.
--
-- Run this once in the Supabase SQL editor. It is written to be re-runnable:
-- every object is created with "if not exists" or dropped first, so a partial
-- run can be repeated safely.
--
-- Design notes live in .claude/reference/phase2.md. The short version:
--   * profiles has NO insert/update/delete policy. Both RPCs are the only way
--     in, so calling the API directly cannot skip validation.
--   * Internal data and helpers live in the `private` schema, which PostgREST
--     does not expose, so they are not reachable as RPCs.
--   * Postgres grants EXECUTE to PUBLIC by default. Every function revokes that
--     before granting anything.

begin;

-- ---------------------------------------------------------------------------
-- 1. private schema, for things that must never be reachable over the API
-- ---------------------------------------------------------------------------

create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon;
-- authenticated needs USAGE only so that RLS policies, which execute as the
-- caller, can reach helpers defined here. The schema still is not exposed.
grant usage on schema private to authenticated;

create table if not exists private.reserved_usernames (
  name_lower text primary key
);

-- No grants at all: only SECURITY DEFINER functions read this, so the blocklist
-- cannot be enumerated by anyone through the API.
revoke all on private.reserved_usernames from public;
revoke all on private.reserved_usernames from anon;
revoke all on private.reserved_usernames from authenticated;

alter table private.reserved_usernames enable row level security;
-- RLS on with zero policies means "deny all" for every non-superuser role.

insert into private.reserved_usernames (name_lower) values
  ('admin'), ('administrator'), ('root'), ('system'), ('support'),
  ('staff'), ('mod'), ('moderator'), ('official'), ('owner'),
  ('gdmacros'), ('gd_macros'), ('api'), ('auth'), ('login'), ('logout'),
  ('signup'), ('account'), ('settings'), ('favorites'), ('submit'),
  ('welcome'), ('admin_panel'), ('null'), ('undefined'),
  -- The site owner's identities, so they cannot be claimed and used to
  -- impersonate. This is also why no username change cooldown is needed.
  ('chesszdc'), ('spypiexj8')
on conflict (name_lower) do nothing;

-- ---------------------------------------------------------------------------
-- 2. profiles
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  username       text not null,
  -- Generated, so a case-only change is an update of THIS row and the unique
  -- index below only ever conflicts with a DIFFERENT row.
  username_lower text generated always as (lower(username)) stored,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  -- 3 to 20 characters, letters/digits/underscore, first character alphanumeric.
  constraint username_format check (username ~ '^[A-Za-z0-9][A-Za-z0-9_]{2,19}$')
);

create unique index if not exists profiles_username_lower_key
  on public.profiles (username_lower);

alter table public.profiles enable row level security;

-- Table grants matter as well as policies: without the INSERT/UPDATE/DELETE
-- privilege, even a mistaken policy added later cannot open a write path.
revoke all on public.profiles from public;
revoke all on public.profiles from anon;
revoke all on public.profiles from authenticated;
grant select on public.profiles to anon;
grant select on public.profiles to authenticated;

-- A username is a public identity, so anyone may read it. The table holds no
-- email and no personal data beyond the chosen name.
drop policy if exists "profiles are publicly readable" on public.profiles;
create policy "profiles are publicly readable"
  on public.profiles for select
  to anon, authenticated
  using (true);

-- Deliberately NO insert, update or delete policy. See the RPCs below.

-- ---------------------------------------------------------------------------
-- 3. Helpers
-- ---------------------------------------------------------------------------

create or replace function private.is_reserved(p_name text)
  returns boolean
  language sql
  security definer
  stable
  set search_path = ''
as $$
  select exists (
    select 1 from private.reserved_usernames
    where name_lower = lower(p_name)
  );
$$;

revoke all on function private.is_reserved(text) from public;
revoke all on function private.is_reserved(text) from anon;
revoke all on function private.is_reserved(text) from authenticated;

-- ---------------------------------------------------------------------------
-- 4. set_username: creates the profile row. No row means "not chosen yet".
-- ---------------------------------------------------------------------------

create or replace function public.set_username(p_username text)
  returns public.profiles
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_uid  uuid := (select auth.uid());
  v_name text := btrim(p_username);
  v_row  public.profiles;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if exists (select 1 from public.profiles where id = v_uid) then
    -- Renames go through change_username, which requires confirmation.
    raise exception 'username already set' using errcode = '23505';
  end if;

  if private.is_reserved(v_name) then
    raise exception 'that username is not available' using errcode = '23514';
  end if;

  -- Format is enforced by the check constraint and uniqueness by the index, so
  -- they are not re-implemented here. The database rejects bad input even if
  -- this function is edited carelessly later.
  insert into public.profiles (id, username)
  values (v_uid, v_name)
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.set_username(text) from public;
revoke all on function public.set_username(text) from anon;
grant execute on function public.set_username(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. change_username: requires the current name to be retyped.
-- ---------------------------------------------------------------------------

create or replace function public.change_username(p_current text, p_new text)
  returns public.profiles
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_current text;
  v_new     text := btrim(p_new);
  v_row     public.profiles;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select username into v_current from public.profiles where id = v_uid;

  if v_current is null then
    raise exception 'no username set' using errcode = '23502';
  end if;

  -- The confirmation, enforced here rather than in the browser so it is real.
  -- Case-insensitive on purpose: it is a memory check, not a typing test.
  if lower(btrim(p_current)) is distinct from lower(v_current) then
    raise exception 'confirmation does not match your current username'
      using errcode = '22023';
  end if;

  if private.is_reserved(v_new) then
    raise exception 'that username is not available' using errcode = '23514';
  end if;

  update public.profiles
     set username = v_new,
         updated_at = now()
   where id = v_uid
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.change_username(text, text) from public;
revoke all on function public.change_username(text, text) from anon;
grant execute on function public.change_username(text, text) to authenticated;

commit;
