"use client";

import { useState } from "react";
import { clearAllStored } from "@/lib/localStore";
import { CheckIcon } from "./icons";

/**
 * Wipes everything the site keeps in this browser. Offered on the privacy page
 * so the claim that it is all local and all yours is something you can act on,
 * not just something we assert.
 */
export default function ClearStored() {
  const [done, setDone] = useState(false);

  return (
    <button
      type="button"
      onClick={() => {
        clearAllStored();
        setDone(true);
      }}
      className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-[12.5px] font-medium transition-colors duration-200 ${
        done
          ? "border-green/40 bg-green/10 text-green"
          : "border-border bg-surface text-text-dim hover:border-rose/40 hover:text-rose"
      }`}
    >
      {done && <CheckIcon className="h-3.5 w-3.5" />}
      {done ? "Cleared from this browser" : "Clear everything stored here"}
    </button>
  );
}
