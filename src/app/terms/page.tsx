import type { Metadata } from "next";
import Link from "next/link";
import AnimatedHeading from "@/components/AnimatedHeading";
import { site } from "@/lib/site";
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from "@/lib/support";
import { TERMS_EFFECTIVE_DATE, TERMS_VERSION, formatLegalDate } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: `The rules for using ${site.name}, submitting macros, and what we can and cannot promise.`,
};

/**
 * The Terms.
 *
 * Written to be read. No invented company, no invented address, no clause
 * claiming to override consumer law, and no pretence that a lawyer wrote it.
 * Everything here describes something the site actually does.
 */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-9">
      <h2 className="text-[17px] font-bold text-text">{title}</h2>
      <div className="mt-2.5 space-y-3 text-[14.5px] leading-relaxed text-text-dim">{children}</div>
    </section>
  );
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item} className="flex gap-3">
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

export default function TermsPage() {
  return (
    <div className="mx-auto w-full max-w-[760px] px-4 py-10 sm:px-6 sm:py-14">
      <AnimatedHeading
        text="Terms of Service"
        className="text-[30px] font-extrabold tracking-tight text-text sm:text-[36px]"
      />
      <p className="mt-3 text-[13px] text-muted">
        Version {TERMS_VERSION}. Effective {formatLegalDate(TERMS_EFFECTIVE_DATE)}.
      </p>
      <p className="mt-4 text-[15px] leading-relaxed text-muted">
        These are the rules for using {site.name}. They are written in plain English because they are
        meant to be read, not skipped.
      </p>

      <Section title="Agreeing to these terms">
        <p>
          Using the site means accepting these terms. Creating an account means the same thing, and
          the version you agreed to at signup is recorded against your account so both of us know
          which text applied.
        </p>
        <p>
          If you do not agree with something here, the honest answer is not to use the site. You can
          browse and download without an account, and you can stop at any time.
        </p>
      </Section>

      <Section title="What GDMacros is">
        <p>
          {site.name} is a free public catalog of Geometry Dash macros. A macro is a recorded
          sequence of inputs that replays a level. It is a list of frame numbers and button states,
          not a program.
        </p>
        <p>
          We host the macro files ourselves rather than linking to whatever is available elsewhere,
          which is what keeps the downloads working.
        </p>
      </Section>

      <Section title="Not an official Geometry Dash project">
        <p>
          {site.name} is an independent fan project. It is not affiliated with, endorsed by, or
          connected to RobTop Games. Geometry Dash and its assets belong to their owners. The same
          goes for the replay tools: Mega Hack, xdBot and zBot are made by other people and are not ours.
        </p>
      </Section>

      <Section title="Your account">
        <p>You are responsible for a few basic things:</p>
        <Bullets
          items={[
            "Using an email address you actually control, because that is where account and service messages go.",
            "Keeping your password and access to your account to yourself.",
            "What happens under your account.",
          ]}
        />
        <p>
          We can restrict or remove an account that is being used abusively. If that happens to you
          and you think it is wrong, write to <Mail /> and we will look at it.
        </p>
      </Section>

      <Section title="Downloading and using macros">
        <p>
          What you do with a macro is your responsibility. We do not promise that using one is
          allowed anywhere in particular. Geometry Dash, its leaderboards, community demon lists and
          any competition all set their own rules, they can change them, and none of them answer to
          us.
        </p>
        <p className="font-semibold text-text">
          A macro completion is not a manual completion. Presenting one as a legitimate achievement
          is dishonest, and this site is not a records list.
        </p>
      </Section>

      <Section title="Submitting a macro">
        <p>When you submit a macro you are telling us that:</p>
        <Bullets
          items={[
            "You recorded it, or you have permission from the person who did to submit and distribute it.",
            "The level, recorder, author and other details you enter are accurate as far as you know.",
            "The file is a genuine .gdr or .gdr2 macro and not malware, a joke file, or anything designed to cause harm.",
          ]}
        />
        <p>
          Submitting something does not mean it gets published. Every submission is reviewed, and it
          can be turned down. The{" "}
          <Link href="/guidelines" className="text-accent-soft hover:underline">
            guidelines
          </Link>{" "}
          explain what we accept.
        </p>
      </Section>

      <Section title="Permission to host what you submit">
        <p>
          You keep whatever rights you have in your macro. We do not claim to own it, and this is not
          a transfer of ownership.
        </p>
        <p>
          What you do give us is permission to run the service with it. That permission is
          non-exclusive, worldwide and free of charge, and it covers only what hosting a public
          catalog actually requires:
        </p>
        <Bullets
          items={[
            "Storing the file and reviewing it.",
            "Renaming the public file so it follows the site's naming convention.",
            "Copying it to our public download hosting.",
            "Publicly listing it and serving it as a download.",
            "Showing the macro author, the level and the recorder alongside it.",
            "Keeping reasonable backup copies.",
          ]}
        />
        <p>
          If you want a macro you submitted taken down, write to <Mail /> and say which one. We will
          also act on a legitimate rights complaint from someone whose macro was submitted by
          somebody else.
        </p>
      </Section>

      <Section title="What happens when a macro is published">
        <p>
          An accepted macro becomes a public download and a public catalog entry. It is meant to stay
          available, which is the point of the site.
        </p>
        <p>
          Because of that, deleting your account does not automatically remove a macro that has
          already been published. Your account data is yours; a published catalog entry is part of
          the catalog. Removal requests still go to <Mail /> and we will handle reasonable ones.
        </p>
      </Section>

      <Section title="Moderation">
        <p>We can:</p>
        <Bullets
          items={[
            "Turn down a submission.",
            "Remove a macro that is broken, mislabelled, or not what it claimed to be.",
            "Stop an account from submitting.",
            "Remove abusive accounts and abusive content.",
          ]}
        />
        <p>
          We try to be reasonable and we will explain a decision if you ask, but we are not promising
          a formal appeals process or that every decision is final.
        </p>
      </Section>

      <Section title="Things you should not do">
        <Bullets
          items={[
            "Upload malicious files, or anything pretending to be a macro that is not one.",
            "Submit someone else's work as your own, or without their permission.",
            "Impersonate another person, whether in a username, a macro credit, or a message to support.",
            "Try to get around review, moderation or access controls.",
            "Attack the site or deliberately disrupt it for other people.",
            "Harass anyone through submissions, usernames or support email.",
          ]}
        />
      </Section>

      <Section title="Services we depend on">
        <p>
          {site.name} runs on services we do not control: GitHub, Supabase, Vercel, Resend, YouTube,
          GDBrowser and Google. If one of them has an outage or changes its rules, parts of the site
          can stop working, and that is outside our hands. Their own terms apply when you interact
          with them directly, such as when you download a file from GitHub or watch an embedded
          video.
        </p>
        <p>
          The{" "}
          <Link href="/privacy" className="text-accent-soft hover:underline">
            Privacy Policy
          </Link>{" "}
          explains what each of them handles.
        </p>
      </Section>

      <Section title="Availability">
        <p>
          The site is provided as it is and as it happens to be available. We add things, change
          things, fix things and sometimes remove things. There is no uptime guarantee, no promise
          that a particular macro stays up forever, and no promise that a feature will keep working
          the way it does today.
        </p>
      </Section>

      <Section title="What we can and cannot promise">
        <p>
          We do not promise that a macro will work on your setup, sync correctly, or do anything in
          particular. Macros are recordings made by other people, and playback depends on your game
          version, your mods and your frame rate.
        </p>
        <p>
          As far as the law allows, we are not responsible for losses that come from using the site
          or a macro from it. We are not trying to sign away rights that cannot be signed away: if
          the law where you live gives you protections that this section conflicts with, the law
          wins and the rest of this still applies.
        </p>
      </Section>

      <Section title="Changes to these terms">
        <p>
          These terms can change. When they do, the version and effective date at the top change with
          them, so you can tell whether you are reading something new.
        </p>
        <p>
          For a material change we may email the address on your account. If a change ever needs your
          renewed agreement under the law that applies to you, an email on its own is not us claiming
          you agreed. We would ask properly.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          Anything about these terms, your account, a takedown or a complaint: <Mail />.
        </p>
        <p className="flex flex-wrap gap-x-5 gap-y-1 pt-1">
          <Link href="/privacy" className="text-accent-soft hover:underline">
            Privacy Policy
          </Link>
          <Link href="/guidelines" className="text-accent-soft hover:underline">
            Guidelines
          </Link>
          <Link href="/faq" className="text-accent-soft hover:underline">
            FAQ
          </Link>
        </p>
      </Section>
    </div>
  );
}
