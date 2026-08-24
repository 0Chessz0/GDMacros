"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { recordQualityCheck } from "@/lib/actions/adminTools";

export interface QualityCandidate {
  levelName: string;
  levelId: string;
  levelSlug: string;
  creator: string;
  macroAuthor: string;
  recorder: string;
  downloadUrl: string;
  videoUrl: string | null;
}
export default function QualityCheckCard({ candidate }: { candidate: QualityCandidate }) {
  const router = useRouter();
  const [outcome, setOutcome] = useState<"good" | "issue" | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    if (!outcome) return;
    setError(null);
    startTransition(async () => {
      const result = await recordQualityCheck(candidate.downloadUrl, outcome, note);
      if (result.ok) router.refresh();
      else setError(result.error);
    });
  }

  return (
    <div className="card mt-6 overflow-hidden">
      <div className="border-b border-border-soft bg-surface-2/50 px-5 py-4">
        <p className="text-[11.5px] font-semibold tracking-wide text-muted uppercase">Random catalog entry</p>
        <h2 translate="no" className="notranslate mt-1 text-[20px] font-extrabold text-text">{candidate.levelName}</h2>
        <p className="mt-1 text-[12.5px] text-muted">Level by {candidate.creator} · ID {candidate.levelId}</p>
      </div>
      <div className="grid gap-4 p-5 sm:grid-cols-2">
        <div>
          <p className="text-[11.5px] text-muted">Macro author</p>
          <p translate="no" className="notranslate mt-0.5 text-[14px] font-bold text-text">{candidate.macroAuthor}</p>
        </div>
        <div>
          <p className="text-[11.5px] text-muted">Recorder</p>
          <p className="mt-0.5 text-[14px] font-bold text-text">{candidate.recorder}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2.5 border-t border-border-soft px-5 py-4">
        <a href={candidate.downloadUrl} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-accent px-3.5 py-2 text-[12.5px] font-bold text-white">Download macro</a>
        <Link href={`/macro/${candidate.levelSlug}`} target="_blank" className="rounded-lg border border-border px-3.5 py-2 text-[12.5px] font-semibold text-text-dim">Open catalog page</Link>
        {candidate.videoUrl && <a href={candidate.videoUrl} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-border px-3.5 py-2 text-[12.5px] font-semibold text-text-dim">Watch video</a>}
        <button type="button" onClick={() => router.refresh()} className="ml-auto text-[12.5px] font-semibold text-accent-soft hover:underline">Skip and pick another</button>
      </div>

      <div className="border-t border-border-soft p-5">
        <p className="text-[13px] font-bold text-text">Record the result</p>
        <div className="mt-3 flex flex-wrap gap-2.5">
          <button type="button" onClick={() => setOutcome("good")} className={`rounded-lg border px-3.5 py-2 text-[12.5px] font-semibold ${outcome === "good" ? "border-green bg-green/10 text-green" : "border-border text-muted"}`}>Looks good</button>
          <button type="button" onClick={() => setOutcome("issue")} className={`rounded-lg border px-3.5 py-2 text-[12.5px] font-semibold ${outcome === "issue" ? "border-rose bg-rose/10 text-rose" : "border-border text-muted"}`}>Issue found</button>
        </div>
        <textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={1000} rows={4} placeholder={outcome === "issue" ? "What is wrong?" : "Optional note"} className="mt-3 w-full rounded-xl border border-border bg-bg px-3.5 py-3 text-[13px] text-text outline-none focus:border-accent" />
        {error && <p className="mt-2 text-[12.5px] text-rose">{error}</p>}
        <button type="button" onClick={save} disabled={pending || !outcome || (outcome === "issue" && note.trim().length < 3)} className="mt-3 rounded-xl bg-accent px-4 py-2.5 text-[13px] font-bold text-white disabled:opacity-60">{pending ? "Saving..." : "Save and pick another"}</button>
      </div>
    </div>
  );
}
