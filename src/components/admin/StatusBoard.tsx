"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getOperationsSummary,
  getSiteStats,
  getTrafficStats,
  runHealthChecks,
} from "@/lib/actions/health";
import type { TrafficSummary } from "@/lib/vercelAnalytics";
import {
  CHECK_DESCRIPTIONS,
  STATE_DOT,
  STATE_LABEL,
  countByState,
  isSlow,
  needsAttention,
  overallState,
  type CheckResult,
  type OperationsSummary,
  type SiteStats,
} from "@/lib/health";

/**
 * The status board.
 *
 * Everything shown here is produced on the server, because most of the probes
 * need a credential the browser must never hold. This component asks "how is
 * everything" and renders seven labels, seven states and a handful of counts.
 *
 * Checks are run on demand rather than on a timer. They hit real third parties,
 * and a status page that quietly polls seven services forever is a good way to
 * become someone else's rate limit problem.
 */
export default function StatusBoard() {
  const [results, setResults] = useState<CheckResult[] | null>(null);
  const [stats, setStats] = useState<SiteStats | null>(null);
  const [traffic, setTraffic] = useState<TrafficSummary | null>(null);
  const [trafficNote, setTrafficNote] = useState<string | null>(null);
  const [ops, setOps] = useState<OperationsSummary | null>(null);
  const [opsNote, setOpsNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ranAt, setRanAt] = useState<string | null>(null);

  const run = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const [health, site, visits, operations] = await Promise.all([
        runHealthChecks(),
        getSiteStats(),
        getTrafficStats(),
        getOperationsSummary(),
      ]);

      if (!health.ok) {
        setError(health.error ?? "Could not run the checks.");
        return;
      }
      setResults(health.results ?? []);
      if (site.ok && site.stats) setStats(site.stats);
      setTraffic(visits.ok ? (visits.traffic ?? null) : null);
      setTrafficNote(visits.error ?? null);
      setOps(operations.ok ? (operations.ops ?? null) : null);
      setOpsNote(operations.ok ? null : (operations.error ?? null));
      setRanAt(new Date().toLocaleTimeString());
    } catch {
      setError("Could not run the checks.");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void run();
  }, [run]);

  const overall = results ? overallState(results) : null;
  const counts = results ? countByState(results) : null;

  return (
    <div className="mt-6 flex flex-col gap-8">
      {/* ---- services ---- */}
      <section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <h2 className="text-[17px] font-bold text-text">Services</h2>
            {overall && (
              <span className="inline-flex items-center gap-1.5 rounded-md bg-surface-2 px-2 py-0.5 text-[11.5px] font-semibold text-text-dim">
                <span className={`h-2 w-2 rounded-full ${STATE_DOT[overall]}`} />
                {counts?.down ? `${counts.down} down` : counts?.degraded ? `${counts.degraded} degraded` : "All responding"}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={run}
            disabled={busy}
            className="rounded-lg border border-border px-3 py-1.5 text-[12.5px] font-semibold text-text-dim transition-colors hover:border-accent/40 hover:text-text disabled:opacity-60"
          >
            {busy ? "Checking..." : "Run checks"}
          </button>
        </div>

        {ranAt && !busy && (
          <p className="mt-1.5 text-[11.5px] text-muted">Last checked at {ranAt}.</p>
        )}
        {error && <p className="mt-3 text-[12.5px] text-rose">{error}</p>}

        <div className="mt-4 flex flex-col gap-2.5">
          {(results ?? []).map((r) => (
            <div key={r.id} className="card flex flex-wrap items-start gap-x-4 gap-y-2 px-4 py-3.5">
              <div className="flex min-w-0 flex-1 items-start gap-3">
                {/* Colour and text together: a status is never conveyed by
                    colour alone, which matters most for the red/green pair. */}
                <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${STATE_DOT[r.state]}`} />
                <div className="min-w-0">
                  <p className="text-[14px] font-bold text-text">{r.label}</p>
                  <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted">
                    {CHECK_DESCRIPTIONS[r.id]}
                  </p>
                  <p className="mt-1 text-[12.5px] text-text-dim">{r.detail}</p>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-3 text-[12px]">
                <span
                  className={
                    r.state === "ok" ? "text-green" : r.state === "degraded" ? "text-amber-400" : "text-rose"
                  }
                >
                  {STATE_LABEL[r.state]}
                </span>
                {r.ms !== null && (
                  <span className={`tabular-nums ${isSlow(r) ? "text-amber-400" : "text-muted"}`}>
                    {r.ms} ms
                  </span>
                )}
              </div>
            </div>
          ))}

          {busy && !results && (
            <div className="card px-6 py-10 text-center text-[13px] text-muted">
              Checking every service...
            </div>
          )}
        </div>
      </section>

      {/* ---- work waiting on a person ---- */}
      <section>
        <h2 className="text-[17px] font-bold text-text">Needs attention</h2>

        {ops ? (
          needsAttention(ops) ? (
            <>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
                Work that has stopped and is waiting for someone. Counts only; the detail is in the
                review queue and the provider dashboards.
              </p>
              <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
                <Attention label="Publications holding an error" value={ops.stuckPublishes} />
                <Attention label="Result emails needing review" value={ops.resultEmailsNeedingReview} />
                <Attention label="Result emails failed" value={ops.resultEmailsFailed} />
                <Attention label="Notice batches needing review" value={ops.noticeBatchesNeedingReview} />
              </div>
            </>
          ) : (
            <p className="mt-2 text-[13px] text-green">Nothing is stuck.</p>
          )
        ) : (
          <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
            {opsNote ?? "Not available."}
          </p>
        )}

        {ops && ops.resultEmailsPending > 0 && (
          <p className="mt-2.5 text-[11.5px] leading-relaxed text-muted">
            {ops.resultEmailsPending} result email
            {ops.resultEmailsPending === 1 ? "" : "s"} queued. Normal for a moment after a decision;
            worth a look if it stays.
          </p>
        )}
      </section>

      {/* ---- numbers ---- */}
      {stats && (
        <section>
          <h2 className="text-[17px] font-bold text-text">Catalog and queue</h2>

          <div className="mt-4 grid gap-2.5 sm:grid-cols-3">
            <Stat label="Levels" value={stats.levels} />
            <Stat label="Macros" value={stats.macros} />
            <Stat label="Accounts" value={stats.accounts} />
            <Stat label="Pending review" value={stats.pendingSubmissions} />
            <Stat label="Being published" value={stats.processingSubmissions} />
            <Stat label="Environment" value={stats.env} />
          </div>

          {stats.recorders.length > 0 && (
            <div className="card mt-2.5 px-4 py-3.5">
              <p className="text-[11px] font-semibold tracking-wider text-muted uppercase">
                By recorder
              </p>
              <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5 text-[13px] text-text-dim">
                {stats.recorders.map((r) => (
                  <span key={r.recorder} translate="no" className="notranslate">
                    {r.recorder} <span className="font-bold text-text tabular-nums">{r.count}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {stats.commit && (
            <p className="mt-3 text-[11.5px] text-muted">
              This build is{" "}
              <span className="font-mono text-text-dim">{stats.commit.slice(0, 7)}</span>
              {stats.ref ? ` on ${stats.ref}` : ""}.
            </p>
          )}
        </section>
      )}

      {/* ---- traffic ---- */}
      <section>
        <h2 className="text-[17px] font-bold text-text">Traffic</h2>

        {traffic ? (
          <>
            <p className="mt-1.5 text-[11.5px] text-muted">
              Vercel Web Analytics production traffic, {traffic.since} to {traffic.until}.
            </p>

            <div className="mt-4 grid gap-2.5 sm:grid-cols-3">
              <Stat label="Page views" value={traffic.pageviews} />
              <Stat label="Visitors" value={traffic.visitors} />
              <Stat label="Days with traffic" value={traffic.days?.length ?? null} />
            </div>

            {trafficNote && (
              <p className="mt-2 text-[11.5px] text-amber-400">{trafficNote}.</p>
            )}

            {traffic.days && traffic.days.length > 0 && <Sparkline days={traffic.days} />}

            {traffic.pages && traffic.pages.length > 0 && (
              <div className="card mt-2.5 px-4 py-3.5">
                <p className="text-[11px] font-semibold tracking-wider text-muted uppercase">
                  Busiest pages
                </p>
                <div className="mt-2 flex flex-col gap-1.5">
                  {traffic.pages.map((page) => (
                    <div key={page.path} className="flex items-baseline justify-between gap-4 text-[13px]">
                      <span className="min-w-0 truncate text-text-dim">{page.path}</span>
                      <span className="shrink-0 text-muted tabular-nums">
                        <span className="font-bold text-text">{page.pageviews}</span> views
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
            {/*
              The environment variable is named in the docs, not here. Its name
              is not a secret, but every other credential name is kept out of
              the client bundle as a matter of course and this is no different.
            */}
            {trafficNote
              ? `Traffic is unavailable right now. ${trafficNote}.`
              : "Traffic is not configured here. Add a Vercel access token that can reach this project to show page views and visitors."}
          </p>
        )}
      </section>
    </div>
  );
}

/**
 * A bar per day.
 *
 * Deliberately not a charting library: seven bars do not justify a dependency,
 * and every bar carries its day and count as a title so the shape is readable
 * without hovering blindly. Heights are relative to the busiest day, with a
 * floor so a quiet day is still visible rather than a zero-height sliver.
 */
function Sparkline({ days }: { days: { day: string; pageviews: number; visitors: number }[] }) {
  const peak = Math.max(...days.map((d) => d.pageviews), 1);
  const accessibleSummary = days.map((d) => `${d.day}: ${d.pageviews}`).join(", ");
  return (
    <div
      className="card mt-2.5 px-4 py-3.5"
      role="img"
      aria-label={`Page views by day. ${accessibleSummary}`}
    >
      <p className="text-[11px] font-semibold tracking-wider text-muted uppercase">Page views by day</p>
      <div className="mt-3 flex h-20 items-end gap-1.5">
        {days.map((d) => (
          <div key={d.day} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
            <div
              className="w-full rounded-sm bg-accent/70"
              style={{ height: `${Math.max(4, (d.pageviews / peak) * 100)}%` }}
              title={`${d.day}: ${d.pageviews} views, ${d.visitors} visitors`}
              aria-hidden="true"
            />
            <span className="truncate text-[10px] text-muted tabular-nums">{d.day.slice(5)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Zero is quiet, anything else is loud. */
function Attention({ label, value }: { label: string; value: number }) {
  const bad = value > 0;
  return (
    <div className={`card px-4 py-3 ${bad ? "border-rose/40" : ""}`}>
      <p className="text-[11px] font-semibold tracking-wider text-muted uppercase">{label}</p>
      <p className={`mt-1 text-[18px] font-bold tabular-nums ${bad ? "text-rose" : "text-text"}`}>
        {value}
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string | null }) {
  return (
    <div className="card px-4 py-3">
      <p className="text-[11px] font-semibold tracking-wider text-muted uppercase">{label}</p>
      <p className="mt-1 text-[18px] font-bold text-text tabular-nums">
        {value === null ? <span className="text-[14px] font-normal text-muted">Unavailable</span> : value}
      </p>
    </div>
  );
}
