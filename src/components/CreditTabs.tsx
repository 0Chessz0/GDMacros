import type { Level } from "@/lib/types";
import { BotIcon } from "./icons";

/**
 * Level credits for the catalog rows.
 *
 * The green tab is always the level creator. What follows depends on how many
 * macros the level has: with one, there is room to name its author outright;
 * with several, the count is the useful thing and the authors are listed
 * per-macro on the detail page instead.
 */
export default function CreditTabs({
  level,
  className = "",
}: {
  level: Level;
  className?: string;
}) {
  const size = "px-2 py-0.5 text-[11.5px]";
  const single = level.macros.length === 1 ? level.macros[0] : null;

  // Deduped, so a level with three xdBot macros shows one xdBot chip.
  const recorders = [...new Set(level.macros.map((m) => m.recorder))];

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      <span
        title={`Level created by ${level.creator}`}
        className={`rounded-md border border-green/35 bg-green/12 font-medium text-green ${size}`}
      >
        <span translate="no" className="notranslate">
          {level.creator}
        </span>
      </span>

      {single ? (
        <span
          title={`Macro by ${single.author}`}
          className={`rounded-md border border-accent/35 bg-accent/12 font-medium text-accent-soft ${size}`}
        >
          <span translate="no" className="notranslate">
            {single.author}
          </span>
        </span>
      ) : (
        <span
          title={`${level.macros.length} macros available for this level`}
          className={`rounded-md border border-accent/35 bg-accent/12 font-semibold text-accent-soft ${size}`}
        >
          {level.macros.length} macros
        </span>
      )}

      {recorders.map((recorder) => (
        <span
          key={recorder}
          title={`Recorded with ${recorder}`}
          className={`inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-2 font-medium text-text-dim ${size}`}
        >
          <BotIcon className="h-3.5 w-3.5 text-muted" />
          <span translate="no" className="notranslate">
            {recorder}
          </span>
        </span>
      ))}
    </div>
  );
}
