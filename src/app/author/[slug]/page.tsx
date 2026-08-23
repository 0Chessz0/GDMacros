import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon, BotIcon, UserIcon } from "@/components/icons";
import { getAllAuthors, getAuthorBySlug } from "@/lib/authors";
import { site } from "@/lib/site";

export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return getAllAuthors().map((author) => ({ slug: author.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const author = getAuthorBySlug(slug);
  if (!author) return { title: "Author not found" };

  const macroWord = author.macroCount === 1 ? "macro" : "macros";
  const levelWord = author.levelCount === 1 ? "level" : "levels";
  const title = `${author.name} Geometry Dash Macros`;
  const description = `${author.macroCount} Geometry Dash ${macroWord} across ${author.levelCount} ${levelWord}, publicly credited to ${author.name} in the GDMacros catalog.`;

  return {
    title,
    description,
    alternates: { canonical: `/author/${author.slug}` },
    openGraph: {
      title: `${title} | ${site.name}`,
      description,
      url: `/author/${author.slug}`,
      type: "website",
    },
    twitter: {
      card: "summary",
      title: `${title} | ${site.name}`,
      description,
    },
  };
}

function Count({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col rounded-xl border border-border-soft bg-surface-2/60 px-4 py-3">
      <dt className="order-2 mt-0.5 text-[11.5px] font-medium tracking-wide text-muted uppercase">
        {label}
      </dt>
      <dd className="order-1 text-[22px] font-extrabold text-text tabular-nums">{value}</dd>
    </div>
  );
}

export default async function AuthorPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const author = getAuthorBySlug(slug);
  if (!author) notFound();

  return (
    <div className="mx-auto w-full max-w-[860px] px-4 py-8 sm:px-6 sm:py-11">
      <Link
        href="/"
        className="group mb-6 inline-flex items-center gap-1.5 text-[13px] text-muted transition-colors duration-200 hover:text-accent-soft"
      >
        <ArrowLeftIcon className="h-4 w-4 transition-transform duration-200 ease-out group-hover:-translate-x-1" />
        Back to catalog
      </Link>

      <header className="card p-5 sm:p-7">
        <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:items-start sm:gap-5 sm:text-left">
          <span
            aria-hidden="true"
            className="grid h-20 w-20 shrink-0 place-items-center rounded-full border border-border bg-surface-2 text-muted sm:h-24 sm:w-24"
          >
            <UserIcon className="h-10 w-10 sm:h-12 sm:w-12" />
          </span>

          <div className="min-w-0 flex-1">
            <p className="text-[11.5px] font-semibold tracking-[0.1em] text-muted uppercase">
              Catalog author
            </p>
            <h1
              translate="no"
              className="notranslate mt-1 break-words text-[27px] leading-tight font-extrabold tracking-tight text-text sm:text-[34px]"
            >
              {author.name}
            </h1>
            <p className="mt-2 max-w-[590px] text-[13px] leading-relaxed text-muted">
              This page groups public macro credits that use this name. It is not a verified
              account profile and does not identify who controls the name.
            </p>
          </div>
        </div>

        <dl className="mt-6 grid grid-cols-2 gap-2.5 sm:max-w-sm">
          <Count value={author.macroCount} label={author.macroCount === 1 ? "Macro" : "Macros"} />
          <Count value={author.levelCount} label={author.levelCount === 1 ? "Level" : "Levels"} />
        </dl>

        <div className="mt-5 border-t border-border-soft pt-4">
          <p className="text-[11.5px] font-semibold tracking-wide text-muted uppercase">
            Recorder credits
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {author.recorders.map(({ recorder, count }) => (
              <span
                key={recorder}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2.5 py-1 text-[12px] font-medium text-text-dim"
              >
                <BotIcon className="h-3.5 w-3.5 text-muted" />
                <span translate="no" className="notranslate">
                  {recorder}
                </span>
                <span className="text-muted tabular-nums">{count}</span>
              </span>
            ))}
          </div>
        </div>
      </header>

      <section aria-labelledby="author-credits" className="mt-8">
        <div className="mb-3">
          <h2 id="author-credits" className="text-[18px] font-bold text-text sm:text-[20px]">
            Macros credited to{" "}
            <span translate="no" className="notranslate text-accent-soft">
              {author.name}
            </span>
          </h2>
          <p className="mt-1 text-[12.5px] text-muted">
            Open an entry to see its download and full level details.
          </p>
        </div>

        <ul className="flex flex-col gap-2.5">
          {author.credits.map(({ level, macro }) => (
            <li key={`${level.slug}-${macro.position}`} className="defer-offscreen">
              <Link
                href={`/macro/${level.slug}#macro-${macro.position}`}
                aria-label={`${level.name}, macro ${macro.position}, recorded with ${macro.recorder}`}
                className="card group flex min-h-20 flex-col justify-between gap-3 px-4 py-3.5 transition-[border-color,transform] duration-200 ease-out hover:-translate-y-px hover:border-accent/40 active:scale-[0.995] sm:flex-row sm:items-center sm:px-5"
              >
                <span className="min-w-0">
                  <span
                    translate="no"
                    className="notranslate block truncate text-[15px] font-bold text-text transition-colors group-hover:text-accent-soft"
                  >
                    {level.name}
                  </span>
                  <span className="mt-1 block text-[12px] text-muted">
                    Level by{" "}
                    <span translate="no" className="notranslate text-green">
                      {level.creator}
                    </span>{" "}
                    · ID <span className="font-mono text-text-dim">{level.levelId}</span>
                  </span>
                </span>

                <span className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                  <span className="rounded-md border border-accent/30 bg-accent/10 px-2 py-1 text-[11.5px] font-semibold text-accent-soft">
                    Macro {macro.position}
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-2 px-2 py-1 text-[11.5px] font-medium text-text-dim">
                    <BotIcon className="h-3.5 w-3.5 text-muted" />
                    <span translate="no" className="notranslate">
                      {macro.recorder}
                    </span>
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
