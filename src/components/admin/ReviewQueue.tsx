"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  getSubmissionDownloadUrl,
  rejectSubmission,
  startProcessing,
} from "@/lib/actions/submissions";
import { LIMITS, MIN_REJECTION_REASON, STATUS_LABEL, formatDate } from "@/lib/submissions";
import ProcessingModal from "./ProcessingModal";
import EditSubmission from "./EditSubmission";
import InspectSubmission from "./InspectSubmission";
import BulkPublishPanel from "./BulkPublishPanel";

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
  created_at: string;
  file_size: number | null;
  processing_started_at: string | null;
  /** The submitter's USERNAME, resolved from profiles. Never their email. */
  submitter: string;
  /** Who is publishing it, by username. Null while pending. */
  processor: string | null;
  /** Whether the admin looking at this page is the one who claimed it. */
  mine: boolean;
}

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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[11.5px] text-muted">{label}</p>
      <p className="mt-0.5 truncate text-[13px] text-text-dim">{children}</p>
    </div>
  );
}

function Card({
  row,
  onChanged,
  selected,
  onSelected,
  batchRunning,
}: {
  row: AdminRow;
  onChanged: () => void;
  selected: boolean;
  onSelected: (selected: boolean) => void;
  batchRunning: boolean;
}) {
  const router = useRouter();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"accept" | "reject" | "download" | null>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  // Set the moment a claim succeeds, so this card shows the right buttons
  // without waiting for a refresh that would remove it from this filter.
  const [claimed, setClaimed] = useState(false);
  const [, startTransition] = useTransition();

  const status = claimed ? "processing" : row.status;

  function accept() {
    setError(null);
    setBusy("accept");
    startTransition(async () => {
      const res = await startProcessing(row.id);
      setBusy(null);
      if (res.ok) {
        // Claimed. Open the publishing screen, and deliberately do NOT refresh
        // the list yet: the row has just left the Pending filter, so refreshing
        // now would unmount this card and take the modal with it. The refresh
        // happens when the modal closes instead.
        setClaimed(true);
        setEditing(false);
        setOpen(true);
      } else {
        setError(res.error);
      }
    });
  }

  /**
   * Inspect the macro before deciding.
   *
   * Read only in every sense: it mints a short-lived signed URL and changes
   * nothing. No claim, no status change, no notification, no database write.
   * The path is derived server side from the row, so the browser cannot ask for
   * an arbitrary object.
   */
  async function download() {
    setError(null);
    setBusy("download");
    const res = await getSubmissionDownloadUrl(row.id);
    setBusy(null);
    if ("error" in res) {
      setError(res.error);
      return;
    }
    window.open(res.url, "_blank", "noopener,noreferrer");
  }

  function reject() {
    setError(null);
    setBusy("reject");
    startTransition(async () => {
      const res = await rejectSubmission(row.id, reason);
      setBusy(null);
      if (res.ok) {
        setRejecting(false);
        setReason("");
        onChanged();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <>
      {open && (
        <ProcessingModal
          row={row}
          onClose={() => {
            setOpen(false);
            /*
             * If this was just claimed it has left the Pending filter, so
             * simply refreshing would make the card vanish with no explanation
             * of where it went. Go to the Processing list instead: that is
             * where it now lives and where it is resumed from.
             */
            if (claimed) router.push("/admin/submissions?status=processing");
            else onChanged();
          }}
          onFinished={() => {
            setOpen(false);
            onChanged();
          }}
        />
      )}

      <div className={`card p-4 sm:p-5 ${status === "processing" ? "border-accent/30" : ""}`}>
        {status === "pending" && (
          <label className="mb-3 flex w-fit cursor-pointer items-center gap-2 text-[12px] font-semibold text-muted">
            <input type="checkbox" checked={selected} onChange={(event) => onSelected(event.target.checked)} disabled={batchRunning} className="h-4 w-4 accent-[var(--color-accent)]" />
            Select for bulk publishing
          </label>
        )}
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[14.5px] font-bold text-text">{row.level_name}</p>
            <p className="mt-0.5 text-[12.5px] text-muted">
              ID <span className="tabular-nums">{row.level_id}</span>
              {row.level_creator ? <> &middot; by {row.level_creator}</> : null}
            </p>
          </div>
          <StatusPill status={status} />
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
          <Field label="File size">
            {row.file_size ? `${(row.file_size / 1024).toFixed(1)} KB` : "Unknown"}
          </Field>
          <Field label="Submitted">{formatDate(row.created_at)}</Field>
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
          {status === "processing" && (
            <Field label="Being handled by">
              <span translate="no" className="notranslate font-semibold text-accent-soft">
                {row.mine || claimed ? "you" : (row.processor ?? "another admin")}
              </span>
            </Field>
          )}
        </div>

        {row.notes && (
          <div className="mt-3 rounded-xl border border-border-soft bg-surface-2/50 px-3.5 py-2.5">
            <p className="text-[11.5px] text-muted">Notes</p>
            <p className="mt-1 text-[12.5px] leading-relaxed whitespace-pre-wrap text-text-dim">
              {row.notes}
            </p>
          </div>
        )}

        {editing && status === "pending" && (
          <EditSubmission
            row={row}
            onSaved={() => {
              setEditing(false);
              onChanged();
            }}
            onCancel={() => setEditing(false)}
          />
        )}

        {error && (
          <p role="alert" className="mt-3 text-[12.5px] text-rose">
            {error}
          </p>
        )}

        <div className="mt-3.5 flex flex-wrap items-center gap-2.5 border-t border-border-soft pt-3.5">
          {status === "pending" && !rejecting && (
            <>
              <button
                type="button"
                onClick={download}
                disabled={busy !== null}
                className="rounded-lg border border-accent/40 bg-accent/10 px-3.5 py-2 text-[12.5px] font-semibold text-accent-soft transition-[background-color,border-color,transform] duration-200 ease-out hover:bg-accent/15 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busy === "download" ? "Preparing..." : "Download .gdr2"}
              </button>
              <button
                type="button"
                onClick={accept}
                disabled={busy !== null}
                className="rounded-lg bg-accent px-3.5 py-2 text-[12.5px] font-semibold text-white transition-[background-color,transform] duration-200 ease-out hover:bg-accent-hover active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busy === "accept" ? "Opening..." : "Start Publishing"}
              </button>
              <InspectSubmission id={row.id} />
              <button
                type="button"
                onClick={() => setEditing((v) => !v)}
                disabled={busy !== null}
                className="rounded-lg border border-border bg-surface px-3.5 py-2 text-[12.5px] font-semibold text-text-dim transition-[background-color,border-color,transform,color] duration-200 ease-out hover:border-accent/40 hover:text-accent-soft active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {editing ? "Close editor" : "Edit details"}
              </button>
              <button
                type="button"
                onClick={() => setRejecting(true)}
                disabled={busy !== null}
                className="rounded-lg border border-border bg-surface px-3.5 py-2 text-[12.5px] font-semibold text-text-dim transition-[background-color,border-color,transform,color] duration-200 ease-out hover:border-rose/40 hover:text-rose active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Reject
              </button>
            </>
          )}

          {status === "processing" && (
            <>
              <button
                type="button"
                onClick={download}
                disabled={busy !== null}
                className="rounded-lg border border-accent/40 bg-accent/10 px-3.5 py-2 text-[12.5px] font-semibold text-accent-soft transition-[background-color,border-color,transform] duration-200 ease-out hover:bg-accent/15 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busy === "download" ? "Preparing..." : "Download .gdr2"}
              </button>
              <button
                type="button"
                onClick={() => setOpen(true)}
                className="rounded-lg bg-accent px-3.5 py-2 text-[12.5px] font-semibold text-white transition-[background-color,transform] duration-200 ease-out hover:bg-accent-hover active:scale-95"
              >
                {row.mine || claimed ? "Resume publishing" : "Open publishing screen"}
              </button>
              <span className="text-[12px] text-muted">
                Started {formatDate(row.processing_started_at)}
              </span>
            </>
          )}
        </div>

        {status === "pending" && rejecting && (
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
            <p className="text-[12px] leading-relaxed text-muted">
              Rejecting deletes the submission and its file straight away, and tells the submitter
              this reason. It cannot be undone.
            </p>
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={reject}
                disabled={busy !== null || reason.trim().length < MIN_REJECTION_REASON}
                className="rounded-lg bg-rose px-3.5 py-2 text-[12.5px] font-semibold text-white transition-[background-color,transform] duration-200 ease-out active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
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
    </>
  );
}

const FILTERS = [
  { id: "pending", label: "Pending" },
  { id: "processing", label: "Processing" },
  { id: "all", label: "All active" },
] as const;

export default function ReviewQueue({ rows, filter }: { rows: AdminRow[]; filter: string }) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [batchRunning, setBatchRunning] = useState(false);
  const selectedRows = rows.filter((row) => selected.includes(row.id) && row.status === "pending");

  return (
    <>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() =>
              router.push(
                f.id === "pending" ? "/admin/submissions" : `/admin/submissions?status=${f.id}`,
              )
            }
            aria-pressed={filter === f.id}
            className={`rounded-lg border px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
              filter === f.id
                ? "border-accent/50 bg-accent/10 text-accent-soft"
                : "border-border bg-surface text-text-dim hover:border-accent/30 hover:text-text"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {rows.some((row) => row.status === "pending") && (
        <div className="mb-4 flex flex-wrap items-center gap-3 text-[12.5px]">
          <button type="button" disabled={batchRunning} onClick={() => setSelected(rows.filter((row) => row.status === "pending").map((row) => row.id))} className="font-semibold text-accent-soft hover:underline disabled:opacity-50">Select all pending</button>
          {selected.length > 0 && <button type="button" disabled={batchRunning} onClick={() => setSelected([])} className="text-muted hover:text-text disabled:opacity-50">Clear selection</button>}
        </div>
      )}

      {selectedRows.length > 0 && (
        <BulkPublishPanel rows={selectedRows} onRunningChange={setBatchRunning} onFinished={() => { setSelected([]); router.refresh(); }} />
      )}

      {rows.length === 0 ? (
        <div className="card px-6 py-16 text-center">
          <p className="text-[15px] font-semibold text-text">Nothing here</p>
          <p className="mt-1.5 text-[13px] text-muted">
            {filter === "pending"
              ? "No submissions are waiting for review."
              : filter === "processing"
                ? "Nothing is being published right now."
                : "There are no active submissions."}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((row) => (
            <Card
              key={row.id}
              row={row}
              onChanged={() => router.refresh()}
              selected={selected.includes(row.id)}
              onSelected={(checked) => setSelected((current) => checked ? [...new Set([...current, row.id])] : current.filter((id) => id !== row.id))}
              batchRunning={batchRunning}
            />
          ))}
        </div>
      )}
    </>
  );
}
