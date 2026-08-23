import "server-only";

import { getAllLevels } from "./macros";
import type { PublishedSubmissionRow, PublishedSubmissionView } from "./submissions";

/**
 * Joins the private account ledger back to the public catalog in linear time.
 *
 * The verified download URL is the identity here. A displayed author name is
 * intentionally not used: it is a free-form credit and is not proof that the
 * submitter owns an account with the same name.
 */
export function resolvePublishedSubmissions(
  rows: PublishedSubmissionRow[],
): PublishedSubmissionView[] {
  const hrefByDownload = new Map<string, string>();

  for (const level of getAllLevels()) {
    for (const macro of level.macros) {
      hrefByDownload.set(
        macro.downloadLink,
        `/macro/${level.slug}#macro-${macro.position}`,
      );
    }
  }

  return rows.map((row) => ({
    ...row,
    macro_href: hrefByDownload.get(row.download_url) ?? null,
  }));
}
