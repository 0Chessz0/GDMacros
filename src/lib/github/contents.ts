import "server-only";

import { ghFetch, GitHubError } from "./client";
import { CATALOG_PATH, GITHUB_API, GITHUB_ORG, PRODUCTION_BRANCH, SOURCE_REPO } from "./config";

/**
 * Reading and committing `data/macros.json` in `GDMacros-com/GDMacros`.
 *
 * The path, repository and branch are constants from config.ts. Nothing the
 * browser sends reaches any of them, so this cannot be used to write an
 * arbitrary file.
 */

const REPO_BASE = `${GITHUB_API}/repos/${GITHUB_ORG}/${SOURCE_REPO}`;

export interface CatalogFile {
  /** Decoded file text. */
  text: string;
  /** Blob sha, which is the optimistic-concurrency token for an update. */
  sha: string;
}

/**
 * The CURRENT catalog on `main`.
 *
 * Deliberately fetched from GitHub every time rather than read off disk. The
 * copy bundled into the running deployment is a snapshot from build time and
 * will be stale the moment anybody else publishes.
 */
export async function getCatalogFile(): Promise<CatalogFile> {
  const res = await ghFetch<{ content?: string; encoding?: string; sha?: string }>({
    url: `${REPO_BASE}/contents/${CATALOG_PATH}?ref=${PRODUCTION_BRANCH}`,
  });

  const body = res.data;
  if (!body?.sha) throw new GitHubError("not-found", "The catalog file could not be read");
  if (body.encoding !== "base64" || typeof body.content !== "string") {
    // Files over 1 MB come back without inline content. The catalog is ~76 KB,
    // so this would mean something has changed structurally and guessing would
    // be worse than stopping.
    throw new GitHubError("invalid", "The catalog file was not returned as inline base64");
  }

  return { text: Buffer.from(body.content, "base64").toString("utf8"), sha: body.sha };
}

export interface CommitOutcome {
  /** The commit created on main. This is what production must end up serving. */
  commitSha: string;
}

/**
 * Commits a new version of the catalog, refusing to clobber a newer one.
 *
 * `sha` is the blob we read. GitHub rejects the write with 409 if the file has
 * moved on since, which is precisely the desired behaviour: another admin's
 * publication must never be overwritten. The caller re-reads, re-applies its
 * own change to the newer text, and tries again.
 */
export async function commitCatalog(
  newText: string,
  baseSha: string,
  message: string,
): Promise<CommitOutcome> {
  const res = await ghFetch<{ commit?: { sha?: string } }>({
    method: "PUT",
    url: `${REPO_BASE}/contents/${CATALOG_PATH}`,
    body: {
      message,
      content: Buffer.from(newText, "utf8").toString("base64"),
      sha: baseSha,
      branch: PRODUCTION_BRANCH,
    },
  });

  const sha = res.data?.commit?.sha;
  if (!sha) throw new GitHubError("invalid", "GitHub did not return a commit sha");
  return { commitSha: sha };
}

/**
 * The most recent commit that touched the catalog on `main`.
 *
 * Used only in one recovery case: a previous attempt committed the macro but
 * died before recording the sha, so the file already contains the download link
 * and we have nothing to wait for.
 *
 * The head commit is at least as new as the one that introduced our macro, so
 * waiting for production to serve THIS sha is a strictly stronger condition
 * than waiting for the original. It can wait slightly longer than necessary; it
 * can never declare a macro live before it is.
 */
export async function getLatestCatalogCommitSha(): Promise<string | null> {
  const res = await ghFetch<{ sha?: string }[]>({
    url: `${REPO_BASE}/commits?path=${encodeURIComponent(CATALOG_PATH)}&sha=${PRODUCTION_BRANCH}&per_page=1`,
  });
  const sha = res.data?.[0]?.sha;
  return typeof sha === "string" && /^[0-9a-f]{40}$/.test(sha) ? sha : null;
}

/**
 * Distinguishes "someone committed first" from every other failure.
 *
 * GitHub answers a stale blob sha with 409, and occasionally 422 when the
 * message mentions the sha being out of date. Both mean: re-read and re-apply.
 */
export function isConcurrencyConflict(e: unknown): boolean {
  if (!(e instanceof GitHubError)) return false;
  if (e.failure === "conflict") return true;
  return e.failure === "invalid" && /sha|conflict|does not match/i.test(e.message);
}

/**
 * Whether a failure looks like branch protection refusing the App.
 *
 * Worth naming separately, because the fix is a repository setting rather than
 * anything in this code, and an admin staring at a generic 403 would have no
 * way to know that.
 */
export function isBranchProtectionRefusal(e: unknown): boolean {
  if (!(e instanceof GitHubError)) return false;
  return (
    e.failure === "forbidden" &&
    /protected branch|required status|review|ruleset|not allowed to push/i.test(e.message)
  );
}
