"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { withdrawSubmission } from "@/lib/actions/submissions";
import { STATUS_LABEL, formatDate, type SubmissionRow } from "@/lib/submissions";

function StatusPill({ status }: { status: string }) {
  const tone =
    status === "approved"
      ? "border-green/40 bg-green/10 text-green"
      : status === "rejected"
        ? "border-rose/40 bg-rose/10 text-rose"
        : "border-amber/40 bg-amber/10 text-amber";
  return (
    <span className={`rounded-lg border px-2 py-0.5 text-[11.5px] font-semibold ${tone}`}>
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

/** One row per submission. The withdraw button only exists while pending. */
export default function MySubmissions({ rows }: { rows: SubmissionRow[] }) {
  const [items, setItems] = useState(rows);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function onWithdraw(id: string) {
    setError(null);
    setBusyId(id);
    startTransition(async () => {
      const res = await withdrawSubmission(id);
      if (res.ok) {
        setItems((list) => list.filter((s) => s.id !== id));
      } else {
        // The database is the authority. If it says no, the row is stale, so
        // the message explains rather than pretending the button still works.
        setError(res.error);
      }
      setBusyId(null);
    });
  }

  if (items.length === 0) {
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
    <div className="flex flex-col gap-3">
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-rose/40 bg-rose/10 px-3.5 py-2.5 text-[12.5px] text-rose"
        >
          {error}
        </div>
      )}

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
            {s.reviewed_at && <span>Reviewed {formatDate(s.reviewed_at)}</span>}
          </div>

          {s.status === "rejected" && s.rejection_reason && (
            <div className="mt-3 rounded-xl border border-rose/30 bg-rose/5 px-3.5 py-2.5">
              <p className="text-[12px] font-semibold text-rose">Why it was turned down</p>
              <p className="mt-1 text-[12.5px] leading-relaxed text-text-dim">
                {s.rejection_reason}
              </p>
            </div>
          )}

          {s.status === "approved" && (
            <p className="mt-3 text-[12.5px] leading-relaxed text-muted">
              Passed review. It still gets uploaded and listed by hand, so give it a little time to
              appear on the site.
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
  );
}
