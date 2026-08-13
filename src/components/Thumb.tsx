"use client";

import { useEffect, useRef, useState } from "react";
import type { Macro } from "@/lib/types";

/** Stable pseudo-random hue per macro so placeholder tiles stay distinguishable. */
function hueFor(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return h;
}

type Status = "loading" | "loaded" | "failed";

export default function Thumb({
  macro,
  className = "",
  rounded = "rounded-lg",
}: {
  macro: Macro;
  className?: string;
  rounded?: string;
}) {
  const [status, setStatus] = useState<Status>("loading");
  const imgRef = useRef<HTMLImageElement>(null);
  const src = macro.thumbnailUrl;

  /*
   * Server-rendered <img> tags start downloading as soon as the HTML parses,
   * which is usually before React hydrates and attaches onLoad. A load event
   * that already fired never fires again, so relying on onLoad alone leaves the
   * image stuck at opacity 0 behind an endless shimmer on every fresh page load.
   *
   * Reconciling against `complete` on mount closes that gap. `naturalWidth === 0`
   * on a completed image means it failed, which also covers a missed onError.
   */
  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;

    setStatus("loading");
    if (img.complete) {
      setStatus(img.naturalWidth > 0 ? "loaded" : "failed");
    }
  }, [src]);

  const hue = hueFor(macro.slug);
  const showImage = src && status !== "failed";

  return (
    <div className={`relative shrink-0 overflow-hidden ${rounded} bg-surface-2 ${className}`}>
      {showImage ? (
        <>
          {status === "loading" && (
            <span
              aria-hidden="true"
              className="animate-shimmer absolute inset-0 overflow-hidden bg-surface-3/50"
            />
          )}
          <img
            ref={imgRef}
            src={src}
            alt=""
            loading="lazy"
            decoding="async"
            onLoad={() => setStatus("loaded")}
            onError={() => setStatus("failed")}
            className={`h-full w-full object-cover transition-[opacity,transform] duration-500 ease-out group-hover:scale-[1.06] ${
              status === "loaded" ? "opacity-100" : "opacity-0"
            }`}
          />
        </>
      ) : (
        <div
          className="grid h-full w-full place-items-center transition-transform duration-500 ease-out group-hover:scale-[1.06]"
          style={{
            background: `linear-gradient(135deg, hsl(${hue} 45% 26%), hsl(${(hue + 48) % 360} 50% 15%))`,
          }}
        >
          <span className="text-2xl font-black text-white/70">{macro.name.charAt(0).toUpperCase()}</span>
        </div>
      )}
    </div>
  );
}
