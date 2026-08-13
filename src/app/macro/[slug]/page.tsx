import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import CopyButton from "@/components/CopyButton";
import CreditTabs from "@/components/CreditTabs";
import Thumb from "@/components/Thumb";
import VideoEmbed from "@/components/VideoEmbed";
import {
  ArrowLeftIcon,
  DownloadIcon,
  GamepadIcon,
} from "@/components/icons";
import { hostAccent, isPlaceholderLink, levelUrl } from "@/lib/format";
import { getAllMacros, getMacroBySlug, getNeighbours } from "@/lib/macros";

export function generateStaticParams() {
  return getAllMacros().map((m) => ({ slug: m.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const macro = getMacroBySlug(slug);
  if (!macro) return { title: "Macro not found" };

  const title = `Macro for ${macro.name} by ${macro.macroAuthor}`;
  const description =
    macro.description ??
    `${macro.name} by ${macro.creator}. Macro recorded by ${macro.macroAuthor}, available on ${macro.downloadType}.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: macro.thumbnailUrl ? [macro.thumbnailUrl] : undefined,
    },
  };
}

export default async function MacroPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const macro = getMacroBySlug(slug);
  if (!macro) notFound();

  const { prev, next } = getNeighbours(slug);
  const accent = hostAccent(macro.downloadType);
  const unavailable = isPlaceholderLink(macro.downloadLink);

  return (
    <div className="mx-auto w-full max-w-[740px] px-4 py-7 sm:px-6 sm:py-9">
      <Link
        href="/"
        className="group mb-6 inline-flex items-center gap-1.5 text-[13px] text-muted transition-colors duration-200 hover:text-accent-soft"
      >
        {/* The arrow leads the way back, so it moves first. */}
        <ArrowLeftIcon className="h-4 w-4 transition-transform duration-200 ease-out group-hover:-translate-x-1" />
        Back to catalog
      </Link>

      {/* Title + the two credit tabs, centred like the reference. */}
      <div className="flex flex-col items-center text-center">
        <h1
          translate="no"
          className="notranslate text-[30px] leading-tight font-extrabold tracking-tight text-text sm:text-[38px]"
        >
          {macro.name}
        </h1>
        <CreditTabs macro={macro} verbose className="mt-3 justify-center" />
      </div>

      <div className="mt-7">
        {macro.youtubeId ? (
          <VideoEmbed youtubeId={macro.youtubeId} title={`${macro.name} by ${macro.macroAuthor}`} />
        ) : (
          <Thumb macro={macro} className="aspect-video w-full" rounded="rounded-xl" />
        )}
      </div>

      {macro.description && (
        <p className="mx-auto mt-6 max-w-[600px] text-center text-[14.5px] leading-relaxed text-text-dim">
          {macro.description}
        </p>
      )}

      {/* Download card, centred per the reference layout. */}
      <div className="mt-8 flex justify-center">
        {unavailable ? (
          <div className="card w-full max-w-[340px] px-6 py-5 text-center">
            <p className="text-[11px] font-semibold tracking-[0.12em] text-muted uppercase">Download</p>
            <p className="mt-1 text-[18px] font-bold text-muted">Not available yet</p>
            <p className="mt-1.5 text-[12.5px] text-muted">
              No link has been added for this macro.
            </p>
          </div>
        ) : (
          <div className="card group w-full max-w-[340px] overflow-hidden transition-[transform,border-color] duration-200 ease-out hover:-translate-y-0.5 hover:border-accent/40">
            <a
              href={macro.downloadLink}
              target="_blank"
              rel="noopener noreferrer"
              className="block px-6 pt-5 pb-4 text-center transition-colors duration-200 hover:bg-surface-2 active:scale-[0.98] active:duration-75"
            >
              <p className="text-[11px] font-semibold tracking-[0.12em] text-muted uppercase">
                Download
              </p>
              <p className="mt-1.5 flex items-center justify-center gap-2 text-[19px] font-bold text-text">
                <DownloadIcon
                  className="h-[19px] w-[19px]"
                  style={accent ? { color: accent } : undefined}
                />
                <span translate="no" className="notranslate">
                  {macro.downloadType}
                </span>
              </p>
            </a>
            <div className="border-t border-border-soft px-6 py-2.5 text-center">
              <CopyButton value={macro.downloadLink} />
            </div>
          </div>
        )}
      </div>

      {/* GD Browser: https://gdbrowser.com/<levelId> */}
      <div className="mt-6 flex justify-center">
        <a
          href={levelUrl(macro.levelId)}
          target="_blank"
          rel="noopener noreferrer"
          className="group inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-3 text-[14px] font-semibold text-white shadow-lg shadow-accent/20 transition-[background-color,transform] duration-200 ease-out hover:-translate-y-0.5 hover:bg-accent-hover active:translate-y-0 active:scale-95 active:duration-75"
        >
          <GamepadIcon className="h-[19px] w-[19px] transition-transform duration-300 ease-out group-hover:-rotate-12" />
          GD Browser
        </a>
      </div>

      <div className="mt-4 flex items-center justify-center gap-2 text-[12px] text-muted">
        <span>
          Level ID <span className="font-mono text-text-dim">{macro.levelId}</span>
        </span>
        <CopyButton value={String(macro.levelId)} label="Copy" className="text-[12px]" />
      </div>

      {/* Alphabetical neighbours. */}
      {(prev || next) && (
        <nav className="mt-12 grid gap-2.5 border-t border-border-soft pt-6 sm:grid-cols-2">
          {prev ? (
            <Link
              href={`/macro/${prev.slug}`}
              className="card group px-4 py-3 transition-[border-color,transform] duration-200 ease-out hover:-translate-x-1 hover:border-accent/40 active:scale-[0.98] active:duration-75"
            >
              <p className="text-[11px] tracking-wider text-muted uppercase">Previous</p>
              <p
                translate="no"
                className="notranslate mt-0.5 truncate text-[14px] font-semibold text-text-dim transition-colors group-hover:text-accent-soft"
              >
                {prev.name}
              </p>
            </Link>
          ) : (
            <span />
          )}
          {next && (
            <Link
              href={`/macro/${next.slug}`}
              className="card group px-4 py-3 text-right transition-[border-color,transform] duration-200 ease-out hover:translate-x-1 hover:border-accent/40 active:scale-[0.98] active:duration-75 sm:col-start-2"
            >
              <p className="text-[11px] tracking-wider text-muted uppercase">Next</p>
              <p
                translate="no"
                className="notranslate mt-0.5 truncate text-[14px] font-semibold text-text-dim transition-colors group-hover:text-accent-soft"
              >
                {next.name}
              </p>
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
