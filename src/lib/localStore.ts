"use client";

import { useCallback, useEffect, useState } from "react";
import { PENDING_PREFIX } from "@/lib/favoritesRules";

/**
 * Everything the site keeps in the browser. The privacy page names each of
 * these keys, so adding one here means updating that page too.
 *
 * Favorites are the one list that can also live on an account. Everything else
 * is device-local and is never sent anywhere. See `src/lib/favorites.ts` for how
 * the favorites mirror and the server copy are kept in step.
 *
 * One family of keys is not listed here because it is per user rather than
 * fixed: unsaved edits belonging to an account that is not the current one are
 * parked under `gdmacros:favorites-pending:<user id>`. clearAllStored sweeps
 * those by prefix.
 */
export const STORE_KEYS = {
  /** Slugs of macros opened recently, newest first. */
  recent: "gdmacros:recent",
  /** Level ids the visitor starred. Slugs before the Phase 2B migration. */
  favorites: "gdmacros:favorites",
  /**
   * Which account the favorites list currently mirrors: "guest", or a user id.
   * This is what stops one person's list being absorbed into the next person's
   * account on a shared browser.
   */
  favoritesOwner: "gdmacros:favorites-owner",
  /** "1" when the list was edited while signed out and still needs merging. */
  favoritesDirty: "gdmacros:favorites-dirty",
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
export const CHANGED = "gdmacros:store-changed";

/* localStorage throws when it is disabled, full, or blocked in private mode.
   None of that is worth breaking a page over, so every accessor swallows it. */
export function readList(key: string): string[] {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

export function writeList(key: string, value: string[]) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* nothing to do */
  }
  notifyChanged(key);
}

/** Plain string slots, used for the favorites owner and dirty flag. */
export function readString(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeString(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* nothing to do */
  }
  notifyChanged(key);
}

export function removeKey(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* nothing to do */
  }
  notifyChanged(key);
}

export function notifyChanged(key: string) {
  window.dispatchEvent(new CustomEvent(CHANGED, { detail: key }));
}

/**
 * A list of strings held in localStorage.
 *
 * Starts empty on purpose. The server renders nothing, and the first client
 * paint has to match it, so the stored value is only adopted after mount. That
 * is also why every consumer has to cope with a first render that has no data.
 */
export function useStoredList(key: string): [string[], (next: string[]) => void, boolean] {
  const [list, setList] = useState<string[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setList(readList(key));
    setReady(true);

    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      if (detail && detail !== key) return;
      setList(readList(key));
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
      writeList(key, next);
    },
    [key],
  );

  return [list, update, ready];
}

/** Records that a macro was opened. Most recent first, no duplicates. */
export function recordView(slug: string) {
  if (!slug) return;
  const next = [slug, ...readList(STORE_KEYS.recent).filter((s) => s !== slug)].slice(
    0,
    RECENT_LIMIT,
  );
  writeList(STORE_KEYS.recent, next);
}

/**
 * Wipes everything this site stores in the browser. Offered on the privacy page.
 *
 * This clears the favorites *mirror*, not the account copy. Someone signed in
 * who clears local data and reloads gets their list back from the server, which
 * is the point of syncing. Clearing an account's favorites is done by
 * unfavoriting them, or by deleting the account.
 */
export function clearAllStored() {
  for (const key of Object.values(STORE_KEYS)) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* nothing to do */
    }
  }

  // The parked slots are per user, so they have to be swept by prefix rather
  // than named. Missing them would leave one account's favorites behind after
  // someone explicitly asked for everything to be cleared.
  try {
    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith(PENDING_PREFIX)) window.localStorage.removeItem(key);
    }
  } catch {
    /* nothing to do */
  }

  notifyChanged("");
}
