"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createBrokenMacroTicket } from "@/lib/actions/supportTickets";
import { BugIcon } from "./icons";

/**
 * Opens a private support thread after explicit confirmation. The server reads
 * the macro context from the catalog, so a modified browser cannot forge the
 * level or links included in the report.
 */
export default function ReportBroken({
  name,
  slug,
}: {
  name: string;
  slug: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function report() {
    setError(null);
    startTransition(async () => {
      const result = await createBrokenMacroTicket(slug);
      if (result.ok) {
        window.dispatchEvent(new CustomEvent("gdmacros:support-changed"));
        router.push(result.href);
      }
      else if (result.loginHref) router.push(result.loginHref);
      else setError(result.error);
    });
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setConfirming((value) => !value)}
        className="group inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-3 text-[14px] font-semibold text-text-dim transition-[background-color,border-color,transform,color] duration-200 ease-out hover:-translate-y-0.5 hover:border-rose/40 hover:text-rose active:translate-y-0 active:scale-95"
      >
        <BugIcon className="h-[18px] w-[18px] transition-transform duration-300 group-hover:rotate-12" />
        Report broken
      </button>

      {confirming && (
        <div className="absolute right-0 bottom-[calc(100%+10px)] z-30 w-[310px] max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-nav p-4 text-left shadow-2xl">
          <p className="text-[13.5px] font-bold text-text">Report {name} as broken?</p>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
            You must be signed in. This immediately opens a private support thread containing the known download details.
          </p>
          {error && <p role="alert" className="mt-2 text-[12px] text-rose">{error}</p>}
          <div className="mt-3 flex gap-2.5">
            <button type="button" onClick={report} disabled={pending} className="rounded-lg bg-rose px-3 py-2 text-[12.5px] font-bold text-white disabled:opacity-60">
              {pending ? "Opening..." : "Yes, open ticket"}
            </button>
            <button type="button" onClick={() => setConfirming(false)} disabled={pending} className="text-[12.5px] text-muted hover:text-text">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
