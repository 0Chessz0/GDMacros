import type { Metadata } from "next";
import Link from "next/link";
import { getAllMacros } from "@/lib/macros";
import { SUBMIT_URL, site } from "@/lib/site";

export const metadata: Metadata = {
  title: "About",
  description: `What ${site.name} is.`,
};

const SECTIONS = [
  {
    title: "What you get",
    items: [
      "A searchable list of macros, each one showing the level it plays, who built that level and who recorded the macro.",
      "Downloads that stay up. We host every file ourselves rather than pointing at someone else's upload.",
      "A link straight through to the level on GD Browser, so you can check it before you download.",
      "No accounts, no ads, no paywalls. Take what you want.",
    ],
  },
  {
    title: "What this is not",
    items: [
      "Not a records list. Nothing here is a legitimate completion and none of it is presented as one.",
      "Not a ranking. The list is alphabetical, and no macro sits above another.",
      "Not a mod menu. You will need Mega Hack or xdBot to play any of these back.",
    ],
  },
];

export default function AboutPage() {
  const count = getAllMacros().length;

  return (
    <div className="mx-auto w-full max-w-[760px] px-4 py-10 sm:px-6 sm:py-14">
      <h1 className="text-[30px] font-extrabold tracking-tight text-text sm:text-[36px]">
        About {site.name}
      </h1>
      <p className="mt-3 text-[15px] leading-relaxed text-muted">
        {site.name} is a place to find macros for Geometry Dash levels. Everything listed here was
        recorded with either Mega Hack or xdBot, and everything is free to download.
      </p>

      {count > 0 && (
        <p className="mt-6 text-[14.5px] text-text-dim">
          <span className="text-[19px] font-bold text-accent-soft tabular-nums">{count}</span>{" "}
          macro{count === 1 ? "" : "s"} in the catalog right now.
        </p>
      )}

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
        <h2 className="text-[17px] font-bold text-text">Got a macro?</h2>
        <p className="mt-2 text-[14.5px] leading-relaxed text-text-dim">
          Send it over and we will host it for you. Read the guidelines first so you know what gets
          accepted.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <a
            href={SUBMIT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-xl bg-accent px-4 py-2.5 text-[13.5px] font-semibold text-white transition-[background-color,transform] duration-200 ease-out hover:-translate-y-0.5 hover:bg-accent-hover active:translate-y-0 active:scale-95 active:duration-75"
          >
            Submit a macro
          </a>
          <Link
            href="/guidelines"
            className="rounded-xl border border-border bg-surface-2 px-4 py-2.5 text-[13.5px] font-semibold text-text-dim transition-[color,border-color,transform] duration-200 ease-out hover:-translate-y-0.5 hover:border-muted/50 hover:text-text active:translate-y-0 active:scale-95 active:duration-75"
          >
            Guidelines
          </Link>
        </div>
      </section>

      <p className="mt-10 text-[12.5px] text-muted">
        Not affiliated with, endorsed by, or connected to RobTop Games.
      </p>
    </div>
  );
}
