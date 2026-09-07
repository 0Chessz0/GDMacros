-- Accept native zBot `.gdr` uploads everywhere a recorder value is retained.
--
-- The private Storage object key intentionally remains `.gdr2`: it is an
-- opaque, UUID-derived key and never becomes the public download filename.
-- The application validates the bytes according to `recorder`, then publishes
-- zBot files with `.gdr` and Mega Hack/xdBot files with `.gdr2`.

begin;

alter table public.submissions
  drop constraint if exists submissions_recorder_check;
alter table public.submissions
  add constraint submissions_recorder_check
    check (recorder in ('xdBot', 'Mega Hack', 'zBot'));

alter table public.submission_notifications
  drop constraint if exists submission_notification_recorder_check;
alter table public.submission_notifications
  add constraint submission_notification_recorder_check
    check (recorder is null or recorder in ('xdBot', 'Mega Hack', 'zBot'));

alter table public.published_submissions
  drop constraint if exists published_submission_recorder_check;
alter table public.published_submissions
  add constraint published_submission_recorder_check
    check (recorder in ('xdBot', 'Mega Hack', 'zBot'));

alter table private.macro_quality_checks
  drop constraint if exists macro_quality_checks_recorder_check;
alter table private.macro_quality_checks
  add constraint macro_quality_checks_recorder_check
    check (recorder in ('xdBot', 'Mega Hack', 'zBot'));

commit;
