import type { Metadata } from "next";
import Link from "next/link";
import AnimatedHeading from "@/components/AnimatedHeading";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "How to Install Geometry Dash Macros",
  description:
    "Step-by-step guide to installing and playing Geometry Dash macros. Load a .gdr2 macro with xdBot or Mega Hack, and fix desync problems.",
  alternates: { canonical: "/install" },
  openGraph: {
    title: `How to Install Geometry Dash Macros | ${site.name}`,
    description:
      "Step-by-step guide to installing and playing Geometry Dash macros with xdBot or Mega Hack.",
    url: "/install",
    type: "article",
  },
};

/** Numbered step in one of the walkthroughs. */
function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-4">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent text-[13px] font-bold text-white tabular-nums">
        {n}
      </span>
      <div className="min-w-0 pt-0.5">
        <p className="text-[14.5px] font-semibold text-text">{title}</p>
        <p className="mt-1 text-[14px] leading-relaxed text-text-dim">{children}</p>
      </div>
    </li>
  );
}

/**
 * Structured data so this can win the "how to install geometry dash macros"
 * style queries, which are lower competition than the catalog's own terms.
 */
const howToJsonLd = {
  "@context": "https://schema.org",
  "@type": "HowTo",
  name: "How to install Geometry Dash macros",
  description:
    "Install a mod menu, download a macro file, and load it into Geometry Dash with xdBot or Mega Hack.",
  step: [
    { "@type": "HowToStep", name: "Install Geode", text: "Install the Geode mod loader for Geometry Dash." },
    { "@type": "HowToStep", name: "Install a macro bot", text: "Install xdBot or Mega Hack from the Geode mod browser." },
    { "@type": "HowToStep", name: "Download a macro", text: "Download the macro file for the level you want." },
    { "@type": "HowToStep", name: "Load the macro", text: "Pause the level, open the bot, and load the macro file." },
  ],
};

