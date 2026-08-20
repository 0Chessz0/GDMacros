"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  CHANGED,
  STORE_KEYS,
  readList,
  readString,
  removeKey,
  writeList,
  writeString,
} from "@/lib/localStore";
import {
  GUEST,
  isLevelId,
  listAfterRevert,
  listAfterSync,
  listAfterToggle,
  migrateList,
  pendingKey,
  shouldMerge,
  shouldStash,
  unionIds,
} from "@/lib/favoritesRules";

/**
 * Favorites, kept in the browser and, when signed in, on the account.
 *
 * The rules this file exists to enforce:
 *
 *   * Accounts stay optional. Signed out, everything works exactly as before
 *     and nothing leaves the device.
 *   * Logging out keeps the list visible, and keeps the owner id recorded. That
 *     recorded owner is what stops the next person to sign in on a shared
 *     browser absorbing somebody else's favorites.
 *   * A failed server call never clears the local list, and never clears a
 *     parked copy. Local is written first, and the mirror is only re-pointed at
 *     an account after the server confirms it holds the rows.
 *   * Keyed on the in-game level id. The slug comes from the level NAME, so a
 *     rename would orphan every favorite. Lists saved before 2B hold slugs and
 *     are migrated in place, see `migrateStoredFavorites`.
 *
 * KNOWN LIMITATION, accepted for Stage 2B
 * ---------------------------------------
 * Merging is a union, so a favorite ADDED while signed out is merged back
 * safely, but one REMOVED while signed out reappears on the next sign-in.
 *
 * A union has no tombstones: an id missing from this device is indistinguishable
 * from an id this device has simply never seen, and treating absence as deletion
 * would throw away favorites added on another device. Union is the safe
 * direction, and losing a deletion is the price.
 *
 * Fixing it properly needs a deletion log, or per-row timestamps with last write
 * wins, and therefore a migration. Deliberately out of scope here. If favorites
 * sync is revisited, this is the thing to fix.
 */

type Client = NonNullable<ReturnType<typeof createClient>>;

/* ------------------------------------------------------------------ */
/* localStorage shape                                                  */
/* ------------------------------------------------------------------ */

function localList(): string[] {
  return readList(STORE_KEYS.favorites);
}

function localOwner(): string | null {
  return readString(STORE_KEYS.favoritesOwner);
}

function isDirty(): boolean {
  return readString(STORE_KEYS.favoritesDirty) === "1";
}

/* ------------------------------------------------------------------ */
/* Parked edits, so a shared browser loses nobody's changes            */
/* ------------------------------------------------------------------ */

/**
 * Sets aside a list that belongs to an account other than the one signing in.
 *
 * Merged with anything already parked for that user rather than overwriting it,
 * so two handovers in a row cannot drop the first one's changes.
 */
function stashPending(ownerId: string, list: string[]) {
  if (list.length === 0) return;
  const key = pendingKey(ownerId);
  writeList(key, unionIds(readList(key), list));
}

function readPending(userId: string): string[] {
  return readList(pendingKey(userId));
}

function clearPending(userId: string) {
  removeKey(pendingKey(userId));
}

/* ------------------------------------------------------------------ */
/* Migration from slugs to level ids                                   */
/* ------------------------------------------------------------------ */

/**
 * Rewrites any stored slugs as level ids.
 *
 * `complete` says whether `pairs` covers the whole catalog. On the catalog and
 * favorites pages it does, so an entry that resolves to nothing is a level that
 * no longer exists and is dropped, which is what the old code did with unknown
 * slugs anyway. On a single macro page it does not, so unrecognised entries are
 * left alone to be migrated later rather than thrown away.
 */
export function migrateStoredFavorites(
  pairs: ReadonlyArray<{ slug: string; levelId: string }>,
  complete: boolean,
) {
  const stored = localList();
  if (stored.length === 0) return;

  const bySlug = new Map(pairs.map((p) => [p.slug, String(p.levelId)]));
  const next = migrateList(stored, bySlug, complete);

  // Only write when something actually changed, so this cannot loop against the
  // change event it fires.
  const same = next.length === stored.length && next.every((v, i) => v === stored[i]);
  if (!same) writeList(STORE_KEYS.favorites, next);
}

