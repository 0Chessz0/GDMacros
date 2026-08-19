"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { LoginIcon, UserIcon } from "./icons";

/**
 * The account entry in the navbar: one icon button, sized and styled like the
 * theme, submit and GitHub buttons already beside it.
 *
 * Deliberately a CLIENT component. Resolving the user on the server would mean
 * calling cookies() in the root layout, which opts every route out of static
 * rendering, including all 106 prerendered macro pages. That is far too high a
 * price for a nav icon.
 *
 * Nothing is protected by what this renders. It is a signpost. The real gate is
 * the middleware redirect plus the server-side getUser() on /account, neither
 * of which trusts anything the browser says.
 */
export default function AccountLink() {
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const supabase = createClient();
    if (!supabase) return;

    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (active) setSignedIn(Boolean(data.user));
    });

    // Keeps the icon honest after a login, logout or token refresh in this tab.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setSignedIn(Boolean(session?.user));
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  if (!isSupabaseConfigured) return null;

  const href = signedIn ? "/account" : "/login";
  const label = signedIn ? "Your account" : "Log in or create an account";

  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className="relative grid h-9 w-9 place-items-center rounded-lg text-muted transition-[color,background-color,transform] duration-200 hover:bg-surface-2 hover:text-text active:scale-90 active:duration-75"
    >
      {signedIn ? (
        <UserIcon className="h-[18px] w-[18px]" />
      ) : (
        <LoginIcon className="h-[18px] w-[18px]" />
      )}
      {signedIn && (
        // Quiet confirmation that a session is live, without adding a label.
        <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-green" />
      )}
    </Link>
  );
}
