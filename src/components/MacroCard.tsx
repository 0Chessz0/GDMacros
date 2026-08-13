import Link from "next/link";
import { hostAccent } from "@/lib/format";
import type { Macro } from "@/lib/types";
import CreditTabs from "./CreditTabs";
import Thumb from "./Thumb";
import { DownloadIcon } from "./icons";

/** Grid-view tile. Same data as MacroRow, stacked instead of inline. */
export default function MacroCard({ macro, index }: { macro: Macro; index: number }) {
  const accent = hostAccent(macro.downloadType);

  return (
    <Link
      href={`/macro/${macro.slug}`}
      style={{ "--i": index } as React.CSSProperties}
      className="animate-rise card group flex flex-col overflow-hidden transition-[border-color,transform] hover:-translate-y-0.5 hover:border-accent/40"
    >
      <Thumb macro={macro} className="aspect-video w-full" rounded="rounded-none" />

      <div className="flex flex-1 flex-col p-3.5">
        <h2
          translate="no"
          className="notranslate truncate text-[15px] font-bold text-text transition-colors group-hover:text-accent-soft"
        >
          {macro.name}
        </h2>
        <CreditTabs macro={macro} className="mt-2" />

        <div className="mt-auto flex items-center gap-1.5 pt-3 text-[12px] text-muted">
          <DownloadIcon className="h-4 w-4" style={accent ? { color: accent } : undefined} />
          <span translate="no" className="notranslate">
            {macro.downloadType}
          </span>
        </div>
      </div>
    </Link>
  );
}
