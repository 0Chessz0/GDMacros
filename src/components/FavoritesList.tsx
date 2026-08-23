"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { migrateStoredFavorites, useFavorites } from "@/lib/favorites";
import type { Level } from "@/lib/types";
import MacroRow from "./MacroRow";
import { StarIcon } from "./icons";

/**
 * The favorites page body. Everything happens after mount: the server renders
 * nothing here, because the list is either in this browser or on the account.
 */
export default function FavoritesList({ levels }: { levels: Level[] }) {
  const { favorites, ready, toggle } = useFavorites();
  const [confirming, setConfirming] = useState(false);

  // This page has the whole catalog, so it can finish the slug to level id
  // migration outright, including dropping entries for levels that are gone.
  useEffect(() => {
    migrateStoredFavorites(
      levels.map((l) => ({ slug: l.slug, levelId: String(l.levelId) })),
      true,
    );
  }, [levels]);

  if (!ready) {
    // Holds the height so the page does not jump once storage is read.
    return <div className="min-h-[240px]" aria-hidden="true" />;
  }

  const byId = new Map(levels.map((l) => [String(l.levelId), l]));
  const saved = favorites.map((id) => byId.get(id)).filter((l): l is Level => Boolean(l));

  if (saved.length === 0) {
    return (
      <div className="card flex flex-col items-center gap-3 px-6 py-16 text-center">
        <span className="grid h-12 w-12 place-items-center rounded-full bg-surface-2 text-muted">
          <StarIcon className="h-5 w-5" />
        </span>
        <p className="text-[15px] font-semibold text-text">Nothing saved yet</p>
        <p className="max-w-sm text-[13px] text-muted">
          Open any macro and press <span className="font-semibold text-text-dim">Favorite</span> to
          keep it here. Signed out, favorites stay in this browser. Signed in, they follow you to
          your other devices.
        </p>
        <Link
          href="/"
          className="mt-1 rounded-lg bg-accent px-3.5 py-2 text-[13px] font-medium text-white transition-[background-color,transform] duration-200 ease-out hover:bg-accent-hover active:scale-95 active:duration-75"
        >
          Browse all macros
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[12.5px] text-muted">
          <span className="font-semibold text-text-dim tabular-nums">{saved.length}</span> saved
        </p>
        {/*
          Two steps, because this is the one irreversible action on the page.
          Signed out there is no server copy to restore from, and signed in it
          clears the synced list on every device. An inline confirm is used
          rather than window.confirm so the warning can say which of those two
          situations the visitor is actually in.
        */}
        {confirming ? (
          <span className="flex flex-wrap items-center gap-2.5">
            <span className="text-[12.5px] text-text-dim">
              Remove all {saved.length}? This cannot be undone.
            </span>
            <button
              type="button"
              onClick={() => {
                // Each toggle re-reads the stored list, so these do not fight
                // over one stale snapshot the way a state-derived list would.
                saved.forEach((l) => toggle(String(l.levelId)));
                setConfirming(false);
              }}
              className="rounded-lg border border-rose/40 bg-rose/10 px-2.5 py-1 text-[12.5px] font-semibold text-rose transition-colors hover:bg-rose/15"
            >
              Remove all
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="text-[12.5px] text-muted transition-colors hover:text-text-dim"
            >
              Cancel
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="text-[12.5px] text-muted transition-colors hover:text-rose"
          >
            Remove all
          </button>
        )}
      </div>

      <div className="flex flex-col gap-3.5">
        {saved.map((level, i) => (
          <MacroRow key={level.slug} level={level} index={Math.min(i, 12)} />
        ))}
      </div>
    </>
  );
}
