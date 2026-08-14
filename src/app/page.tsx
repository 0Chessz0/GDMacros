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
              {levels.length === 1 ? "" : "s"}, recorded with Mega Hack and xdBot. Search by level,
              creator, macro author or level ID.
            </>
          ) : (
            site.description
          )}
        </p>
      </div>

      <MacroBrowser levels={levels} />
    </div>
  );
}
