"use client";

import Link from "next/link";
import type { Level } from "@/lib/types";
import Thumb from "./Thumb";

/**
 * A short row of macro tiles above the catalog, used by "Recently viewed" and
 * by the favorites page. Kept deliberately small: it is a shortcut back to
 * something, not a second catalog.
 */
export default function MacroStrip({
  levels,
  title,
  id,
  aside,
}: {
  levels: Level[];
  title: string;
  id: string;
  aside?: React.ReactNode;
}) {
  if (levels.length === 0) return null;

  return (
    <section aria-labelledby={id} className="mb-6">
      <div className="mb-2.5 flex items-baseline justify-between gap-3">
        <h2 id={id} className="text-[12px] font-bold tracking-[0.08em] text-muted uppercase">
          {title}
        </h2>
        {aside}
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {levels.map((level) => (
          <Link
            key={level.slug}
            href={`/macro/${level.slug}`}
            className="card group flex items-center gap-3 p-2.5 transition-[border-color,transform] duration-200 ease-out hover:-translate-y-0.5 hover:border-accent/40"
          >
            <div className="h-[42px] w-[74px] shrink-0">
              <Thumb level={level} className="h-full w-full" rounded="rounded-md" />
            </div>
            <div className="min-w-0 flex-1">
              <p
                translate="no"
                className="notranslate truncate text-[13px] font-bold text-text transition-colors group-hover:text-accent-soft"
              >
                {level.name}
              </p>
              <p className="mt-0.5 truncate text-[11.5px] text-muted">
                <span className="text-green">{level.creator}</span>
                <span className="mx-1.5 text-muted/40">·</span>
                {level.macros.length} macro{level.macros.length === 1 ? "" : "s"}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
