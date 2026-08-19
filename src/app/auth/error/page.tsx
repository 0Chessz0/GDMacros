import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "That link did not work",
  robots: { index: false, follow: false },
};

const REASONS: Record<string, { title: string; body: string }> = {
  invalid: {
    title: "That link did not work",
    body: "It has probably expired, or it was already used. Confirmation and reset links are single use and do not last long.",
  },
  missing: {
    title: "That link is incomplete",
    body: "Part of the address is missing, which usually means an email client cut it in half. Try copying the whole link out of the message.",
  },
  unconfigured: {
    title: "Accounts are unavailable",
    body: "This part of the site is not configured right now. Browsing and downloading macros still works normally.",
  },
};

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;
  const detail = REASONS[reason ?? ""] ?? REASONS.invalid;

  return (
    <div className="mx-auto w-full max-w-[440px] px-4 py-10 sm:px-6 sm:py-14">
      <h1 className="text-[22px] font-extrabold tracking-tight text-text sm:text-[26px]">
        {detail.title}
      </h1>
      <p className="mt-2 text-[13.5px] leading-relaxed text-muted">{detail.body}</p>

      <div className="mt-6 flex flex-wrap gap-2.5">
        <Link
          href="/login"
          className="rounded-xl bg-accent px-4 py-2.5 text-[13.5px] font-semibold text-white transition-[background-color,transform] duration-200 ease-out hover:bg-accent-hover active:scale-95 active:duration-75"
        >
          Go to login
        </Link>
        <Link
          href="/forgot-password"
          className="rounded-xl border border-border bg-surface px-4 py-2.5 text-[13.5px] font-semibold text-text-dim transition-[background-color,border-color,transform,color] duration-200 ease-out hover:border-accent/40 hover:text-text active:scale-95 active:duration-75"
        >
          Send a new link
        </Link>
      </div>

      <p className="mt-6 text-center text-[12.5px] text-muted">
        An account is optional.{" "}
        <Link href="/" className="text-accent-soft hover:underline">
          Browse macros
        </Link>{" "}
        without one.
      </p>
    </div>
  );
}
