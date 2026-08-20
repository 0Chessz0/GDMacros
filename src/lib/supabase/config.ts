/**
 * Supabase configuration, read from the environment in exactly one place.
 *
 * Only the publishable (anon) key is referenced HERE. It is designed to be
 * public and is protected by row level security on the database side, which is
 * why it carries the NEXT_PUBLIC_ prefix.
 *
 * There is exactly one privileged key in the project, SUPABASE_SECRET_KEY, and
 * it lives in `storage-admin.ts` behind `import "server-only"`, never in this
 * file. It has no NEXT_PUBLIC_ prefix, so Next cannot inline it into a browser
 * bundle. Nothing privileged may ever be added here: a secret key or a database
 * password in a NEXT_PUBLIC_ variable would be shipped to every visitor.
 */

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

/**
 * Whether accounts can work at all.
 *
 * Accounts are optional on this site: browsing and downloading macros never
 * needs one. So a missing or half-set configuration must degrade to "accounts
 * are unavailable" rather than taking the catalog down with it. Every entry
 * point checks this before constructing a client.
 */
export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);

/**
 * The bare origin Supabase is told to send people back to. No path, no query.
 *
 * This is passed as `redirect_to`, which the email templates read as
 * `{{ .RedirectTo }}` and append their own path to:
 *
 *   {{ .RedirectTo }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/account
 *
 * Using the **live origin** rather than a configured constant means the link
 * always returns to the host the person actually used. That matters because
 * cookies are per host: someone who signs up on www.gdmacros.com must come back
 * to www.gdmacros.com, or they land signed out on a different hostname. It also
 * makes localhost and preview deployments work with no configuration.
 *
 * Every caller runs in the browser, so `window.location.origin` is the normal
 * path. NEXT_PUBLIC_SITE_URL is only a fallback for a non-browser context, and
 * exists so nothing can ever hardcode localhost into production behaviour.
 *
 * The origin must be on Supabase's redirect allow list, or the link is refused.
 */
export function authRedirectBase(): string {
  if (typeof window !== "undefined") return window.location.origin;
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}
