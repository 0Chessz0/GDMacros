"use client";

import { useState } from "react";
import { PlayIcon } from "./icons";

/**
 * Click-to-load YouTube facade: shows the still until the user opts in, so the
 * page never pulls YouTube's player (or its cookies) on first paint.
 */
export default function VideoEmbed({ youtubeId, title }: { youtubeId: string; title: string }) {
  const [playing, setPlaying] = useState(false);

  if (playing) {
    return (
      <div className="aspect-video w-full overflow-hidden rounded-xl border border-border-soft bg-black">
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${youtubeId}?autoplay=1`}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="h-full w-full border-0"
        />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setPlaying(true)}
      aria-label={`Play showcase video for ${title}`}
      className="group relative aspect-video w-full overflow-hidden rounded-xl border border-border-soft bg-surface-2"
    >
      <img
        src={`https://img.youtube.com/vi/${youtubeId}/maxresdefault.jpg`}
        alt=""
        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
        onError={(e) => {
          // maxres doesn't exist for every upload, so fall back to the always-present still.
          const img = e.currentTarget;
          if (!img.dataset.fallback) {
            img.dataset.fallback = "1";
            img.src = `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`;
          }
        }}
      />
      <span className="absolute inset-0 grid place-items-center bg-black/30 transition-colors group-hover:bg-black/45">
        <span className="grid h-16 w-16 place-items-center rounded-full bg-accent text-white shadow-2xl transition-transform group-hover:scale-110">
          <PlayIcon className="h-8 w-8" />
        </span>
      </span>
    </button>
  );
}
