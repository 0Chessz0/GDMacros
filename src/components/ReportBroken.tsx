import { site } from "@/lib/site";
import { buildBrokenMacroMailto, type ReportedMacro } from "@/lib/support";
import { BugIcon, MailIcon } from "./icons";

/**
 * Opens the visitor's mail client with a report already written.
 *
 * This used to open a prefilled GitHub issue. It now goes to support@, because
 * a broken download is a support matter rather than a development one: a
 * reporter should not need a GitHub account, and a report about a specific
 * person's macro does not belong in a public tracker.
 *
 * Prefilling is the point. Everything the page already knows is filled in, so
 * the reporter only has to type what went wrong. A report that arrives without
 * the level or the download URL costs a round trip to be useful, and most
 * people will not bother with the round trip.
 */
export default function ReportBroken({
  name,
  levelId,
  slug,
  macros = [],
}: {
  name: string;
  levelId: number | string;
  slug: string;
  macros?: ReportedMacro[];
}) {
  const href = buildBrokenMacroMailto({
    levelName: name,
    levelId,
    pageUrl: `${site.url}/macro/${slug}`,
    macros,
  });

  return (
    <a
      href={href}
      className="group inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-3 text-[14px] font-semibold text-text-dim transition-[background-color,border-color,transform,color] duration-200 ease-out hover:-translate-y-0.5 hover:border-rose/40 hover:text-rose active:translate-y-0 active:scale-95 active:duration-75"
    >
      <BugIcon className="h-[18px] w-[18px] transition-transform duration-300 ease-out group-hover:rotate-12" />
      Report broken
      <MailIcon className="h-3.5 w-3.5 opacity-60" />
    </a>
  );
}
