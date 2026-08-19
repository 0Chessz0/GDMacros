import type { Metadata } from "next";
import Link from "next/link";
import { getMacroCount, getAllLevels } from "@/lib/macros";
import { site, SUBMIT_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Geometry Dash macros FAQ: are they bannable, how to use a GDR2 file",
  description:
    "Answers about Geometry Dash macros: what a macro is, how to open a .gdr2 file, whether macros get you banned, why an xdBot macro will not play in Mega Hack, and what these downloads contain.",
  alternates: { canonical: "/faq" },
  openGraph: {
    title: `Geometry Dash macros FAQ | ${site.name}`,
    description:
      "What a macro is, how to open a .gdr2 file, and whether using one gets you banned.",
    url: "/faq",
    type: "article",
  },
};

/**
 * Every question here is one people actually type into a search box. Each answer
 * is written to stand on its own, because a search result often drops someone
 * straight onto the question rather than the top of the page.
 */
const FAQ: { q: string; a: React.ReactNode; plain: string }[] = [
  {
    q: "What is a Geometry Dash macro?",
    plain:
      "A macro is a recording of the inputs used to beat a level. It is a list of frame numbers and button presses, not a program. Playing one back makes the game repeat those inputs exactly.",
    a: (
      <>
        A macro is a recording of the inputs used to beat a level: a list of frame numbers and button
        presses, and nothing else. Playing one back makes the game repeat those inputs exactly, so
        the level completes the same way every time.
        <br />
        <br />
        It is a data file, not a program. It cannot run on its own and does nothing until a mod like
        Mega Hack or xdBot loads it.
      </>
    ),
  },
  {
    q: "Are Geometry Dash macros bannable?",
    plain:
      "Using a macro in normal play is not detected or punished by the game itself. Submitting a macro completion as a legitimate record to a demon list or a level creator is cheating, and those communities do ban for it.",
    a: (
      <>
        The game itself does not detect or punish macro playback, so using one privately is not going
        to get your account banned.
        <br />
        <br />
        Submitting a macro completion as though you played it yourself is a different matter. Demon
        lists, leaderboards and creators treat that as cheating and will remove or ban the
        submission. Macros are for practice, for seeing a route, and for watching a level get beaten,
        not for claiming a record.
      </>
    ),
  },
  {
    q: "How do I open a .gdr2 file?",
    plain:
      "A .gdr2 file is a replay. You do not open it directly. Put it in the macro folder of Mega Hack or xdBot, then load it from that mod's menu inside the game.",
    a: (
      <>
        You do not open it directly, and double-clicking it will do nothing useful. A <code>.gdr2</code>{" "}
        is a replay file that a mod reads.
        <br />
        <br />
        Put it in the macro folder for whichever tool you use, then load it from that mod's menu
        inside the game. The full steps for both tools are on the{" "}
        <Link href="/install" className="text-accent-soft hover:underline">
          install page
        </Link>
        .
      </>
    ),
  },
  {
    q: "Why does my xdBot macro not work in Mega Hack?",
    plain:
      "The two tools write the same file extension but not the same contents. An xdBot recording carries extra data Mega Hack does not read, so it can load and then do nothing. Download the Mega Hack version of the macro instead.",
    a: (
      <>
        Both tools write <code>.gdr2</code>, but they do not write the same thing inside it. An xdBot
        recording carries extra data that Mega Hack does not read, which is why it can appear to load
        and then do nothing at all.
        <br />
        <br />
        You do not need to fix anything. Most levels here have both versions, so download the Mega
        Hack one and use that.
      </>
    ),
  },
  {
    q: "Is Mega Hack free?",
    plain:
      "No. Mega Hack is a paid mod menu. xdBot is free but was removed from the Geode mod list, so it has to be installed manually.",
    a: (
      <>
        No. Mega Hack is paid, and the price is set by its developer, not by this site.
        <br />
        <br />
        xdBot is free. It was removed from the Geode mod list, so it has to be installed by hand,
        which the{" "}
        <Link href="/install" className="text-accent-soft hover:underline">
          install page
        </Link>{" "}
        walks through.
      </>
    ),
  },
  {
    q: "What is actually in these downloads?",
    plain:
      "A single replay file, hosted on MediaFire. No installer and no executable. The filename and the host are shown on every download button before you click it.",
    a: (
      <>
        A single replay file and nothing else. No installer, no executable, no archive that unpacks
        into something surprising.
        <br />
        <br />
        Every download button shows the real filename and says which host it opens before you click
        it, so you can see exactly what you are getting.
      </>
    ),
  },
  {
    q: "Do macros work on mobile?",
    plain:
      "Yes, if you can install the mod. Geode and xdBot both run on Android, and the replay files are identical to the PC ones.",
    a: (
      <>
        Yes, provided you can install the mod. Geode runs on Android, and the replay files are
        identical to the PC ones, so a macro downloaded here works either way.
        <br />
        <br />
        iOS is far more restricted and is not something this site can help with.
      </>
    ),
  },
  {
    q: "Can I request a level, or send in my own macro?",
    plain:
      "Yes. Submissions go through the form linked in the navigation. Recordings must come from Mega Hack or xdBot, and reuploads of someone else's macro are rejected.",
    a: (
      <>
        Yes. Everything goes through{" "}
        <a
          href={SUBMIT_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent-soft hover:underline"
        >
          the form
        </a>
        , for both requests and submissions.
        <br />
        <br />
        Recordings have to come from Mega Hack or xdBot, and reuploads of someone else's macro are
        rejected. The{" "}
        <Link href="/guidelines" className="text-accent-soft hover:underline">
          guidelines
        </Link>{" "}
        cover the rest.
      </>
    ),
  },
  {
    q: "Does it cost anything to download from here?",
    plain:
      "No. Every macro on the site is free, and there is no account to make.",
    a: (
      <>
        No. Every macro here is free, there is no account to make, and nothing is locked behind a
        link shortener or a survey.
      </>
    ),
  },
];

export default function FaqPage() {
  const macroCount = getMacroCount();
  const levelCount = getAllLevels().length;

  /** Rich result eligibility, and it keeps the answers honest and self-contained. */
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.plain },
    })),
  };

  return (
    <div className="mx-auto w-full max-w-[760px] px-4 py-7 sm:px-6 sm:py-9">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />

      <h1 className="text-[22px] font-extrabold tracking-tight text-text sm:text-[26px]">
        Geometry Dash macros: common questions
      </h1>
      <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
        What a macro is, how to use one, and what these {macroCount} downloads across {levelCount}{" "}
        levels actually contain.
      </p>

      <div className="mt-7 flex flex-col gap-3">
        {FAQ.map((item) => (
          <section key={item.q} className="card p-5">
            <h2 className="text-[15px] font-bold text-text">{item.q}</h2>
            <div className="mt-2 text-[13.5px] leading-relaxed text-text-dim">{item.a}</div>
          </section>
        ))}
      </div>

      <div className="mt-7 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface px-5 py-4">
        <p className="min-w-0 flex-1 text-[13px] text-text-dim">
          Still stuck on getting a macro to load?
        </p>
        <Link
          href="/install"
          className="shrink-0 rounded-lg bg-accent px-3.5 py-2 text-[13px] font-medium text-white transition-[background-color,transform] duration-200 ease-out hover:bg-accent-hover active:scale-95 active:duration-75"
        >
          Read the install guide
        </Link>
      </div>
    </div>
  );
}
