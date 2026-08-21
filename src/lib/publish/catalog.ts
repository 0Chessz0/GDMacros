/**
 * Pure transformation of `data/macros.json`.
 *
 * The catalog stays a file in git. This module never fetches, never writes and
 * never talks to GitHub: it takes the current file text in, and returns the new
 * file text out. That is what makes it directly testable, and what lets the
 * publisher re-apply a change against a newer version of the file when someone
 * else commits first.
 *
 * FORMATTING IS A CONTRACT
 * ------------------------
 * `data/macros.json` is also read and rewritten by the GDMacros App, and it is
 * reviewed by hand in pull requests. `JSON.stringify(value, null, 2) + "\n"`
 * was verified to reproduce the current 106-level file byte for byte, so that
 * is the serialiser, and key order is preserved deliberately rather than by
 * luck. See `.claude/reference/cross-project.md`.
 */

import { RECORDERS, type Recorder } from "@/lib/types";

/** Where an automatically published macro lives. Matches the app's host list. */
export const PUBLISHED_DOWNLOAD_TYPE = "GitHub";

export interface CatalogMacro {
  author: string;
  recorder: string;
  downloadType: string;
  downloadLink: string;
}

export interface CatalogLevel {
  name: string;
  creator: string;
  levelId: string;
  video?: string;
  description?: string;
  addedAt?: string;
  macros?: CatalogMacro[];
  [key: string]: unknown;
}

/** Everything needed to place one macro in the catalog. All server-derived. */
export interface PublicationInput {
  levelId: string;
  levelName: string;
  levelCreator: string | null;
  videoUrl: string | null;
  macroAuthor: string;
  recorder: string;
  downloadLink: string;
  /** ISO date for a level that does not exist yet. */
  addedAt: string;
}

export type ApplyOutcome =
  | { ok: true; json: string; changed: true; mode: "new-level" | "existing-level" }
  | { ok: true; json: string; changed: false; mode: "already-present" }
  | { ok: false; error: string };

/** `JSON.stringify(v, null, 2) + "\n"`, kept in one place so it cannot drift. */
export function serialiseCatalog(levels: unknown[]): string {
  return JSON.stringify(levels, null, 2) + "\n";
}

export function parseCatalog(text: string): CatalogLevel[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  return parsed as CatalogLevel[];
}

/**
 * Builds a brand new level entry with keys in the catalog's canonical order.
 *
 * The order matters: `orderLevel()` in the GDMacros App enforces the same one
 * so generated files still read as hand written, and a different order produces
 * an enormous meaningless diff.
 *
 * Optional keys are omitted entirely rather than written as null or "", which
 * is how the app treats `addedAt` and is what keeps an old file round tripping
 * unchanged.
 *
 * `description` is deliberately NOT invented here. Existing descriptions are
 * editorial blurbs written by a person, and the submitter's private notes are
 * not the same thing, so a new level simply has no description until somebody
 * writes one.
 */
function buildLevel(input: PublicationInput, macro: CatalogMacro): CatalogLevel {
  const level: CatalogLevel = {
    name: input.levelName,
    creator: input.levelCreator ?? "Unknown",
    levelId: String(input.levelId),
  };
  if (input.videoUrl) level.video = input.videoUrl;
  level.addedAt = input.addedAt;
  level.macros = [macro];
  return level;
}

function buildMacro(input: PublicationInput): CatalogMacro {
  return {
    author: input.macroAuthor,
    recorder: input.recorder,
    downloadType: PUBLISHED_DOWNLOAD_TYPE,
    downloadLink: input.downloadLink,
  };
}

/**
 * Applies one publication to the catalog text.
 *
 * IDEMPOTENT. The download link is the identity of a published macro: it comes
 * from GitHub and is unique per asset. If it is already somewhere in the file
 * this returns `changed: false` and the text untouched, so a retry after a
 * successful commit cannot add the macro twice, and neither can two concurrent
 * retries of the same submission.
 *
 * Levels are matched on the in-game level id, never the slug or the name. A
 * level can be renamed; its id cannot.
 */
export function applyPublication(currentText: string, input: PublicationInput): ApplyOutcome {
  const levels = parseCatalog(currentText);
  if (!levels) return { ok: false, error: "The catalog file is not valid JSON." };

  if (!input.downloadLink || !/^https:\/\//i.test(input.downloadLink)) {
    return { ok: false, error: "Refusing to write a download link that is not https." };
  }
  if (!RECORDERS.includes(input.recorder as Recorder)) {
    return { ok: false, error: `Unknown recorder: ${input.recorder}` };
  }
  if (!/^[0-9]{1,12}$/.test(String(input.levelId))) {
    return { ok: false, error: "Refusing to write a non-numeric level id." };
  }

  // Idempotency gate, checked across the WHOLE file rather than just the target
  // level, so a link cannot be duplicated under a different entry either.
  const already = levels.some((lvl) =>
    (lvl.macros ?? []).some((m) => m?.downloadLink === input.downloadLink),
  );
  if (already) {
    return { ok: true, json: serialiseCatalog(levels), changed: false, mode: "already-present" };
  }

  const wanted = String(input.levelId);
  const index = levels.findIndex((lvl) => String(lvl?.levelId ?? "") === wanted);
  const macro = buildMacro(input);

  if (index === -1) {
    levels.push(buildLevel(input, macro));
    return { ok: true, json: serialiseCatalog(levels), changed: true, mode: "new-level" };
  }

  // An existing level keeps every field it already has. The catalog is edited
  // by hand and by the desktop app, and a publication is not the place to
  // silently "correct" a name, creator, video or description someone chose.
  const level = levels[index];
  const macros = Array.isArray(level.macros) ? level.macros : [];
  level.macros = [...macros, macro];

  return { ok: true, json: serialiseCatalog(levels), changed: true, mode: "existing-level" };
}

/** Counts, for the log line and for asserting the regression baseline. */
export function catalogCounts(text: string): { levels: number; macros: number } | null {
  const levels = parseCatalog(text);
  if (!levels) return null;
  return {
    levels: levels.length,
    macros: levels.reduce((n, l) => n + (l.macros?.length ?? 0), 0),
  };
}

/** Today, as the catalog writes dates. Local time, matching the desktop app. */
export function todayIso(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
