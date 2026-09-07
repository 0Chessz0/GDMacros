"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { getSubmissionDownloadUrl, releaseProcessing } from "@/lib/actions/submissions";
import { checkPublishProgress, getPublishState, publishMacro } from "@/lib/actions/publish";
import type { PublishProgress } from "@/lib/publish/publisher";
import { formatDate } from "@/lib/submissions";
import { macroFileExtension } from "@/lib/types";
import type { AdminRow } from "./ReviewQueue";

/**
 * The publishing screen.
 *
 * Publishing is now automated: the admin still decides, and pressing Publish
 * Macro hands the rest to the server, which uploads the file to a GitHub
 * Release, commits the catalog, waits for production to actually serve it, and
 * only then finalises.
 *
 * CLOSING IS NOT FINISHING, and that is now true in a stronger sense than
 * before. The X, Escape, clicking outside, refreshing, navigating away and
 * closing the browser all leave the submission Processing with its publish
 * progress recorded in the database. Reopening resumes from wherever it got to,
 * and any admin can resume it, because the state lives in the database rather
 * than in this component.
 */

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border-soft py-2.5 last:border-b-0">
      <span className="shrink-0 text-[12px] text-muted">{label}</span>
      <span className="min-w-0 text-right text-[13px] font-medium break-words text-text">
        {children}
      </span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card p-4">
      <h3 className="mb-1 text-[12px] font-bold tracking-wide text-muted uppercase">{title}</h3>
      {children}
    </div>
  );
}

/** The four steps, in the order the server performs them. */
const STEPS = [
  { key: "asset_uploaded", label: "Publish the file to GDMacros Downloads" },
  { key: "catalog_committed", label: "Add the macro to the catalog and commit it" },
  { key: "live_verified", label: "Wait for production to serve the new catalog" },
  { key: "finished", label: "Finalise and tell the submitter" },
] as const;

const ORDER: Record<string, number> = {
  not_started: 0,
  asset_uploaded: 1,
  catalog_committed: 2,
  live_verified: 3,
  finished: 4,
};

/**
 * Shows exactly how far the publication has got.
 *
 * This is not decoration. Every step below is an irreversible external action,
 * and after a failure the admin needs to know which of them already happened
 * before deciding what to do, so the panel stays visible after an error rather
 * than being replaced by it.
 */
