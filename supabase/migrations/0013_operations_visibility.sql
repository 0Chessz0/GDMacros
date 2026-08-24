-- Make stuck work visible on the admin status page.
--
-- Run with `npx supabase db push` after 0012. Migrations 0001 to 0012 are
-- applied history and are untouched.
--
-- THREE SUBSYSTEMS CAN STOP AND WAIT FOR A HUMAN, AND NONE OF THEM SAY SO.
--
--   * a publication can end holding an error, having uploaded an asset or
--     committed a catalog entry but not finished;
--   * a submission-result email can end `needs_review`, meaning it may or may
--     not have been delivered;
--   * a legal-notice batch can end `needs_review` for the same reason.
--
-- All three live in the `private` schema, which PostgREST does not expose, so
-- the admin status page could not see them even though it is the obvious place
-- to look. Somebody would find out by chance, days later. This adds one
-- read-only RPC returning COUNTS.
--
-- NOT DONE HERE: reserving catalog author names.
--
-- It was considered, because a profile now presents every macro credited to a
-- name as that person's work, so claiming a prolific author's name would hand
-- somebody else's macros to a stranger. It turned out to be almost entirely
-- solved already and actively harmful to finish: the catalog has three distinct
-- authors, `chesszdc` and `spypiexj8` were reserved back in 0001, and the third
-- is a real contributor with one macro. Reserving that name would stop the
-- person who recorded it from ever signing up under it, which is a worse
-- outcome than the risk it removes. Worth revisiting only if the catalog gains
-- many credits from people without accounts.

begin;

-- ---------------------------------------------------------------------------
-- 1. Operational counts for the admin status page
-- ---------------------------------------------------------------------------

/**
 * How much work is stuck, as numbers only.
 *
 * Deliberately returns counts and nothing else. No submission id, no level, no
 * account, no error text: the status page answers "is anything wrong", and the
 * detail for acting on it lives in the review queue and the provider dashboard
 * where it can be seen in context. A status board that leaks a recipient or a
 * raw provider error is a worse trade than one that says "3".
 *
 * `stuck_publishes` counts publications that recorded an error, not merely ones
 * in progress. A publication mid-flight is normal and would otherwise make this
 * page cry wolf every time somebody presses Accept.
 */
create or replace function public.admin_operations_summary()
  returns table (
    stuck_publishes integer,
    result_emails_needing_review integer,
    result_emails_failed integer,
    result_emails_pending integer,
    notice_batches_needing_review integer
  )
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'not authorised';
  end if;

  return query
  select
    (select count(*)::int
       from private.submission_publish_state ps
      where ps.last_error is not null),

    (select count(*)::int
       from private.submission_result_email_jobs j
      where j.status = 'needs_review'),

    (select count(*)::int
       from private.submission_result_email_jobs j
      where j.status = 'failed'),

    -- Queued but not yet delivered. Healthy for a moment, worth looking at if
    -- it stays high, because delivery is opportunistic rather than scheduled.
    (select count(*)::int
       from private.submission_result_email_jobs j
      where j.status = 'pending'),

    (select count(distinct d.batch_number)::int
       from private.legal_notice_deliveries d
      where d.status = 'needs_review');
end;
$$;

revoke all on function public.admin_operations_summary() from public;
revoke all on function public.admin_operations_summary() from anon;
grant execute on function public.admin_operations_summary() to authenticated;

commit;
