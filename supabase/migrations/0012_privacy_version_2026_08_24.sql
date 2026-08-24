-- Mirror the rewritten Privacy Policy version into the database.
--
-- Run with `npx supabase db push` after 0011. Migrations 0001 to 0011 are
-- applied history and are untouched.
--
-- WHY THIS EXISTS AT ALL
-- ----------------------
-- The signup trigger stamps an acceptance record from `private.legal_documents`
-- rather than from anything the browser sends, so the database needs its own
-- copy of the current version. `src/lib/legal.ts` is the app's copy, and
-- `npm run test:legal` asserts the two agree. Bumping one without the other
-- fails the suite instead of quietly recording a version nobody published.
--
-- WHAT CHANGED IN THE DOCUMENT
-- ----------------------------
-- The policy was reorganised by category of data and purpose rather than by
-- feature. It previously grew a section per feature, which meant it needed
-- editing on every release, and a document that must be edited every release is
-- one that eventually ships wrong. Nothing about what is collected changed; the
-- same facts are described in a form that stays true as features are added.
--
-- Terms are untouched and keep their existing version.

begin;

update private.legal_documents
   set version = '2026-08-24',
       effective_date = '2026-08-24',
       updated_at = now()
 where doc = 'privacy';

-- Fails loudly rather than silently doing nothing if the row is missing.
do $$
begin
  if not exists (
    select 1 from private.legal_documents
     where doc = 'privacy' and version = '2026-08-24'
  ) then
    raise exception 'privacy version row was not updated';
  end if;
end;
$$;

commit;
