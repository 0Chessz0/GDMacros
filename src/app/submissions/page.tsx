import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import MySubmissions from "@/components/submissions/MySubmissions";
import { getUserAndProfile } from "@/lib/profile";
import { resolvePublishedSubmissions } from "@/lib/publishedSubmissions";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  NOTIFICATION_COLUMNS,
  OWN_COLUMNS,
  PUBLISHED_SUBMISSION_COLUMNS,
  type NotificationRow,
  type PublishedSubmissionRow,
  type SubmissionRow,
} from "@/lib/submissions";

export const metadata: Metadata = {
  title: "Your submissions",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function SubmissionsPage() {
  if (!isSupabaseConfigured) redirect("/login");

  const { user, profile } = await getUserAndProfile();
  if (!user) redirect("/login?next=/submissions");
  if (!profile) redirect("/welcome");

  const supabase = await createClient();

  // No user_id filter is needed on either query: the select policies already
  // scope both tables to the caller's own rows. Filtering here would be a
  // comment, not a control. Only the columns a submitter should see are
  // requested, so no storage path and no admin identity reaches the page.
  const [live, outcomes, accepted] = await Promise.all([
    supabase!.from("submissions").select(OWN_COLUMNS).order("created_at", { ascending: false }),
    supabase!
      .from("submission_notifications")
      .select(NOTIFICATION_COLUMNS)
      .order("created_at", { ascending: false }),
    supabase!
      .from("published_submissions")
      .select(PUBLISHED_SUBMISSION_COLUMNS)
      .order("published_at", { ascending: false }),
  ]);

  const data = live.data as SubmissionRow[] | null;
  const notifications = outcomes.data as NotificationRow[] | null;
  const published = resolvePublishedSubmissions(
    (accepted.data ?? []) as PublishedSubmissionRow[],
  );

  return (
    <div className="mx-auto w-full max-w-[720px] px-4 py-10 sm:px-6 sm:py-14">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-extrabold tracking-tight text-text sm:text-[26px]">
            Your submissions
          </h1>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">
            What you have sent in, and how each one turned out.
          </p>
        </div>
        <Link
          href="/submit"
          className="rounded-xl bg-accent px-4 py-2.5 text-[13.5px] font-semibold text-white transition-[background-color,transform] duration-200 ease-out hover:bg-accent-hover active:scale-95 active:duration-75"
        >
          Submit a macro
        </Link>
      </div>

      <MySubmissions
        rows={data ?? []}
        notifications={notifications ?? []}
        published={published}
      />
    </div>
  );
}
