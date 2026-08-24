"use client";

import Link from "next/link";

/**
 * Fallback UI for an unexpected runtime error.
 *
 * Without this file an error drops to Next's default page: unstyled, off
 * design, and on a route like /admin fairly alarming. This keeps the navbar,
 * the footer and the theme, and offers the two things worth offering.
 *
 * NOT SHOWN: the error message. Errors thrown in a Server Component reach the
 * client as a generic string plus a digest precisely so server internals do not
 * leak, and re-rendering `error.message` would put whatever a Client Component
 * happened to throw on screen. The digest is enough to find the real error in
 * the Vercel logs, and it is the one thing worth printing.
 *
 * The recovery prop is `retry` in this version of Next, not `reset`.
 */
export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <div className="mx-auto flex w-full max-w-[560px] flex-col items-center px-4 py-24 text-center">
      <p className="text-[64px] leading-none font-extrabold text-rose">!</p>
      <h1 className="mt-4 text-[22px] font-bold text-text">Something went wrong</h1>
      <p className="mt-2 text-[14px] leading-relaxed text-muted">
        This page could not be loaded. Trying again often works, because the usual cause is a
        service being briefly unavailable rather than anything being broken.
      </p>

      <div className="mt-6 flex flex-wrap justify-center gap-2.5">
        <button
          type="button"
          onClick={retry}
          className="rounded-xl bg-accent px-4 py-2.5 text-[13.5px] font-semibold text-white transition-colors hover:bg-accent-hover"
        >
          Try again
        </button>
        <Link
          href="/"
          className="rounded-xl border border-border bg-surface px-4 py-2.5 text-[13.5px] font-semibold text-text-dim transition-colors hover:border-muted/50 hover:text-text"
        >
          Back to catalog
        </Link>
      </div>

      {error.digest && (
        <p className="mt-6 text-[11.5px] text-muted">
          Reference <span className="font-mono text-text-dim">{error.digest}</span>
        </p>
      )}
    </div>
  );
}
