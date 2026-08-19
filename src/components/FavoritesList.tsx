"use client";

import Link from "next/link";
import { useFavorites } from "@/lib/localStore";
import type { Level } from "@/lib/types";
import MacroRow from "./MacroRow";
import { StarIcon } from "./icons";

/**
 * The favorites page body. The whole list lives in this browser, so everything
 * has to happen after mount: the server has no idea what anyone starred.
 */
export default function FavoritesList({ levels }: { levels: Level[] }) {
  const { favorites, ready, toggle } = useFavorites();

  if (!ready) {
    // Holds the height so the page does not jump once storage is read.
    return <div className="min-h-[240px]" aria-hidden="true" />;
  }

  const bySlug = new Map(levels.map((l) => [l.slug, l]));
  const saved = favorites.map((s) => bySlug.get(s)).filter((l): l is Level => Boolean(l));

  if (saved.length === 0) {
    return (
      <div className="card flex flex-col items-center gap-3 px-6 py-16 text-center">
        <span className="grid h-12 w-12 place-items-center rounded-full bg-surface-2 text-muted">
          <StarIcon className="h-5 w-5" />
        </span>
        <p className="text-[15px] font-semibold text-text">Nothing saved yet</p>
        <p className="max-w-sm text-[13px] text-muted">
          Open any macro and press <span className="font-semibold text-text-dim">Favorite</span> to
          keep it here. Favorites are stored in this browser, so they stay on this device and there
          is no account to make.
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
          <span className="font-semibold text-text-dim tabular-nums">{saved.length}</span> saved in
          this browser
        </p>
        <button
          type="button"
          onClick={() => saved.forEach((l) => toggle(l.slug))}
          className="text-[12.5px] text-muted transition-colors hover:text-rose"
        >
          Remove all
        </button>
      </div>

      <div className="flex flex-col gap-3.5">
        {saved.map((level, i) => (
          <MacroRow key={level.slug} level={level} index={Math.min(i, 12)} />
        ))}
      </div>
    </>
  );
}
