"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Everything the site keeps in the browser. There are no accounts and no
 * server-side profile: these lists live on the visitor's own device and are
 * never sent anywhere. The privacy page names each of these keys, so adding one
 * here means updating that page too.
 */
export const STORE_KEYS = {
  /** Slugs of macros opened recently, newest first. */
  recent: "gdmacros:recent",
  /** Slugs the visitor starred. */
  favorites: "gdmacros:favorites",
  /** Catalog sort mode. */
  sort: "gdmacros:sort",
  /** List or grid. */
  view: "gdmacros:view",
} as const;

/** How many recently viewed entries to keep. Two rows' worth on desktop. */
export const RECENT_LIMIT = 6;

/**
 * Fired after any write, so every component using the same key updates without
 * a reload. The native `storage` event only fires in *other* tabs, which is
 * exactly the case we do not need.
 */
const CHANGED = "gdmacros:store-changed";

/* localStorage throws when it is disabled, full, or blocked in private mode.
   None of that is worth breaking a page over, so both sides swallow it. */
function read(key: string): string[] {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function write(key: string, value: string[]) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* nothing to do */
  }
  window.dispatchEvent(new CustomEvent(CHANGED, { detail: key }));
}

/**
 * A list of slugs held in localStorage.
 *
 * Starts empty on purpose. The server renders nothing, and the first client
 * paint has to match it, so the stored value is only adopted after mount. That
 * is also why every consumer has to cope with a first render that has no data.
 */
export function useStoredList(key: string): [string[], (next: string[]) => void, boolean] {
  const [list, setList] = useState<string[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setList(read(key));
    setReady(true);

    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      if (detail && detail !== key) return;
      setList(read(key));
    };

    window.addEventListener(CHANGED, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener(CHANGED, onChange);
      window.removeEventListener("storage", onChange);
    };
  }, [key]);

  const update = useCallback(
    (next: string[]) => {
      setList(next);
      write(key, next);
    },
    [key],
  );

  return [list, update, ready];
}

/** Records that a macro was opened. Most recent first, no duplicates. */
export function recordView(slug: string) {
  if (!slug) return;
  const next = [slug, ...read(STORE_KEYS.recent).filter((s) => s !== slug)].slice(0, RECENT_LIMIT);
  write(STORE_KEYS.recent, next);
}

export function useFavorites() {
  const [favorites, setFavorites, ready] = useStoredList(STORE_KEYS.favorites);

  const toggle = useCallback(
    (slug: string) => {
      setFavorites(
        favorites.includes(slug) ? favorites.filter((s) => s !== slug) : [slug, ...favorites],
      );
    },
    [favorites, setFavorites],
  );

  return { favorites, toggle, ready, isFavorite: (slug: string) => favorites.includes(slug) };
}

/** Wipes everything this site stores. Offered on the privacy page. */
export function clearAllStored() {
  for (const key of Object.values(STORE_KEYS)) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* nothing to do */
    }
  }
  window.dispatchEvent(new CustomEvent(CHANGED, { detail: "" }));
}
