-- Remove the former owner identity from privileged account configuration.
--
-- The auth account was already removed, so its profile and role rows should
-- have disappeared through their foreign-key cascades. The scoped role delete
-- is defence in depth if the account was disabled rather than fully deleted.
-- Releasing the separate reservation makes the username available through the
-- normal username RPC without changing historical macro credits.

begin;

delete from public.user_roles r
using public.profiles p
where r.user_id = p.id
  and r.role = 'admin'
  and p.username_lower = 'spypiexj8';

delete from private.reserved_usernames
where name_lower = 'spypiexj8';

commit;
