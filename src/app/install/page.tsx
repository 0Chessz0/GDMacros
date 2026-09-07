import type { Metadata } from "next";
import Link from "next/link";
import AnimatedHeading from "@/components/AnimatedHeading";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "How to Install Geometry Dash Macros",
  description:
    "Step-by-step guide to installing and playing Geometry Dash macros with xdBot, zBot or Mega Hack, including .gdr and .gdr2 files.",
  alternates: { canonical: "/install" },
  openGraph: {
    title: `How to Install Geometry Dash Macros | ${site.name}`,
    description:
      "Step-by-step guide to installing and playing Geometry Dash macros with xdBot, zBot or Mega Hack.",
    url: "/install",
    type: "article",
  },
};

const XDBOT_PC = "https://www.mediafire.com/file/kk33lxumpzit8y8/zilko.xdbot.geode/file";
const XDBOT_MOBILE = "https://www.mediafire.com/file/gdxapqjqgkbcgmy/zilko.xdbot.geode/file";
const MEGA_HACK_STORE = "https://absolllute.com/store/mega-hack";
const ZBOT_PAGE = "https://geode-sdk.org/mods/fig.zbot";

/** Numbered step in one of the walkthroughs. */
function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-4">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent text-[13px] font-bold text-white tabular-nums">
        {n}
      </span>
      <div className="min-w-0 pt-0.5">
        <p className="text-[14.5px] font-semibold text-text">{title}</p>
        <div className="mt-1 text-[14px] leading-relaxed text-text-dim">{children}</div>
      </div>
    </li>
  );
}

