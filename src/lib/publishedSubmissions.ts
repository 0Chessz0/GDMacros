import "server-only";

import type { CatalogAuthor } from "./authors";
import { getAllLevels } from "./macros";
import type { PublishedSubmissionRow, PublishedSubmissionView } from "./submissions";

/**
 * What fills the "Accepted and live" panel on /submissions.
 *
 * TWO SOURCES, DELIBERATELY
 * -------------------------
 * The catalog is the main one. Every macro credited to your username is yours,
 * which is how ownership works on this site, and it is the only source that
 * includes everything published before the account ledger existed. Reading it
 * costs nothing: it is already in memory at build time.
 *
 * The account ledger is the second. It records what THIS ACCOUNT actually
 * submitted, which catches the one case the catalog cannot: a macro you sent in
 * that is credited to somebody else, because you uploaded it for another
 * recorder. Without it those would silently vanish from your own history.
 *
 * The two overlap almost completely, so they are merged on the download URL.
 * That URL is the only identity that means the same thing on both sides: a
 * level name can repeat and a credit can be edited, but a release asset URL
 * points at exactly one file.
 */

/**
 * Ledger rows with their live catalog page attached.
 *
 * Used by the notification centre, which needs to turn one accepted result into
 * a "View live macro" link and therefore has to key on the submission rather
 * than on the macro. The verified download URL is the identity, never a name.
 */
export function resolvePublishedSubmissions(
  rows: PublishedSubmissionRow[],
): PublishedSubmissionView[] {
  const index = catalogIndex();
  return rows.map((row) => ({
    ...row,
    macro_href: index.get(row.download_url)?.href ?? null,
  }));
}

export interface OwnedMacroView {
  /** Stable per macro, for React keys. */
  key: string;
  levelName: string;
  levelId: string;
  recorder: string;
  macroAuthor: string;
  /** Live catalog page, or null when the download is no longer in the catalog. */
  href: string | null;
  /** ISO date the level was added, when the catalog records one. */
  addedAt: string | null;
  /** True when this came from the account ledger rather than a name credit. */
  submittedByYou: boolean;
}

/** Download URL to catalog location, built once per render. */
function catalogIndex(): Map<string, { href: string; addedAt: string | null; levelName: string; levelId: string }> {
  const index = new Map<string, { href: string; addedAt: string | null; levelName: string; levelId: string }>();
  for (const level of getAllLevels()) {
    for (const macro of level.macros) {
      index.set(macro.downloadLink, {
        href: `/macro/${level.slug}#macro-${macro.position}`,
        addedAt: level.addedAt ?? null,
        levelName: level.name,
        levelId: String(level.levelId),
      });
    }
  }
  return index;
}

/**
 * Everything to show as this account's published work.
 *
 * Newest first where the catalog records a date, then alphabetically, so the
 * order is stable rather than dependent on however the catalog happens to be
 * ordered on disk.
 */
export function resolveOwnedMacros(
  author: CatalogAuthor | undefined,
  ledger: PublishedSubmissionRow[] = [],
): OwnedMacroView[] {
  const index = catalogIndex();
  const byDownload = new Map<string, OwnedMacroView>();

  // 1. Macros credited to this name. The complete picture, legacy included.
  for (const { level, macro } of author?.credits ?? []) {
    byDownload.set(macro.downloadLink, {
      key: `${level.slug}-${macro.position}`,
      levelName: level.name,
      levelId: String(level.levelId),
      recorder: macro.recorder,
      macroAuthor: macro.author,
      href: `/macro/${level.slug}#macro-${macro.position}`,
      addedAt: level.addedAt ?? null,
      submittedByYou: false,
    });
  }

  // 2. Anything this account submitted that the credits above did not already
  //    cover, which means it was published under someone else's name.
  for (const row of ledger) {
    const existing = byDownload.get(row.download_url);
    if (existing) {
      existing.submittedByYou = true;
      continue;
    }
    const found = index.get(row.download_url);
    byDownload.set(row.download_url, {
      key: `ledger-${row.submission_id}`,
      levelName: found?.levelName ?? row.level_name,
      levelId: found?.levelId ?? row.level_id,
      recorder: row.recorder,
      macroAuthor: row.macro_author,
      href: found?.href ?? null,
      addedAt: found?.addedAt ?? row.published_at.slice(0, 10),
      submittedByYou: true,
    });
  }

  return [...byDownload.values()].sort((a, b) => {
    if (a.addedAt && b.addedAt && a.addedAt !== b.addedAt) return b.addedAt.localeCompare(a.addedAt);
    if (a.addedAt && !b.addedAt) return -1;
    if (!a.addedAt && b.addedAt) return 1;
    return a.levelName.localeCompare(b.levelName);
  });
}