/* ------------------------------------------------------------------ */
/* Server access                                                       */
/* ------------------------------------------------------------------ */

/** Newest first, so every device shows the same order. */
async function fetchServer(supabase: Client): Promise<string[] | null> {
  const { data, error } = await supabase
    .from("favorites")
    .select("level_id")
    .order("created_at", { ascending: false });
  if (error || !data) return null;
  return data.map((row) => String(row.level_id));
}

/**
 * Adds rows, ignoring any that already exist.
 *
 * The composite primary key makes this idempotent, so a retry after a failure
 * converges rather than duplicating. Returns false if the write failed, and the
 * caller must then leave local state exactly as it was.
 */
async function pushRows(supabase: Client, userId: string, ids: string[]): Promise<boolean> {
  if (ids.length === 0) return true;
  const { error } = await supabase
    .from("favorites")
    .upsert(
      ids.map((level_id) => ({ user_id: userId, level_id })),
      { onConflict: "user_id,level_id", ignoreDuplicates: true },
    );
  return !error;
}

async function deleteRow(supabase: Client, levelId: string): Promise<boolean> {
  // No user_id filter needed: the RLS policy scopes the delete to the caller,
  // so this cannot reach another account's row even if asked to.
  const { error } = await supabase.from("favorites").delete().eq("level_id", levelId);
  return !error;
}

/* ------------------------------------------------------------------ */
/* The engine                                                          */
/* ------------------------------------------------------------------ */

/** Whose favorites the tab is currently working with. Null means signed out. */
let currentUserId: string | null = null;
let engineStarted = false;
let syncing: Promise<void> | null = null;

/**
 * Reconciles the local mirror with an account, following the table agreed in
 * the plan:
 *
 *   local owner    meaning                     action
 *   -----------    -------                     ------
 *   guest          real guest favorites        merge into the account
 *   this user      their own mirror            no merge, refresh from server
 *   this user +    edits made while signed out merge into the account
 *     dirty
 *   another user   a mirror left by someone    no merge, replace with this
 *                  else                        account's list, after parking
 *                                              any unsaved edits under THEIR id
 *
 * Nothing is destroyed in the last case. Favorites the other person had already
 * saved are safe on their own account, and anything they changed while signed
 * out is parked under their user id, so it comes back the next time they sign
 * in on this browser. Either way none of it reaches this account.
 */
async function syncForUser(userId: string): Promise<void> {
  const supabase = createClient();
  if (!supabase) return;

  const owner = localOwner();
  const dirty = isDirty();
  const stored = localList();
  const merging = shouldMerge(owner, userId, dirty);

  // Before anything is overwritten: if this mirror belongs to somebody else and
  // holds changes their account has never seen, park it under THEIR id. It is
  // not merged here and never reaches this account; it simply stops existing
  // only in a list that is about to be replaced.
  if (owner && shouldStash(owner, userId, dirty)) stashPending(owner, stored);

  // Only real level ids are ever sent. A slug left over from before the
  // migration stays local until a page with the catalog can resolve it.
  const legacy = stored.filter((v) => !isLevelId(v));

  // What this account contributes: its own list when merging, plus anything it
  // parked on this browser during an earlier handover.
  const parked = readPending(userId);
  const sendable = unionIds(
    merging ? stored.filter(isLevelId) : [],
    parked.filter(isLevelId),
  );

  if (sendable.length > 0) {
    // Union by construction: this only ever adds. Nothing on the server is
    // deleted here, so a favorite saved on another device cannot be lost.
    const ok = await pushRows(supabase, userId, sendable);
    // Local untouched, dirty flag left set, and the parked copy left intact so
    // the next sign-in tries again.
    if (!ok) return;
  }

  const server = await fetchServer(supabase);
  if (server === null) return; // read failed: keep showing what we have

  // After a successful push the server already holds the union, so it is the
  // authoritative answer. Unresolved slugs carry over only when they belong to
  // this account: this device's own leftovers when merging, and whatever was
  // parked under this user id when recovering.
  const carryOver = unionIds(
    merging ? legacy : [],
    parked.filter((v) => !isLevelId(v)),
  );
  const next = listAfterSync(server, carryOver);

  writeList(STORE_KEYS.favorites, next);
  writeString(STORE_KEYS.favoritesOwner, userId);
  writeString(STORE_KEYS.favoritesDirty, "0");
  // Only now, after the server has confirmed it holds them.
  if (parked.length > 0) clearPending(userId);
}