/** Outbound link. nofollow because we do not vouch for third-party hosts. */
function Ext({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="font-medium text-accent-soft underline-offset-2 hover:underline"
    >
      {children}
    </a>
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
    "Install the Geode mod loader, add a macro bot, download a macro, and play it back in Geometry Dash.",
  step: [
    { "@type": "HowToStep", name: "Install Geode", text: "Install the Geode mod loader for Geometry Dash." },
    { "@type": "HowToStep", name: "Get a macro bot", text: "Install xdBot or zBot, or buy Mega Hack." },
    { "@type": "HowToStep", name: "Install the mod", text: "Drop the .geode file into the geode/mods folder." },
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
        A macro is a recording of every input in a level. To play one back you need a file made for
        your playback tool. Every macro on {site.name} shows its tool on the download card, so
        check that first, then follow the matching section below.
      </p>

      {/* The free/paid split is the first thing anyone wants to know. */}
      <div className="mt-8 grid gap-2.5 sm:grid-cols-3">
        <div className="card p-4">
          <div className="flex items-center justify-between gap-2">
            <p translate="no" className="notranslate text-[16px] font-bold text-text">
              xdBot
            </p>
            <span className="rounded-md border border-green/35 bg-green/12 px-2 py-0.5 text-[11.5px] font-semibold text-green">
              Free
            </span>
          </div>
          <p className="mt-1.5 text-[13px] leading-snug text-muted">
            What most macros here use. Needs a manual install now, see below.
          </p>
        </div>
        <div className="card p-4">
          <div className="flex items-center justify-between gap-2">
            <p translate="no" className="notranslate text-[16px] font-bold text-text">
              zBot
            </p>
            <span className="rounded-md border border-green/35 bg-green/12 px-2 py-0.5 text-[11.5px] font-semibold text-green">
              Free
            </span>
          </div>
          <p className="mt-1.5 text-[13px] leading-snug text-muted">
            A cross-platform replay bot. Uses the converted .gdr downloads.
          </p>
        </div>
        <div className="card p-4">
          <div className="flex items-center justify-between gap-2">
            <p translate="no" className="notranslate text-[16px] font-bold text-text">
              Mega Hack
            </p>
            <span className="rounded-md border border-amber/35 bg-amber/12 px-2 py-0.5 text-[11.5px] font-semibold text-amber">
              Paid
            </span>
          </div>
          <p className="mt-1.5 text-[13px] leading-snug text-muted">
            A paid mod menu with its own replay system.
          </p>
        </div>
      </div>

      <section className="card mt-8 p-5">
        <h2 className="text-[17px] font-bold text-text">Before you start</h2>
        <p className="mt-2 text-[14.5px] leading-relaxed text-text-dim">
          These tools run with <Ext href="https://geode-sdk.org">Geode</Ext>, the Geometry Dash mod
          loader. Install Geode first and launch the game once so it sets itself up. Everything below
          assumes Geode is already working.
        </p>
        <p className="mt-3 text-[13px] leading-relaxed text-muted">
          Macros only work in a modded client. They will not do anything in a clean copy of the game,
          and they are not completions. Do not submit macro runs as records.
        </p>
      </section>

      {/* ------------------------------- xdBot ------------------------------- */}
      <section className="mt-10">
        <div className="flex flex-wrap items-baseline gap-2.5">
          <h2 translate="no" className="notranslate text-[20px] font-bold text-text">
            xdBot
          </h2>
          <span className="rounded-md border border-green/35 bg-green/12 px-2 py-0.5 text-[11.5px] font-semibold text-green">
            Free
          </span>
          <span className="rounded-md border border-border bg-surface-2 px-2 py-0.5 font-mono text-[11.5px] text-muted">
            .gdr2
          </span>
        </div>
        <p className="mt-2 text-[14px] leading-relaxed text-muted">
          Most macros in the catalog are xdBot recordings.
        </p>

        <div className="mt-4 rounded-xl border border-amber/40 bg-amber/10 px-4 py-3">
          <p className="text-[13.5px] leading-relaxed text-amber">
            <span className="font-semibold">xdBot is no longer in the Geode mod browser.</span> The
            original owner abandoned it, so searching for it in game will not find it. A newer build
            is still maintained, and you install it by hand using the links below.
          </p>
        </div>

        <ol className="mt-6 space-y-4">
          <Step n={1} title="Download the .geode file">
            Pick the build for your device:
            <span className="mt-2 flex flex-wrap gap-2">
              <Ext href={XDBOT_PC}>
                <span className="inline-flex rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-[13px] font-semibold text-text-dim transition-colors hover:border-accent/40 hover:text-accent-soft">
                  Download for PC
                </span>
              </Ext>
              <Ext href={XDBOT_MOBILE}>
                <span className="inline-flex rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-[13px] font-semibold text-text-dim transition-colors hover:border-accent/40 hover:text-accent-soft">
                  Download for mobile
                </span>
              </Ext>
            </span>
            <span className="mt-2 block text-[12.5px] text-muted">
              Both are hosted on MediaFire. The file is called{" "}
              <span className="font-mono">zilko.xdbot.geode</span>.
            </span>
          </Step>

          <Step n={2} title="Find your Geode mods folder">
            Geode keeps installed mods in a <span className="font-mono">geode/mods</span> folder
            inside the game directory:
            <span className="mt-2 block space-y-1.5">
              <span className="block rounded-lg bg-surface-2 px-3 py-2 font-mono text-[12.5px] text-text-dim">
                Windows &nbsp;<span className="text-muted">Geometry Dash/geode/mods</span>
              </span>
              <span className="block rounded-lg bg-surface-2 px-3 py-2 font-mono text-[12.5px] text-text-dim">
                Android &nbsp;<span className="text-muted">
                  (launcher media folder)/game/geode/mods
                </span>
              </span>
              <span className="block rounded-lg bg-surface-2 px-3 py-2 font-mono text-[12.5px] text-text-dim">
                iOS &nbsp;<span className="text-muted">Documents/game/geode/mods</span>
              </span>
            </span>
            <span className="mt-2 block text-[12.5px] text-muted">
              On Steam you can reach the Windows folder with Manage, then Browse local files.
            </span>
          </Step>

          <Step n={3} title="Drop the file in and restart">
            Put <span className="font-mono">zilko.xdbot.geode</span> straight into that mods folder.
            Do not unzip it and do not rename it. Close Geometry Dash fully and open it again, and
            Geode loads the mod on startup.
          </Step>

          <Step n={4} title="Check it loaded">
            Open the Geode menu in game and look for xdBot in your installed mods. If it is not
            there, the file is in the wrong folder or the game was not restarted.
          </Step>

          <Step n={5} title="Download a macro and load it">
            Grab a macro from the{" "}
            <Link href="/" className="font-medium text-accent-soft underline-offset-2 hover:underline">
              catalog
            </Link>
            , start the level it was made for, then pause. Open xdBot from its button in the corner
            of the pause screen, press <span className="font-medium text-text-dim">Load</span> and
            pick the file.
          </Step>

          <Step n={6} title="Play it back">
            Make sure playback is enabled rather than recording, then unpause. The macro drives the
            level from wherever you started it.
          </Step>
        </ol>
      </section>

      {/* -------------------------------- zBot ------------------------------- */}
      <section className="mt-10">
        <div className="flex flex-wrap items-baseline gap-2.5">
          <h2 translate="no" className="notranslate text-[20px] font-bold text-text">
            zBot
          </h2>
          <span className="rounded-md border border-green/35 bg-green/12 px-2 py-0.5 text-[11.5px] font-semibold text-green">
            Free
          </span>
          <span className="rounded-md border border-border bg-surface-2 px-2 py-0.5 font-mono text-[11.5px] text-muted">
            .gdr
          </span>
        </div>
        <p className="mt-2 text-[14px] leading-relaxed text-muted">
          The zBot downloads in this catalog are converted from compatible xdBot recordings while
          keeping the same level and macro-author credit.
        </p>

        <div className="card mt-4 flex flex-wrap items-center justify-between gap-3 p-4">
          <p className="text-[13.5px] leading-relaxed text-text-dim">
            Install zBot through Geode. Its free version includes recording and playback; the
            optional paid key removes zBot&apos;s visible watermark.
          </p>
          <Ext href={ZBOT_PAGE}>
            <span className="inline-flex rounded-xl bg-accent px-4 py-2.5 text-[13.5px] font-semibold text-white transition-colors hover:bg-accent-hover">
              Open zBot on Geode
            </span>
          </Ext>
        </div>

        <ol className="mt-6 space-y-4">
          <Step n={1} title="Install zBot">
            Open Geode&apos;s mod browser, search for zBot and install the version offered for your
            device. The official Geode page above also lists the currently available builds.
          </Step>
          <Step n={2} title="Download the zBot entry">
            Open a level in the catalog and choose the download card labelled zBot. Its filename ends
            in <span className="font-mono">.gdr</span>.
          </Step>
          <Step n={3} title="Load the replay">
            Open zBot in game and use its load or import control to select the downloaded .gdr file.
          </Step>
          <Step n={4} title="Play from the beginning">
            Use playback mode and start the matching level from the beginning. Keep the game at 240
            FPS unless the macro page says otherwise.
          </Step>
        </ol>
      </section>

      {/* ----------------------------- Mega Hack ----------------------------- */}
      <section className="mt-10">
        <div className="flex flex-wrap items-baseline gap-2.5">
          <h2 translate="no" className="notranslate text-[20px] font-bold text-text">
            Mega Hack
          </h2>
          <span className="rounded-md border border-amber/35 bg-amber/12 px-2 py-0.5 text-[11.5px] font-semibold text-amber">
            Paid
          </span>
          <span className="rounded-md border border-border bg-surface-2 px-2 py-0.5 font-mono text-[11.5px] text-muted">
            .gdr2
          </span>
        </div>
        <p className="mt-2 text-[14px] leading-relaxed text-muted">
          Mega Hack ships its own replay system and reads the same .gdr2 files.
        </p>

        <div className="card mt-4 flex flex-wrap items-center justify-between gap-3 p-4">
          <p className="text-[13.5px] leading-relaxed text-text-dim">
            <span className="font-semibold text-text">Mega Hack is not free.</span> It is a paid mod
            menu, bought from its developer.
          </p>
          <Ext href={MEGA_HACK_STORE}>
            <span className="inline-flex rounded-xl bg-accent px-4 py-2.5 text-[13.5px] font-semibold text-white transition-colors hover:bg-accent-hover">
              Buy Mega Hack
            </span>
          </Ext>
        </div>

        <ol className="mt-6 space-y-4">
          <Step n={1} title="Buy and install it">
            Purchase Mega Hack from <Ext href={MEGA_HACK_STORE}>absolllute.com</Ext> and follow the
            installer. Once it is running, open the mod menu in game and find the replay or macro
            section.
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

        {/* The catalog carries tool-specific files. Finding that out mid-level
            is worse than reading it here. */}
        <div className="mt-5 rounded-xl border border-amber/40 bg-amber/10 px-4 py-3">
          <p className="text-[13.5px] leading-relaxed text-amber">
            <span className="font-semibold">
              Use the file made for your playback tool.
            </span>{" "}
            Mega Hack and xdBot entries use .gdr2, while zBot entries use .gdr. Check the recorder on
            each download card and take the one that matches your setup.
          </p>
        </div>
      </section>

      {/* --------------------------- troubleshooting -------------------------- */}
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

      <section className="card mt-10 border-l-2 border-l-accent p-5">
        <h2 className="text-[17px] font-bold text-text">More tools may come</h2>
        <p className="mt-2 text-[14.5px] leading-relaxed text-text-dim">
          The catalog now carries xdBot, zBot and Mega Hack downloads. Support for other replay tools
          may be added later, including{" "}
          <span translate="no" className="notranslate font-medium text-text">
            Eclipse
          </span>
          , and this page will be updated as each one is added.
        </p>
      </section>

      <section className="card mt-6 p-5">
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
