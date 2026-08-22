import type { Metadata } from "next";
import Link from "next/link";
import AnimatedHeading from "@/components/AnimatedHeading";
import { site } from "@/lib/site";
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from "@/lib/support";
import { PRIVACY_EFFECTIVE_DATE, PRIVACY_VERSION, formatLegalDate } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: `What ${site.name} stores, what stays private, and which services are involved.`,
};

/**
 * The Privacy Policy.
 *
 * Every statement here describes something the code actually does. Where the
 * code does not guarantee something, the wording says so rather than promising
 * it: there are no retention periods the application does not enforce, no claim
 * of regulatory compliance, and no promise that anything is perfectly secure.
 */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-9">
      <h2 className="text-[17px] font-bold text-text">{title}</h2>
      <div className="mt-2.5 space-y-3 text-[14.5px] leading-relaxed text-text-dim">{children}</div>
    </section>
  );
}

function Bullets({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="space-y-2">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3">
          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

const Mail = () => (
  <a href={SUPPORT_MAILTO} className="text-accent-soft hover:underline">
    {SUPPORT_EMAIL}
  </a>
);

const Key = ({ children }: { children: React.ReactNode }) => (
  <code className="rounded bg-surface-2 px-1.5 py-0.5 text-[12.5px] text-text">{children}</code>
);

export default function PrivacyPage() {
  return (
    <div className="mx-auto w-full max-w-[760px] px-4 py-10 sm:px-6 sm:py-14">
      <AnimatedHeading
        text="Privacy Policy"
        className="text-[30px] font-extrabold tracking-tight text-text sm:text-[36px]"
      />
      <p className="mt-3 text-[13px] text-muted">
        Version {PRIVACY_VERSION}. Last updated {formatLegalDate(PRIVACY_EFFECTIVE_DATE)}.
      </p>
      <p className="mt-4 text-[15px] leading-relaxed text-muted">
        {site.name} is a macro catalog, not an advertising business. This page explains what is
        actually stored, what stays private, and which other companies are involved. It describes
        what the site really does today.
      </p>

      <Section title="Browsing without an account">
        <p>
          You do not need an account to browse the catalog or to download a macro. Nothing about you
          is stored on our side when you do either.
        </p>
        <p>Your browser keeps a few small things locally so the site behaves sensibly:</p>
        <Bullets
          items={[
            <>
              <Key>gdm-theme</Key> for light or dark mode.
            </>,
            <>
              <Key>gdmacros:view</Key> and <Key>gdmacros:sort</Key> for how you like the list laid out.
            </>,
            <>
              <Key>gdmacros:recent</Key> for the recently viewed strip.
            </>,
            <>
              <Key>gdmacros:favorites</Key> and a couple of related keys for favorites.
            </>,
          ]}
        />
        <p>
          These live in your browser's local storage. They are not sent to us, they are not an
          identifier, and clearing your site data removes them.
        </p>
      </Section>

      <Section title="Cookies">
        <p>There is no advertising or tracking cookie on this site. Cookies appear in three cases:</p>
        <Bullets
          items={[
            "When you sign in, Supabase sets a session cookie so you stay signed in. Signing out clears it.",
            "If you use the language menu, Google Translate sets a googtrans cookie to remember the language. Setting it back to English clears it.",
            "An embedded YouTube video can set cookies when you play it. That is YouTube, under Google's terms, not us.",
          ]}
        />
      </Section>

      <Section title="Accounts">
        <p>Accounts are handled by Supabase. When you create one, Supabase stores:</p>
        <Bullets
          items={[
            "Your email address, used to sign in, confirm the account, reset a password, and send important account notices.",
            "A hashed version of your password. We never see your actual password, and it is not something we can look up or recover.",
            "Session information that keeps you signed in.",
          ]}
        />
        <p>
          Your <span className="font-semibold text-text">username is public</span>. It appears next
          to macros you submit. Your{" "}
          <span className="font-semibold text-text">email address is private</span>: it is not shown
          anywhere on the site, and the review screens do not have access to it. When an admin looks
          at a submission they see the username, never the address behind it.
        </p>
      </Section>

      <Section title="Favorites">
        <p>
          Signed out, favorites are stored only in your browser. We do not know what they are and
          they do not leave your device.
        </p>
        <p>
          Signed in, they sync to your account so the same list follows you between devices. That
          means a row linking your account to a level ID. Removing a favorite removes the row.
        </p>
      </Section>

      <Section title="Submitting a macro">
        <p>A submission stores:</p>
        <Bullets
          items={[
            "Which account submitted it, as an internal account ID. Your public username is shown to reviewers through that link.",
            "The level name, level ID and level creator.",
            "The showcase video link, if you gave one.",
            "The recorder used, and the macro author's name.",
            "Any notes you wrote for the reviewer.",
            "The .gdr2 file itself.",
            "Timestamps and the current review status.",
          ]}
        />
        <p>
          The uploaded file goes into private storage. It is not public and not listed, and no
          browser can reach it directly. Only an admin reviewing your submission can open it, and
          only through a short-lived link generated for that review.
        </p>
      </Section>

      <Section title="What happens when a macro is accepted">
        <p>
          After an admin approves a submission, publishing happens automatically. The file is
          uploaded as a public download, the catalog entry is added, and the site is checked to
          confirm the macro is really live before the submission is closed out. Once that is
          confirmed, the private copy of your upload is deleted.
        </p>
        <p>The public file is named after the macro author, the level and the recorder. It does not contain:</p>
        <Bullets
          items={[
            "your email address,",
            "your account ID,",
            "your submission notes,",
            "or anything from the review process.",
          ]}
        />
        <p>
          What becomes public is the macro itself and the credits shown beside it. Nothing private
          travels with it.
        </p>
      </Section>

      <Section title="GitHub">
        <p>
          GitHub hosts the site's source code and the catalog file, and it hosts every public macro
          download as a release asset. When you download a macro, or open one of the repository
          links, your browser is talking to GitHub and GitHub's own privacy terms apply to that
          request.
        </p>
      </Section>

      <Section title="Older MediaFire copies">
        <p>
          Macros used to be hosted on MediaFire. They were all moved to our own hosting, and{" "}
          <span className="font-semibold text-text">nothing in the catalog links to MediaFire any
          more</span>. The old copies still exist as a fallback in case something ever needs to be
          restored from them. We are not putting a date on removing them.
        </p>
        <p>
          The MediaFire links on the install page are a separate thing. They are how you download
          xdBot itself, and they are not macro downloads.
        </p>
      </Section>

      <Section title="Support email">
        <p>
          Mail sent to <Mail /> travels through more than one company before it reaches a person, so
          it is worth being clear about the path:
        </p>
        <Bullets
          items={[
            "Resend receives the message.",
            "Resend calls a webhook on this site.",
            "The site forwards the message to a private mailbox, which is a Google Gmail account.",
          ]}
        />
        <p>
          That means Resend, Vercel and Google can each process support correspondence. The message
          normally includes your email address, the name your mail client sends, the subject, the
          body, any attachments and ordinary email headers.
        </p>
        <p>
          We use it to answer you and to deal with abuse reports and takedown requests. The private
          mailbox address is not published anywhere. <Mail /> is the only address you need.
        </p>
      </Section>

      <Section title="Replies from us">
        <p>
          Replies are sent from <Mail /> using the same Resend and Google infrastructure. If you
          write to us, expect the answer to come from that address.
        </p>
      </Section>

      <Section title="Important account and service emails">
        <p>The email on your account can be used to send you:</p>
        <Bullets
          items={[
            "account mail such as confirmation and password resets,",
            "notice of a material change to these terms or to this policy,",
            "and important account, security or service messages.",
          ]}
        />
        <p>
          These are sent from <Mail />. This is{" "}
          <span className="font-semibold text-text">not a newsletter and not advertising</span>.
          There is no marketing mailing list on this site, and we do not send promotional email.
        </p>
      </Section>

      <Section title="Records of notices we send">
        <p>
          When an important notice is sent to account holders, we keep a private record of the run so
          that it can be resumed if it is interrupted and so nobody is sent the same notice twice.
          That record holds the notice text, the version it referred to, and one row per recipient
          containing the internal account ID, whether it was sent, and the provider's message ID.
        </p>
        <p>
          It deliberately does{" "}
          <span className="font-semibold text-text">not store another copy of your email address</span>
          . Addresses are looked up at the moment of sending and not written down.
        </p>
      </Section>

      <Section title="Agreeing to the terms">
        <p>
          When an account is created, we record that account's internal ID, which version of the
          Terms and Privacy Policy were current at that moment, and the time. That is the whole
          record. It does not include your address, your IP address, or anything about your browser.
        </p>
      </Section>

      <Section title="The companies involved">
        <p>
          <span className="font-semibold text-text">Supabase</span> handles accounts and sign-in,
          profiles and usernames, favorites, submissions, the private files you upload, review and
          moderation state, and the legal records described above.
        </p>
        <p>
          <span className="font-semibold text-text">Vercel</span> hosts the site and runs its server
          code. Vercel Web Analytics and Speed Insights are enabled. They report aggregate traffic and
          page performance, and are not used to build a profile of you or to advertise to you.
        </p>
        <p>
          <span className="font-semibold text-text">Resend</span> handles email. That now covers
          account mail such as confirmations and password resets, receiving mail sent to support,
          forwarding it to the private mailbox, replies sent back out, and the account notices
          described above.
        </p>
        <p>
          <span className="font-semibold text-text">Google</span> is involved through Gmail, which is
          where support mail is read, and through Google Translate if you use the language menu.
        </p>
        <p>
          <span className="font-semibold text-text">GitHub</span> hosts the source, the catalog and
          every public macro download.
        </p>
        <p>
          <span className="font-semibold text-text">GDBrowser</span> is used to look up Geometry Dash
          level details. Those lookups are made by our server, not by your browser, so GDBrowser does
          not see you.
        </p>
        <p>
          <span className="font-semibold text-text">YouTube</span> provides showcase videos. Searching
          for a video during submission happens on our server and uses no API key. An embedded player
          on a macro page is loaded by your browser and is subject to Google's terms.
        </p>
        <p>
          <span className="font-semibold text-text">Lanyard</span> supplies the live Discord status
          shown on the{" "}
          <Link href="/about" className="text-accent-soft hover:underline">
            About
          </Link>{" "}
          page. That request is made by your browser, so Lanyard sees it in the way any site you
          visit does. It asks only for the public Discord profiles of the two site owners, and there
          is no way to make it look up anyone else.
        </p>
      </Section>

      <Section title="Public and private, side by side">
        <p className="font-semibold text-text">Public</p>
        <Bullets
          items={[
            "Your username, once you choose one.",
            "Macros of yours that have been accepted, and the credits shown with them.",
            "The catalog itself.",
          ]}
        />
        <p className="pt-1 font-semibold text-text">Private</p>
        <Bullets
          items={[
            "Your email address.",
            "Your password, which is only ever stored hashed.",
            "Files you upload, until and unless a macro is accepted and published.",
            "Your submission notes and anything from the review process.",
            "Your favorites.",
            "Support email you send us.",
            "Records of notices sent to your account.",
          ]}
        />
      </Section>

      <Section title="How long things are kept">
        <p>
          The application does not run automatic deletion on a timer, so rather than invent retention
          periods, here is what actually happens:
        </p>
        <Bullets
          items={[
            "A pending or in-review submission stays until it is decided or you withdraw it.",
            "Once a macro is accepted and confirmed live, the private copy of your upload is deleted. The published macro stays in the catalog.",
            "A rejected or withdrawn submission is removed along with its uploaded file.",
            "The short result notice telling you the outcome stays until you dismiss it.",
            "Support email stays in the mailbox unless it is deleted by hand.",
            "Notice delivery records and the signup acceptance record are kept while the account exists.",
            "Deleting your account removes the account and the data tied to it, including favorites and any open submissions. Macros already published stay in the catalog, because they are part of the catalog rather than account data.",
          ]}
        />
      </Section>

      <Section title="Deleting your account, or asking about your data">
        <p>
          Write to <Mail /> from the address on the account and say what you want. That covers
          deletion, asking what is stored about you, correcting something, and takedown requests.
        </p>
        <p>
          Please do not open a public GitHub issue for anything about your account. That is a public
          tracker and account matters do not belong there.
        </p>
      </Section>

      <Section title="Security">
        <p>
          Private data sits behind database access rules rather than being hidden by the interface, so
          a request for someone else's data is refused by the database itself. Uploaded files are in
          private storage that no browser can read. Nobody can promise perfect security and we are not
          going to, but the design assumes the front end can be bypassed.
        </p>
      </Section>

      <Section title="Children">
        <p>
          Geometry Dash has a young audience. We do not knowingly collect more from a younger visitor
          than from anyone else, and you can use the whole catalog without an account and therefore
          without giving us anything. If you believe a child's information is stored here and it
          should not be, write to <Mail /> and we will remove it.
        </p>
      </Section>

      <Section title="Changes to this policy">
        <p>
          This policy can change. The version and date at the top change with it, so you can tell
          whether you are looking at something new.
        </p>
        <p>
          For a material change we may email the address on your account. Where the law that applies
          to you requires more than notice, an email on its own is not us claiming you agreed to
          anything.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          Questions about privacy, your account, or anything on this page: <Mail />.
        </p>
        <p className="flex flex-wrap gap-x-5 gap-y-1 pt-1">
          <Link href="/terms" className="text-accent-soft hover:underline">
            Terms of Service
          </Link>
          <Link href="/faq" className="text-accent-soft hover:underline">
            FAQ
          </Link>
          <Link href="/guidelines" className="text-accent-soft hover:underline">
            Guidelines
          </Link>
        </p>
      </Section>
    </div>
  );
}
