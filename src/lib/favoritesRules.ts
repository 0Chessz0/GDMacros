/**
 * The favorites decision rules, kept free of React, Supabase and the browser so
 * they can be tested directly.
 *
 * `src/lib/favorites.ts` does the input and output around these; everything
 * that decides *what should happen* lives here.
 */

/** Level ids are numeric strings; slugs never are. That is the whole test. */
const LEVEL_ID = /^[0-9]{1,12}$/;

export const GUEST = "guest";

/**
 * Where a departing account's unsaved edits are parked, one slot per user id.
 *
 * When somebody else signs in on this browser, the visible list has to become
 * theirs. Without this, any change the previous person made while signed out
 * would simply be overwritten. Parking it under their own id keeps it out of
 * the new account entirely while still being there if they come back.
 */
export const PENDING_PREFIX = "gdmacros:favorites-pending:";

export function pendingKey(userId: string): string {
  return PENDING_PREFIX + userId;
}

export function isLevelId(value: string): boolean {
  return LEVEL_ID.test(value);
}

/**
 * Whether this device's list should be merged into the account being signed in
 * to, or discarded in favour of the account's own list.
 *
 *   local owner        meaning                       merge?
 *   -----------        -------                       ------
 *   guest              real guest favorites          yes
 *   this user          their own mirror              no, just refresh
 *   this user, dirty   edits made while signed out   yes
 *   another user       a mirror left by someone else NO
 *
 * The last row is the shared-device rule. Nothing is destroyed by refusing:
 * the other person's favorites are safe on their own account, and only this
 * device's copy of them is replaced.
 *
 * A browser that has never been tagged counts as a guest, which is what makes
 * lists saved before Phase 2B merge on first sign-in.
 */
export function shouldMerge(owner: string | null, userId: string, dirty: boolean): boolean {
  const effective = owner ?? GUEST;
  return effective === GUEST || (effective === userId && dirty);
}

/**
 * Whether this browser's mirror belongs to a DIFFERENT account and holds edits
 * that were never saved to it.
 *
 * That is the only situation where something would otherwise be destroyed:
 * the list on screen is the other person's, it contains changes their account
 * has never seen, and the account signing in is about to replace it.
 */
export function shouldStash(owner: string | null, userId: string, dirty: boolean): boolean {
  if (!dirty) return false; // nothing unsaved, so nothing to lose
  if (owner === null || owner === GUEST) return false; // guest edits merge instead
  return owner !== userId;
}

/** Union preserving order, first occurrence wins. */
export function unionIds(first: readonly string[], second: readonly string[]): string[] {
  return [...new Set([...first, ...second])];
}

/**
 * The list to show after a sync.
 *
 * Union semantics, which is why a removal made while signed out does not stick:
 * see the KNOWN LIMITATION note in `favorites.ts`. Accepted for Stage 2B.
 *
 * `server` has just been re-read, so after a successful merge it already holds
 * the union and is authoritative. `carryOver` is whatever the caller decided
 * should survive on top of it, which in practice means entries still stored as
 * slugs that no page has been able to resolve yet. The caller decides what
 * carries: entries belonging to somebody else must not.
 */
export function listAfterSync(
  server: readonly string[],
  carryOver: readonly string[],
): string[] {
  const seen = new Set(server);
  return [...server, ...carryOver.filter((v) => !seen.has(v))];
}

/**
 * Rewrites stored slugs as level ids, de-duplicating as it goes.
 *
 * `complete` says whether `bySlug` covers the whole catalog. When it does, an
 * entry that resolves to nothing is a level that no longer exists and is
 * dropped, which is what the old code did with unknown slugs anyway. When it
 * does not, unrecognised entries are kept so a page with the full catalog can
 * migrate them later, rather than being thrown away by a page that simply could
 * not see them.
 */
export function migrateList(
  stored: readonly string[],
  bySlug: ReadonlyMap<string, string>,
  complete: boolean,
): string[] {
  const out: string[] = [];
  for (const entry of stored) {
    if (isLevelId(entry)) {
      out.push(entry);
      continue;
    }
    const id = bySlug.get(entry);
    if (id) out.push(id);
    else if (!complete) out.push(entry);
  }
  return [...new Set(out)];
}

/**
 * The list after a local toggle. Newest first, so a freshly starred level shows
 * at the top of the favorites page.
 */
export function listAfterToggle(current: readonly string[], levelId: string): string[] {
  return current.includes(levelId)
    ? current.filter((v) => v !== levelId)
    : [levelId, ...current];
}

/** Undoes a toggle the server refused. */
export function listAfterRevert(
  current: readonly string[],
  levelId: string,
  attempted: boolean,
): string[] {
  if (attempted) return current.filter((v) => v !== levelId);
  return current.includes(levelId) ? [...current] : [levelId, ...current];
}
