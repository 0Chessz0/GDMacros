import type { Metadata } from "next";
import Link from "next/link";
import AnimatedHeading from "@/components/AnimatedHeading";
import { getAllLevels, getMacroCount } from "@/lib/macros";
import { site } from "@/lib/site";
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from "@/lib/support";

/**
 * The FAQ.
 *
 * Counts are READ FROM THE CATALOG at build time, never written into the copy.
 * The publisher adds macros automatically now, so any number typed into a
 * sentence here is only true until the next submission is accepted. This page
 * previously claimed a fixed total and was wrong within days.
 */

const levelCount = () => getAllLevels().length;

export const metadata: Metadata = {
  title: "FAQ",
  description: `Common questions about Geometry Dash macros, .gdr and .gdr2 files, and how ${site.name} works.`,
};

interface Item {
  q: string;
  /** Plain text for the structured data, which cannot carry markup. */
  plain: string;
  a: React.ReactNode;
}

const Mail = () => (
  <a href={SUPPORT_MAILTO} className="text-accent-soft hover:underline">
    {SUPPORT_EMAIL}
  </a>
);

function items(levels: number, macros: number): Item[] {
  return [
    {
      q: "What is a Geometry Dash macro?",
      plain:
        "A macro is a recording of the inputs that complete a level. It stores frame numbers and button states and replays them, so it is a list of inputs rather than a program.",
      a: (
        <>
          A recording of the inputs that complete a level. It stores which buttons were pressed and
          on which frames, then plays them back. It is a list of inputs, not a program, and it does
          not modify the game itself.
        </>
      ),
    },
    {
      q: "Will using a macro get me banned?",
      plain:
        "We cannot promise that. Geometry Dash, its leaderboards, community demon lists and competitions each set their own rules and can change them. A macro completion is not a legitimate manual completion and should never be submitted as one.",
      a: (
        <>
          We cannot promise anything either way. Geometry Dash, its leaderboards, the community demon
          lists and any competition all set their own rules, and they can change them without warning.
          Decide for yourself what you are comfortable with.
          <br />
          <br />
          One thing is not a grey area:{" "}
          <span className="font-semibold text-text">
            a macro completion is not a legitimate completion
          </span>
          . Do not submit one to a records list or pass it off as your own run.
        </>
      ),
    },
    {
      q: "What are .gdr2 and .gdr files?",
      plain:
        ".gdr2 and .gdr are replay data files containing the recorded inputs for one level. Mega Hack and xdBot entries use .gdr2, while zBot entries use .gdr. Neither format is an installer or executable.",
      a: (
        <>
          Both are replay data files containing the inputs for one level. Mega Hack and xdBot entries
          use <span className="font-mono">.gdr2</span>, while zBot entries use{" "}
          <span className="font-mono">.gdr</span>. Neither format is an installer or executable.
        </>
      ),
    },
    {
      q: "Mega Hack, xdBot or zBot: which download do I take?",
      plain:
        "Take the file labelled for the replay tool you use. Mega Hack and xdBot entries use .gdr2; zBot entries use .gdr. Every download card clearly identifies its tool.",
      a: (
        <>
          Take the one that matches the tool you actually use. Every download is labelled with its
          replay tool, so pick the label that matches your setup. Mega Hack and xdBot entries use{" "}
          <span className="font-mono">.gdr2</span>; zBot entries use{" "}
          <span className="font-mono">.gdr</span>.
          <br />
          <br />
          Most levels here carry a version for each recorder, but not every level has to, so check
          the labels on the page before downloading.
        </>
      ),
    },
    {
      q: "How do I install and play one?",
      plain:
        "Install the matching replay tool, put the downloaded .gdr or .gdr2 file where that tool can load it, then play it from inside the game. The install page has the full walkthrough.",
      a: (
        <>
          Install the matching replay tool, load its .gdr or .gdr2 download, then play it in game. The{" "}
          <Link href="/install" className="text-accent-soft hover:underline">
            install guide
          </Link>{" "}
          walks through it properly, including what to do about desync.
        </>
      ),
    },
    {
      q: "Where are the downloads hosted?",
      plain:
        "On GitHub Releases, in the GDMacros-com/GDMacros-downloads repository. Every macro is hosted by the site rather than linked from somewhere else.",
      a: (
        <>
          On GitHub Releases, in the{" "}
          <span className="font-semibold text-text">GDMacros-com/GDMacros-downloads</span>{" "}
          repository, with one release per level. We host every macro ourselves rather than linking
          to a file somewhere else, which is what keeps the downloads working.
        </>
      ),
    },
    {
      q: "What exactly am I downloading?",
      plain:
        "A single .gdr or .gdr2 replay file. There is no installer and no executable. The filename and the host are shown on the button before you click it.",
      a: (
        <>
          A single .gdr or .gdr2 replay file. No installer, no executable, nothing that runs on its
          own. The filename and the host are both shown on the download button before you click it.
        </>
      ),
    },
    {
      q: "Does this work on mobile?",
      plain:
        "It depends on your recorder and platform. The install page covers what is currently known to work.",
      a: (
        <>
          It depends on which recorder you use and what you play on. The{" "}
          <Link href="/install" className="text-accent-soft hover:underline">
            install guide
          </Link>{" "}
          covers what is currently known to work, including the mobile build of xdBot.
        </>
      ),
    },
    {
      q: "Do I need an account to download?",
      plain:
        "No. Browsing and downloading need no account. An account is only needed to submit a macro or to sync favorites across devices.",
      a: (
        <>
          No. Browsing and downloading are open to everyone, with nothing to sign up for. An account
          is only needed if you want to submit a macro or keep favorites synced across devices.
        </>
      ),
    },
    {
      q: "Can I submit my own macro?",
      plain:
        "Yes. Read the guidelines, then submit from the submit page. You need an account and a username, and the macro has to be yours or submitted with permission.",
      a: (
        <>
          Yes. Read the{" "}
          <Link href="/guidelines" className="text-accent-soft hover:underline">
            guidelines
          </Link>{" "}
          first, then head to{" "}
          <Link href="/submit" className="text-accent-soft hover:underline">
            submit
          </Link>
          . You need an account and a username.
          <br />
          <br />
          The <span className="font-semibold text-text">macro author</span> is whoever recorded the
          run, and that credit is shown publicly on the macro. The{" "}
          <span className="font-semibold text-text">submitter</span> is the account that sent it in.
          They are usually the same person, and if they are not, you need the author's permission.
        </>
      ),
    },
    {
      q: "What happens after I submit?",
      plain:
        "It joins the review queue. An admin accepts or rejects it, and an accepted macro is published to the site automatically. You get a notice either way.",
      a: (
        <>
          It joins the review queue and waits for an admin. They either accept it or reject it with a
          reason, and you get a short notice either way.
          <br />
          <br />
          Once a macro is accepted it is{" "}
          <span className="font-semibold text-text">published to the site automatically</span>, so it
          appears on its own without anyone doing anything else.
        </>
      ),
    },
    {
      q: "A macro is broken. How do I report it?",
      plain:
        "Use the Report broken button on the macro's page. It opens an email to support with the level details already filled in, so you only have to describe what went wrong.",
      a: (
        <>
          Use the <span className="font-semibold text-text">Report broken</span> button on that
          macro's page. It opens an email to <Mail /> with the level, the level ID and the download
          links already filled in, so all you have to type is what went wrong.
        </>
      ),
    },
    {
      q: `How do I contact ${site.name}?`,
      plain: `Email ${SUPPORT_EMAIL}. That covers broken macros, takedowns, account questions and anything about privacy or the terms.`,
      a: (
        <>
          Email <Mail />. That is the address for broken macros, takedown requests, account questions
          and anything about the{" "}
          <Link href="/privacy" className="text-accent-soft hover:underline">
            Privacy Policy
          </Link>{" "}
          or{" "}
          <Link href="/terms" className="text-accent-soft hover:underline">
            Terms
          </Link>
          .
        </>
      ),
    },
    {
      q: `Is ${site.name} free?`,
      plain: `Yes. The site, the catalog and every download are free. The replay tools are made by other people and have their own pricing: xdBot and zBot have free versions, while Mega Hack is paid.`,
      a: (
        <>
          Yes. The site, the catalog and all {macros} downloads across {levels} levels are free, with
          no account required and nothing to pay.
          <br />
          <br />
          The replay tools are separate products made by other people. xdBot and zBot have free
          versions, while Mega Hack is paid. None of them is ours.
        </>
      ),
    },
  ];
}

