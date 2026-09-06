-- Grant the admin role to the owner account.
--
-- NOT a migration. A migration must never create an administrator silently.
-- Run this by hand in the Supabase SQL editor, one step at a time, and inspect
-- every result before continuing. No real uuid or email belongs in this file.
--
-- A row in public.user_roles is keyed to the auth user id. The username below
-- is only a checksum proving the pasted uuid belongs to the intended profile;
-- it is never stored as authorization identity.


-- ---------------------------------------------------------------------------
-- Step 1. Find the intended auth account. Read only.
-- ---------------------------------------------------------------------------

select id, email, created_at, email_confirmed_at
from auth.users
order by created_at;


-- ---------------------------------------------------------------------------
-- Step 2. Verify the uuid belongs to ChesszDC. Read only.
-- ---------------------------------------------------------------------------

with intended (user_id, username) as (
  values ('PASTE-UUID-FOR-CHESSZDC'::uuid, 'ChesszDC')
)
select
  i.username as intended_username,
  i.user_id as intended_uuid,
  case
    when u.id is null then 'NO SUCH AUTH ACCOUNT. Check the uuid against step 1.'
    else 'auth account exists (' || u.email || ')'
  end as auth_check,
  case
    when p.id is null then 'THAT ACCOUNT HAS NO PROFILE.'
    when p.username_lower is distinct from lower(i.username)
      then 'MISMATCH. That uuid owns the username ' || p.username
    else 'pair ok'
  end as pair_check,
  case
    when ur.role is not null then 'already an admin; step 3 will skip it'
    else 'will be granted admin'
  end as grant_check
from intended i
left join auth.users u on u.id = i.user_id
left join public.profiles p on p.id = i.user_id
left join public.user_roles ur on ur.user_id = i.user_id and ur.role = 'admin';


-- ---------------------------------------------------------------------------
-- Step 3. Grant the role. The only step that writes; safe to rerun.
-- ---------------------------------------------------------------------------

with intended (user_id, username) as (
  values ('PASTE-UUID-FOR-CHESSZDC'::uuid, 'ChesszDC')
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
-- Step 4. Verify. ChesszDC should be the only returned administrator.
-- ---------------------------------------------------------------------------

select
  p.username,
  ur.role,
  ur.user_id,
  u.email,
  ur.created_at as granted_at
from public.user_roles ur
join public.profiles p on p.id = ur.user_id
join auth.users u on u.id = ur.user_id
where ur.role = 'admin'
order by p.username;


-- Revoking remains a deliberate SQL-editor action and is not automated here:
--
--   delete from public.user_roles
--    where user_id = '<the uuid from step 4>' and role = 'admin';