/** Signed out. The list stays visible and the owner tag is deliberately kept. */
function markSignedOut() {
  if (readString(STORE_KEYS.favoritesOwner) === null) {
    writeString(STORE_KEYS.favoritesOwner, GUEST);
  }
}

function runSync(userId: string) {
  // Coalesced: several components mounting at once must not each start a merge.
  if (syncing) return;
  syncing = syncForUser(userId).finally(() => {
    syncing = null;
  });
}

/**
 * Starts the auth watcher once per tab. Idempotent, so every hook instance can
 * call it without setting up duplicate subscriptions.
 */
function startEngine() {
  if (engineStarted) return;
  engineStarted = true;

  const supabase = createClient();
  if (!supabase) {
    currentUserId = null;
    return;
  }

  const apply = (userId: string | null) => {
    const changed = userId !== currentUserId;
    currentUserId = userId;
    if (!changed) return;
    if (userId) runSync(userId);
    else markSignedOut();
  };

  void supabase.auth.getUser().then(({ data }) => apply(data.user?.id ?? null));

  // Catches a login or logout that happens while this tab is open.
  supabase.auth.onAuthStateChange((_event, session) => {
    apply(session?.user?.id ?? null);
  });
}

/* ------------------------------------------------------------------ */
/* Writes, serialised so rapid clicking cannot race                    */
/* ------------------------------------------------------------------ */

/** levelId -> the state the user last asked for. */
const pending = new Map<string, boolean>();
let flushing = false;

async function flush() {
  if (flushing) return;
  flushing = true;
  try {
    while (pending.size > 0) {
      const [levelId, desired] = pending.entries().next().value as [string, boolean];
      pending.delete(levelId);

      const supabase = createClient();
      const userId = currentUserId;
      if (!supabase || !userId) continue;

      const ok = desired
        ? await pushRows(supabase, userId, [levelId])
        : await deleteRow(supabase, levelId);

      // Put the local list back if the server refused, unless the user has
      // since asked for something newer on this same level.
      if (!ok && !pending.has(levelId)) revertLocal(levelId, desired);
    }
  } finally {
    flushing = false;
  }
}

function revertLocal(levelId: string, attempted: boolean) {
  writeList(STORE_KEYS.favorites, listAfterRevert(localList(), levelId, attempted));
}

/**
 * Stars or unstars a level.
 *
 * Local first, always, so the button responds immediately and a slow or failing
 * network never blocks the UI. Reads the current list from storage rather than
 * closing over React state, which is what makes repeated calls in one tick, as
 * "Remove all" does, each see the previous one's result.
 */
export function toggleFavorite(levelId: string) {
  const id = String(levelId);
  if (!id) return;

  const cur = localList();
  const had = cur.includes(id);
  writeList(STORE_KEYS.favorites, listAfterToggle(cur, id));

  if (!currentUserId) {
    // Edited while signed out. Flagged so it is merged on the next sign-in,
    // but only into the account that already owns this mirror.
    writeString(STORE_KEYS.favoritesDirty, "1");
    return;
  }

  pending.set(id, !had);
  void flush();
}

/* ------------------------------------------------------------------ */
/* The hook. Same shape the UI already used.                           */
/* ------------------------------------------------------------------ */

export function useFavorites() {
  const [favorites, setFavorites] = useState<string[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    startEngine();
    setFavorites(localList());
    setReady(true);

    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      if (detail && detail !== STORE_KEYS.favorites) return;
      setFavorites(localList());
    };

    window.addEventListener(CHANGED, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener(CHANGED, onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  const toggle = useCallback((levelId: string) => toggleFavorite(levelId), []);

  return {
    favorites,
    toggle,
    ready,
    isFavorite: (levelId: string) => favorites.includes(String(levelId)),
  };
}
