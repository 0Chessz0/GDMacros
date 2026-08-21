import "server-only";

import { createHash } from "node:crypto";
import { ghFetch, GitHubError } from "./client";
import { DOWNLOADS_REPO, GITHUB_API, GITHUB_ORG, GITHUB_UPLOADS } from "./config";

/**
 * Releases in `GDMacros-com/GDMacros-downloads`.
 *
 * ONE RELEASE PER LEVEL, identified by the in-game level id:
 *
 *   title  Acheron
 *   tag    level-73667628
 *   assets Zoink-Acheron-Mega-Hack.gdr2, Someone-Acheron-xdBot.gdr2, ...
 *
 * The tag is the identity because level names collide and can change, while an
 * id cannot. Every later macro for the same level attaches to the same release.
 */

const REPO_BASE = `${GITHUB_API}/repos/${GITHUB_ORG}/${DOWNLOADS_REPO}`;

export interface GhRelease {
  id: number;
  tag_name: string;
  name: string | null;
  upload_url: string;
}

export interface GhAsset {
  id: number;
  name: string;
  size: number;
  browser_download_url: string;
  /** Present on modern responses; `sha256:...`. Not relied on when absent. */
  digest?: string | null;
}

/** SHA-256 of the bytes we are about to upload, for recovery matching. */
export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(Buffer.from(bytes)).digest("hex");
}

/** The release for a level, or null. A 404 here is a normal answer. */
export async function getReleaseByTag(tag: string): Promise<GhRelease | null> {
  const res = await ghFetch<GhRelease | null>({
    url: `${REPO_BASE}/releases/tags/${encodeURIComponent(tag)}`,
    allow404: true,
  });
  return res.data ?? null;
}

/**
 * Creates the release for a level, tolerating the race where another publisher
 * created it first.
 *
 * Two admins publishing two different macros for the same brand new level will
 * both see "no release" and both try to create it. GitHub answers the loser
 * with 422 "already_exists". That is not a failure: the correct response is to
 * re-read the release by tag and use it, which is exactly what a single release
 * per level means.
 */
export async function createLevelRelease(
  tag: string,
  levelName: string,
  levelId: string,
): Promise<GhRelease> {
  const body = {
    tag_name: tag,
    name: levelName,
    // Public, factual, and free of anything about the submitter. No email, no
    // account, no moderation note ever reaches a release.
    body: `Public GDMacros macro downloads for ${levelName}.\nGeometry Dash level ID: ${levelId}`,
    draft: false,
    prerelease: false,
    generate_release_notes: false,
    make_latest: "false",
  };

  try {
    const res = await ghFetch<GhRelease>({ method: "POST", url: `${REPO_BASE}/releases`, body });
    return res.data;
  } catch (e) {
    if (e instanceof GitHubError && (e.failure === "invalid" || e.failure === "conflict")) {
      // Lost the race, almost certainly. Re-read before concluding anything.
      const existing = await getReleaseByTag(tag);
      if (existing) return existing;
    }
    throw e;
  }
}

/** Every asset currently on a release. */
export async function listReleaseAssets(releaseId: number): Promise<GhAsset[]> {
  const out: GhAsset[] = [];
  // 100 macros for one level is not realistic, but paging is cheap and a
  // truncated list would silently corrupt the duplicate-name logic.
  for (let page = 1; page <= 5; page++) {
    const res = await ghFetch<GhAsset[]>({
      url: `${REPO_BASE}/releases/${releaseId}/assets?per_page=100&page=${page}`,
    });
    const batch = res.data ?? [];
    out.push(...batch);
    if (batch.length < 100) break;
  }
  return out;
}

/** Picks the first candidate name not already taken on the release. */
export function firstFreeName(candidates: string[], existing: GhAsset[]): string | null {
  const taken = new Set(existing.map((a) => a.name));
  return candidates.find((n) => !taken.has(n)) ?? null;
}

/**
 * Whether an existing asset is the one THIS submission already uploaded.
 *
 * Two conditions, both required: it carries the exact name this submission
 * reserved, and its content matches. Name alone is not enough, because a name
 * collision between two different macros is a normal situation the suffix logic
 * exists to handle. Content alone is not enough either, because two different
 * submissions can legitimately hold byte-identical files, and letting the
 * second adopt the first one's asset would make it skip its own catalog entry
 * and finalise having published nothing.
 */
export function isOurEarlierUpload(
  asset: GhAsset,
  reservedName: string,
  bytes: Uint8Array,
  digest: string,
): boolean {
  if (asset.name !== reservedName) return false;
  if (asset.size !== bytes.byteLength) return false;
  // GitHub reports a digest on modern responses. When it does, it is decisive.
  // When it does not, name plus size is the best available evidence, and the
  // name was reserved by this submission alone.
  if (asset.digest) return asset.digest.toLowerCase() === `sha256:${digest}`;
  return true;
}

export interface UploadOutcome {
  asset: GhAsset;
  /** True when this submission's own earlier upload was adopted. */
  reused: boolean;
}

/**
 * Uploads one macro to a name this submission has already reserved.
 *
 * The caller records the reserved name in the database BEFORE calling this, so
 * a crash between the upload and the database write is recoverable: the retry
 * arrives with the same reserved name and adopts the asset instead of creating
 * a second one.
 *
 * DUPLICATE NAMES between different macros are handled before this point, when
 * the name is chosen. If the reservation turns out to be stale because another
 * publication took the name in the meantime, this reports that so the caller
 * can reserve the next one.
 */
export async function uploadMacroAsset(
  releaseId: number,
  reservedName: string,
  bytes: Uint8Array,
): Promise<UploadOutcome | { taken: true }> {
  const digest = sha256Hex(bytes);
  const existing = await listReleaseAssets(releaseId);

  const mine = existing.find((a) => isOurEarlierUpload(a, reservedName, bytes, digest));
  if (mine) return { asset: mine, reused: true };

  // The name exists but is not ours: somebody else took it between our
  // reservation and now.
  if (existing.some((a) => a.name === reservedName)) return { taken: true };

  try {
    const res = await ghFetch<GhAsset>({
      method: "POST",
      url: `${GITHUB_UPLOADS}/repos/${GITHUB_ORG}/${DOWNLOADS_REPO}/releases/${releaseId}/assets?name=${encodeURIComponent(reservedName)}`,
      raw: bytes,
      contentType: "application/octet-stream",
      timeoutMs: 60_000,
    });
    return { asset: res.data, reused: false };
  } catch (e) {
    // 422 here is almost certainly "an asset with this name already exists",
    // created between our listing and our upload. Re-read before concluding:
    // it may be our own upload from an attempt that died before recording.
    if (e instanceof GitHubError && (e.failure === "invalid" || e.failure === "conflict")) {
      const after = await listReleaseAssets(releaseId);
      const ours = after.find((a) => isOurEarlierUpload(a, reservedName, bytes, digest));
      if (ours) return { asset: ours, reused: true };
      if (after.some((a) => a.name === reservedName)) return { taken: true };
    }
    throw e;
  }
}
