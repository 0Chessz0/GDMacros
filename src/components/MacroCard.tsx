"use client";

import Link from "next/link";
import { hostAccent } from "@/lib/format";
import type { Level } from "@/lib/types";
import { useSpotlight } from "@/lib/useSpotlight";
import CreditTabs from "./CreditTabs";
import Thumb from "./Thumb";
import { DownloadIcon } from "./icons";

/** Grid-view tile. Same data as MacroRow, stacked instead of inline. */
export default function MacroCard({ level, index }: { level: Level; index: number }) {
  const spotlight = useSpotlight<HTMLAnchorElement>();

  const only = level.macros.length === 1 ? level.macros[0] : null;
  const accent = only ? hostAccent(only.downloadType) : null;

  return (
    <Link
      href={`/macro/${level.slug}`}
      {...spotlight}
      style={
        {
          "--i": index,
          // Shares its name with the list row, so switching layout morphs the
          // same element rather than swapping one component for another.
          viewTransitionName: `macro-${level.slug}`,
        } as React.CSSProperties
      }
      className="animate-rise card spotlight group flex flex-col overflow-hidden transition-[border-color,transform] duration-200 ease-out hover:-translate-y-0.5 hover:border-accent/40 active:scale-[0.985] active:duration-75"
    >
      <Thumb level={level} className="aspect-video w-full" rounded="rounded-none" />

      <div className="flex flex-1 flex-col p-3.5">
        <h2
          translate="no"
          className="notranslate truncate text-[15px] font-bold text-text transition-colors group-hover:text-accent-soft"
        >
          {level.name}
        </h2>
        <CreditTabs level={level} className="mt-2" />

        <div className="mt-auto flex items-center gap-1.5 pt-3 text-[12px] text-muted">
          <DownloadIcon
            className="h-4 w-4 transition-transform duration-300 ease-out group-hover:translate-y-0.5"
            style={accent ? { color: accent } : undefined}
          />
          {only ? (
            <span translate="no" className="notranslate">
              {only.downloadType}
            </span>
          ) : (
            <span>{level.macros.length} downloads</span>
          )}
        </div>
      </div>
    </Link>
  );
}
