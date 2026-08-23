import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import NotificationCenter from "@/components/notifications/NotificationCenter";
import { BellIcon } from "@/components/icons";
import { getUserAndProfile } from "@/lib/profile";
import { resolvePublishedSubmissions } from "@/lib/publishedSubmissions";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import {
  NOTIFICATION_COLUMNS,
  PUBLISHED_SUBMISSION_COLUMNS,
  type NotificationRow,
  type PublishedSubmissionRow,
} from "@/lib/submissions";

export const metadata: Metadata = {
  title: "Notifications",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  if (!isSupabaseConfigured) redirect("/login");

  const { user, profile } = await getUserAndProfile();
  if (!user) redirect("/login?next=/notifications");
  if (!profile) redirect("/welcome");

  const supabase = await createClient();
  const [notificationResult, publishedResult] = await Promise.all([
    supabase!
      .from("submission_notifications")
      .select(NOTIFICATION_COLUMNS)
      .order("created_at", { ascending: false }),
    supabase!
      .from("published_submissions")
      .select(PUBLISHED_SUBMISSION_COLUMNS)
      .order("published_at", { ascending: false }),
  ]);

  const notifications = (notificationResult.data ?? []) as NotificationRow[];
  const published = resolvePublishedSubmissions(
    (publishedResult.data ?? []) as PublishedSubmissionRow[],
  );
  const hrefBySubmission = Object.fromEntries(
    published
      .filter((item) => item.macro_href)
      .map((item) => [item.submission_id, item.macro_href as string]),
  );

  return (
    <div className="mx-auto w-full max-w-[720px] px-4 py-10 sm:px-6 sm:py-14">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl border border-border bg-surface text-accent-soft">
            <BellIcon className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-[22px] font-extrabold tracking-tight text-text sm:text-[26px]">
              Notifications
            </h1>
            <p className="mt-1 text-[13px] text-muted">Results from your macro submissions.</p>
          </div>
        </div>
        <Link href="/settings" className="text-[12.5px] font-medium text-accent-soft hover:underline">
          Email settings
        </Link>
      </div>

      <NotificationCenter initial={notifications} hrefBySubmission={hrefBySubmission} />
    </div>
  );
}

