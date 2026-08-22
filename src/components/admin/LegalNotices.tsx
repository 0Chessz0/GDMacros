"use client";

import { useState } from "react";
import {
  NOTICE_TYPES,
  SEND_CONFIRMATION,
  type NoticeType,
} from "@/lib/legalNotice";
import {
  prepareNotice,
  previewNotice,
  runStatus,
  sendNextBatch,
  sendTestNotice,
  type RunProgress,
} from "@/lib/actions/legalNotice";
import { ShieldIcon } from "../icons";

/**
 * Legal Notices.
 *
 * Deliberately a separate block from the review queue: approving one macro and
 * emailing every account holder are different kinds of action and should not
 * sit next to each other looking equally routine.
 *
 * The browser drives the run one batch at a time. It never learns who the
 * recipients are: every server action here returns counts, and an email address
 * is resolved only inside the send path.
 */

interface Props {
  termsVersion: string;
  privacyVersion: string;
  /** The most recent run, if there is one. Counts only. */
  initialRun: RunProgress | null;
}

const field =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-[13.5px] text-text outline-none transition-colors focus:border-accent/50";

export default function LegalNotices({ termsVersion, privacyVersion, initialRun }: Props) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<NoticeType>("terms_and_privacy");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [effectiveDate, setEffectiveDate] = useState("");

  const [preview, setPreview] = useState<{ html: string; count: number } | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [run, setRun] = useState<RunProgress | null>(initialRun);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const draft = { type, subject, message, effectiveDate: effectiveDate || null };

  async function onPreview() {
    setBusy("preview");
    setError(null);
    setNote(null);
    const r = await previewNotice(draft);
    setBusy(null);
    if (!r.ok) {
      setError(r.error ?? "Could not build a preview.");
      setPreview(null);
      return;
    }
    setPreview({ html: r.html ?? "", count: r.recipientCount ?? 0 });
    if (r.truncated) setError("Account enumeration did not finish. Do not send until this is fixed.");
  }

  async function onTest() {
    setBusy("test");
    setError(null);
    setNote(null);
    const r = await sendTestNotice(draft);
    setBusy(null);
    if (!r.ok) setError(r.error ?? "The test could not be sent.");
    else setNote("Test sent to your own account address. No run was created.");
  }

  async function onStart() {
    setBusy("start");
    setError(null);
    setNote(null);
    const r = await prepareNotice(draft, confirmation);
    setBusy(null);
    if (!r.ok) {
      setError(r.error ?? "Could not prepare the notice.");
      return;
    }
    setRun(r);
    setConfirmation("");
    setNote("Prepared. Recipients are frozen into batches. Send the first batch below.");
  }

  /**
   * One batch per click, and the loop is driven from here rather than from a
   * single long request. Progress is written to the database after each batch,
   * so closing this page and coming back resumes rather than restarting.
   */
  async function onSendBatch() {
    if (!run?.runId) return;
    setBusy("batch");
    setError(null);
    const r = await sendNextBatch(run.runId);
    setBusy(null);
    if (!r.ok) {
      setError(r.error ?? "That batch could not be sent.");
      return;
    }
    setRun(r);
  }

  async function onRefresh() {
    setBusy("refresh");
    const r = await runStatus(run?.runId);
    setBusy(null);
    if (r.ok) setRun(r);
  }

  const canStart =
    subject.trim().length >= 3 &&
    message.trim().length >= 3 &&
    confirmation.trim() === SEND_CONFIRMATION;

  const active = run?.runId && !run.done;

  return (
    <section className="mt-12">
      <div className="flex items-center gap-2.5">
        <ShieldIcon className="h-[18px] w-[18px] text-muted" />
        <h2 className="text-[17px] font-bold text-text">Legal notices</h2>
      </div>

      <p className="mt-2 rounded-lg border border-amber-400/30 bg-amber-400/5 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-text-dim">
        This tool is for important account, Terms, Privacy, and service notices only. It is not a
        marketing mailing list.
      </p>

      <div className="mt-4 grid gap-2.5 sm:grid-cols-3">
        <div className="card px-4 py-3">
          <p className="text-[11px] font-semibold tracking-wider text-muted uppercase">Terms version</p>
          <p className="mt-1 text-[15px] font-bold text-text tabular-nums">{termsVersion}</p>
        </div>
        <div className="card px-4 py-3">
          <p className="text-[11px] font-semibold tracking-wider text-muted uppercase">Privacy version</p>
          <p className="mt-1 text-[15px] font-bold text-text tabular-nums">{privacyVersion}</p>
        </div>
        <div className="card px-4 py-3">
          <p className="text-[11px] font-semibold tracking-wider text-muted uppercase">Accounts</p>
          <p className="mt-1 text-[15px] font-bold text-text tabular-nums">
            {preview ? preview.count : run?.total != null ? run.total : "Preview to count"}
          </p>
        </div>
      </div>

      {run?.runId && (
        <div className="card mt-3 px-4 py-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[13px] font-semibold text-text">
              Last run: <span className="font-normal text-text-dim">{run.status}</span>
            </p>
            <button
              type="button"
              onClick={onRefresh}
              disabled={busy !== null}
              className="text-[12px] text-muted hover:text-text-dim disabled:opacity-60"
            >
              {busy === "refresh" ? "Refreshing..." : "Refresh"}
            </button>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[12.5px] text-text-dim tabular-nums">
            <span>Sent {run.sent ?? 0}</span>
            <span>Pending {run.pending ?? 0}</span>
            <span className={run.failed ? "text-rose" : ""}>Failed {run.failed ?? 0}</span>
            <span className={run.needsReview ? "text-amber-400" : ""}>
              Needs review {run.needsReview ?? 0}
            </span>
            <span className="text-muted">of {run.total ?? 0}</span>
          </div>

          {active && (
            <button
              type="button"
              onClick={onSendBatch}
              disabled={busy !== null}
              className="mt-3 rounded-lg bg-accent px-3.5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
            >
              {busy === "batch" ? "Sending batch..." : "Send next batch"}
            </button>
          )}

          {(run.needsReview ?? 0) > 0 && (
            <p className="mt-2 text-[12px] leading-relaxed text-amber-400">
              A batch could not be confirmed. It is not retried automatically, because resending
              something that may already have gone out would deliver a duplicate notice. Check Resend
              before deciding.
            </p>
          )}
        </div>
      )}

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-4 rounded-lg border border-border px-3.5 py-2 text-[13px] font-semibold text-text-dim transition-colors hover:border-accent/40 hover:text-text"
        >
          Prepare a notice
        </button>
      ) : (
        <div className="card mt-4 flex flex-col gap-3.5 p-5">
          <label className="text-[12px] text-muted">
            Notice type
            <select
              value={type}
              onChange={(e) => setType(e.target.value as NoticeType)}
              className={`${field} mt-1`}
            >
              {NOTICE_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>

          <label className="text-[12px] text-muted">
            Subject
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={200}
              className={`${field} mt-1`}
              placeholder="We have updated the GDMacros Terms of Service"
            />
          </label>

          <label className="text-[12px] text-muted">
            Message (plain text, no HTML)
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={6}
              maxLength={5000}
              className={`${field} mt-1 resize-y`}
              placeholder={"What changed, in a sentence or two.\n\nA blank line starts a new paragraph."}
            />
          </label>

          <label className="text-[12px] text-muted">
            Effective date (optional)
            <input
              type="date"
              value={effectiveDate}
              onChange={(e) => setEffectiveDate(e.target.value)}
              className={`${field} mt-1`}
            />
          </label>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onPreview}
              disabled={busy !== null}
              className="rounded-lg border border-border px-3.5 py-2 text-[13px] font-semibold text-text-dim transition-colors hover:border-accent/40 hover:text-text disabled:opacity-60"
            >
              {busy === "preview" ? "Building..." : "Preview"}
            </button>
            <button
              type="button"
              onClick={onTest}
              disabled={busy !== null}
              className="rounded-lg border border-border px-3.5 py-2 text-[13px] font-semibold text-text-dim transition-colors hover:border-accent/40 hover:text-text disabled:opacity-60"
            >
              {busy === "test" ? "Sending..." : "Send test to myself"}
            </button>
          </div>

          {preview && (
            <div>
              <p className="text-[12px] text-muted">
                Preview. This would go to{" "}
                <span className="font-semibold text-text tabular-nums">{preview.count}</span>{" "}
                account{preview.count === 1 ? "" : "s"}, one message each.
              </p>
              <div
                className="mt-2 max-h-[320px] overflow-auto rounded-lg border border-border bg-white p-3"
                // The preview renders the SAME html the mail carries. Everything
                // the admin typed was escaped by the renderer before it got here,
                // so there is no path from the textarea to live markup.
                dangerouslySetInnerHTML={{ __html: preview.html }}
              />
            </div>
          )}

          <div className="border-t border-border-soft pt-3.5">
            <label className="text-[12px] text-muted">
              Type <span className="font-semibold text-text">{SEND_CONFIRMATION}</span> to enable
              sending
              <input
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                className={`${field} mt-1`}
                placeholder={SEND_CONFIRMATION}
                autoComplete="off"
              />
            </label>
            <button
              type="button"
              onClick={onStart}
              disabled={busy !== null || !canStart}
              className="mt-3 rounded-lg bg-rose px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy === "start" ? "Preparing..." : "Prepare run for all accounts"}
            </button>
          </div>
        </div>
      )}

      {error && <p className="mt-3 text-[12.5px] text-rose">{error}</p>}
      {note && <p className="mt-3 text-[12.5px] text-green">{note}</p>}
    </section>
  );
}
