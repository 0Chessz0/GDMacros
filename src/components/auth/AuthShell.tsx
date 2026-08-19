import Link from "next/link";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/**
 * The frame every auth page sits in. Narrow, centred, one card, same borders
 * and spacing as the rest of the site. Nothing here introduces a new visual
 * idiom: an account page should look like it was always part of GDMacros.
 */
export default function AuthShell({
  title,
  intro,
  children,
  footer,
}: {
  title: string;
  intro?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-[440px] px-4 py-10 sm:px-6 sm:py-14">
      <h1 className="text-[22px] font-extrabold tracking-tight text-text sm:text-[26px]">{title}</h1>
      {intro && <p className="mt-2 text-[13.5px] leading-relaxed text-muted">{intro}</p>}

      <div className="card mt-6 p-5">
        {isSupabaseConfigured ? (
          children
        ) : (
          <div className="text-[13.5px] leading-relaxed text-text-dim">
            <p className="font-semibold text-amber">Accounts are unavailable right now.</p>
            <p className="mt-2 text-muted">
              This part of the site is not configured. Browsing and downloading macros still works
              normally, and neither needs an account.
            </p>
            <Link
              href="/"
              className="mt-4 inline-block rounded-lg bg-accent px-3.5 py-2 text-[13px] font-medium text-white transition-[background-color,transform] duration-200 ease-out hover:bg-accent-hover active:scale-95 active:duration-75"
            >
              Browse macros
            </Link>
          </div>
        )}
      </div>

      {footer && isSupabaseConfigured && (
        <div className="mt-4 text-center text-[13px] text-muted">{footer}</div>
      )}

      <p className="mt-6 text-center text-[12.5px] text-muted">
        An account is optional. Every macro is free to download without one.
      </p>
    </div>
  );
}
