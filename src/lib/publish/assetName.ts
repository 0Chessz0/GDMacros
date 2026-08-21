/**
 * The one place a release asset filename is decided.
 *
 * Shape: `<macro-author>-<level-name>-<recorder>.gdr2`
 *
 *   Zoink-Acheron-Mega-Hack.gdr2
 *   SomePlayer-Bloodbath-xdBot.gdr2
 *
 * MACRO AUTHOR, never the submitter. Whoever uploaded a macro and whoever
 * recorded it are separate concepts everywhere else in this project, and a
 * public filename is exactly the wrong place to start conflating them.
 *
 * WHY THE CHARACTER SET IS SO NARROW
 * ----------------------------------
 * GitHub rewrites release asset names it does not like, replacing runs of
 * unsupported characters. If we uploaded `Mega Hack` with a space we would get
 * a name back that is not the one we asked for, and every later
 * "does this asset already exist" check would be comparing against the wrong
 * string. Emitting only [A-Za-z0-9._-] means GitHub stores the name verbatim,
 * so the name we compute is the name that comes back.
 *
 * This module is deliberately pure: no network, no environment, no server-only
 * import. That is what lets the tests exercise it directly.
 */

/** Extension is fixed. A macro is a .gdr2 or it is not a macro. */
export const ASSET_EXTENSION = ".gdr2";

/** Per-segment cap, so one absurd level name cannot eat the whole filename. */
const MAX_SEGMENT = 48;

/**
 * Cap for the whole base name (everything before `.gdr2`). Well under any
 * filesystem or GitHub limit, and short enough to stay readable in a browser's
 * download list.
 */
const MAX_BASE = 120;

/**
 * Reduces one field to the safe alphabet.
 *
 * Accents are folded rather than dropped, so `Krmal` stays recognisable as
 * `Krmal` instead of collapsing to `Krml`. Anything still outside the alphabet
 * becomes a single dash, and dashes are never doubled or left dangling.
 */
export function sanitiseSegment(input: string, fallback: string): string {
  const folded = String(input ?? "")
    .normalize("NFKD")
    // Combining marks left behind by NFKD, e.g. the accent from "é".
    .replace(/[̀-ͯ]/g, "");

  const cleaned = folded
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SEGMENT)
    // Slicing can leave a trailing dash behind.
    .replace(/-+$/g, "");

  return cleaned.length > 0 ? cleaned : fallback;
}

export interface AssetNameParts {
  macroAuthor: string;
  levelName: string;
  recorder: string;
}

/**
 * The deterministic base name, with no duplicate suffix and no extension.
 *
 * Same inputs always produce the same output, which is what makes the retry
 * path able to recognise its own earlier upload.
 */
export function assetBaseName({ macroAuthor, levelName, recorder }: AssetNameParts): string {
  const parts = [
    sanitiseSegment(macroAuthor, "macro"),
    sanitiseSegment(levelName, "level"),
    sanitiseSegment(recorder, "recorder"),
  ];

  let base = parts.join("-");
  if (base.length > MAX_BASE) {
    base = base.slice(0, MAX_BASE).replace(/-+$/g, "");
  }
  return base;
}

/** The full filename for a first upload. */
export function assetFileName(parts: AssetNameParts): string {
  return assetBaseName(parts) + ASSET_EXTENSION;
}

/**
 * The nth candidate name, used only when GitHub already holds the previous one.
 *
 * `n = 1` is the clean name. `n = 2` becomes `...-2.gdr2`, and so on, matching
 * the convention asked for.
 *
 * IMPORTANT: a suffix means "a different macro that happens to sanitise to the
 * same name", never "the same submission being retried". Retry safety comes
 * from the persisted publish state remembering the asset it already created,
 * not from this function.
 */
export function assetCandidate(parts: AssetNameParts, n: number): string {
  const base = assetBaseName(parts);
  if (n <= 1) return base + ASSET_EXTENSION;
  return `${base}-${n}${ASSET_EXTENSION}`;
}

/**
 * Every candidate up to `limit`, in order. The caller walks these against the
 * release's existing asset list to find the first free one.
 */
export function assetCandidates(parts: AssetNameParts, limit = 50): string[] {
  const out: string[] = [];
  for (let n = 1; n <= limit; n++) out.push(assetCandidate(parts, n));
  return out;
}

/** The release tag for a level. Stable identity: the in-game level id. */
export function releaseTagFor(levelId: string | number): string {
  const id = String(levelId).trim();
  if (!/^[0-9]{1,12}$/.test(id)) {
    throw new Error("Refusing to build a release tag from a non-numeric level id");
  }
  return `level-${id}`;
}
