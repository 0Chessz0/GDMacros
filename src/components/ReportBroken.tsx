import { site } from "@/lib/site";
import { BugIcon, ExternalIcon } from "./icons";

/**
 * Opens a GitHub issue with the level already filled in, using the
 * broken-macro template in `.github/ISSUE_TEMPLATE`. Prefilling matters: a
 * report that arrives without the level name or ID costs a round trip to be
 * useful, and most people will not bother with the round trip.
 */
export default function ReportBroken({
  name,
  levelId,
  slug,
}: {
  name: string;
  levelId: number | string;
  slug: string;
}) {
  const params = new URLSearchParams({
    template: "broken-macro.yml",
    title: `[Broken] ${name}`,
    labels: "broken macro",
    level: `${name} (ID ${levelId})`,
    page: `${site.url}/macro/${slug}`,
  });

  return (
    <a
      href={`${site.repo}/issues/new?${params.toString()}`}
      target="_blank"
      rel="noopener noreferrer"
      className="group inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-3 text-[14px] font-semibold text-text-dim transition-[background-color,border-color,transform,color] duration-200 ease-out hover:-translate-y-0.5 hover:border-rose/40 hover:text-rose active:translate-y-0 active:scale-95 active:duration-75"
    >
      <BugIcon className="h-[18px] w-[18px] transition-transform duration-300 ease-out group-hover:rotate-12" />
      Report broken
      <ExternalIcon className="h-3.5 w-3.5 opacity-60" />
    </a>
  );
}
