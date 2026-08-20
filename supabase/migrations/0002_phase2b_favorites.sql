-- Phase 2B: account-synced favorites.
--
-- Run this once in the Supabase SQL editor. It is written to be re-runnable:
-- every object is created with "if not exists" or dropped first, so a partial
-- run can be repeated safely.
--
-- Design notes live in .claude/reference/phase2.md. The short version:
--   * Unlike profiles, favorites DO get client write policies. A favorite is a
--     plain user-owned row with nothing to validate beyond ownership, so there
--     is no reason to route it through an RPC. Every policy is scoped to
--     auth.uid(), so one account can never see or touch another's rows.
--   * Keyed on the in-game level id, never the slug. The slug is derived from
--     the level NAME, so renaming a level would orphan every favorite of it.
--   * There is no UPDATE grant and no UPDATE policy. A favorite has no mutable
--     field: you either have one or you do not.

begin;

-- ---------------------------------------------------------------------------
-- 1. The table
-- ---------------------------------------------------------------------------

create table if not exists public.favorites (
  user_id    uuid not null references auth.users(id) on delete cascade,
  -- Text rather than a number because that is how level ids arrive from
  -- data/macros.json, and a numeric id would invite arithmetic on something
  -- that is really an opaque identifier.
  level_id   text not null,
  created_at timestamptz not null default now(),

  -- The composite primary key is what makes the whole sync idempotent. An
  -- upsert cannot duplicate a row, so a retry after a failed merge, or a
  -- burst of rapid toggling, converges instead of accumulating.
  primary key (user_id, level_id),

  -- Every id in data/macros.json is a numeric string, currently at most nine
  -- digits. Bounding it stops the table being used as free text storage.
  constraint favorites_level_id_format check (level_id ~ '^[0-9]{1,12}$')
);

-- ---------------------------------------------------------------------------
-- 2. Grants
-- ---------------------------------------------------------------------------
-- Tightened alongside the policies, not instead of them. If a policy is ever
-- added carelessly later, the missing grant still blocks the write.

revoke all on public.favorites from public;
revoke all on public.favorites from anon;
revoke all on public.favorites from authenticated;

-- anon gets nothing at all. Signed-out favorites live only in localStorage and
-- are never sent anywhere, which is what keeps accounts optional.
grant select, insert, delete on public.favorites to authenticated;
-- Deliberately no UPDATE.

-- ---------------------------------------------------------------------------
-- 3. Row level security
-- ---------------------------------------------------------------------------

alter table public.favorites enable row level security;

drop policy if exists "own favorites are readable"   on public.favorites;
drop policy if exists "own favorites are insertable" on public.favorites;
drop policy if exists "own favorites are deletable"  on public.favorites;

-- (select auth.uid()) rather than a bare auth.uid() so the planner treats it as
-- a one-time initplan instead of re-evaluating per row.
create policy "own favorites are readable"
  on public.favorites for select to authenticated
  using ((select auth.uid()) = user_id);

-- WITH CHECK on insert is the important half: it stops a caller writing a row
-- that claims to belong to somebody else.
create policy "own favorites are insertable"
  on public.favorites for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "own favorites are deletable"
  on public.favorites for delete to authenticated
  using ((select auth.uid()) = user_id);

-- No UPDATE policy, matching the absent grant.

commit;

-- ---------------------------------------------------------------------------
-- Verifying afterwards
-- ---------------------------------------------------------------------------
-- As a signed-in user, through the API rather than the SQL editor:
--
--   select  -> only your own rows, never anyone else's
--   insert  -> allowed for user_id = your uid, refused for any other uid
--   update  -> refused, 42501, before RLS is even consulted (no grant)
--   delete  -> only your own rows
--   as anon -> refused entirely
--
-- The SQL editor connects as a privileged role and bypasses RLS, so testing
-- there proves nothing about what a real client can do.
