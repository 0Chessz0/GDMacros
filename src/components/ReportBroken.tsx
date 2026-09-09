"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
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

  useEffect(() => {
    if (!confirming) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setConfirming(false);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [confirming]);

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

      {confirming && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !pending) setConfirming(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="broken-report-title"
            className="max-h-[calc(100dvh-2rem)] w-full max-w-[390px] overflow-y-auto rounded-xl border border-border bg-nav p-4 text-left shadow-2xl sm:p-5"
          >
            <p id="broken-report-title" className="break-words text-[14px] font-bold text-text">
              Report {name} as broken?
            </p>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
              You must be signed in. This immediately opens a private support thread containing the known download details.
            </p>
            {error && <p role="alert" className="mt-2 break-words text-[12px] text-rose">{error}</p>}
            <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={pending}
                className="min-h-10 rounded-lg border border-border px-3 py-2 text-[12.5px] font-semibold text-muted hover:text-text disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={report}
                disabled={pending}
                className="min-h-10 rounded-lg bg-rose px-3 py-2 text-[12.5px] font-bold text-white disabled:opacity-60"
              >
                {pending ? "Opening..." : "Yes, open ticket"}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