function PublishProgressPanel({ progress }: { progress: PublishProgress | null }) {
  if (!progress || progress.state === "not_started") return null;

  const reached = ORDER[progress.state] ?? 0;
  const waiting = progress.stage === "waiting-for-production";

  return (
    <div className="mb-4 rounded-xl border border-accent/30 bg-accent/5 p-3.5">
      <p className="mb-2.5 text-[11.5px] font-bold tracking-wide text-accent-soft uppercase">
        Publishing progress
      </p>
      <ol className="flex flex-col gap-1.5">
        {STEPS.map((step, i) => {
          const done = reached > i;
          const active = reached === i;
          return (
            <li key={step.key} className="flex items-start gap-2 text-[12.5px] leading-relaxed">
              <span
                aria-hidden
                className={
                  done
                    ? "text-green"
                    : active
                      ? "animate-spin-slow text-accent-soft"
                      : "text-muted/50"
                }
              >
                {done ? "✓" : active ? "○" : "○"}
              </span>
              <span className={done ? "text-text-dim" : active ? "text-text" : "text-muted"}>
                {step.label}
                {active && waiting && i === 2 && (
                  <span className="block text-[11.5px] text-muted">
                    Vercel usually takes a minute or two. This keeps checking.
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ol>

      {progress.assetName && (
        <p className="mt-2.5 border-t border-border-soft pt-2.5 font-mono text-[11.5px] break-all text-muted">
          {progress.assetName}
        </p>
      )}
    </div>
  );
}

export default function ProcessingModal({
  row,
  onClose,
  onFinished,
}: {
  row: AdminRow;
  onClose: () => void;
  onFinished: () => void;
}) {
  const fileExtension = macroFileExtension(row.recorder);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"download" | "publish" | "release" | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const [progress, setProgress] = useState<PublishProgress | null>(null);
  const [, startTransition] = useTransition();
  const dialogRef = useRef<HTMLDivElement>(null);
  // Guards against a double click firing two requests before the first returns.
  // The server is idempotent regardless; this just avoids the second call.
  const publishing = useRef(false);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Publishing has started once anything irreversible has happened. From that
  // point the submission cannot be handed back to the Pending queue, because a
  // public GitHub asset already exists for it.
  const started = progress != null && progress.state !== "not_started";
  const waiting = progress?.stage === "waiting-for-production";

  // Escape closes. It does NOT finish, and it does not cancel work already in
  // flight on the server, which continues regardless of this component.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && busy === null) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, busy]);

  useEffect(() => {
    return () => {
      if (pollTimer.current) clearTimeout(pollTimer.current);
    };
  }, []);

  /*
   * Resume. Reads the recorded state WITHOUT doing any work: opening this
   * window must never upload anything. If a previous attempt got part way, the
   * progress panel shows it and the button becomes Retry.
   */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await getPublishState(row.id);
      if (cancelled || "error" in res) return;
      if (res.state === "none" || res.state === "not_started") return;

      setProgress({
        ok: true,
        state: res.state,
        stage: res.state === "catalog_committed" ? "waiting-for-production" : "uploading",
        assetName: res.assetName,
        assetUrl: res.assetUrl,
        commitSha: res.commitSha,
      });
      if (res.lastError) {
        setError(`${res.lastError} The submission is still Processing, so retrying is safe.`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [row.id]);

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

  /**
   * Polls while Vercel builds and deploys the catalog commit.
   *
   * The server never sleeps waiting for a deployment: each call does one cheap
   * check of https://www.gdmacros.com/api/version and returns. This schedules
   * the next one. Closing the modal stops the polling, not the publication:
   * the state is in the database and reopening resumes it.
   */
  const poll = useCallback(
    (attempt = 0) => {
      // ~5 minutes of checking, then stop asking and let the admin retry. The
      // submission stays Processing the whole time, so nothing is lost.
      if (attempt > 40) {
        setBusy(null);
        setError(
          "The catalog was committed, but production has not deployed it yet. The submission is still Processing. Reopen this and press Retry in a minute.",
        );
        return;
      }
      pollTimer.current = setTimeout(async () => {
        const res = await checkPublishProgress(row.id);
        setProgress(res);
        if (res.finished) {
          setBusy(null);
          onFinished();
          return;
        }
        if (!res.ok) {
          setBusy(null);
          setError(res.error ?? "Publishing stopped. The submission is still Processing.");
          return;
        }
        poll(attempt + 1);
      }, 7_000);
    },
    [row.id, onFinished],
  );

  function publish() {
    if (publishing.current) return;
    publishing.current = true;
    setError(null);
    setBusy("publish");
    setConfirming(false);
    startTransition(async () => {
      const res = await publishMacro(row.id);
      setProgress(res);
      publishing.current = false;

      if (res.finished) {
        setBusy(null);
        onFinished();
        return;
      }
      if (!res.ok) {
        setBusy(null);
        setError(res.error ?? "Publishing stopped. Nothing was finalised.");
        return;
      }
      // ok but not finished means the commit landed and we are waiting on the
      // deployment. Keep the button busy and start checking.
      poll(0);
    });
  }

  function release() {
    setError(null);
    setBusy("release");
    startTransition(async () => {
      const res = await releaseProcessing(row.id);
      setBusy(null);
      if (res.ok) onFinished();
      else setError(res.error);
    });
  }

  const videoId = row.video_url?.match(/[?&]v=([A-Za-z0-9_-]{11})/)?.[1] ?? null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm sm:p-6"
      // Clicking the backdrop closes, and closing finalises nothing.
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && busy === null) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Publishing ${row.level_name}`}
        className="my-auto w-full max-w-[680px] rounded-2xl border border-border bg-bg p-4 shadow-2xl sm:p-6"
      >
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11.5px] font-bold tracking-wide text-accent-soft uppercase">
              Publishing
            </p>
            <h2 className="mt-0.5 text-[19px] font-extrabold tracking-tight text-text">
              {row.level_name}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy !== null}
            className="rounded-lg border border-border bg-surface px-3 py-1.5 text-[12.5px] font-semibold text-text-dim transition-colors hover:text-text disabled:opacity-60"
          >
            Close
          </button>
        </div>

        <p className="mb-4 rounded-xl border border-amber/30 bg-amber/10 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-text-dim">
          {started
            ? "Publishing has started for this submission. Closing this window does not stop it and does not lose progress: reopen from the Processing list to carry on."
            : "Closing this does not publish anything. The submission stays in the Processing list until you press Publish Macro, so you can come back to it."}
        </p>

        <PublishProgressPanel progress={progress} />

        <div className="flex flex-col gap-3">
          <Section title="Level">
            <Row label="Name">{row.level_name}</Row>
            <Row label="Level ID">
              <span className="tabular-nums">{row.level_id}</span>
            </Row>
            <Row label="Creator">{row.level_creator ?? "Unknown"}</Row>
            <Row label="GDBrowser">
              <a
                href={`https://gdbrowser.com/${encodeURIComponent(row.level_id)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent-soft hover:underline"
              >
                Open level page
              </a>
            </Row>
          </Section>

          <Section title="Video">
            {videoId ? (
              <div className="flex flex-col gap-3 sm:flex-row">
                {/* Deterministic thumbnail URL, so there is nothing to parse. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`}
                  alt=""
                  className="h-[90px] w-[160px] shrink-0 rounded-lg border border-border object-cover"
                />
                <div className="min-w-0 flex-1">
                  <a
                    href={row.video_url ?? "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[13px] font-semibold break-all text-accent-soft hover:underline"
                  >
                    {row.video_url}
                  </a>
                  <p className="mt-1.5 text-[12px] text-muted">
                    Opens on YouTube. Check it matches the level before publishing.
                  </p>
                </div>
              </div>
            ) : (
              <p className="py-2 text-[13px] text-muted">No video was submitted.</p>
            )}
          </Section>

          <Section title="Macro">
            <Row label="Recorder">{row.recorder}</Row>
            <Row label="Macro author">
              <span translate="no" className="notranslate">
                {row.macro_author}
              </span>
            </Row>
            <Row label="Submitted by">
              <span translate="no" className="notranslate">
                {row.submitter}
              </span>
            </Row>
            <Row label="Submitted">{formatDate(row.created_at)}</Row>
            {row.notes && (
              <div className="border-t border-border-soft pt-2.5">
                <p className="text-[12px] text-muted">Notes</p>
                <p className="mt-1 text-[12.5px] leading-relaxed whitespace-pre-wrap text-text-dim">
                  {row.notes}
                </p>
              </div>
            )}
          </Section>

          <Section title="File">
            <Row label="Filename">
              <span className="font-mono text-[12px]">{row.level_id}{fileExtension}</span>
            </Row>
            <Row label="Size">
              {row.file_size ? `${(row.file_size / 1024).toFixed(1)} KB` : "Unknown"}
            </Row>
            <div className="pt-3">
              <button
                type="button"
                onClick={download}
                disabled={busy !== null}
                className="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-[13.5px] font-semibold text-text-dim transition-[background-color,border-color,transform,color] duration-200 ease-out hover:border-accent/40 hover:text-text active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busy === "download" ? "Preparing..." : `Download ${fileExtension}`}
              </button>
              <p className="mt-2 text-[12px] text-muted">
                A private link that expires in two minutes. It stops working once you finish.
              </p>
            </div>
          </Section>
        </div>

        {error && (
          <p role="alert" className="mt-3 text-[12.5px] text-rose">
            {error}
          </p>
        )}

        <div className="mt-5 border-t border-border-soft pt-4">
          {!confirming ? (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              disabled={busy !== null}
              className="h-11 w-full rounded-xl bg-accent text-[14px] font-bold text-white transition-[background-color,transform] duration-200 ease-out hover:bg-accent-hover active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy === "publish"
                ? waiting
                  ? "Waiting for production..."
                  : "Publishing..."
                : started
                  ? "Retry publishing"
                  : "Publish Macro"}
            </button>
          ) : (
            <div className="rounded-xl border border-accent/40 bg-accent/5 p-3.5">
              <p className="text-[13px] leading-relaxed text-text-dim">This will:</p>
              <ul className="mt-2 flex flex-col gap-1 text-[12.5px] leading-relaxed text-text-dim">
                <li>
                  publish the {fileExtension} to GDMacros Downloads, permanently and publicly
                </li>
                <li>add the macro to the GDMacros catalog</li>
                <li>commit the catalog to GitHub</li>
                <li>trigger the production deployment</li>
                <li>
                  finalise only after the new catalog is live, then tell{" "}
                  <span translate="no" className="notranslate font-semibold text-text">
                    {row.submitter}
                  </span>{" "}
                  it was accepted
                </li>
              </ul>
              <p className="mt-2.5 text-[12.5px] leading-relaxed text-muted">
                The published file cannot be unpublished from here. Nothing is finalised, and the
                submitter is told nothing, unless every step above succeeds.
              </p>
              <div className="mt-3 flex flex-wrap gap-2.5">
                <button
                  type="button"
                  onClick={publish}
                  disabled={busy !== null}
                  className="rounded-xl bg-accent px-4 py-2.5 text-[13.5px] font-bold text-white transition-[background-color,transform] duration-200 ease-out hover:bg-accent-hover active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {busy === "publish" ? "Publishing..." : "Yes, publish it"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  disabled={busy !== null}
                  className="text-[12.5px] text-muted transition-colors hover:text-text-dim"
                >
                  Not yet
                </button>
              </div>
            </div>
          )}

          <div className="mt-3">
            {started ? (
              /*
               * Deliberately not offered any more. Once the macro is a public
               * GitHub Release asset, handing the submission back to Pending
               * would leave a published file with nothing tracking it, and the
               * next admin would publish a second copy. The server refuses this
               * too; hiding the button just avoids offering an action that
               * would be rejected.
               */
              <p className="text-[12px] leading-relaxed text-muted">
                This can no longer be returned to the pending queue: the macro file is already
                published. Finish it here, or retry if a step failed.
              </p>
            ) : !releasing ? (
              <button
                type="button"
                onClick={() => setReleasing(true)}
                disabled={busy !== null}
                className="text-[12px] text-muted transition-colors hover:text-text-dim disabled:opacity-60"
              >
                Put this back in the pending queue
              </button>
            ) : (
              <div className="rounded-xl border border-border bg-surface-2/50 p-3">
                <p className="text-[12.5px] text-text-dim">
                  Hand this back so another admin can pick it up? Nothing is deleted and the
                  submitter is not told anything.
                </p>
                <div className="mt-2.5 flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    onClick={release}
                    disabled={busy !== null}
                    className="rounded-lg border border-border bg-surface px-3.5 py-2 text-[12.5px] font-semibold text-text-dim transition-colors hover:text-text disabled:opacity-60"
                  >
                    {busy === "release" ? "Releasing..." : "Yes, release it"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setReleasing(false)}
                    disabled={busy !== null}
                    className="text-[12.5px] text-muted transition-colors hover:text-text-dim"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
