"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { retryMySubmissionResultEmails } from "@/lib/actions/submissionResultEmail";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  BellIcon,
  ChevronDownIcon,
  ListIcon,
  LoginIcon,
  SettingsIcon,
  StarIcon,
  UserIcon,
} from "./icons";

/**
 * Signed-in account controls for the navbar.
 *
 * This stays client-side so the static catalog and every macro page remain
 * statically rendered. The pages and database policies are still the real
 * access boundary; hiding these controls while signed out is only the UI rule.
 */
export default function AccountLink() {
  const [signedIn, setSignedIn] = useState(false);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const retriedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const browserClient = createClient();
    if (!browserClient) return;
    const supabase = browserClient;

    let active = true;
    let currentUserId: string | null = null;

    async function readUnread() {
      if (!currentUserId) return;
      const [submissions, account] = await Promise.all([
        supabase.from("submission_notifications").select("id", { count: "exact", head: true }).is("read_at", null),
        supabase.from("account_notifications").select("id", { count: "exact", head: true }).is("read_at", null),
      ]);
      if (active) setUnread((submissions.count ?? 0) + (account.count ?? 0));
    }

    async function useUser(user: { id: string } | null) {
      currentUserId = user?.id ?? null;
      if (!active) return;
      setSignedIn(Boolean(user));
      if (!user) {
        retriedFor.current = null;
        setUnread(0);
        setOpen(false);
        return;
      }

      await readUnread();
      if (retriedFor.current !== user.id) {
        retriedFor.current = user.id;
        // A prior provider outage can leave a result email queued. Retrying is
        // bounded and best-effort; it never changes the in-app notification.
        void retryMySubmissionResultEmails();
      }
    }

    void supabase.auth.getUser().then(({ data }) => useUser(data.user));

    const { data: authSubscription } = supabase.auth.onAuthStateChange((_event, session) => {
      // Run outside Supabase's auth callback lock before making another query.
      window.setTimeout(() => void useUser(session?.user ?? null), 0);
    });

    const interval = window.setInterval(() => void readUnread(), 60_000);
    const onFocus = () => void readUnread();
    const onRead = () => void readUnread();
    window.addEventListener("focus", onFocus);
    window.addEventListener("gdmacros:notifications-read", onRead);

    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("gdmacros:notifications-read", onRead);
      authSubscription.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!open) return;

    function pointerDown(event: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setOpen(false);
    }
    function keyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    }

    document.addEventListener("pointerdown", pointerDown);
    document.addEventListener("keydown", keyDown);
    return () => {
      document.removeEventListener("pointerdown", pointerDown);
      document.removeEventListener("keydown", keyDown);
    };
  }, [open]);

  if (!isSupabaseConfigured) return null;

  if (!signedIn) {
    return (
      <Link
        href="/login"
        aria-label="Log in or create an account"
        title="Log in or create an account"
        className="grid h-9 w-9 place-items-center rounded-lg text-muted transition-[color,background-color,transform] hover:bg-surface-2 hover:text-text active:scale-90"
      >
        <LoginIcon className="h-[18px] w-[18px]" />
      </Link>
    );
  }

  const close = () => setOpen(false);

  return (
    <>
      <Link
        href="/notifications"
        aria-label={unread > 0 ? `${unread} unread notification${unread === 1 ? "" : "s"}` : "Notifications"}
        title="Notifications"
        className="relative grid h-9 w-9 place-items-center rounded-lg text-muted transition-[color,background-color,transform] hover:bg-surface-2 hover:text-text active:scale-90"
      >
        <BellIcon className="h-[18px] w-[18px]" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 grid min-h-4 min-w-4 place-items-center rounded-full bg-rose px-1 text-[9px] font-bold leading-none text-white ring-2 ring-nav tabular-nums">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </Link>

      <div ref={menuRef} className="relative">
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-label="Open account menu"
          aria-haspopup="menu"
          aria-expanded={open}
          title="Your account"
          className={`flex h-9 items-center rounded-lg px-2 text-muted transition-[color,background-color,transform] hover:bg-surface-2 hover:text-text active:scale-95 ${
            open ? "bg-surface-2 text-text" : ""
          }`}
        >
          <UserIcon className="h-[18px] w-[18px]" />
          <ChevronDownIcon className={`ml-1 hidden h-3 w-3 transition-transform sm:block ${open ? "rotate-180" : ""}`} />
        </button>

        {open && (
          <div
            role="menu"
            className="animate-menu-in absolute top-[calc(100%+7px)] right-0 z-50 w-[250px] rounded-xl border border-border bg-nav p-1.5 shadow-2xl"
          >
            <Link role="menuitem" href="/account" onClick={close} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] text-text-dim hover:bg-surface-2 hover:text-text">
              <UserIcon className="h-4 w-4 text-muted" /> Your account
            </Link>
            <Link role="menuitem" href="/submissions" onClick={close} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] text-text-dim hover:bg-surface-2 hover:text-text">
              <ListIcon className="h-4 w-4 text-muted" /> Your submissions
            </Link>
            <Link role="menuitem" href="/favorites" onClick={close} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] text-text-dim hover:bg-surface-2 hover:text-text">
              <StarIcon className="h-4 w-4 text-muted" /> Favorites
            </Link>
            <Link role="menuitem" href="/settings" onClick={close} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] text-text-dim hover:bg-surface-2 hover:text-text">
              <SettingsIcon className="h-4 w-4 text-muted" /> Settings
            </Link>
            <Link role="menuitem" href="/support" onClick={close} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] text-text-dim hover:bg-surface-2 hover:text-text">
              <BellIcon className="h-4 w-4 text-muted" /> Support tickets
            </Link>
            <div className="my-1 border-t border-border-soft" />
            <form action="/auth/signout" method="post">
              <button
                role="menuitem"
                type="submit"
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[13px] text-muted hover:bg-surface-2 hover:text-rose"
              >
                <LoginIcon className="h-4 w-4 rotate-180" /> Sign out
              </button>
            </form>
          </div>
        )}
      </div>
    </>
  );
}
