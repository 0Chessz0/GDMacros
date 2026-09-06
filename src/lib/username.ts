/**
 * Username rules, mirrored from the database so the browser can complain first.
 *
 * The database is the authority: `username_format` on `public.profiles` holds
 * the same pattern, the unique index on `username_lower` holds uniqueness, and
 * `private.reserved_usernames` holds the blocklist. Everything here exists only
 * so someone finds out while typing instead of after pressing the button.
 *
 * If the constraint in `supabase/migrations/0001_phase2a_profiles_usernames.sql`
 * changes, change this too.
 */

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;

/** Same expression as the `username_format` check constraint. */
export const USERNAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_]{2,19}$/;

export const USERNAME_HINT =
  "3 to 20 characters. Letters, numbers and underscores, starting with a letter or number.";

/**
 * A copy of the reserved list, for a fast local answer only. It is deliberately
 * NOT the enforcement: the real list lives in a table the API cannot read, so a
 * client cannot enumerate it, and the RPCs check it server side regardless.
 */
const RESERVED_HINT = new Set([
  "admin", "administrator", "root", "system", "support", "staff", "mod",
  "moderator", "official", "owner", "gdmacros", "gd_macros", "api", "auth",
  "login", "logout", "signup", "account", "settings", "favorites", "submit",
  "welcome", "admin_panel", "null", "undefined", "chesszdc",
]);

/** The first thing wrong with a candidate name, or null when it looks fine. */
export function usernameProblem(raw: string): string | null {
  const name = raw.trim();

  if (name.length === 0) return "Choose a username.";
  if (name.length < USERNAME_MIN) return `At least ${USERNAME_MIN} characters.`;
  if (name.length > USERNAME_MAX) return `At most ${USERNAME_MAX} characters.`;

  if (!/^[A-Za-z0-9]/.test(name)) return "Must start with a letter or a number.";
  if (!/^[A-Za-z0-9_]+$/.test(name)) {
    return "Only letters, numbers and underscores.";
  }
  if (!USERNAME_PATTERN.test(name)) return USERNAME_HINT;
  if (RESERVED_HINT.has(name.toLowerCase())) return "That username is not available.";

  return null;
}

/** True when the two names differ only by capitalisation. */
export function isCaseOnlyChange(current: string, next: string): boolean {
  return current !== next && current.toLowerCase() === next.trim().toLowerCase();
}

/**
 * Turns a Postgres or PostgREST error into something worth showing a person.
 *
 * The raw messages leak constraint names and SQL vocabulary, and the unique
 * violation in particular arrives as "duplicate key value violates unique
 * constraint profiles_username_lower_key", which means nothing to anybody.
 */
export function usernameErrorMessage(error: { message?: string; code?: string } | null): string {
  const raw = error?.message ?? "";

  if (/profiles_username_lower_key/i.test(raw) || error?.code === "23505") {
    if (/already set/i.test(raw)) return "You already have a username.";
    return "That username is taken.";
  }
  if (/username_format/i.test(raw)) return USERNAME_HINT;
  if (/not available/i.test(raw)) return "That username is not available.";
  if (/confirmation does not match/i.test(raw)) {
    return "That does not match your current username.";
  }
  if (/not authenticated/i.test(raw)) return "You are signed out. Log in and try again.";
  if (/no username set/i.test(raw)) return "You do not have a username yet.";

  return "Something went wrong. Try again.";
}
