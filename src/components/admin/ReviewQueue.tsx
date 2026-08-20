"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  approveSubmission,
  getSubmissionDownloadUrl,
  rejectSubmission,
} from "@/lib/actions/submissions";
import { LIMITS, MIN_REJECTION_REASON, STATUS_LABEL, formatDate } from "@/lib/submissions";

export interface AdminRow {
  id: string;
  level_name: string;
  level_id: string;
  level_creator: string | null;
  video_url: string | null;
  recorder: string;
  macro_author: string;
  notes: string | null;
  status: string;
  rejection_reason: string | null;
  created_at: string;
  reviewed_at: string | null;
  /** The submitter's USERNAME, joined from profiles. Never their email. */
  submitter: string;
}

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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[11.5px] text-muted">{label}</p>
      <p className="mt-0.5 truncate text-[13px] text-text-dim">{children}</p>
    </div>
  );
}

function Card({ row, onDone }: { row: AdminRow; onDone: () => void }) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"approve" | "reject" | "download" | null>(null);
  const [, startTransition] = useTransition();

  function run(kind: "approve" | "reject") {
    setError(null);
    setBusy(kind);
    startTransition(async () => {
      const res =
        kind === "approve"
          ? await approveSubmission(row.id)
          : await rejectSubmission(row.id, reason);
      setBusy(null);
      if (res.ok) {
        setRejecting(false);
        setReason("");
        // Re-read from the server rather than patching local state, so what is
        // on screen is what the database actually says.
        onDone();
      } else {
        setError(res.error);
      }
    });
  }

  async function download() {
    setError(null);
    setBusy("download");
    const res = await getSubmissionDownloadUrl(row.id);
    setBusy(null);
    if ("error" in res) {
      setError(res.error);
      return;
    }
    // Minted on demand and used immediately. Nothing permanent is ever put in
    // the page or the database.
    window.open(res.url, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="card p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[14.5px] font-bold text-text">{row.level_name}</p>
          <p className="mt-0.5 text-[12.5px] text-muted">
            ID <span className="tabular-nums">{row.level_id}</span>
            {row.level_creator ? <> &middot; by {row.level_creator}</> : null}
          </p>
        </div>
        <StatusPill status={row.status} />
      </div>

      <div className="mt-3.5 grid grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-3">
        <Field label="Submitted by">
          <span translate="no" className="notranslate font-semibold text-text">
            {row.submitter}
          </span>
        </Field>
        <Field label="Macro author">
          <span translate="no" className="notranslate">
            {row.macro_author}
          </span>
        </Field>
        <Field label="Recorder">{row.recorder}</Field>
        <Field label="Submitted">{formatDate(row.created_at)}</Field>
        {row.reviewed_at && <Field label="Reviewed">{formatDate(row.reviewed_at)}</Field>}
        <Field label="Video">
          {row.video_url ? (
            <a
              href={row.video_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent-soft hover:underline"
            >
              Watch
            </a>
          ) : (
            <span className="text-muted">None</span>
          )}
        </Field>
      </div>

      {row.notes && (
        <div className="mt-3 rounded-xl border border-border-soft bg-surface-2/50 px-3.5 py-2.5">
          <p className="text-[11.5px] text-muted">Notes</p>
          <p className="mt-1 text-[12.5px] leading-relaxed whitespace-pre-wrap text-text-dim">
            {row.notes}
          </p>
        </div>
      )}

      {row.status === "rejected" && row.rejection_reason && (
        <div className="mt-3 rounded-xl border border-rose/30 bg-rose/5 px-3.5 py-2.5">
          <p className="text-[11.5px] font-semibold text-rose">Rejection reason</p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-text-dim">{row.rejection_reason}</p>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-3 text-[12.5px] text-rose">
          {error}
        </p>
      )}

      <div className="mt-3.5 flex flex-wrap items-center gap-2.5 border-t border-border-soft pt-3.5">
        <button
          type="button"
          onClick={download}
          disabled={busy !== null}
          className="rounded-lg border border-border bg-surface px-3.5 py-2 text-[12.5px] font-semibold text-text-dim transition-[background-color,border-color,transform,color] duration-200 ease-out hover:border-accent/40 hover:text-text active:scale-95 active:duration-75 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy === "download" ? "Preparing..." : "Download .gdr2"}
        </button>

        {row.status === "pending" && !rejecting && (
          <>
            <button
              type="button"
              onClick={() => run("approve")}
              disabled={busy !== null}
              className="rounded-lg bg-accent px-3.5 py-2 text-[12.5px] font-semibold text-white transition-[background-color,transform] duration-200 ease-out hover:bg-accent-hover active:scale-95 active:duration-75 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy === "approve" ? "Approving..." : "Approve"}
            </button>
            <button
              type="button"
              onClick={() => setRejecting(true)}
              disabled={busy !== null}
              className="rounded-lg border border-border bg-surface px-3.5 py-2 text-[12.5px] font-semibold text-text-dim transition-[background-color,border-color,transform,color] duration-200 ease-out hover:border-rose/40 hover:text-rose active:scale-95 active:duration-75 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Reject
            </button>
          </>
        )}
      </div>

      {row.status === "pending" && rejecting && (
        <div className="mt-3 flex flex-col gap-2.5">
          <label htmlFor={`reason-${row.id}`} className="text-[12.5px] font-semibold text-text-dim">
            Why is it being turned down?
          </label>
          <textarea
            id={`reason-${row.id}`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            maxLength={LIMITS.rejectionReason}
            placeholder="Shown to the person who sent it in"
            className="w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-[13px] text-text outline-none transition-colors placeholder:text-muted focus:border-accent"
          />
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => run("reject")}
              disabled={busy !== null || reason.trim().length < MIN_REJECTION_REASON}
              className="rounded-lg bg-rose px-3.5 py-2 text-[12.5px] font-semibold text-white transition-[background-color,transform] duration-200 ease-out active:scale-95 active:duration-75 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy === "reject" ? "Rejecting..." : "Confirm rejection"}
            </button>
            <button
              type="button"
              onClick={() => {
                setRejecting(false);
                setReason("");
                setError(null);
              }}
              className="text-[12.5px] text-muted transition-colors hover:text-text-dim"
            >
              Cancel
            </button>
            <span className="ml-auto text-[11.5px] text-muted tabular-nums">
              {reason.trim().length}/{LIMITS.rejectionReason}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

const FILTERS = ["pending", "approved", "rejected", "all"] as const;

export default function ReviewQueue({
  rows,
  filter,
}: {
  rows: AdminRow[];
  filter: string;
}) {
  const router = useRouter();

  return (
    <>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => router.push(f === "pending" ? "/admin" : `/admin?status=${f}`)}
            aria-pressed={filter === f}
            className={`rounded-lg border px-3 py-1.5 text-[12.5px] font-semibold capitalize transition-colors ${
              filter === f
                ? "border-accent/50 bg-accent/10 text-accent-soft"
                : "border-border bg-surface text-text-dim hover:border-accent/30 hover:text-text"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="card px-6 py-16 text-center">
          <p className="text-[15px] font-semibold text-text">Nothing here</p>
          <p className="mt-1.5 text-[13px] text-muted">
            {filter === "pending"
              ? "No submissions are waiting for review."
              : `No ${filter} submissions.`}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((row) => (
            <Card key={row.id} row={row} onDone={() => router.refresh()} />
          ))}
        </div>
      )}
    </>
  );
}
