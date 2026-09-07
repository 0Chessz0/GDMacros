"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ADSENSE_ENABLED, hasConfiguredAdSlot, isAdSupportedPath } from "@/lib/adsense";
import { XIcon } from "@/components/icons";

const DISMISSED_KEY = "gdmacros:adblock-notice-dismissed";

function wasDismissedThisTab(): boolean {
  try {
    return window.sessionStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

export default function AdBlockNotice() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!ADSENSE_ENABLED || !hasConfiguredAdSlot() || !isAdSupportedPath(pathname)) {
      setVisible(false);
      return;
    }
    if (wasDismissedThisTab()) return;

    const bait = document.createElement("div");
    bait.className = "adsbox ad-banner ad-unit";
    bait.setAttribute("aria-hidden", "true");
    bait.style.cssText =
      "position:absolute;left:-10000px;top:-10000px;width:2px;height:2px;pointer-events:none;";
    document.body.appendChild(bait);

    const timer = window.setTimeout(() => {
      const style = window.getComputedStyle(bait);
      const blocked =
        bait.offsetHeight === 0 ||
        bait.clientHeight === 0 ||
        style.display === "none" ||
        style.visibility === "hidden";
      bait.remove();
      if (blocked) setVisible(true);
    }, 500);

    return () => {
      window.clearTimeout(timer);
      bait.remove();
    };
  }, [pathname]);

  function dismiss() {
    try {
      window.sessionStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // The notice can still be dismissed even when storage is unavailable.
    }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <aside
      role="status"
      aria-label="Ad blocker notice"
      className="fixed inset-x-3 bottom-3 z-[70] mx-auto max-w-[620px] rounded-xl border border-border bg-surface p-4 shadow-2xl sm:bottom-5 sm:p-5"
    >
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss ad blocker notice"
        className="absolute top-3 right-3 grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-text"
      >
        <XIcon className="h-4 w-4" />
      </button>
      <p className="pr-9 text-[15px] font-bold text-text">Using an ad blocker?</p>
      <p className="mt-1.5 pr-5 text-[13.5px] leading-relaxed text-text-dim">
        Ads help cover GDMacros&apos; hosting costs. If you are comfortable doing so, please allow
        ads for gdmacros.com. You can keep using the entire site either way.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-lg bg-accent px-3.5 py-2 text-[13px] font-semibold text-white hover:bg-accent-hover"
        >
          I&apos;ve allowed ads
        </button>
        <button
          type="button"
          onClick={dismiss}
          className="rounded-lg border border-border bg-surface-2 px-3.5 py-2 text-[13px] font-semibold text-text-dim hover:text-text"
        >
          Not now
        </button>
      </div>
    </aside>
  );
}
