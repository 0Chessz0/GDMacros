import type { Metadata } from "next";
import AnimatedHeading from "@/components/AnimatedHeading";
import Link from "next/link";
import { site } from "@/lib/site";
import { RECORDERS } from "@/lib/types";

export const metadata: Metadata = {
  title: "Guidelines",
  description: `What ${site.name} accepts, and how to submit a macro.`,
};

const SECTIONS = [
  {
    title: "What belongs here",
    items: [
      "Macros recorded with Mega Hack's macro recorder, or with xdBot's recorder. Nothing else is accepted.",
      "The level has to be possible on 240 FPS.",
      "The level has to exist in-game and have a working level ID.",
      "A showcase video is optional but encouraged. It becomes the entry's thumbnail automatically.",
    ],
  },
  {
    title: "What gets rejected",
    items: [
      "Anything recorded with a tool other than Mega Hack or xdBot.",
      "Reuploads. If the macro isn't yours, it doesn't get posted.",
      "Macros presented as legitimate completions. This is a macro index, not a records list.",
      "Entries with a level ID that doesn't resolve on GD Browser.",
    ],
  },
];

export default function GuidelinesPage() {
  return (
    <div className="mx-auto w-full max-w-[760px] px-4 py-10 sm:px-6 sm:py-14">
      <AnimatedHeading text="Guidelines" className="text-[30px] font-extrabold tracking-tight text-text sm:text-[36px]" />
      <p className="mt-3 text-[15px] leading-relaxed text-muted">
        {site.name} indexes macros and does not rank them against each other. Submissions are accepted
        as long as they were recorded with one of the two supported tools and are your own work.
      </p>

      {/* The two accepted recorders, called out up front. */}
      <div className="mt-8 grid gap-2.5 sm:grid-cols-2">
        {RECORDERS.map((r) => (
          <div key={r} className="card px-4 py-3.5">
            <p className="text-[11px] font-semibold tracking-wider text-muted uppercase">Accepted</p>
            <p translate="no" className="notranslate mt-1 text-[16px] font-bold text-text">
              {r}
            </p>
          </div>
        ))}
      </div>

      {SECTIONS.map((section) => (
        <section key={section.title} className="mt-10">
          <h2 className="text-[17px] font-bold text-text">{section.title}</h2>
          <ul className="mt-3 space-y-2.5">
            {section.items.map((item) => (
              <li key={item} className="flex gap-3 text-[14.5px] leading-relaxed text-text-dim">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                {item}
              </li>
            ))}
          </ul>
        </section>
      ))}

      <section className="card mt-10 p-5">
        <h2 className="text-[17px] font-bold text-text">Submitting</h2>
        <p className="mt-2 text-[14.5px] leading-relaxed text-text-dim">
          You don&apos;t need to host the file anywhere. Sign in, fill in the level name, the level
          creator, the level ID and who recorded it, then attach the .gdr2. We review it, upload it
          ourselves and add it to the catalog for you.
        </p>
        <Link
          href="/submit"
          className="mt-4 inline-flex rounded-xl bg-accent px-4 py-2.5 text-[13.5px] font-semibold text-white transition-[background-color,transform] duration-200 ease-out hover:-translate-y-0.5 hover:bg-accent-hover active:translate-y-0 active:scale-95 active:duration-75"
        >
          Submit a macro
        </Link>
      </section>
    </div>
  );
}
