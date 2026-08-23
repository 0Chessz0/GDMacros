"use client";

import { useCallback, useEffect, useState } from "react";
import { getSiteStats, runHealthChecks } from "@/lib/actions/health";
import {
  CHECK_DESCRIPTIONS,
  STATE_DOT,
  STATE_LABEL,
  countByState,
  isSlow,
  overallState,
  type CheckResult,
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ranAt, setRanAt] = useState<string | null>(null);

  const run = useCallback(async () => {
    setBusy(true);
    setError(null);
    const [health, site] = await Promise.all([runHealthChecks(), getSiteStats()]);
    setBusy(false);

    if (!health.ok) {
      setError(health.error ?? "Could not run the checks.");
      return;
    }
    setResults(health.results ?? []);
    if (site.ok && site.stats) setStats(site.stats);
    setRanAt(new Date().toLocaleTimeString());
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

      <p className="text-[11.5px] leading-relaxed text-muted">
        Traffic and performance numbers live in the Vercel dashboard. Reading them here would need a
        Vercel API token, which would be a new secret whose only job is filling in one panel, so it
        is deliberately not wired up.
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
