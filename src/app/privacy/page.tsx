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
 * WRITTEN TO STOP GOING STALE
 * ---------------------------
 * The previous version described the implementation: individual tables,
 * individual storage keys, one section per feature. Every feature shipped meant
 * another section, and a policy that needs editing on every release is a policy
 * that will eventually be wrong, because sooner or later somebody ships without
 * editing it.
 *
 * This version is organised by CATEGORY OF DATA and PURPOSE instead. "Things
 * you choose, stored against your account" covers the email preferences that
 * exist today and the next preference that gets added, without a word changing.
 * Companies are described by the ROLE they perform, so moving a feature between
 * them is what would need an edit, not adding a feature.
 *
 * Specific facts are still named where they are the point rather than an
 * example: the route support mail actually takes, what is public, what is
 * deleted when. Those are commitments, not implementation trivia.
 *
 * The trade is deliberate and has a floor: generality must never become vague
 * enough to stop being a promise. If a change means the words below are no
 * longer true, the words change. That is the whole test.
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
        stored, what stays private, and which other companies are involved.
      </p>

      <Section title="The short version">
        <Bullets
          items={[
            "You can browse and download everything without an account.",
            "There is no advertising, no tracking cookie, and nothing is sold or shared for marketing.",
            "An account stores what it needs to be an account, plus what you choose to give it.",
            "Your email address is private. Your username and your macros are public.",
            "We only email you about your account, your submissions, and changes to these documents.",
          ]}
        />
        <p>The rest of this page is the detail behind those five points.</p>
      </Section>

      <Section title="Browsing without an account">
        <p>
          You do not need an account to browse the catalog or to download a macro, and nothing about
          you is stored on our side when you do either.
        </p>
        <p>
          Your browser keeps a few small preferences locally so the site behaves sensibly between
          visits: things like your theme (<Key>gdm-theme</Key>), how you like the list laid out,
          what you viewed recently, and your favorites (<Key>gdmacros:favorites</Key>). These live in
          your browser&apos;s local storage. They are not sent to us, they are not an identifier, and
          clearing your site data removes them.
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

      <Section title="Your account">
        <p>Accounts are handled by Supabase. Having one means storing:</p>
        <Bullets
          items={[
            "Your email address, used to sign in, confirm the account, reset a password, and send the messages described below.",
            "A hashed version of your password. We never see your actual password, and it is not something we can look up or recover.",
            "Session information that keeps you signed in.",
            "Your username.",
          ]}
        />
        <p>
          Your <span className="font-semibold text-text">username is public</span>. It is the name
          shown on macros you record and on your profile page. Your{" "}
          <span className="font-semibold text-text">email address is private</span>: it is not shown
          anywhere on the site, and the review screens do not have access to it. When an admin looks
          at a submission they see the username, never the address behind it.
        </p>
      </Section>

      <Section title="Things you choose, stored against your account">
        <p>
          Some data exists only because you asked for it. Today that means your favorites when you
          are signed in, your notification read state, and your preferences for which submission
          results are emailed to you. As the site gains options, new preferences of this kind are
          stored the same way and for the same reason: to make the site behave the way you set it.
        </p>
        <p>
          None of it is used for anything other than providing that feature to you. Changing a
          setting changes the stored value; removing the feature or the account removes it.
        </p>
        <p>
          Signed out, favorites stay in your browser only. We do not know what they are and they do
          not leave your device.
        </p>
      </Section>

      <Section title="Macros you submit">
        <p>Submitting a macro stores what is needed to review and publish it:</p>
        <Bullets
          items={[
            "Which account submitted it, and the level, video link, recorder, macro author and any notes you entered.",
            "The .gdr2 file itself.",
            "Timestamps and the current review status.",
          ]}
        />
        <p>
          The uploaded file goes into private storage. It is not public and not listed, and no
          browser can reach it directly. Only an admin reviewing your submission can open it, and
          only through a short-lived link generated for that review. A reviewer can correct details
          such as a missing video link before publishing.
        </p>
      </Section>

      <Section title="What becomes public">
        <p>
          After an admin approves a submission, publishing happens automatically. The file is
          uploaded as a public download, the catalog entry is added, and the site is checked to
          confirm the macro is really live. Once that is confirmed, the private copy of your upload
          is deleted.
        </p>
        <p>Public means the macro itself, and the credits shown beside it: the level, the recorder, and the macro author. Also public:</p>
        <Bullets
          items={[
            "Your username, once you choose one.",
            <>
              Your profile page, which lists the macros credited to your name. Anyone can view it,
              and it is included in the site&apos;s sitemap.
            </>,
            "The catalog itself.",
          ]}
        />
        <p>
          Nothing private travels with a published macro. The public file is named after the macro
          author, the level and the recorder. It does not contain your email address, your account
          ID, your submission notes, or anything from the review process.
        </p>
      </Section>

      <Section title="Email we send you">
        <p>The address on your account is used for:</p>
        <Bullets
          items={[
            "account mail such as confirmation and password resets,",
            "submission results, if you have those switched on in Settings,",
            "the result of a support ticket when an admin closes it,",
            "notice of a material change to the Terms or this policy,",
            "and important account, security or service messages.",
          ]}
        />
        <p>
          All of it comes from <Mail />. This is{" "}
          <span className="font-semibold text-text">not a newsletter and not advertising</span>.
          There is no marketing mailing list on this site, and we do not send promotional email. You
          can switch off submission-result email in Settings; the results still appear on the site.
        </p>
        <p>
          Sending mail reliably means keeping a short record of what was sent, so that an
          interrupted run can resume and nobody is sent the same message twice. Those records hold
          the message and its delivery state. Where a retry needs it, a copy of the destination
          address is held only for as long as the retry is safe, and is erased once the message is
          settled. They are never used to build a mailing list.
        </p>
      </Section>

      <Section title="Support tickets">
        <p>
          When you are signed in, a suggestion or broken-macro report opens a private support
          thread. It stores your account ID, username, the title and messages, timestamps, its
          status, and the macro page details when the report concerns a download. Only you and the
          admins can read that thread.
        </p>
        <p>
          Open tickets stay available so the conversation can continue. When an admin resolves or
          closes one, you receive an in-app notification and an email with a link to its transcript.
          The ticket, every message, its notification, and the delivery job are permanently deleted
          30 days after closure. Access stops at that deadline even if the scheduled deletion is a
          few seconds late.
        </p>
        <p>
          An admin can block an account from opening new tickets when the feature is abused. The
          block stores the account ID, the reason, who applied it, and the time. It does not hide an
          existing conversation or prevent replies in one.
        </p>
      </Section>

      <Section title="Email you send us">
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
          body, any attachments and ordinary email headers. We use it to answer you and to deal with
          abuse reports and takedown requests.
        </p>
        <p>
          Replies come from <Mail /> using the same infrastructure. The private mailbox address is
          not published anywhere. <Mail /> is the only address you need.
        </p>
      </Section>

      <Section title="Agreeing to the terms">
        <p>
          When an account is created, we record that account&apos;s internal ID, which version of the
          Terms and Privacy Policy were current at that moment, and the time. That is the whole
          record. It does not include your address, your IP address, or anything about your browser.
        </p>
      </Section>

      <Section title="The companies involved">
        <p>
          Each of these performs one role. That is how to read this list: if a feature changes, it is
          almost always still one of these companies doing the same job.
        </p>
        <Bullets
          items={[
            <>
              <span className="font-semibold text-text">Supabase</span> stores accounts and
              everything attached to one: sign-in, profiles, favorites, submissions, the private
              files you upload, review state, support tickets, preferences and the records described
              above.
            </>,
            <>
              <span className="font-semibold text-text">Vercel</span> hosts the site and runs its
              server code. Vercel Web Analytics and Speed Insights are enabled. They report aggregate
              traffic and page performance, and are not used to build a profile of you or to
              advertise to you.
            </>,
            <>
              <span className="font-semibold text-text">Resend</span> handles email, both the
              messages we send you and the support mail you send us.
            </>,
            <>
              <span className="font-semibold text-text">Google</span> is involved through Gmail,
              where support mail is read, and through Google Translate if you use the language menu.
            </>,
            <>
              <span className="font-semibold text-text">GitHub</span> hosts the source code, the
              catalog and every public macro download. Downloading a macro means your browser talks
              to GitHub, under GitHub&apos;s own terms.
            </>,
            <>
              <span className="font-semibold text-text">GDBrowser</span> is used to look up Geometry
              Dash level details. Those lookups are made by our server, not by your browser, so
              GDBrowser does not see you.
            </>,
            <>
              <span className="font-semibold text-text">YouTube</span> provides showcase videos.
              Searching for one during submission happens on our server and uses no API key. An
              embedded player on a macro page is loaded by your browser and is subject to
              Google&apos;s terms.
            </>,
            <>
              <span className="font-semibold text-text">Lanyard</span> supplies the live Discord
              status shown on the{" "}
              <Link href="/about" className="text-accent-soft hover:underline">
                About
              </Link>{" "}
              page. That request is made by your browser. It asks only for the public Discord
              profiles of the two site owners, and there is no way to make it look up anyone else.
            </>,
          ]}
        />
      </Section>

      <Section title="Older MediaFire copies">
        <p>
          Macros used to be hosted on MediaFire. They were all moved to our own hosting, and{" "}
          <span className="font-semibold text-text">
            nothing in the catalog links to MediaFire any more
          </span>
          . The old copies still exist as a fallback in case something ever needs to be restored from
          them. We are not putting a date on removing them.
        </p>
        <p>
          The MediaFire links on the install page are a separate thing. They are how you download
          xdBot itself, and they are not macro downloads.
        </p>
      </Section>

      <Section title="What stays private">
        <p>Everything not listed as public above. In particular:</p>
        <Bullets
          items={[
            "Your email address.",
            "Your password, which is only ever stored hashed.",
            "Files you upload, until and unless a macro is accepted and published.",
            "Your submission notes and anything from the review process.",
            "Your support-ticket threads.",
            "Your settings, your notification state and your favorites.",
            "Support email you send us.",
            "Records of messages sent to your account.",
          ]}
        />
      </Section>

      <Section title="How long things are kept">
        <p>
          The rule is that something is kept while it is still doing its job, and removed when it is
          not. Most records follow an event such as a decision or account deletion; closed support
          tickets are the exception with a fixed deletion timer. Here is what that means in practice:
        </p>
        <Bullets
          items={[
            "A submission stays until it is decided or you withdraw it. Once it is accepted and confirmed live, the private copy of your upload is deleted; a rejected or withdrawn one is removed along with its file.",
            "A published macro stays in the catalog, because it is catalog content rather than account data.",
            "An open support ticket stays while the conversation is active. A resolved or otherwise closed ticket, its transcript and its notification are permanently deleted after 30 days.",
            "Your other account data, including settings, favorites, notifications and your submission history, stays while the account exists.",
            "Delivery records hold a destination address only while a retry could still need it, and are erased once the message is settled.",
            "Support email stays in the mailbox unless it is deleted by hand.",
            "Deleting your account removes the account and the data tied to it. Macros already published stay in the catalog.",
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
          Private data sits behind database access rules rather than being hidden by the interface,
          so a request for someone else&apos;s data is refused by the database itself. Uploaded files
          are in private storage that no browser can read. Nobody can promise perfect security and we
          are not going to, but the design assumes the front end can be bypassed.
        </p>
      </Section>

      <Section title="Children">
        <p>
          Geometry Dash has a young audience. We do not knowingly collect more from a younger visitor
          than from anyone else, and you can use the whole catalog without an account and therefore
          without giving us anything. If you believe a child&apos;s information is stored here and it
          should not be, write to <Mail /> and we will remove it.
        </p>
      </Section>

      <Section title="How this page changes">
        <p>
          {site.name} is actively developed, and features get added. This page is written by category
          rather than by feature so that it keeps describing the site accurately as that happens: a
          new preference, a new kind of message, or a new page is already covered by the categories
          above.
        </p>
        <p>
          What that is <span className="font-semibold text-text">not</span> is a blank cheque. It
          does not permit collecting a new kind of information, using what is here for a new purpose,
          or handing data to a company not named above. Any of those is a change to this page, and
          this page changes before it happens.
        </p>
        <p>
          When it does change, the version and date at the top change with it, so you can tell
          whether you are reading something new. For a material change we may email the address on
          your account. Where the law that applies to you requires more than notice, an email on its
          own is not us claiming you agreed to anything.
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
