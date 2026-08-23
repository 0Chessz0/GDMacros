import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import LegalNotices from "@/components/admin/LegalNotices";
import BackToAdmin from "@/components/admin/BackToAdmin";
import { isCurrentUserAdmin } from "@/lib/admin";
import { runStatus } from "@/lib/actions/legalNotice";
import { getUser } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { PRIVACY_VERSION, TERMS_VERSION } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Legal notices",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Mail everyone.
 *
 * The tool itself is unchanged; it simply lives on its own page now rather than
 * underneath the review queue. That separation is the point: emailing every
 * account holder should take a deliberate navigation, not a scroll past the
 * thing you actually came to do.
 *
 * The role check runs here, `private.can_send_legal_notice()` runs inside every
 * RPC, and each server action checks again on the request that does the work.
 */
export default async function AdminNoticesPage() {
  if (!isSupabaseConfigured) redirect("/login");

  const user = await getUser();
  if (!user) redirect("/login?next=/admin/notices");
  if (!(await isCurrentUserAdmin())) notFound();

  // Counts only. This never returns a recipient or an address.
  const latestRun = await runStatus();

  return (
    <div className="mx-auto w-full max-w-[860px] px-4 py-10 sm:px-6 sm:py-14">
      <BackToAdmin />

      <h1 className="text-[22px] font-extrabold tracking-tight text-text sm:text-[26px]">
        Mail everyone
      </h1>
      <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">
        For a Terms or Privacy update, or an important account or service message. Every account
        holder receives their own individual email.
      </p>

      <LegalNotices
        termsVersion={TERMS_VERSION}
        privacyVersion={PRIVACY_VERSION}
        initialRun={latestRun.ok && latestRun.runId ? latestRun : null}
      />
    </div>
  );
}
