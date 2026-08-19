"use client";

import Link from "next/link";
import { hostAccent } from "@/lib/format";
import type { Level } from "@/lib/types";
import { useSpotlight } from "@/lib/useSpotlight";
import CreditTabs from "./CreditTabs";
import Thumb from "./Thumb";
import { DownloadIcon } from "./icons";

export default function MacroRow({ level, index }: { level: Level; index: number }) {
  const spotlight = useSpotlight<HTMLAnchorElement>();

  // With one macro the host is worth naming. With several, the count says more,
  // and the hosts are listed per macro on the detail page.
  const only = level.macros.length === 1 ? level.macros[0] : null;
  const accent = only ? hostAccent(only.downloadType) : null;

  return (
    <Link
      href={`/macro/${level.slug}`}
      {...spotlight}
      style={
        {
          "--i": index,
          // Lets the browser morph this exact row when the list is refiltered
          // or switched between list and grid.
          viewTransitionName: `macro-${level.slug}`,
        } as React.CSSProperties
      }
      className="animate-rise card spotlight group defer-offscreen flex items-center gap-3.5 p-3.5 transition-[border-color,transform] duration-200 ease-out hover:-translate-y-px hover:border-accent/40 active:scale-[0.995] active:duration-75 sm:gap-4 sm:p-4"
    >
      <Thumb level={level} className="aspect-video w-[116px] sm:w-[170px] lg:w-[225px]" />

      <div className="min-w-0 flex-1">
        <h2
          translate="no"
          className="notranslate truncate text-[16px] font-bold text-text transition-colors group-hover:text-accent-soft sm:text-[19px]"
        >
          {level.name}
        </h2>
        <CreditTabs level={level} className="mt-2" />
      </div>

      <div className="hidden shrink-0 flex-col items-end gap-1.5 lg:flex">
        <span className="flex items-center gap-1.5 text-[12.5px] text-text-dim">
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
        </span>
        <span className="font-mono text-[11.5px] text-muted">ID {level.levelId}</span>
      </div>
    </Link>
  );
}
