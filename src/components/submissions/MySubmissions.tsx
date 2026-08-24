"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { ChevronDownIcon } from "@/components/icons";
import { withdrawSubmission } from "@/lib/actions/submissions";
import type { OwnedMacroView } from "@/lib/publishedSubmissions";
import { STATUS_LABEL, formatDate, type SubmissionRow } from "@/lib/submissions";

function StatusPill({ status }: { status: string }) {
  const tone =
    status === "processing"
      ? "border-accent/40 bg-accent/10 text-accent-soft"
      : "border-amber/40 bg-amber/10 text-amber";
  return (
    <span className={`rounded-lg border px-2 py-0.5 text-[11.5px] font-semibold ${tone}`}>
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

/**
 * What a submitter sees: submissions still in play, and a collapsed record of
 * the ones already published.
 *
 * Accepted and rejected RESULTS deliberately do not appear here. They live in
 * the notification centre, which is the one place a result is read and
 * dismissed. Showing the same outcome in two places made "dismiss" ambiguous:
 * it was never clear whether it cleared the notice or the history.
 */
export default function MySubmissions({
  rows,
  owned,
  profileHref,
}: {
  rows: SubmissionRow[];
  /** Every published macro that is theirs, newest first. */
  owned: OwnedMacroView[];
  /** The visitor's own public profile, or null if nothing is credited to them yet. */
  profileHref: string | null;
}) {
  const [items, setItems] = useState(rows);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function onWithdraw(id: string) {
    setError(null);
    setBusyId(id);
    startTransition(async () => {
      const res = await withdrawSubmission(id);
      if (res.ok) setItems((list) => list.filter((s) => s.id !== id));
      else setError(res.error);
      setBusyId(null);
    });
  }

  const nothingAtAll = items.length === 0 && owned.length === 0;

  if (nothingAtAll) {
    return (
      <div className="card flex flex-col items-center gap-3 px-6 py-16 text-center">
        <p className="text-[15px] font-semibold text-text">Nothing submitted yet</p>
        <p className="max-w-sm text-[13px] text-muted">
          When you send a macro in, it appears here with its status while it waits for review.
        </p>
        <Link
          href="/submit"
          className="mt-1 rounded-lg bg-accent px-3.5 py-2 text-[13px] font-medium text-white transition-[background-color,transform] duration-200 ease-out hover:bg-accent-hover active:scale-95 active:duration-75"
        >
          Submit a macro
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-rose/40 bg-rose/10 px-3.5 py-2.5 text-[12.5px] text-rose"
        >
          {error}
        </div>
      )}

      {owned.length > 0 && (
        <details className="group card overflow-hidden">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-4 marker:content-none sm:px-5">
            <span>
              <span className="text-[13.5px] font-bold text-text">Accepted &amp; live</span>
              <span className="ml-2 rounded-md border border-green/30 bg-green/10 px-2 py-0.5 text-[11px] font-semibold text-green tabular-nums">
                {owned.length}
              </span>
              <span className="mt-1 block text-[12px] font-normal text-muted">
                Your macros on the site
              </span>
            </span>
            <ChevronDownIcon className="h-4 w-4 shrink-0 text-muted transition-transform group-open:rotate-180" />
          </summary>

          <div className="border-t border-border-soft px-4 py-2 sm:px-5">
            {owned.map((item) => (
              <div
                key={item.key}
                className="flex flex-col gap-2 border-b border-border-soft py-3.5 last:border-b-0 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate text-[13.5px] font-bold text-text" translate="no">
                    {item.levelName}
                  </p>
                  <p className="mt-1 text-[12px] text-muted">
                    ID <span className="tabular-nums">{item.levelId}</span> · {item.recorder}
                    {/* Only worth naming when it is not simply you. */}
                    {item.submittedByYou && item.macroAuthor !== undefined && (
                      <> · by <span translate="no" className="notranslate text-text-dim">{item.macroAuthor}</span></>
                    )}
                  </p>
                  {item.addedAt && (
                    <p className="mt-1 text-[11.5px] text-muted">Added {formatDate(item.addedAt)}</p>
                  )}
                </div>
                {item.href ? (
                  <Link
                    href={item.href}
                    className="shrink-0 text-[12.5px] font-medium text-accent-soft hover:underline"
                  >
                    View live macro
                  </Link>
                ) : (
                  <span className="shrink-0 text-[11.5px] text-muted">Live catalog entry</span>
                )}
              </div>
            ))}

            {profileHref && (
              <p className="border-t border-border-soft py-3 text-[11.5px] leading-relaxed text-muted">
                These are also on{" "}
                <Link href={profileHref} className="text-accent-soft hover:underline">
                  your public profile
                </Link>
                , which is what everyone else sees.
              </p>
            )}
          </div>
        </details>
      )}

      {items.length > 0 && (
        <section>
          <h2 className="mb-2.5 text-[13px] font-bold text-text-dim">In progress</h2>
          <div className="flex flex-col gap-3">
            {items.map((s) => (
              <div key={s.id} className="card p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[14.5px] font-bold text-text">{s.level_name}</p>
                    <p className="mt-0.5 text-[12.5px] text-muted">
                      ID <span className="tabular-nums">{s.level_id}</span> &middot; {s.recorder}
                    </p>
                  </div>
                  <StatusPill status={s.status} />
                </div>

                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[12.5px] text-muted">
                  <span>
                    Macro author{" "}
                    <span translate="no" className="notranslate font-medium text-text-dim">
                      {s.macro_author}
                    </span>
                  </span>
                  <span>Submitted {formatDate(s.created_at)}</span>
                </div>

                {s.status === "processing" && (
                  <p className="mt-3 text-[12.5px] leading-relaxed text-muted">
                    Someone is publishing this now. The result arrives in your notifications.
                  </p>
                )}

                {s.status === "pending" && (
                  <div className="mt-3.5 border-t border-border-soft pt-3.5">
                    <button
                      type="button"
                      onClick={() => onWithdraw(s.id)}
                      disabled={busyId === s.id}
                      className="rounded-lg border border-border bg-surface px-3.5 py-2 text-[12.5px] font-semibold text-text-dim transition-[background-color,border-color,transform,color] duration-200 ease-out hover:border-rose/40 hover:text-rose active:scale-95 active:duration-75 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {busyId === s.id ? "Withdrawing..." : "Withdraw"}
                    </button>
                    <p className="mt-2 text-[12px] text-muted">
                      You can take this back while it is still pending.
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
