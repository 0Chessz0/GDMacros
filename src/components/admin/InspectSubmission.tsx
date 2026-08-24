"use client";

import { useState } from "react";
import { inspectSubmission, type InspectResult } from "@/lib/actions/submissionInspect";
import type { Finding } from "@/lib/gdr2Review";

/**
 * What the uploaded file says about itself, next to what the form claims.
 *
 * Loaded on demand rather than with the queue: it downloads and hashes the
 * whole upload, which is wasted work for the rows a reviewer scrolls past.
 */

function Row({ finding }: { finding: Finding }) {
  const tone =
    finding.level === "warn"
      ? "border-amber-400/40 bg-amber-400/5"
      : "border-border-soft";

  return (
    <div className={`rounded-lg border px-3 py-2.5 ${tone}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="text-[11.5px] text-muted">{finding.label}</span>
        <span
          className={`text-[13px] font-semibold ${
            finding.level === "warn" ? "text-amber-400" : "text-text"
          }`}
        >
          {finding.value}
        </span>
      </div>
      {finding.note && (
        <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted">{finding.note}</p>
      )}
    </div>
  );
}

export default function InspectSubmission({ id }: { id: string }) {
  const [result, setResult] = useState<InspectResult | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    setBusy(true);
    setResult(await inspectSubmission(id));
    setBusy(false);
  }

  if (!result) {
    return (
      <button
        type="button"
        onClick={load}
        disabled={busy}
        className="rounded-lg border border-border bg-surface px-3.5 py-2 text-[12.5px] font-semibold text-text-dim transition-[background-color,border-color,color] duration-200 ease-out hover:border-accent/40 hover:text-accent-soft disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? "Reading file..." : "Inspect file"}
      </button>
    );
  }

  if (!result.ok) {
    return (
      <p role="alert" className="text-[12.5px] text-rose">
        {result.error}
      </p>
    );
  }

  return (
    <div className="mt-1 w-full rounded-xl border border-border-soft bg-surface-2/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12.5px] font-semibold text-text">What the file says</p>
        {result.warnings ? (
          <span className="rounded-md border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-[11px] font-semibold text-amber-400">
            Check before publishing
          </span>
        ) : (
          <span className="rounded-md border border-green/30 bg-green/10 px-2 py-0.5 text-[11px] font-semibold text-green">
            Matches the form
          </span>
        )}
      </div>

      {result.existing && (
        <p className="mt-2.5 rounded-lg border border-amber-400/40 bg-amber-400/5 px-3 py-2 text-[11.5px] leading-relaxed text-amber-400">
          The catalog already has a {result.existing.recorder} macro for this level, credited to{" "}
          <span translate="no" className="notranslate font-semibold">
            {result.existing.author}
          </span>
          . Publishing adds a second one rather than replacing it.
        </p>
      )}

      <div className="mt-3 flex flex-col gap-2">
        {(result.findings ?? []).map((f) => (
          <Row key={f.id} finding={f} />
        ))}
      </div>
    </div>
  );
}
