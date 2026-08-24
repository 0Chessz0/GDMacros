import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import BackToAdmin from "@/components/admin/BackToAdmin";
import { isCurrentUserAdmin } from "@/lib/admin";
import { createClient, getUser } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { ticketDate } from "@/lib/supportTickets";

export const metadata: Metadata = { title: "Review activity", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

interface ActivityRow {
  activity_id: number;
  event: string;
  submission_id: string | null;
  level_name: string | null;
  actor_username: string;
  detail: string | null;
  created_at: string;
}
const LABELS: Record<string, string> = {
  submitted: "submitted a macro",
  review_started: "started reviewing",
  review_released: "returned it to pending",
  details_edited: "edited submission details",
  accepted: "accepted and finalised",
  rejected: "rejected",
  publish_not_started: "started the publisher",
  publish_asset_uploaded: "uploaded the release asset",
  publish_catalog_committed: "committed the catalog",
  publish_live_verified: "verified production",
  publish_error: "hit a publishing error",
};

export default async function AdminActivityPage() {
  if (!isSupabaseConfigured) redirect("/login");
  const user = await getUser();
  if (!user) redirect("/login?next=/admin/activity");
  if (!(await isCurrentUserAdmin())) notFound();
  const supabase = await createClient();
  const { data, error } = await supabase!.rpc("admin_review_activity", { p_limit: 150 });
  const rows = (data ?? []) as ActivityRow[];

  return (
    <div className="mx-auto w-full max-w-[820px] px-4 py-10 sm:px-6 sm:py-14">
      <BackToAdmin />
      <h1 className="text-[22px] font-extrabold tracking-tight text-text sm:text-[26px]">Review activity</h1>
      <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">A private timeline recorded from migration 0014 onward. It contains no submitter email or file contents.</p>

      {error ? (
        <div className="card mt-6 px-6 py-12 text-center text-[13px] text-muted">The timeline is unavailable. Migration 0014 may not be applied yet.</div>
      ) : rows.length === 0 ? (
        <div className="card mt-6 px-6 py-12 text-center text-[13px] text-muted">No review activity has been recorded yet.</div>
      ) : (
        <ol className="relative mt-7 border-l border-border-soft pl-6">
          {rows.map((row) => (
            <li key={row.activity_id} className="relative pb-6 last:pb-0">
              <span className="absolute top-1.5 -left-[29px] h-2.5 w-2.5 rounded-full border-2 border-bg bg-accent" />
              <div className="card px-4 py-3.5">
                <p className="text-[13px] leading-relaxed text-text-dim">
                  <span translate="no" className="notranslate font-bold text-text">{row.actor_username}</span>{" "}
                  {LABELS[row.event] ?? row.event.replaceAll("_", " ")}{row.level_name ? <> <span translate="no" className="notranslate font-semibold text-accent-soft">{row.level_name}</span></> : null}.
                </p>
                {row.detail && <p className="mt-1.5 line-clamp-3 text-[12px] leading-relaxed text-muted">{row.detail}</p>}
                <p className="mt-2 text-[11.5px] text-muted">{ticketDate(row.created_at)}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
