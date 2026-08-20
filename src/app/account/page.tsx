import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import ChangeUsernameForm from "@/components/auth/ChangeUsernameForm";
import { getUserAndProfile } from "@/lib/profile";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const metadata: Metadata = {
  title: "Your account",
  robots: { index: false, follow: false },
};

/**
 * Nothing here is the same for two visitors, so it must never be cached or
 * prerendered into a static page.
 */
export const dynamic = "force-dynamic";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border-soft py-3 last:border-b-0">
      <span className="text-[12.5px] text-muted">{label}</span>
      <span className="text-[13.5px] font-medium text-text">{children}</span>
    </div>
  );
}

export default async function AccountPage() {
  if (!isSupabaseConfigured) redirect("/login");

  // Middleware already turns anonymous visitors away, but this is the check
  // that actually guards the data. Middleware can be bypassed by configuration
  // mistakes; a server-side getUser() on the page itself cannot.
  const { user, profile } = await getUserAndProfile();
  if (!user) redirect("/login?next=/account");
  // No profile row means no username chosen yet. Absence of the row is the
  // signal, which is why a half-built profile is never written.
  if (!profile) redirect("/welcome");

  const verified = Boolean(user.email_confirmed_at);
  const joined = user.created_at
    ? new Date(user.created_at).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : null;

  return (
    <div className="mx-auto w-full max-w-[560px] px-4 py-10 sm:px-6 sm:py-14">
      <h1 className="text-[22px] font-extrabold tracking-tight text-text sm:text-[26px]">
        Your account
      </h1>
      <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
        There is not much here yet. Accounts exist so that submitting and managing macros can be
        tied to a person later.
      </p>

      <div className="card mt-6 px-5 py-1.5">
        <Row label="Username">
          <span translate="no" className="notranslate selectable">
            {profile.username}
          </span>
        </Row>
        <Row label="Email">
          <span className="selectable">{user.email}</span>
        </Row>
        <Row label="Email verified">
          {verified ? (
            <span className="text-green">Yes</span>
          ) : (
            <span className="text-amber">Not yet</span>
          )}
        </Row>
        {joined && <Row label="Joined">{joined}</Row>}
      </div>

      <div className="card mt-3 p-5">
        <h2 className="text-[15px] font-bold text-text">Your username</h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
          This is your public identity on GDMacros. Your email is never shown to anyone.
        </p>
        <ChangeUsernameForm current={profile.username} />
      </div>

      {!verified && (
        <div className="mt-3 rounded-xl border border-amber/40 bg-amber/10 px-4 py-3 text-[13px] leading-relaxed text-text-dim">
          Your email is not confirmed yet. Open the link in the message we sent, then reload this
          page.
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-2.5">
        {/* A POST, so no other site can sign you out with an image tag. */}
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="rounded-xl border border-border bg-surface px-4 py-2.5 text-[13.5px] font-semibold text-text-dim transition-[background-color,border-color,transform,color] duration-200 ease-out hover:-translate-y-0.5 hover:border-rose/40 hover:text-rose active:translate-y-0 active:scale-95 active:duration-75"
          >
            Sign out
          </button>
        </form>
        <Link
          href="/favorites"
          className="rounded-xl border border-border bg-surface px-4 py-2.5 text-[13.5px] font-semibold text-text-dim transition-[background-color,border-color,transform,color] duration-200 ease-out hover:-translate-y-0.5 hover:border-accent/40 hover:text-text active:translate-y-0 active:scale-95 active:duration-75"
        >
          Your favorites
        </Link>
      </div>

      <p className="mt-6 text-[12.5px] leading-relaxed text-muted">
        Favorites are still saved in this browser rather than to your account, so they do not follow
        you to another device yet. What is stored where is listed on the{" "}
        <Link href="/privacy" className="text-accent-soft hover:underline">
          privacy page
        </Link>
        .
      </p>
    </div>
  );
}
