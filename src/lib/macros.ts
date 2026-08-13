import fs from "node:fs";
import path from "node:path";
import { RECORDERS, type Macro, type MacroInput } from "./types";

const DATA_FILE = path.join(process.cwd(), "data", "macros.json");

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip combining accents
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Pull the video ID out of any of the common YouTube URL shapes. */
export function youtubeIdFrom(url: string | undefined): string | null {
  if (!url) return null;
  const patterns = [
    /(?:youtube\.com\/watch\?(?:.*&)?v=)([\w-]{11})/,
    /(?:youtu\.be\/)([\w-]{11})/,
    /(?:youtube\.com\/embed\/)([\w-]{11})/,
    /(?:youtube\.com\/shorts\/)([\w-]{11})/,
  ];
  for (const re of patterns) {
    const m = url.match(re);
    if (m) return m[1];
  }
  return null;
}

/** Every field required for a real entry. */
const REQUIRED_FIELDS = [
  "name",
  "creator",
  "macroAuthor",
  "levelId",
  "recorder",
  "downloadType",
  "downloadLink",
] as const;

/**
 * True when an entry is an untouched template row, with every required field blank.
 * These are ignored so `data/macros.json` can ship with empty slots to fill in.
 * A row with *some* fields filled is a typo, not a placeholder, and still errors.
 */
export function isBlankTemplate(entry: Partial<MacroInput>): boolean {
  return REQUIRED_FIELDS.every((f) => {
    const v = entry[f];
    return v === undefined || v === null || String(v).trim() === "";
  });
}

let cache: Macro[] | null = null;

/** Read and normalise `data/macros.json` at build time. */
export function getAllMacros(): Macro[] {
  if (cache) return cache;

  if (!fs.existsSync(DATA_FILE)) {
    cache = [];
    return cache;
  }

  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch (err) {
    throw new Error(`data/macros.json is not valid JSON: ${(err as Error).message}`);
  }

  if (!Array.isArray(raw)) {
    throw new Error("data/macros.json must contain an array of macros.");
  }

  const seen = new Set<string>();

  const macros = (raw as MacroInput[])
    // Blank template rows are placeholders waiting to be filled in, so skip them.
    // A row with *some* fields filled is a genuine mistake and still throws below.
    .filter((entry) => !isBlankTemplate(entry))
    .map((entry, i) => {
      const where = `data/macros.json[${i}]`;

      for (const field of ["name", "creator", "macroAuthor", "levelId", "recorder"] as const) {
        if (entry[field] === undefined || entry[field] === "") {
          throw new Error(`${where} is missing required field "${field}".`);
        }
      }

      if (!RECORDERS.includes(entry.recorder)) {
        throw new Error(
          `${where} has recorder "${entry.recorder}". Must be one of: ${RECORDERS.join(", ")}.`,
        );
      }

      const slug = entry.slug || `${slugify(entry.name)}-${slugify(entry.macroAuthor)}`;
      if (seen.has(slug)) {
        throw new Error(
          `${where} produces the duplicate URL "${slug}". Add a unique "slug" field to one of them.`,
        );
      }
      seen.add(slug);

      const youtubeId = youtubeIdFrom(entry.video);

      return {
        ...entry,
        slug,
        youtubeId,
        thumbnailUrl:
          entry.thumbnail ||
          (youtubeId ? `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg` : null),
        searchIndex: [
          entry.name,
          entry.creator,
          entry.macroAuthor,
          entry.levelId,
          entry.downloadType,
          entry.recorder,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase(),
      } satisfies Macro;
    });

  // Ordering is alphabetical by level name, always. numeric:true keeps
  // "Level 2" ahead of "Level 10"; base sensitivity ignores case and accents.
  macros.sort((a, b) =>
    a.name.localeCompare(b.name, "en", { numeric: true, sensitivity: "base" }),
  );

  cache = macros;
  return cache;
}

export function getMacroBySlug(slug: string): Macro | undefined {
  return getAllMacros().find((m) => m.slug === slug);
}

/** Alphabetical neighbours, for the prev/next links on a detail page. */
export function getNeighbours(slug: string): { prev: Macro | null; next: Macro | null } {
  const all = getAllMacros();
  const i = all.findIndex((m) => m.slug === slug);
  if (i === -1) return { prev: null, next: null };
  return { prev: all[i - 1] ?? null, next: all[i + 1] ?? null };
}
