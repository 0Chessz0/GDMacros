"use client";

import { useEffect } from "react";
import { migrateStoredFavorites, useFavorites } from "@/lib/favorites";
import { StarIcon } from "./icons";

/**
 * Stars a macro. Kept in this browser, and synced to the account when signed in.
 *
 * Keyed on the level id rather than the slug, because the slug is derived from
 * the level name and a rename would orphan the favorite.
 */
export default function FavoriteButton({
  levelId,
  slug,
  name,
}: {
  levelId: string;
  slug: string;
  name: string;
}) {
  const { isFavorite, toggle, ready } = useFavorites();
  const active = isFavorite(levelId);

  // This page knows one level, so it can only migrate that one entry. Anything
  // it does not recognise is left for a page that has the whole catalog.
  useEffect(() => {
    migrateStoredFavorites([{ slug, levelId }], false);
  }, [slug, levelId]);

  return (
    <button
      type="button"
      onClick={() => toggle(levelId)}
      // Disabled until the stored list has been read, so it cannot flash the
      // wrong state and then correct itself.
      disabled={!ready}
      aria-pressed={active}
      title={active ? `Remove ${name} from favorites` : `Save ${name} to favorites`}
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
