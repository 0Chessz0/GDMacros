"use client";

import { usePathname } from "next/navigation";

/**
 * Replays an entrance animation on first load and again on every route change.
 *
 * Keying the wrapper on the pathname is what makes it fire on navigation: the
 * old subtree unmounts and the new one mounts fresh, so the CSS animation runs
 * again rather than being stuck in its finished state.
 *
 * `prefers-reduced-motion` is honoured by the global rule in globals.css.
 */
export default function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div key={pathname} className="animate-page-enter">
      {children}
    </div>
  );
}
