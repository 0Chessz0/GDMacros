-- Claim a reserved username for the site owner.
--
-- NOT a migration. This is specific to one account, so it must not run
-- automatically anywhere. Paste it into the Supabase SQL editor once, by hand.
--
-- Why this is needed
-- -----------------
-- `chesszdc` and `spypiexj8` are in private.reserved_usernames so that nobody
-- can claim them and impersonate the people whose names appear as macro authors
-- in data/macros.json. That protection has an obvious side effect: the owner
-- cannot claim their own name through /welcome either, because set_username
-- checks the same list.
--
-- Why this is safe
-- ----------------
-- The reserved list is only consulted inside the RPCs, and public.profiles has
-- no INSERT/UPDATE/DELETE grant for anon or authenticated at all. So a direct
-- insert here is possible only from a privileged SQL session, which means only
-- you, in the dashboard. Everyone coming through the API is still refused:
--
--   set_username('chesszdc')  ->  'that username is not available'
--   set_username('ChesszDC')  ->  'that username is not available'
--
-- The format check and the case-insensitive unique index still apply to this
-- insert, so a malformed or already-taken name is rejected here too.

-- Step 1. Find your account id. Confirm the email is the one you expect before
-- running step 2, because this writes your public identity.
-- Replace the address below with your own before running. It is left as a
-- placeholder deliberately: this file is committed to a public repository, so a
-- real address here would be published along with it.
select id, email, created_at
from auth.users
where email = 'you@example.com';

-- Step 2. Claim the name. Replace the uuid with the id from step 1.
-- Capitalisation is preserved exactly as typed here.
insert into public.profiles (id, username)
values ('00000000-0000-0000-0000-000000000000', 'ChesszDC');

-- Step 3. Check it.
select id, username, username_lower from public.profiles;

-- Renaming later works normally through the app: change_username does not
-- consult the reserved list for the name you are leaving, only for the one you
-- are moving to. Note that if you rename away from ChesszDC, you will not be
-- able to claim it again through the app, and would need this snippet again.
