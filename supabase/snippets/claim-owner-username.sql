-- Claim the reserved owner usernames.
--
-- NOT a migration. This is specific to two named accounts, so it must never run
-- automatically anywhere. Paste it into the Supabase SQL editor, by hand, one
-- step at a time, and read the result of each step before running the next.
--
--
-- What this does
-- --------------
-- Gives ChesszDC and Spypiexj8 to their real owner accounts. Both names are in
-- private.reserved_usernames precisely so nobody can claim them through the app
-- and impersonate the people whose names appear as macro authors in
-- data/macros.json. set_username refuses them for everyone, including the owner,
-- which is why claiming them needs a privileged SQL session.
--
--
-- Two accounts are required
-- -------------------------
-- public.profiles.id is the primary key, so one auth account holds exactly one
-- username. ChesszDC and Spypiexj8 therefore need TWO separate accounts in
-- auth.users. If the second one does not exist yet, create and confirm it before
-- running step 3.
--
--
-- Run this BEFORE either account signs in
-- ---------------------------------------
-- An account with no profile row is sent to /welcome, where it can claim some
-- other name. Once it has a row, set_username refuses to create a second one and
-- you would have to UPDATE rather than INSERT. Insert first, sign in after.
--
--
-- Safety properties
-- -----------------
-- Steps 1, 2 and 4 only read. Step 3 is the single statement that writes, and it
-- is safe to rerun:
--
--   * The email acts as a checksum on the uuid. A row whose uuid and email do
--     not belong to the same account inserts nothing, so a mistyped uuid can
--     never attach an owner name to the wrong account.
--   * ON CONFLICT DO NOTHING covers both unique constraints on the table: the id
--     primary key, and the username_lower unique index. An account that already
--     has a profile is left exactly as it is, and a name already held by someone
--     else is not stolen. Nothing is ever overwritten.
--   * Because of that, a PARTIAL run is recoverable. If one owner was inserted
--     and the other was skipped over a typo, fix the typo and rerun the whole of
--     step 3. The row that already exists is skipped instead of raising a
--     duplicate key error, and the missing one is inserted.
--   * RETURNING reports what was actually written, so an empty result means
--     "already done", not "failed".
--   * It is one statement, so it is atomic on its own. No explicit transaction
--     is needed.
--
-- Skipping is silent by design, so step 4 is not optional. It is what turns a
-- silent skip into a visible verdict.
--
--
-- About the placeholders
-- ----------------------
-- This file is committed to a PUBLIC repository, so it carries no real uuid and
-- no real email address. Fill in the same two VALUES rows in steps 2, 3 and 4,
-- and keep them identical across the three steps: that repetition is what lets
-- each step check the same intent independently.


-- ---------------------------------------------------------------------------
-- Step 1. List the accounts. Run this alone and read the result.
-- ---------------------------------------------------------------------------
-- Note which uuid belongs to which owner. If you see only one account, stop and
-- create the second one first.

select id, email, created_at, email_confirmed_at
from auth.users
order by created_at;


-- ---------------------------------------------------------------------------
-- Step 2. Dry run. Verify each uuid and email pair. This writes nothing.
-- ---------------------------------------------------------------------------
-- Every check column must read as the "ok" wording before you run step 3.

with intended (id, email, username) as (
  values
    ('PASTE-UUID-FOR-CHESSZDC'::uuid,  'PASTE-EMAIL-FOR-CHESSZDC',  'ChesszDC'),
    ('PASTE-UUID-FOR-SPYPIEXJ8'::uuid, 'PASTE-EMAIL-FOR-SPYPIEXJ8', 'Spypiexj8')
)
select
  i.username,
  i.id    as intended_id,
  i.email as intended_email,

  case
    when (select count(distinct id) from intended) = 2 then 'two distinct accounts'
    else 'THE SAME UUID IS USED TWICE. One account cannot hold both names.'
  end as account_check,

  case
    when u.id is null then 'NO SUCH ACCOUNT. Check the uuid against step 1.'
    when lower(u.email) is distinct from lower(i.email)
      then 'MISMATCH. That uuid belongs to ' || u.email
    else 'pair ok'
  end as pair_check,

  case
    when p.id is not null
      then 'ALREADY HAS A PROFILE, username ' || p.username ||
           '. It will be left untouched.'
    else 'no profile yet'
  end as profile_check,

  case
    when t.id is not null and t.id is distinct from i.id
      then 'NAME ALREADY TAKEN by a different account.'
    when t.id is not null then 'already held by this same account'
    else 'name free'
  end as name_check

from intended i
left join auth.users      u on u.id = i.id
left join public.profiles p on p.id = i.id
left join public.profiles t on t.username_lower = lower(i.username);


-- ---------------------------------------------------------------------------
-- Step 3. The insert. The only step that writes. Safe to rerun.
-- ---------------------------------------------------------------------------
-- Paste the same two VALUES rows as step 2. RETURNING lists what was written on
-- this run: two rows on a clean first run, one row when completing a partial
-- run, and zero rows when everything was already in place.

with intended (id, email, username) as (
  values
    ('PASTE-UUID-FOR-CHESSZDC'::uuid,  'PASTE-EMAIL-FOR-CHESSZDC',  'ChesszDC'),
    ('PASTE-UUID-FOR-SPYPIEXJ8'::uuid, 'PASTE-EMAIL-FOR-SPYPIEXJ8', 'Spypiexj8')
)
insert into public.profiles (id, username)
select u.id, i.username
from intended i
join auth.users u
  on u.id = i.id
 and lower(u.email) = lower(i.email)
on conflict do nothing
returning id, username;


-- ---------------------------------------------------------------------------
-- Step 4. Verify the final mapping. Required, not optional.
-- ---------------------------------------------------------------------------
-- Expect exactly two rows, both with verdict 'OK':
--
--   ChesszDC   -> the owner account you intended
--   Spypiexj8  -> the owner account you intended

with intended (id, email, username) as (
  values
    ('PASTE-UUID-FOR-CHESSZDC'::uuid,  'PASTE-EMAIL-FOR-CHESSZDC',  'ChesszDC'),
    ('PASTE-UUID-FOR-SPYPIEXJ8'::uuid, 'PASTE-EMAIL-FOR-SPYPIEXJ8', 'Spypiexj8')
)
select
  i.username as intended_username,
  i.email    as intended_email,
  p.username as actual_username,
  u.email    as actual_email,
  case
    when p.id is null
      then 'MISSING. Nothing was inserted for this account. Rerun step 2 and read pair_check.'
    when p.username = i.username and lower(u.email) = lower(i.email)
      then 'OK'
    else 'WRONG. This account holds ' || p.username || ', not ' || i.username
  end as verdict
from intended i
left join public.profiles p on p.id = i.id
left join auth.users      u on u.id = p.id;


-- Confirm nobody else holds either name. Expect exactly the two rows above and
-- no others.
select id, username, username_lower, created_at
from public.profiles
where username_lower in ('chesszdc', 'spypiexj8')
order by username_lower;


-- ---------------------------------------------------------------------------
-- Afterwards
-- ---------------------------------------------------------------------------
-- Leave BOTH names in private.reserved_usernames. The unique index protects a
-- name while it is held, but the reserved list is what stops someone claiming it
-- if an owner account is ever deleted or renamed away.
--
-- The trade-off that follows from keeping them reserved: renaming away from
-- these names through /account is a one way door, because change_username checks
-- the reserved list for the name you are moving TO. Coming back means running
-- this file again.
--
-- Renaming changes nothing else. Every reference in the schema is by user id and
-- never by username, so no backfill is ever needed.
