-- Claim the reserved owner username.
--
-- NOT a migration. Run this by hand in the Supabase SQL editor before the owner
-- first signs in. The email and uuid checks prevent a typo from attaching the
-- reserved name to the wrong account. Keep real credentials out of this file.


-- ---------------------------------------------------------------------------
-- Step 1. Find the intended auth account. Read only.
-- ---------------------------------------------------------------------------

select id, email, created_at, email_confirmed_at
from auth.users
order by created_at;


-- ---------------------------------------------------------------------------
-- Step 2. Verify the uuid/email pair and name availability. Read only.
-- ---------------------------------------------------------------------------

with intended (id, email, username) as (
  values (
    'PASTE-UUID-FOR-CHESSZDC'::uuid,
    'PASTE-EMAIL-FOR-CHESSZDC',
    'ChesszDC'
  )
)
select
  i.username,
  i.id as intended_id,
  i.email as intended_email,
  case
    when u.id is null then 'NO SUCH ACCOUNT. Check the uuid against step 1.'
    when lower(u.email) is distinct from lower(i.email)
      then 'MISMATCH. That uuid belongs to ' || u.email
    else 'pair ok'
  end as pair_check,
  case
    when p.id is not null
      then 'ALREADY HAS A PROFILE, username ' || p.username || '. It will be left untouched.'
    else 'no profile yet'
  end as profile_check,
  case
    when t.id is not null and t.id is distinct from i.id
      then 'NAME ALREADY TAKEN by a different account.'
    when t.id is not null then 'already held by this same account'
    else 'name free'
  end as name_check
from intended i
left join auth.users u on u.id = i.id
left join public.profiles p on p.id = i.id
left join public.profiles t on t.username_lower = lower(i.username);


-- ---------------------------------------------------------------------------
-- Step 3. Claim the name. The only step that writes; safe to rerun.
-- ---------------------------------------------------------------------------

with intended (id, email, username) as (
  values (
    'PASTE-UUID-FOR-CHESSZDC'::uuid,
    'PASTE-EMAIL-FOR-CHESSZDC',
    'ChesszDC'
  )
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
-- Step 4. Verify the final mapping. Read only; expect one OK row.
-- ---------------------------------------------------------------------------

with intended (id, email, username) as (
  values (
    'PASTE-UUID-FOR-CHESSZDC'::uuid,
    'PASTE-EMAIL-FOR-CHESSZDC',
    'ChesszDC'
  )
)
select
  i.username as intended_username,
  i.email as intended_email,
  p.username as actual_username,
  u.email as actual_email,
  case
    when p.id is null
      then 'MISSING. Nothing was inserted; rerun step 2 and read pair_check.'
    when p.username = i.username and lower(u.email) = lower(i.email)
      then 'OK'
    else 'WRONG. This account holds ' || p.username || ', not ' || i.username
  end as verdict
from intended i
left join public.profiles p on p.id = i.id
left join auth.users u on u.id = p.id;


-- Keep ChesszDC in private.reserved_usernames. That reservation prevents
-- impersonation if the owner account is ever deleted or renamed away.
