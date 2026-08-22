/**
 * The single source of truth for legal document versions.
 *
 * Public metadata only. Nothing here is secret, and nothing here may become
 * secret: this module is imported by client components (the signup form, the
 * Terms and Privacy pages) and so ships to the browser.
 *
 * THE UPDATE WORKFLOW
 * -------------------
 *   1. edit the Terms and/or Privacy page copy
 *   2. bump the version and effective date below
 *   3. deploy
 *   4. optionally notify account holders with the admin Legal Notices tool
 *
 * The database keeps its own copy of these values in `private.legal_documents`,
 * because the server must stamp an acceptance record from a value the browser
 * cannot influence. The two are asserted to match by `npm run test:legal`, so a
 * bump here that is not mirrored in a migration fails the suite rather than
 * silently recording the wrong version.
 *
 * Versions are date based. That makes "which one did I agree to" answerable at
 * a glance, and sorts correctly without a parser.
 */

export const TERMS_VERSION = "2026-08-22";
export const TERMS_EFFECTIVE_DATE = "2026-08-22";

export const PRIVACY_VERSION = "2026-08-22";
export const PRIVACY_EFFECTIVE_DATE = "2026-08-22";

/** Canonical paths, so links are written once. */
export const TERMS_PATH = "/terms";
export const PRIVACY_PATH = "/privacy";

/**
 * Renders a version date for display.
 *
 * Fixed to en-GB with an explicit UTC time zone: a bare `new Date("2026-08-22")`
 * is parsed as midnight UTC and then formatted in the viewer's zone, which
 * renders the previous day for anyone west of Greenwich. An effective date that
 * changes depending on where you read it is worse than useless on a legal page.
 */
export function formatLegalDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export const LEGAL_DOCUMENTS = [
  { key: "terms", title: "Terms of Service", path: TERMS_PATH, version: TERMS_VERSION, effective: TERMS_EFFECTIVE_DATE },
  { key: "privacy", title: "Privacy Policy", path: PRIVACY_PATH, version: PRIVACY_VERSION, effective: PRIVACY_EFFECTIVE_DATE },
] as const;

export type LegalDocumentKey = (typeof LEGAL_DOCUMENTS)[number]["key"];
