"use client";

import { useRef, useState } from "react";
import { publishMacroForBatch } from "@/lib/actions/publish";
import { startProcessing } from "@/lib/actions/submissions";
import type { AdminRow } from "./ReviewQueue";

type ItemState = "waiting" | "claiming" | "publishing" | "production" | "done" | "failed";

const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

export default function BulkPublishPanel({
  rows,
  onFinished,
  onRunningChange,
}: {
  rows: AdminRow[];
  onFinished: () => void;
  onRunningChange: (running: boolean) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [running, setRunning] = useState(false);
  const [states, setStates] = useState<Record<string, ItemState>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const stopRequested = useRef(false);

  function setItem(id: string, state: ItemState, error?: string) {
    setStates((current) => ({ ...current, [id]: state }));
    if (error) setErrors((current) => ({ ...current, [id]: error }));
  }

  async function run() {
    setConfirming(false);
    setRunning(true);
    onRunningChange(true);
    setErrors({});
    setStates(Object.fromEntries(rows.map((row) => [row.id, "waiting" as ItemState])));
    stopRequested.current = false;

    try {
      for (const row of rows) {
        if (stopRequested.current) break;
        try {
          setItem(row.id, "claiming");
          const claimed = await startProcessing(row.id);
          if (!claimed.ok) {
            setItem(row.id, "failed", claimed.error);
            continue;
          }

          let complete = false;
          for (let attempt = 0; attempt < 120; attempt++) {
            setItem(row.id, attempt === 0 ? "publishing" : "production");
            const result = await publishMacroForBatch(row.id);
            if (result.finished) {
              setItem(row.id, "done");
              complete = true;
              break;
            }
            if (!result.ok) {
              setItem(row.id, "failed", result.error ?? "Publishing stopped. Resume it from Processing.");
              complete = true;
              break;
            }
            await sleep(7_500);
          }
          if (!complete) setItem(row.id, "failed", "Timed out waiting for production. Resume it from Processing.");
        } catch {
          setItem(row.id, "failed", "The request was interrupted. Resume it from Processing.");
        }
      }
    } finally {
      setRunning(false);
      onRunningChange(false);
      onFinished();
    }
  }

  const completed = Object.values(states).filter((state) => state === "done").length;
  const failed = Object.values(states).filter((state) => state === "failed").length;

  return (
    <section className="mb-4 rounded-xl border border-accent/30 bg-accent/5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[13.5px] font-bold text-text">Bulk publish {rows.length} selected</p>
          <p className="mt-1 max-w-xl text-[12px] leading-relaxed text-muted">
            Publishes sequentially through the normal verified pipeline. Keep this page open; interrupted items remain recoverable under Processing.
          </p>
        </div>
        {!running && !confirming && (
          <button type="button" onClick={() => setConfirming(true)} className="rounded-xl bg-accent px-4 py-2.5 text-[13px] font-bold text-white hover:bg-accent-hover">Publish selected</button>
        )}
        {running && (
          <button type="button" onClick={() => { stopRequested.current = true; }} className="rounded-lg border border-border px-3 py-2 text-[12.5px] font-semibold text-muted hover:text-text">Stop after current</button>
        )}
      </div>

      {confirming && (
        <div className="mt-4 border-t border-border-soft pt-4">
          <p className="text-[12.5px] leading-relaxed text-text-dim">
            Each selected macro will be made permanently public, committed to the catalog and announced only after production is verified. Continue?
          </p>
          <div className="mt-3 flex gap-2.5">
            <button type="button" onClick={() => void run()} className="rounded-lg bg-accent px-3.5 py-2 text-[12.5px] font-bold text-white">Yes, publish all</button>
            <button type="button" onClick={() => setConfirming(false)} className="text-[12.5px] text-muted hover:text-text">Cancel</button>
          </div>
        </div>
      )}

      {Object.keys(states).length > 0 && (
        <div className="mt-4 border-t border-border-soft pt-4">
          <div className="mb-3 flex gap-4 text-[11.5px] text-muted"><span>{completed} completed</span><span>{failed} failed</span></div>
          <div className="flex max-h-64 flex-col gap-2 overflow-y-auto">
            {rows.map((row) => (
              <div key={row.id} className="flex items-start justify-between gap-4 rounded-lg bg-surface-2/60 px-3 py-2 text-[12px]">
                <div className="min-w-0">
                  <p translate="no" className="notranslate truncate font-semibold text-text-dim">{row.level_name}</p>
                  {errors[row.id] && <p className="mt-0.5 text-rose">{errors[row.id]}</p>}
                </div>
                <span className={`shrink-0 font-semibold capitalize ${states[row.id] === "done" ? "text-green" : states[row.id] === "failed" ? "text-rose" : "text-accent-soft"}`}>{(states[row.id] ?? "waiting").replace("production", "waiting for production")}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
