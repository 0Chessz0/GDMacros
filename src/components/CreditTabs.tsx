import type { Macro } from "@/lib/types";
import { BotIcon } from "./icons";

/**
 * The two credit tabs: green for whoever built the level, blue for whoever
 * recorded the macro, followed by which tool was used.
 *
 * All three carry `translate="no"`: these are handles and product names, and
 * Google Translate would happily turn "Bloodbath" into "Baño de sangre".
 */
export default function CreditTabs({
  macro,
  verbose = false,
  className = "",
}: {
  macro: Macro;
  verbose?: boolean;
  className?: string;
}) {
  const size = verbose ? "px-3 py-1.5 text-[13px]" : "px-2 py-0.5 text-[11.5px]";

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      <span
        title={`Level created by ${macro.creator}`}
        aria-label={`Level created by ${macro.creator}`}
        className={`rounded-md border border-green/35 bg-green/12 font-medium text-green ${size}`}
      >
        {verbose && <span className="opacity-70">Level by </span>}
        <span translate="no" className="notranslate">
          {macro.creator}
        </span>
      </span>

      <span
        title={`Macro created by ${macro.macroAuthor}`}
        aria-label={`Macro created by ${macro.macroAuthor}`}
        className={`rounded-md border border-accent/35 bg-accent/12 font-medium text-accent-soft ${size}`}
      >
        {verbose && <span className="opacity-70">Macro by </span>}
        <span translate="no" className="notranslate">
          {macro.macroAuthor}
        </span>
      </span>

      <span
        title={`Recorded with ${macro.recorder}`}
        aria-label={`Recorded with ${macro.recorder}`}
        className={`inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-2 font-medium text-text-dim ${size}`}
      >
        <BotIcon className={verbose ? "h-4 w-4 text-muted" : "h-3.5 w-3.5 text-muted"} />
        <span translate="no" className="notranslate">
          {macro.recorder}
        </span>
      </span>
    </div>
  );
}