export default function InstallPage() {
  return (
    <div className="mx-auto w-full max-w-[760px] px-4 py-10 sm:px-6 sm:py-14">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(howToJsonLd) }}
      />

      <AnimatedHeading
        text="How to Install Geometry Dash Macros"
        className="text-[30px] leading-tight font-extrabold tracking-tight text-text sm:text-[36px]"
      />
      <p className="mt-3 text-[15px] leading-relaxed text-muted">
        A macro is a recording of every input in a level. To play one back you need the same tool it
        was recorded with. Every macro on {site.name} shows its recorder on the download card, so
        check that first, then follow the matching section below.
      </p>

      {/* Prerequisite, shared by both tools. */}
      <section className="card mt-8 p-5">
        <h2 className="text-[17px] font-bold text-text">Before you start</h2>
        <p className="mt-2 text-[14.5px] leading-relaxed text-text-dim">
          Both tools run on{" "}
          <a
            href="https://geode-sdk.org"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-accent-soft underline-offset-2 hover:underline"
          >
            Geode
          </a>
          , the Geometry Dash mod loader. Install Geode first, launch the game once so it sets
          itself up, then install your bot from the in-game mod browser.
        </p>
        <p className="mt-3 text-[13px] leading-relaxed text-muted">
          Macros only work in a modded client. They will not do anything in a clean copy of the game,
          and they are not completions. Do not submit macro runs as records.
        </p>
      </section>

      <section className="mt-10">
        <div className="flex items-baseline gap-2.5">
          <h2 translate="no" className="notranslate text-[20px] font-bold text-text">
            xdBot
          </h2>
          <span className="rounded-md border border-border bg-surface-2 px-2 py-0.5 font-mono text-[11.5px] text-muted">
            .gdr2 .gdr
          </span>
        </div>
        <p className="mt-2 text-[14px] leading-relaxed text-muted">
          Most macros in the catalog are xdBot recordings.
        </p>

        <ol className="mt-5 space-y-4">
          <Step n={1} title="Install xdBot">
            Open the Geode mod browser inside Geometry Dash, search for{" "}
            <span translate="no" className="notranslate font-medium text-text-dim">
              xdBot
            </span>
            , and install it. Restart the game when it asks.
          </Step>
          <Step n={2} title="Download the macro">
            Find the level in the{" "}
            <Link href="/" className="font-medium text-accent-soft underline-offset-2 hover:underline">
              catalog
            </Link>{" "}
            and download its file. Keep it somewhere you can find again, like your Downloads folder.
          </Step>
          <Step n={3} title="Open the level and pause">
            Start the level the macro was made for, then pause. xdBot is opened from its small button
            in the corner of the pause screen.
          </Step>
          <Step n={4} title="Load the file">
            Press <span className="font-medium text-text-dim">Load</span> and pick the macro you
            downloaded. xdBot reads several formats, so both .gdr2 and .gdr work.
          </Step>
          <Step n={5} title="Play it back">
            Make sure playback is enabled rather than recording, then unpause. The macro drives the
            level from wherever you started it.
          </Step>
        </ol>
      </section>

      <section className="mt-10">
        <div className="flex items-baseline gap-2.5">
          <h2 translate="no" className="notranslate text-[20px] font-bold text-text">
            Mega Hack
          </h2>
          <span className="rounded-md border border-border bg-surface-2 px-2 py-0.5 font-mono text-[11.5px] text-muted">
            .mhr
          </span>
        </div>
        <p className="mt-2 text-[14px] leading-relaxed text-muted">
          Mega Hack ships its own replay system with its own file format.
        </p>

        <ol className="mt-5 space-y-4">
          <Step n={1} title="Install Mega Hack">
            Install Mega Hack, then open the mod menu in game and find the replay or macro section.
          </Step>
          <Step n={2} title="Put the macro where it can find it">
            Mega Hack loads replays from its own macros folder. Drop the downloaded file in there, or
            use the menu&apos;s import option if your version has one.
          </Step>
          <Step n={3} title="Select and play">
            Pick the macro from the list, switch the mode from record to playback, then start the
            level.
          </Step>
        </ol>

        <p className="mt-4 text-[13px] leading-relaxed text-muted">
          Mega Hack replays and xdBot recordings are different formats. A .gdr2 file will not load in
          Mega Hack, and a .mhr will not load in xdBot, unless you convert it first.
        </p>
      </section>

      <section className="mt-10">
        <h2 className="text-[17px] font-bold text-text">If the macro desyncs</h2>
        <p className="mt-2 text-[14px] leading-relaxed text-text-dim">
          A macro is a list of inputs tied to timing, so anything that changes the game&apos;s timing
          breaks it partway through. When a run starts clean and then dies at the same spot every
          time, check these:
        </p>
        <ul className="mt-3 space-y-2.5">
          {[
            "Frame rate. Every macro here is made to run at 240 FPS. Set your game to the same rate the macro was recorded at.",
            "Physics bypass and speedhacks. Turn them off unless the macro says otherwise.",
            "Other mods. Anything that alters timing, gameplay or object behaviour can shift the run.",
            "The level version. If the creator updated the level after the macro was recorded, the macro no longer matches it.",
            "Start position. Play from the beginning of the level, not from a checkpoint or a start pos.",
          ].map((item) => (
            <li key={item} className="flex gap-3 text-[14.5px] leading-relaxed text-text-dim">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
              {item}
            </li>
          ))}
        </ul>
      </section>

      <section className="card mt-10 p-5">
        <h2 className="text-[17px] font-bold text-text">Ready to grab one?</h2>
        <p className="mt-2 text-[14.5px] leading-relaxed text-text-dim">
          Every macro in the catalog is free, hosted by us, and shows which tool it needs.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href="/"
            className="rounded-xl bg-accent px-4 py-2.5 text-[13.5px] font-semibold text-white transition-[background-color,transform] duration-200 ease-out hover:-translate-y-0.5 hover:bg-accent-hover active:translate-y-0 active:scale-95 active:duration-75"
          >
            Browse macros
          </Link>
          <Link
            href="/guidelines"
            className="rounded-xl border border-border bg-surface-2 px-4 py-2.5 text-[13.5px] font-semibold text-text-dim transition-[color,border-color,transform] duration-200 ease-out hover:-translate-y-0.5 hover:border-muted/50 hover:text-text active:translate-y-0 active:scale-95 active:duration-75"
          >
            Guidelines
          </Link>
        </div>
      </section>
    </div>
  );
}
