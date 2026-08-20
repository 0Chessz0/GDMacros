import type { Metadata } from "next";
import Link from "next/link";
import ClearStored from "@/components/ClearStored";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy on GDMacros: accounts, submissions, analytics and third parties",
  description:
    "What GDMacros stores in your browser and on your account, what happens to a macro you submit, how long it is kept, and which third parties are involved.",
  alternates: { canonical: "/privacy" },
  openGraph: {
    title: `Privacy | ${site.name}`,
    description: "What is stored, what happens to a submitted macro, and which third parties are involved.",
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
        Accounts on {site.name} are optional. Browsing, searching and downloading macros needs no
        account and collects nothing about you. An account adds a public username, favorites that
        follow you between devices, and the ability to submit a macro. This page covers the website
        only, not the desktop app.
      </p>

      <div className="mt-7 flex flex-col gap-3">
        <Section title="What is stored in your browser">
          <p>
            A few small preferences are kept in your browser&apos;s local storage. This is not a
            cookie, and it is separate from the account session cookie described below. None of it
            is sent anywhere while you are signed out. The one exception, once you are signed in, is
            your favorites, noted below:
          </p>
          <ul className="ml-4 list-disc space-y-1 text-[13px]">
            <li>
              <span className="font-mono text-[12px] text-text">gdmacros:recent</span>: the last few
              macros you opened, for the &ldquo;Recently viewed&rdquo; row.
            </li>
            <li>
              <span className="font-mono text-[12px] text-text">gdmacros:favorites</span>: the
              macros you starred. Signed out, this stays on your device. Signed in, it is also saved
              to your account so the same list appears on your other devices.
            </li>
            <li>
              <span className="font-mono text-[12px] text-text">gdmacros:favorites-owner</span> and{" "}
              <span className="font-mono text-[12px] text-text">gdmacros:favorites-dirty</span>:
              which account this browser&apos;s copy of the list belongs to, and whether it has
              changes still to be saved. These exist so that on a shared browser one person&apos;s
              favorites are never added to somebody else&apos;s account.
            </li>
            <li>
              <span className="font-mono text-[12px] text-text">gdmacros:favorites-pending:</span>
              followed by an account id: if you change your favorites while signed out and somebody
              else then signs in on the same browser, your unsaved changes are set aside here rather
              than being lost. They are never added to the other account, and they are saved to
              yours the next time you sign in on this browser. Clearing your browser data, below,
              removes these too.
            </li>
            <li>
              <span className="font-mono text-[12px] text-text">gdmacros:sort</span> and{" "}
              <span className="font-mono text-[12px] text-text">gdmacros:view</span>: how you like
              the catalog ordered and laid out.
            </li>
          </ul>
          <p>
            Clearing your browser data clears all of it. If you are signed in, your favorites are
            also on your account, so they come back when you sign in again. Signed out, these lists
            do not follow you to another browser or another phone.
          </p>
          <div className="pt-1">
            <ClearStored />
          </div>
        </Section>

        <Section title="If you create an account">
          <p>
            Accounts are handled by <span className="font-semibold text-text">Supabase</span>, which
            stores your email address and a hashed password on your behalf. We never see or store
            your password, and it is never displayed anywhere.
          </p>
          <p>
            An email address is required so the account can be verified and so a password can be
            reset. Those emails are delivered by{" "}
            <span className="font-semibold text-text">Resend</span>, which handles the sending on
            our behalf and therefore sees the address the message goes to.
          </p>
          <p>
            You also choose a <span className="font-semibold text-text">username</span>. The
            username is <span className="font-semibold text-text">public</span>: it is what appears
            next to a macro you submit, and it is what reviewers see. Your{" "}
            <span className="font-semibold text-text">email address is private</span>. It is never
            shown on the site, never shown to reviewers, and never attached to anything anyone
            browses.
          </p>
          <p>
            Being signed in sets a session cookie so the site knows it is you between pages. Signing
            out removes it and revokes the session.
          </p>
          <p>
            You do not need an account to browse or download, and having one changes nothing about
            what you can download.
          </p>
        </Section>

        <Section title="Favorites">
          <p>Signed out, favorites are kept only in your browser and are never sent anywhere.</p>
          <p>
            Signed in, they are also saved to your account so the same list appears on your other
            devices. What is stored is your account identifier and the in-game level id of each
            saved level, and nothing else. Your email is not involved.
          </p>
          <p>Your favorites are private to you. They are not shown publicly and nobody else can read them.</p>
        </Section>

        <Section title="Submitting a macro">
          <p>When you submit a macro, the submission holds:</p>
          <ul className="ml-4 list-disc space-y-1 text-[13px]">
            <li>the Geometry Dash level you picked, meaning its level ID, name and creator</li>
            <li>the video link, when you choose or paste one</li>
            <li>which tool recorded it, xdBot or Mega Hack</li>
            <li>the macro author, meaning whoever recorded it, which is often not you</li>
            <li>your optional notes</li>
            <li>the uploaded .gdr2 file</li>
            <li>the date it was sent and its current status</li>
            <li>the account identifier that links the submission to you</li>
          </ul>
          <p>
            Reviewers see the <span className="font-semibold text-text">public username</span> of
            whoever sent a submission in. They do not see the email address, and the review screens
            contain no email at all.
          </p>
        </Section>

        <Section title="Your uploaded macro file">
          <p>
            Uploaded .gdr2 files are kept in{" "}
            <span className="font-semibold text-text">private storage</span>. They are not publicly
            accessible, they cannot be listed, and there is no public link to them. Your browser
            never talks to the file storage directly.
          </p>
          <p>
            Authorised {site.name} administrators can open a submitted file while reviewing it,
            through a short-lived private link created at the moment they ask for it. Nothing
            permanent is published.
          </p>
        </Section>

        <Section title="How long a submission is kept">
          <p>
            <span className="font-semibold text-text">Waiting for review.</span> The full submission
            and its file are kept while it waits.
          </p>
          <p>
            <span className="font-semibold text-text">Being published.</span> When an administrator
            starts publishing a macro by hand, the submission and its file are still kept, because
            they are what the work is done from.
          </p>
          <p>
            <span className="font-semibold text-text">Accepted.</span> Once the administrator marks
            the publishing as finished, the full submission record is deleted and its .gdr2 is
            deleted with it.
          </p>
          <p>
            <span className="font-semibold text-text">Rejected.</span> The full submission record
            and its .gdr2 are deleted straight away.
          </p>
          <p>
            <span className="font-semibold text-text">Withdrawn.</span> If you withdraw a submission
            while it is still waiting, the record is removed and its file is cleaned up the same
            way.
          </p>
          <p>
            File deletion is attempted as part of finishing, and in practice happens at the same
            moment. Because the file storage and the database are separate systems, a deletion can
            occasionally fail even though the record is already gone. A leftover file like that is
            not reachable by anyone and is removed by routine cleanup.
          </p>
        </Section>

        <Section title="Results you are shown afterwards">
          <p>
            Because an accepted or rejected submission is deleted, a small result note is kept so
            you can still see what happened. It holds only the level name, whether it was accepted
            or rejected, the reason if it was rejected, and the date.
          </p>
          <p>
            It does not keep your file, the video link, the notes, the macro author, the recorder,
            the file size or anything else from the submission. Only you can see your own results,
            and you can dismiss any of them, which deletes it.
          </p>
        </Section>

        <Section title="Submission bans">
          <p>
            Administrators can stop an email address from creating{" "}
            <span className="font-semibold text-text">new macro submissions</span>. This is only
            about submitting. It does not stop anyone signing in, browsing, downloading, using
            favorites, seeing a submission they have already sent, withdrawing one that is still
            waiting, or reading their past results.
          </p>
          <p>For moderation we store privately, and only for banned addresses:</p>
          <ul className="ml-4 list-disc space-y-1 text-[13px]">
            <li>the address in lower case</li>
            <li>the internal account identifier, when the address belongs to an account</li>
            <li>a private moderator note explaining why</li>
            <li>which administrator account added it, and when</li>
          </ul>
          <p>
            None of this is public. Banned addresses do not appear in the normal review screens, and
            the moderator note is never shown to the person who is banned. They are told only that
            they are not allowed to make macro submissions.
          </p>
          <p>
            A ban is remembered against the account as well as the address, so it still applies if
            that account later changes its email. Banning an address can also stop a future account
            created with the same address from submitting.
          </p>
        </Section>

        <Section title="Level search, through GDBrowser">
          <p>
            The submit form searches Geometry Dash levels using{" "}
            <span className="font-semibold text-text">GDBrowser</span>, a third-party service, and
            checks the level again when you send the submission so that the name and creator stored
            are the real ones.
          </p>
          <p>
            What goes to GDBrowser is only what is needed to answer the lookup: your search text, or
            a level ID. The request is made by our server rather than by your browser, so GDBrowser
            sees our server and the search terms. Your account, username and email are not sent.
          </p>
        </Section>

        <Section title="Video search, without a YouTube API key">
          <p>
            The submit form can search YouTube for the showcase video. Our server reads
            YouTube&apos;s ordinary public search results page and takes the title, channel and
            thumbnail of each result. When you choose or paste a video, our server checks that it is
            a real public video using YouTube&apos;s public oEmbed service.
          </p>
          <p>
            We do <span className="font-semibold text-text">not</span> use the YouTube Data API.
            There is no Google API key, no Google Cloud project and no YouTube account involved. You
            are not signing in to YouTube, and we are not acting on your behalf there.
          </p>
          <p>
            What goes to YouTube is the search text you typed, or the video you chose, along with
            the ordinary details any web request carries from our server. Your account, username and
            email are not sent.
          </p>
          <p>
            Because both of these searches are made by our server rather than by your browser, those
            services see our server rather than you. They are still separate companies with their
            own privacy policies.
          </p>
        </Section>

        <Section title="What is public and what is not">
          <p>
            <span className="font-semibold text-text">Public:</span> your chosen username, and the
            ordinary catalog information about a macro once it is published, such as the level, the
            macro author and the recorder.
          </p>
          <p>
            <span className="font-semibold text-text">Not public:</span> your email address, your
            uploaded .gdr2 file, your favorites, submission ban records and moderator notes, and the
            internal identifiers and storage details the site uses to keep track of things.
          </p>
          <p>
            Administrators can see private submitted content where they need it to review or
            moderate. That is the only reason anyone else sees it.
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
            A content blocker or a &ldquo;do not track&rdquo; style extension will block both, and
            the site works exactly the same with them blocked.
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
            text of the page is sent to Google to be translated. That is Google&apos;s processing,
            under Google&apos;s privacy policy, not ours. Apart from these and the account session
            cookie, the site sets no cookies at all.
          </p>
        </Section>

        <Section title="Video embeds">
          <p>
            Macro pages embed the showcase video from{" "}
            <span className="font-semibold text-text">YouTube</span>. Playing one connects you to
            Google&apos;s servers, and from that point Google can set cookies and log the view under
            its own policy, exactly as it would on YouTube itself.
          </p>
          <p>The thumbnails are loaded as plain images from YouTube and play nothing on their own.</p>
        </Section>

        <Section title="Downloads">
          <p>
            Published macro files are hosted on{" "}
            <span className="font-semibold text-text">MediaFire</span>. Every download button says
            so, and names the file, before you click it. Following one takes you to MediaFire, which
            is a separate company with its own privacy policy, its own cookies and its own adverts.
          </p>
          <p>
            {site.name} does not see who downloads what. There are no download counters tied to a
            person and no redirect tracker in the middle.
          </p>
        </Section>

        <Section title="Who processes data for us">
          <ul className="ml-4 list-disc space-y-1 text-[13px]">
            <li>
              <span className="font-semibold text-text">Supabase</span>: accounts and sign-in, the
              database behind usernames, favorites and submissions, and the private storage holding
              uploaded .gdr2 files.
            </li>
            <li>
              <span className="font-semibold text-text">Vercel</span>: hosting the site, running the
              server side of it, and the analytics described above.
            </li>
            <li>
              <span className="font-semibold text-text">Resend</span>: sending account emails, such
              as confirming an address or resetting a password.
            </li>
          </ul>
          <p>
            GDBrowser, YouTube, Google Translate and MediaFire are described in their own sections
            above. They are not processing data on our behalf; they are separate services you or our
            server reach out to.
          </p>
        </Section>

        <Section title="Security">
          <p>
            Uploaded files are private, administrative functions are restricted by an account role
            rather than by anything the browser claims, and access is checked in the database rather
            than only in the interface. Passwords and sessions are handled by Supabase.
          </p>
          <p>
            No site can promise that data is impossible to reach. What we can say is that the
            arrangement above is designed so that private things stay private by default, and so
            that a mistake in the interface alone is not enough to expose them.
          </p>
        </Section>

        <Section title="Your choices">
          <p>
            You can browse, search and download without an account at all. If you have one, you can
            change your username, withdraw a submission while it is still waiting for review,
            dismiss a result note, and clear everything this site stores in your browser using the
            button further up this page.
          </p>
          <p>
            If you want your account removed, ask through the link below and say which account it
            is. Deleting an account removes the things attached to it, including its username, its
            synced favorites, any submission still in progress and its uploaded file.
          </p>
        </Section>

        <Section title="Changes">
          <p>
            Accounts arrived in August 2026, followed by synced favorites and then on-site macro
            submissions with an administrator review process. This page was updated alongside each
            of those rather than afterwards. If anything else changes about what is collected, this
            page changes first.
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
