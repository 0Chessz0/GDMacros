"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { ChevronDownIcon } from "@/components/icons";
import { dismissNotification, withdrawSubmission } from "@/lib/actions/submissions";
import {
  STATUS_LABEL,
  formatDate,
  type NotificationRow,
  type PublishedSubmissionView,
  type SubmissionRow,
} from "@/lib/submissions";

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
 * What a submitter sees: submissions still in play, dismissible result notices,
 * and the durable account-linked record of accepted items that are live.
 *
 * An outcome is a separate, tiny row. The submission itself is deleted once it
 * is accepted or rejected, so nothing here can show a file, a video, notes or
 * anything else about a rejected submission, because none of it still exists.
 */
export default function MySubmissions({
  rows,
  notifications,
  published,
}: {
  rows: SubmissionRow[];
  notifications: NotificationRow[];
  published: PublishedSubmissionView[];
}) {
  const [items, setItems] = useState(rows);
  const [notes, setNotes] = useState(notifications);
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

  function onDismiss(id: string) {
    setError(null);
    setBusyId(id);
    startTransition(async () => {
      const res = await dismissNotification(id);
      if (res.ok) {
        setNotes((list) => list.filter((n) => n.id !== id));
        window.dispatchEvent(new CustomEvent("gdmacros:notifications-read"));
      } else setError(res.error);
      setBusyId(null);
    });
  }

  const nothingAtAll = items.length === 0 && notes.length === 0 && published.length === 0;

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

      {notes.length > 0 && (
        <section>
          <h2 className="mb-2.5 text-[13px] font-bold text-text-dim">Results</h2>
          <div className="flex flex-col gap-2.5">
            {notes.map((n) => (
              <div
                key={n.id}
                className={`card p-4 ${
                  n.outcome === "accepted" ? "border-green/30" : "border-rose/30"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="text-[13.5px] leading-relaxed text-text">
                    Your submission for{" "}
                    <span className="font-bold">{n.level_name}</span>{" "}
                    {n.outcome === "accepted" ? (
                      <span className="font-semibold text-green">was accepted.</span>
                    ) : (
                      <span className="font-semibold text-rose">was rejected.</span>
                    )}
                  </p>
                  <button
                    type="button"
                    onClick={() => onDismiss(n.id)}
                    disabled={busyId === n.id}
                    className="shrink-0 text-[12px] text-muted transition-colors hover:text-text-dim disabled:opacity-60"
                  >
                    {busyId === n.id ? "Dismissing..." : "Dismiss"}
                  </button>
                </div>

                {n.outcome === "rejected" && n.rejection_reason && (
                  <p className="mt-2 text-[12.5px] leading-relaxed text-text-dim">
                    <span className="text-muted">Reason:</span> {n.rejection_reason}
                  </p>
                )}
                {n.outcome === "accepted" && (
                  <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
                    Your macro is now live on GDMacros.
                  </p>
                )}
                <p className="mt-2 text-[11.5px] text-muted">{formatDate(n.created_at)}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {published.length > 0 && (
        <details className="group card overflow-hidden">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-4 marker:content-none sm:px-5">
            <span>
              <span className="text-[13.5px] font-bold text-text">Accepted &amp; live</span>
              <span className="ml-2 rounded-md border border-green/30 bg-green/10 px-2 py-0.5 text-[11px] font-semibold text-green tabular-nums">
                {published.length}
              </span>
              <span className="mt-1 block text-[12px] font-normal text-muted">
                Published submissions tied to your account
              </span>
            </span>
            <ChevronDownIcon className="h-4 w-4 shrink-0 text-muted transition-transform group-open:rotate-180" />
          </summary>

          <div className="border-t border-border-soft px-4 py-2 sm:px-5">
            {published.map((item) => (
              <div
                key={item.submission_id}
                className="flex flex-col gap-2 border-b border-border-soft py-3.5 last:border-b-0 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate text-[13.5px] font-bold text-text" translate="no">
                    {item.level_name}
                  </p>
                  <p className="mt-1 text-[12px] text-muted">
                    ID <span className="tabular-nums">{item.level_id}</span> · {item.recorder} · by{" "}
                    <span translate="no" className="notranslate text-text-dim">
                      {item.macro_author}
                    </span>
                  </p>
                  <p className="mt-1 text-[11.5px] text-muted">
                    Published {formatDate(item.published_at)}
                  </p>
                </div>
                {item.macro_href ? (
                  <Link
                    href={item.macro_href}
                    className="shrink-0 text-[12.5px] font-medium text-accent-soft hover:underline"
                  >
                    View live macro
                  </Link>
                ) : (
                  <span className="shrink-0 text-[11.5px] text-muted">Live catalog entry</span>
                )}
              </div>
            ))}

            <p className="border-t border-border-soft py-3 text-[11.5px] leading-relaxed text-muted">
              Account-linked accepted history starts with this feature. Older catalog credits may
              not appear here, because author credits and account ownership were not previously
              linked.
            </p>
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
                    Someone is publishing this now. You will see the result here when it is done.
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
