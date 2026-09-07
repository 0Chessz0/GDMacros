import Link from "next/link";
import AnimatedHeading from "@/components/AnimatedHeading";
import MacroBrowser from "@/components/MacroBrowser";
import { getAllLevels, getMacroCount } from "@/lib/macros";
import { site } from "@/lib/site";

export default function HomePage() {
  const levels = getAllLevels();
  const macroCount = getMacroCount();

  /** Lets Google see the catalog as a list of things rather than a wall of divs. */
  const listJsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Geometry Dash Macros",
    description: site.description,
    url: site.url,
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: levels.length,
      itemListElement: levels.slice(0, 100).map((level, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: `${level.name} macro`,
        url: `${site.url}/macro/${level.slug}`,
      })),
    },
  };

  return (
    <div className="mx-auto w-full max-w-[940px] px-4 py-7 sm:px-6 sm:py-9">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(listJsonLd) }}
      />

      <div className="mb-6">
        {/* The H1 carries the search phrase. The brand name is in the nav and
            the <title>, so it does not need to be repeated here. */}
        <AnimatedHeading
          text="Geometry Dash Macros"
          className="text-[22px] font-extrabold tracking-tight text-text sm:text-[26px]"
        />
        <p className="mt-1 text-[13.5px] text-muted">
          {macroCount > 0 ? (
            <>
              {macroCount} free macro{macroCount === 1 ? "" : "s"} across {levels.length} level
              {levels.length === 1 ? "" : "s"}, available for Mega Hack, xdBot and zBot. Search by level,
              creator, macro author or level ID.
            </>
          ) : (
            site.description
          )}
        </p>

        {/*
          A couple of real sentences above the catalog. A page that is almost
          entirely a list of links has very little for a search engine to read,
          and this is also the first thing a human lands on.
        */}
        <p className="mt-3 max-w-[640px] text-[13.5px] leading-relaxed text-muted">
          A macro is a recording of every input in a Geometry Dash level, played back frame by
          frame. Every one in this catalog is free, hosted by us so the links stay alive, and
          labelled with the tool it needs. Browse extreme demon macros and everything else below,
          then read{" "}
          <Link href="/install" className="font-medium text-accent-soft underline-offset-2 hover:underline">
            how to install a macro
          </Link>{" "}
          if you have not used one before.
        </p>
      </div>

      <MacroBrowser levels={levels} />
    </div>
  );
}
