import "server-only";

/**
 * Every GitHub target this project will ever write to, decided here and nowhere
 * else.
 *
 * These are CONSTANTS on purpose. The publisher takes a submission id from the
 * browser and nothing else: owner, repository, branch and API version are never
 * parameters, so no request can retarget the publisher at another repository.
 * That is the difference between "an admin can publish a macro" and "an admin
 * has an arbitrary GitHub write primitive".
 */

/** The organisation. See `.claude/reference/HANDOFF.md` section 2. */
export const GITHUB_ORG = "GDMacros-com";

/** Website source and the catalog. The Vercel production project builds this. */
export const SOURCE_REPO = "GDMacros";

/** Public permanent macro downloads, as GitHub Release assets. Not a website. */
export const DOWNLOADS_REPO = "GDMacros-downloads";

/** The branch Vercel deploys to production. */
export const PRODUCTION_BRANCH = "main";

/** The catalog path inside the source repository. */
export const CATALOG_PATH = "data/macros.json";

export const GITHUB_API = "https://api.github.com";
export const GITHUB_UPLOADS = "https://uploads.github.com";

/** Pinned, so a future default change cannot silently alter response shapes. */
export const GITHUB_API_VERSION = "2022-11-28";

export const ACCEPT_JSON = "application/vnd.github+json";

/* ------------------------------------------------------------------ */
/* Credentials                                                         */
/* ------------------------------------------------------------------ */

/**
 * Server-only, all three. None carries a NEXT_PUBLIC_ prefix, so Next will not
 * inline any of them into a browser bundle.
 *
 * The private key is base64 of the PEM GitHub generated. Base64 avoids the
 * newline mangling that a multi-line PEM suffers when it travels through a
 * dashboard field or a .env file.
 */
export const APP_ID = process.env.GITHUB_PUBLISHER_APP_ID ?? "";
export const INSTALLATION_ID = process.env.GITHUB_PUBLISHER_INSTALLATION_ID ?? "";

/**
 * Whether publishing can work at all.
 *
 * Publishing is one feature of an otherwise static catalog. A missing key must
 * degrade to "publishing is unavailable" and leave the submission Processing,
 * never take the site down or half-finish a review.
 *
 * Installation id is deliberately NOT required: it can be resolved from the
 * App itself. Setting it just skips a round trip.
 *
 * Note this reads the key variable WITHOUT keeping it. The key itself is
 * handled only in `client.ts`, which is the single module allowed to touch it;
 * this file deliberately has no way to hand it to anyone.
 */
export const isPublisherConfigured = Boolean(
  APP_ID && (process.env.GITHUB_PUBLISHER_PRIVATE_KEY_BASE64 ?? ""),
);