export default function FaqPage() {
  const levels = levelCount();
  const macros = getMacroCount();
  const faqs = items(levels, macros);

  // Google's FAQ rich result needs plain text, so the structured data uses the
  // `plain` field rather than trying to serialise the JSX above.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.plain },
    })),
  };

  return (
    <div className="mx-auto w-full max-w-[760px] px-4 py-10 sm:px-6 sm:py-14">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <AnimatedHeading
        text="FAQ"
        className="text-[30px] font-extrabold tracking-tight text-text sm:text-[36px]"
      />
      <p className="mt-3 text-[15px] leading-relaxed text-muted">
        Common questions about macros and about {site.name}. Right now the catalog holds{" "}
        <span className="font-semibold text-text">
          {macros} downloads across {levels} levels
        </span>
        , and it grows as new macros are accepted.
      </p>

      <div className="mt-9 space-y-3">
        {faqs.map((f) => (
          <details key={f.q} className="card group px-5 py-4 open:pb-5">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[15px] font-bold text-text marker:hidden">
              {f.q}
              <span className="shrink-0 text-[18px] leading-none text-muted transition-transform duration-200 group-open:rotate-45">
                +
              </span>
            </summary>
            <div className="mt-3 text-[14.5px] leading-relaxed text-text-dim">{f.a}</div>
          </details>
        ))}
      </div>

      <p className="mt-10 text-[14px] leading-relaxed text-muted">
        Still stuck? Email <Mail />, or read the{" "}
        <Link href="/guidelines" className="text-accent-soft hover:underline">
          guidelines
        </Link>{" "}
        before submitting.
      </p>
    </div>
  );
}
