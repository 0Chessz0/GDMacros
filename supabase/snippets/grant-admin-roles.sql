-- Grant the admin role to the two owner accounts.
--
-- NOT a migration. A migration must never be able to create an administrator
-- silently, so this is run once, by hand, in the Supabase SQL editor, one step
-- at a time, reading the result of each step before running the next.
--
--
-- What "admin" is
-- --------------
-- A row in public.user_roles, keyed on the auth user id. That id is the ONLY
-- permanent identity: there is no email column and no username column, because
-- a username is mutable and an email is a login credential rather than an
-- authorisation subject. private.is_admin() reads this table and is the single
-- database-side definition of admin. No email or username appears in any
-- authorisation rule anywhere in the schema or the application.
--
-- Usernames are used BELOW only as a checksum on the uuid you paste, never as
-- the thing that gets stored.
--
--
-- Both owners, not just one
-- -------------------------
-- ChesszDC and Spypiexj8 are both administrators. Step 4 inserts both in one
-- statement; step 5 must show two rows.
--
--
-- Safety properties
-- -----------------
-- Steps 1, 2, 3 and 5 only read. Step 4 is the single statement that writes:
--
--   * The username acts as a checksum. A row whose uuid and username do not
--     belong to the same profile inserts nothing, so a mistyped uuid can never
--     make the wrong account an administrator.
--   * ON CONFLICT (user_id, role) DO NOTHING makes it safe to rerun, and safe
--     to rerun after a PARTIAL run where one owner was inserted and the other
--     was skipped over a typo. Fix the typo, run step 4 again.
--   * It only ever INSERTs the single role 'admin'. It contains no UPDATE and
--     no DELETE, so no other role on any account can be overwritten or removed.
--   * RETURNING reports what this run actually wrote, so an empty result means
--     "already done" rather than "failed".
--
--
-- About the placeholders
-- ----------------------
-- This file is committed to a PUBLIC repository, so it carries no real uuid and
-- no real email address. Fill in the same two VALUES rows in steps 3, 4 and 5.


-- ---------------------------------------------------------------------------
-- Step 1. The accounts. Run this alone and read it.
-- ---------------------------------------------------------------------------

select id, email, created_at, email_confirmed_at
from auth.users
order by created_at;


-- ---------------------------------------------------------------------------
-- Step 2. Which auth account owns which username. Verify this VISUALLY.
-- ---------------------------------------------------------------------------
-- Confirm with your own eyes that ChesszDC is the account you expect, and that
-- Spypiexj8 is the account you expect, before going any further. Everything
-- below trusts the uuids you take from here.

select
  u.id    as auth_user_id,
  u.email,
  p.username,
  p.username_lower,
  p.created_at as profile_created,
  case when ur.role is not null then 'ALREADY ADMIN' else 'not an admin yet' end as current_state
from auth.users u
left join public.profiles  p  on p.id = u.id
left join public.user_roles ur on ur.user_id = u.id and ur.role = 'admin'
order by p.username nulls last;


-- ---------------------------------------------------------------------------
-- Step 3. Dry run. Verify each uuid and username pair. Writes nothing.
-- ---------------------------------------------------------------------------
-- Every check column must read as its "ok" wording before you run step 4.

with intended (user_id, username) as (
  values
    ('PASTE-UUID-FOR-CHESSZDC'::uuid,  'ChesszDC'),
    ('PASTE-UUID-FOR-SPYPIEXJ8'::uuid, 'Spypiexj8')
)
select
  i.username as intended_username,
  i.user_id  as intended_uuid,

  case
    when (select count(distinct user_id) from intended) = 2 then 'two distinct accounts'
    else 'THE SAME UUID IS USED TWICE. Check step 2.'
  end as account_check,

  case
    when u.id is null then 'NO SUCH AUTH ACCOUNT. Check the uuid against step 1.'
    else 'auth account exists (' || u.email || ')'
  end as auth_check,

  case
    when p.id is null
      then 'THAT ACCOUNT HAS NO PROFILE. It cannot be matched by username.'
    when p.username_lower is distinct from lower(i.username)
      then 'MISMATCH. That uuid owns the username ' || p.username
    else 'pair ok'
  end as pair_check,

  case
    when ur.role is not null then 'already an admin, step 4 will skip it'
    else 'will be granted admin'
  end as grant_check

from intended i
left join auth.users       u  on u.id = i.user_id
left join public.profiles  p  on p.id = i.user_id
left join public.user_roles ur on ur.user_id = i.user_id and ur.role = 'admin';


-- ---------------------------------------------------------------------------
-- Step 4. Grant admin to BOTH. The only step that writes. Safe to rerun.
-- ---------------------------------------------------------------------------
-- Paste the same two VALUES rows as step 3. RETURNING lists what was written on
-- this run: two rows on a clean first run, one when completing a partial run,
-- and zero when both were already administrators.
--
-- The join on public.profiles is the checksum: if a uuid and username do not
-- belong to the same profile, that row inserts nothing at all.

with intended (user_id, username) as (
  values
    ('PASTE-UUID-FOR-CHESSZDC'::uuid,  'ChesszDC'),
    ('PASTE-UUID-FOR-SPYPIEXJ8'::uuid, 'Spypiexj8')
)
insert into public.user_roles (user_id, role)
select p.id, 'admin'
from intended i
join public.profiles p
  on p.id = i.user_id
 and p.username_lower = lower(i.username)
on conflict (user_id, role) do nothing
returning user_id, role;


-- ---------------------------------------------------------------------------
-- Step 5. Verify. Required, not optional.
-- ---------------------------------------------------------------------------
-- Expect EXACTLY TWO rows, ChesszDC and Spypiexj8, both with role = admin.

select
  p.username,
  ur.role,
  ur.user_id,
  u.email,
  ur.created_at as granted_at
from public.user_roles ur
join public.profiles p on p.id = ur.user_id
join auth.users      u on u.id = ur.user_id
where ur.role = 'admin'
order by p.username;


-- Nobody else should hold any role at all. Expect the same two rows and no
-- others, which also confirms no account promoted itself through the API.
select ur.user_id, ur.role, p.username
from public.user_roles ur
left join public.profiles p on p.id = ur.user_id
order by ur.role, p.username;


-- ---------------------------------------------------------------------------
-- Revoking, if ever needed
-- ---------------------------------------------------------------------------
-- Deliberately not scripted here, so that removing an administrator is always a
-- deliberate act rather than a line someone runs by accident:
--
--   delete from public.user_roles
--    where user_id = '<the uuid from step 5>' and role = 'admin';
--
-- There is no API path to this table for anyone, so revoking, like granting,
-- can only happen from a privileged SQL session.
