import { randomInt } from "node:crypto";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import BackToAdmin from "@/components/admin/BackToAdmin";
import QualityCheckCard, { type QualityCandidate } from "@/components/admin/QualityCheckCard";
import { isCurrentUserAdmin } from "@/lib/admin";
import { getAllLevels } from "@/lib/macros";
import { createClient, getUser } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { ticketDate } from "@/lib/supportTickets";

export const metadata: Metadata = { title: "Random quality check", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

interface QualityHistoryRow {
  check_id: string;
  download_url: string;
  level_name: string;
  macro_author: string;
  recorder: string;
  outcome: "good" | "issue";
  note: string | null;
  checked_by_username: string;
  created_at: string;
}
export default async function AdminQualityPage() {
  if (!isSupabaseConfigured) redirect("/login");
  const user = await getUser();
  if (!user) redirect("/login?next=/admin/quality");
  if (!(await isCurrentUserAdmin())) notFound();
  const supabase = await createClient();
  const historyResult = await supabase!.rpc("list_macro_quality_checks", { p_limit: 30 });
  const history = (historyResult.data ?? []) as QualityHistoryRow[];
  const checkedRecently = new Set(history.map((row) => row.download_url));
  const all: QualityCandidate[] = getAllLevels().flatMap((level) => level.macros.map((macro) => ({
    levelName: level.name,
    levelId: String(level.levelId),
    levelSlug: level.slug,
    creator: level.creator,
    macroAuthor: macro.author,
    recorder: macro.recorder,
    downloadUrl: macro.downloadLink,
    videoUrl: level.video ?? null,
  })));
  const fresh = all.filter((macro) => !checkedRecently.has(macro.downloadUrl));
  const pool = fresh.length > 0 ? fresh : all;
  const candidate = pool.length > 0 ? pool[randomInt(pool.length)] : null;

  return (
    <div className="mx-auto w-full max-w-[800px] px-4 py-10 sm:px-6 sm:py-14">
      <BackToAdmin />
      <h1 className="text-[22px] font-extrabold tracking-tight text-text sm:text-[26px]">Random quality check</h1>
      <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">Spot-check a live download whenever you have time. Recently checked macros are avoided until the catalog has cycled.</p>
      {candidate ? <QualityCheckCard candidate={candidate} /> : <div className="card mt-6 px-6 py-12 text-center text-[13px] text-muted">The catalog is empty.</div>}

      <section className="mt-9">
        <h2 className="text-[16px] font-bold text-text">Recent checks</h2>
        {historyResult.error ? (
          <p className="mt-3 text-[12.5px] text-muted">History is unavailable. Migration 0014 may not be applied yet.</p>
        ) : history.length === 0 ? (
          <p className="mt-3 text-[12.5px] text-muted">No quality checks recorded yet.</p>
        ) : (
          <div className="mt-3 flex flex-col gap-2.5">
            {history.slice(0, 12).map((row) => (
              <div key={row.check_id} className="card flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p translate="no" className="notranslate truncate text-[13.5px] font-bold text-text">{row.level_name} · {row.recorder}</p>
                  <p className="mt-0.5 text-[11.5px] text-muted">{row.checked_by_username} · {ticketDate(row.created_at)}{row.note ? ` · ${row.note}` : ""}</p>
                </div>
                <span className={`w-fit rounded-full border px-2.5 py-1 text-[11.5px] font-semibold ${row.outcome === "good" ? "border-green/40 bg-green/10 text-green" : "border-rose/40 bg-rose/10 text-rose"}`}>{row.outcome === "good" ? "Good" : "Issue"}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
