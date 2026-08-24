import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import SubmissionEmailSettings from "@/components/settings/SubmissionEmailSettings";
import { MailIcon, ShieldIcon, SlidersIcon, UserIcon } from "@/components/icons";
import { findAuthorByName } from "@/lib/authors";
import { getUserAndProfile } from "@/lib/profile";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Settings",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

function SettingsLink({ href, title, detail }: { href: string; title: string; detail: string }) {
  return (
    <Link
      href={href}
      className="block rounded-xl border border-border-soft bg-surface px-4 py-3.5 transition-[border-color,transform] hover:-translate-y-0.5 hover:border-accent/40"
    >
      <span className="block text-[13.5px] font-semibold text-text">{title}</span>
      <span className="mt-1 block text-[12.5px] leading-relaxed text-muted">{detail}</span>
    </Link>
  );
}

export default async function SettingsPage() {
  if (!isSupabaseConfigured) redirect("/login");

  const { user, profile } = await getUserAndProfile();
  if (!user) redirect("/login?next=/settings");
  if (!profile) redirect("/welcome");

  const supabase = await createClient();
  const { data } = await supabase!.rpc("get_account_settings");
  const row = (
    Array.isArray(data) ? data[0] : data
  ) as
    | { email_submission_accepted?: boolean; email_submission_rejected?: boolean }
    | null;
  const accepted = row?.email_submission_accepted ?? true;
  const rejected = row?.email_submission_rejected ?? true;
  const catalogAuthor = findAuthorByName(profile.username);

  return (
    <div className="mx-auto w-full max-w-[720px] px-4 py-10 sm:px-6 sm:py-14">
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-xl border border-border bg-surface text-accent-soft">
          <SlidersIcon className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-[22px] font-extrabold tracking-tight text-text sm:text-[26px]">
            Settings
          </h1>
          <p className="mt-1 text-[13px] text-muted">Account and notification preferences.</p>
        </div>
      </div>

      <section className="card mt-6 p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-border bg-surface-2 text-muted">
            <MailIcon className="h-[18px] w-[18px]" />
          </span>
          <div>
            <h2 className="text-[15px] font-bold text-text">Submission result emails</h2>
            <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
              Sent to <span className="selectable font-medium text-text-dim">{user.email}</span>.
              In-app notifications are always created, even when email is off.
            </p>
          </div>
        </div>
        <div className="mt-3">
          <SubmissionEmailSettings accepted={accepted} rejected={rejected} />
        </div>
      </section>

      <section className="mt-7">
        <div className="mb-3 flex items-center gap-2">
          <UserIcon className="h-[17px] w-[17px] text-muted" />
          <h2 className="text-[14px] font-bold text-text">Profile and activity</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <SettingsLink
            href="/account"
            title={`Profile: ${profile.username}`}
            detail="View your account details or change your public username."
          />
          <SettingsLink
            href="/notifications"
            title="Notifications"
            detail="Read and dismiss accepted or rejected submission results."
          />
          <SettingsLink
            href="/submissions"
            title="Submission history"
            detail="See work in review and accepted macros tied to your account."
          />
          <SettingsLink
            href="/favorites"
            title="Favorites"
            detail="Manage macros saved in this browser or synced to your account."
          />
          <SettingsLink
            href="/support"
            title="Support tickets"
            detail="Read private support threads or send a suggestion."
          />
          {catalogAuthor && (
            <SettingsLink
              href={`/author/${catalogAuthor.slug}`}
              title="Your public profile"
              detail={`The page everyone sees, with every macro credited to ${catalogAuthor.name}.`}
            />
          )}
        </div>
      </section>

      <section className="card mt-7 p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <ShieldIcon className="mt-0.5 h-5 w-5 shrink-0 text-muted" />
          <div>
            <h2 className="text-[15px] font-bold text-text">Account and privacy</h2>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
              Your email is private. Your username and your macros are public.
            </p>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-[12.5px]">
              <Link href="/reset-password" className="text-accent-soft hover:underline">
                Change your password
              </Link>
              <Link href="/privacy" className="text-accent-soft hover:underline">
                Read the privacy policy
              </Link>
              <Link href="/terms" className="text-accent-soft hover:underline">
                Read the terms
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
