import Link from "next/link";
import { SUBMIT_URL, site } from "@/lib/site";
import { GithubIcon, GlobeIcon } from "./icons";

export default function Footer() {
  return (
    <footer className="mt-20 border-t border-border-soft bg-nav/50">
      <div className="mx-auto flex max-w-[1320px] flex-col gap-6 px-4 py-8 sm:px-6 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent text-white">
              <GlobeIcon className="h-4 w-4" />
            </span>
            <span className="text-[14px] font-extrabold tracking-[0.06em] text-text uppercase">{site.name}</span>
          </div>
          <p className="mt-2 max-w-md text-[13px] leading-relaxed text-muted">
            {site.tagline}. Every macro is hosted by us, so the downloads stay up. Not affiliated
            with RobTop Games.
          </p>
        </div>

        <div className="flex flex-col gap-4 md:items-end">
          <nav className="flex flex-wrap gap-x-5 gap-y-2 text-[13px]">
            <Link href="/" className="text-text-dim transition-colors hover:text-accent-soft">
              All macros
            </Link>
            <Link href="/install" className="text-text-dim transition-colors hover:text-accent-soft">
              How to install
            </Link>
            <Link href="/faq" className="text-text-dim transition-colors hover:text-accent-soft">
              FAQ
            </Link>
            <Link href="/guidelines" className="text-text-dim transition-colors hover:text-accent-soft">
              Guidelines
            </Link>
            <Link href="/about" className="text-text-dim transition-colors hover:text-accent-soft">
              About
            </Link>
            <a
              href={SUBMIT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-text-dim transition-colors hover:text-accent-soft"
            >
              Submit a macro
            </a>
          </nav>

          <a
            href={site.repo}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="GitHub repository"
            className="grid h-9 w-9 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-text md:-mr-2"
          >
            <GithubIcon className="h-[17px] w-[17px]" />
          </a>
        </div>
      </div>
    </footer>
  );
}
