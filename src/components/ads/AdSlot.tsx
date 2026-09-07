"use client";

import { useEffect, useRef } from "react";
import { ADSENSE_CLIENT, ADSENSE_ENABLED } from "@/lib/adsense";

declare global {
  interface Window {
    adsbygoogle?: Record<string, unknown>[];
  }
}

export default function AdSlot({ slot, className = "" }: { slot: string; className?: string }) {
  const requested = useRef(false);

  useEffect(() => {
    if (!ADSENSE_ENABLED || !slot || requested.current) return;
    requested.current = true;

    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      // An ad blocker or an unavailable ad network must never break the page.
    }
  }, [slot]);

  if (!ADSENSE_ENABLED || !slot) return null;

  return (
    <aside aria-label="Advertisement" className={`gdm-ad-slot ${className}`}>
      <style>{`
        .gdm-responsive-ad {
          display: block;
          width: 100%;
          max-width: 320px;
          height: 100px;
          margin: 0 auto;
        }
        @media (min-width: 500px) {
          .gdm-responsive-ad { width: 468px; max-width: 100%; height: 60px; }
        }
        @media (min-width: 800px) {
          .gdm-responsive-ad { width: 728px; max-width: 100%; height: 90px; }
        }
      `}</style>
      <span className="gdm-ad-label">Advertisement</span>
      <ins
        className="adsbygoogle gdm-responsive-ad"
        data-ad-client={ADSENSE_CLIENT}
        data-ad-slot={slot}
      />
    </aside>
  );
}
