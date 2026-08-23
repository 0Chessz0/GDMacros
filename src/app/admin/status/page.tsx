import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import StatusBoard from "@/components/admin/StatusBoard";
import BackToAdmin from "@/components/admin/BackToAdmin";
import { isCurrentUserAdmin } from "@/lib/admin";
import { getUser } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const metadata: Metadata = {
  title: "Statistics",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Statistics.
 *
 * Answers one question: is everything the site depends on actually working. The
 * seven probes run on the server, because most of them exercise a credential
 * the browser must never hold, and they are all READS: nothing here uploads,
 * commits, sends or deletes, so opening this page cannot cause anything to
 * happen.
 *
 * The role is checked here, and again inside `runHealthChecks` and
 * `getSiteStats` on every call.
 */
export default async function AdminStatusPage() {
  if (!isSupabaseConfigured) redirect("/login");

  const user = await getUser();
  if (!user) redirect("/login?next=/admin/status");
  if (!(await isCurrentUserAdmin())) notFound();

  return (
    <div className="mx-auto w-full max-w-[860px] px-4 py-10 sm:px-6 sm:py-14">
      <BackToAdmin />

      <h1 className="text-[22px] font-extrabold tracking-tight text-text sm:text-[26px]">
        Statistics
      </h1>
      <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">
        Whether every service the site depends on is responding, and how big the catalog and the
        queue currently are. Every check is a read.
      </p>

      <StatusBoard />
    </div>
  );
}
