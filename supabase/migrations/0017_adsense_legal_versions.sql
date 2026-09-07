-- Advertising changes both public legal documents, so mirror their new
-- versions into the server-owned source used to stamp new signup acceptances.

begin;

update private.legal_documents
   set version = '2026-09-07',
       effective_date = '2026-09-07',
       updated_at = now()
 where doc = 'terms';

update private.legal_documents
   set version = '2026-09-07',
       effective_date = '2026-09-07',
       updated_at = now()
 where doc = 'privacy';

do $$
begin
  if not exists (
    select 1 from private.legal_documents
     where doc = 'terms' and version = '2026-09-07'
  ) or not exists (
    select 1 from private.legal_documents
     where doc = 'privacy' and version = '2026-09-07'
  ) then
    raise exception 'advertising legal versions were not updated';
  end if;
end;
$$;

commit;
