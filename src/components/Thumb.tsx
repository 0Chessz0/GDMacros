"use client";

import { useState } from "react";
import type { Macro } from "@/lib/types";

/** Stable pseudo-random hue per macro so placeholder tiles stay distinguishable. */
function hueFor(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return h;
}

export default function Thumb({
  macro,
  className = "",
  rounded = "rounded-lg",
}: {
  macro: Macro;
  className?: string;
  rounded?: string;
}) {
  // Remote stills (YouTube in particular) can 404, so fall through to the tile.
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const hue = hueFor(macro.slug);
  const showImage = macro.thumbnailUrl && !failed;

  return (
    <div className={`relative shrink-0 overflow-hidden ${rounded} bg-surface-2 ${className}`}>
      {showImage ? (
        <>
          {/* Shimmer holds the space until the still arrives, so rows do not
              flash from empty grey to full-bleed artwork. */}
          {!loaded && (
            <span
              aria-hidden="true"
              className="animate-shimmer absolute inset-0 overflow-hidden bg-surface-3/50"
            />
          )}
          <img
            src={macro.thumbnailUrl!}
            alt=""
            loading="lazy"
            decoding="async"
            onLoad={() => setLoaded(true)}
            onError={() => setFailed(true)}
            className={`h-full w-full object-cover transition-[opacity,transform] duration-500 ease-out group-hover:scale-[1.06] ${
              loaded ? "opacity-100" : "opacity-0"
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
