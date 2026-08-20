"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { SlidersIcon } from "./icons";

/**
 * A shortcut to the review queue, shown only to administrators.
 *
 * This is convenience, not security. The role is read from the database using
 * the visitor's own session, so the policy on `user_roles` decides: it returns
 * only your own rows, meaning a normal user gets an empty result no matter what
 * they ask for. There is no list of admins in the frontend, and no username or
 * email is compared against anything.
 *
 * Hiding the link protects nothing on its own, and it is not meant to. /admin
 * checks the role again on the server, the select policy on `submissions` only
 * returns other people's rows to an admin, and both review RPCs call
 * private.is_admin() for themselves.
 *
 * A CLIENT component for the same reason as AccountLink: resolving this on the
 * server would mean calling cookies() in the root layout, which opts every
 * route out of static rendering, including all 106 prerendered macro pages.
 */
export default function AdminLink() {
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const supabase = createClient();
    if (!supabase) return;

    let active = true;

    const check = async () => {
      // No session, no query. Signed-out visitors are the overwhelming
      // majority, and they should cost nothing.
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        if (active) setIsAdmin(false);
        return;
      }
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("role", "admin")
        .limit(1);
      if (active) setIsAdmin((roles?.length ?? 0) > 0);
    };

    void check();

    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      void check();
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  if (!isAdmin) return null;

  return (
    <Link
      href="/admin"
      aria-label="Review queue"
      title="Review queue"
      className="grid h-9 w-9 place-items-center rounded-lg text-muted transition-[color,background-color,transform] duration-200 hover:bg-surface-2 hover:text-text active:scale-90 active:duration-75"
    >
      <SlidersIcon className="h-[18px] w-[18px]" />
    </Link>
  );
}
