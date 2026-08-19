"use client";

import { STORE_KEYS, useStoredList } from "@/lib/localStore";
import type { Level } from "@/lib/types";
import MacroStrip from "./MacroStrip";

/**
 * The macros this visitor opened most recently, read from their own browser.
 * No account, no server, nothing leaves the device.
 *
 * Renders nothing until the stored list has been read after mount, so the
 * server output and the first client paint agree.
 */
export default function RecentlyViewed({ levels }: { levels: Level[] }) {
  const [slugs, setSlugs, ready] = useStoredList(STORE_KEYS.recent);
  if (!ready || slugs.length === 0) return null;

  // Resolved in stored order, newest first. A slug that no longer exists, from
  // a renamed or removed level, simply drops out.
  const bySlug = new Map(levels.map((l) => [l.slug, l]));
  const resolved = slugs.map((s) => bySlug.get(s)).filter((l): l is Level => Boolean(l));
  if (resolved.length === 0) return null;

  return (
    <MacroStrip
      id="recently-viewed"
      title="Recently viewed"
      levels={resolved}
      aside={
        <button
          type="button"
          onClick={() => setSlugs([])}
          className="text-[12px] text-muted transition-colors hover:text-text-dim"
        >
          Clear
        </button>
      }
    />
  );
}
