"use client";

import { useFavorites } from "@/lib/localStore";
import { StarIcon } from "./icons";

/**
 * Stars a macro, saved to this browser only. There are no accounts, so the list
 * does not follow anyone to another device, and the button says so on hover
 * rather than pretending otherwise.
 */
export default function FavoriteButton({ slug, name }: { slug: string; name: string }) {
  const { isFavorite, toggle, ready } = useFavorites();
  const active = isFavorite(slug);

  return (
    <button
      type="button"
      onClick={() => toggle(slug)}
      // Disabled until the stored list has been read, so it cannot flash the
      // wrong state and then correct itself.
      disabled={!ready}
      aria-pressed={active}
      title={active ? `Remove ${name} from favorites` : `Save ${name} to favorites, on this device`}
      className={`group inline-flex items-center gap-2 rounded-xl border px-4 py-3 text-[14px] font-semibold transition-[background-color,border-color,transform,color] duration-200 ease-out hover:-translate-y-0.5 active:translate-y-0 active:scale-95 active:duration-75 disabled:opacity-60 ${
        active
          ? "border-amber/50 bg-amber/12 text-amber"
          : "border-border bg-surface text-text-dim hover:border-amber/40 hover:text-amber"
      }`}
    >
      <StarIcon
        filled={active}
        className={`h-[18px] w-[18px] transition-transform duration-300 ease-out ${
          active ? "scale-110" : "group-hover:rotate-12"
        }`}
      />
      {active ? "Favorited" : "Favorite"}
    </button>
  );
}
