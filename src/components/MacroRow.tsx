"use client";

import Link from "next/link";
import { hostAccent } from "@/lib/format";
import type { Macro } from "@/lib/types";
import { useSpotlight } from "@/lib/useSpotlight";
import CreditTabs from "./CreditTabs";
import Thumb from "./Thumb";
import { DownloadIcon } from "./icons";

export default function MacroRow({ macro, index }: { macro: Macro; index: number }) {
  const accent = hostAccent(macro.downloadType);
  const spotlight = useSpotlight<HTMLAnchorElement>();

  return (
    <Link
      href={`/macro/${macro.slug}`}
      {...spotlight}
      style={
        {
          "--i": index,
          // Lets the browser morph this exact row when the list is refiltered
          // or switched between list and grid.
          viewTransitionName: `macro-${macro.slug}`,
        } as React.CSSProperties
      }
      className="animate-rise card spotlight group flex items-center gap-3.5 p-3.5 transition-[border-color,transform] duration-200 ease-out hover:-translate-y-px hover:border-accent/40 active:scale-[0.995] active:duration-75 sm:gap-4 sm:p-4"
    >
      <Thumb macro={macro} className="aspect-video w-[116px] sm:w-[170px] lg:w-[225px]" />

      <div className="min-w-0 flex-1">
        <h2
          translate="no"
          className="notranslate truncate text-[16px] font-bold text-text transition-colors group-hover:text-accent-soft sm:text-[19px]"
        >
          {macro.name}
        </h2>
        <CreditTabs macro={macro} className="mt-2" />
      </div>

      <div className="hidden shrink-0 flex-col items-end gap-1.5 lg:flex">
        <span className="flex items-center gap-1.5 text-[12.5px] text-text-dim">
          <DownloadIcon
            className="h-4 w-4 transition-transform duration-300 ease-out group-hover:translate-y-0.5"
            style={accent ? { color: accent } : undefined}
          />
          <span translate="no" className="notranslate">
            {macro.downloadType}
          </span>
        </span>
        <span className="font-mono text-[11.5px] text-muted">ID {macro.levelId}</span>
      </div>
    </Link>
  );
}
