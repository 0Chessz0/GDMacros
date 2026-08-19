import type { Metadata } from "next";
import Link from "next/link";
import ClearStored from "@/components/ClearStored";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy on GDMacros: analytics, cookies and third parties",
  description:
    "What GDMacros stores in your browser, what the analytics collect, and which third parties are involved when you translate a page, watch an embed or download a macro.",
  alternates: { canonical: "/privacy" },
  openGraph: {
    title: `Privacy | ${site.name}`,
    description: "What is stored in your browser, and which third parties are involved.",
    url: "/privacy",
    type: "article",
  },
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card p-5">
      <h2 className="text-[15px] font-bold text-text">{title}</h2>
      <div className="mt-2 space-y-2.5 text-[13.5px] leading-relaxed text-text-dim">{children}</div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <div className="mx-auto w-full max-w-[760px] px-4 py-7 sm:px-6 sm:py-9">
      <h1 className="text-[22px] font-extrabold tracking-tight text-text sm:text-[26px]">
        Privacy
      </h1>
      <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
        Accounts on {site.name} are optional. Browsing and downloading macros needs no account and
        collects nothing about you. If you do create one, the only personal data involved is your
        email address. This page covers the website only.
      </p>

      <div className="mt-7 flex flex-col gap-3">
        <Section title="What is stored in your browser">
          <p>
            A few small preferences are kept in your browser's local storage. This is not a cookie,
            it is never sent to a server, and it never leaves your device. This is separate from
            the account session cookie described below:
          </p>
          <ul className="ml-4 list-disc space-y-1 text-[13px]">
            <li>
              <span className="font-mono text-[12px] text-text">gdmacros:recent</span>: the last few
              macros you opened, for the "Recently viewed" row.
            </li>
            <li>
              <span className="font-mono text-[12px] text-text">gdmacros:favorites</span>: the
              macros you starred.
            </li>
            <li>
              <span className="font-mono text-[12px] text-text">gdmacros:sort</span> and{" "}
              <span className="font-mono text-[12px] text-text">gdmacros:view</span>: how you like
              the catalog ordered and laid out.
            </li>
          </ul>
          <p>
            Because it lives on your device, this list does not follow you to another browser or
            another phone, and clearing your browser data clears it.
          </p>
          <div className="pt-1">
            <ClearStored />
          </div>
        </Section>

        <Section title="If you create an account">
          <p>
            Accounts are handled by <span className="font-semibold text-text">Supabase</span>, which
            stores your email address and a hashed password on your behalf. We never see or store
            your password ourselves.
          </p>
          <p>
            An email address is required so the account can be verified and so a password can be
            reset. Those emails are delivered by <span className="font-semibold text-text">Resend</span>,
            which handles the sending on our behalf and therefore sees the address the message goes
            to. Nothing else about you is collected, and there is no profile, no display name and no
            public page.
          </p>
          <p>
            Being signed in sets a session cookie so the site knows it is you between pages. Signing
            out removes it and revokes the session.
          </p>
          <p>
            You do not need an account to use this site, and having one changes nothing about what
            you can download. Favorites and recently viewed are still stored in your browser rather
            than on your account, so they do not follow you between devices.
          </p>
        </Section>

        <Section title="Analytics">
          <p>
            The site uses <span className="font-semibold text-text">Vercel Web Analytics</span> and{" "}
            <span className="font-semibold text-text">Vercel Speed Insights</span>, from the company
            that hosts it. They count page views and measure how quickly pages load.
          </p>
          <p>
            Neither sets a cookie, and neither builds a profile of you across sites. What they
            record is the page visited, a coarse location such as the country, and technical details
            like browser and device type, plus loading measurements. There is no way for us to look
            up an individual person in it.
          </p>
          <p>
            A content blocker or a "do not track" style extension will block both, and the site
            works exactly the same with them blocked.
          </p>
        </Section>

        <Section title="Translation">
          <p>
            The language picker uses the{" "}
            <span className="font-semibold text-text">Google Translate website widget</span>. If you
            do not use it, it does nothing.
          </p>
          <p>
            If you do pick a language, Google sets its own cookies to remember that choice and the
            text of the page is sent to Google to be translated. That is Google's processing, under
            Google's privacy policy, not ours. Apart from these and the account session cookie, the
            site sets no cookies at all.
          </p>
        </Section>

        <Section title="Video embeds">
          <p>
            Macro pages embed the showcase video from{" "}
            <span className="font-semibold text-text">YouTube</span>. Playing one connects you to
            Google's servers, and from that point Google can set cookies and log the view under its
            own policy, exactly as it would on YouTube itself.
          </p>
          <p>The thumbnails are loaded as plain images from YouTube and play nothing on their own.</p>
        </Section>

        <Section title="Downloads">
          <p>
            Macro files are hosted on <span className="font-semibold text-text">MediaFire</span>.
            Every download button says so, and names the file, before you click it. Following one
            takes you to MediaFire, which is a separate company with its own privacy policy, its own
            cookies and its own adverts.
          </p>
          <p>
            {site.name} does not see who downloads what. There are no download counters tied to a
            person and no redirect tracker in the middle.
          </p>
        </Section>

        <Section title="Reporting and submitting">
          <p>
            <span className="font-semibold text-text">Report a broken macro</span> opens an issue on
            our public GitHub repository. Anything you write there is public and is handled under
            GitHub's privacy policy. You need a GitHub account to post one.
          </p>
          <p>
            <span className="font-semibold text-text">Submitting a macro</span> uses a Google Form,
            so what you enter goes to Google and then to us. Only send what you are happy for us to
            have.
          </p>
        </Section>

        <Section title="Changes">
          <p>
            Accounts arrived in August 2026, and this page was updated before they went live rather
            than after. If anything else changes about what is collected, this page changes first.
          </p>
          <p className="text-[13px] text-muted">
            Questions, or something here that looks wrong? Open an issue on{" "}
            <a
              href={site.repo}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent-soft hover:underline"
            >
              the repository
            </a>
            .
          </p>
        </Section>
      </div>

      <p className="mt-6 text-center text-[12.5px] text-muted">
        See also the{" "}
        <Link href="/faq" className="text-accent-soft hover:underline">
          FAQ
        </Link>{" "}
        and the{" "}
        <Link href="/guidelines" className="text-accent-soft hover:underline">
          guidelines
        </Link>
        .
      </p>
    </div>
  );
}
