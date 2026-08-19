import fs from "node:fs";
import path from "node:path";
import { RECORDERS, type Level, type LevelInput, type Macro } from "./types";

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

const blank = (v: unknown) => v === undefined || v === null || String(v).trim() === "";

/**
 * Reads the macro list off a level, accepting either the current `macros` array
 * or the older flat shape where a single macro's fields sat on the level itself.
 */
function readMacros(entry: LevelInput): Partial<Macro>[] {
  if (Array.isArray(entry.macros) && entry.macros.length > 0) return entry.macros;

  const legacy = [entry.macroAuthor, entry.recorder, entry.downloadType, entry.downloadLink];
  if (legacy.some((v) => !blank(v))) {
    return [
      {
        author: entry.macroAuthor,
        recorder: entry.recorder,
        downloadType: entry.downloadType,
        downloadLink: entry.downloadLink,
      },
    ];
  }
  return [];
}

/**
 * True when an entry is an untouched template row: no level details and no
 * macro details anywhere. These are skipped so `data/macros.json` can ship with
 * empty slots. A row with *some* fields filled is a typo, not a placeholder,
 * and still errors.
 */
export function isBlankTemplate(entry: LevelInput): boolean {
  const levelBlank = blank(entry.name) && blank(entry.creator) && blank(entry.levelId);
  const macrosBlank = readMacros(entry).every((m) =>
    [m.author, m.recorder, m.downloadType, m.downloadLink].every(blank),
  );
  return levelBlank && macrosBlank;
}

let cache: Level[] | null = null;

/** Read and normalise `data/macros.json` at build time. */
export function getAllLevels(): Level[] {
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
    throw new Error("data/macros.json must contain an array of levels.");
  }

  const seen = new Set<string>();

  const levels = (raw as LevelInput[])
    .filter((entry) => !isBlankTemplate(entry))
    .map((entry, i) => {
      const where = `data/macros.json[${i}]`;

      for (const field of ["name", "creator", "levelId"] as const) {
        if (blank(entry[field])) {
          throw new Error(`${where} is missing required field "${field}".`);
        }
      }

      const macroList = readMacros(entry);
      if (macroList.length === 0) {
        throw new Error(`${where} ("${entry.name}") has no macros. Add at least one to "macros".`);
      }

      const macros: Macro[] = macroList.map((m, j) => {
        const at = `${where}.macros[${j}]`;
        for (const field of ["author", "recorder", "downloadType", "downloadLink"] as const) {
          if (blank(m[field])) {
            throw new Error(`${at} is missing required field "${field}".`);
          }
        }
        if (!RECORDERS.includes(m.recorder as (typeof RECORDERS)[number])) {
          throw new Error(
            `${at} has recorder "${m.recorder}". Must be one of: ${RECORDERS.join(", ")}.`,
          );
        }
        return { ...(m as Macro), position: j + 1 };
      });

      // The slug is the level now, not the level plus one author, because a
      // level can hold several macros under the same page.
      const slug = entry.slug || slugify(entry.name);
      if (seen.has(slug)) {
        throw new Error(
          `${where} produces the duplicate URL "${slug}". Add a unique "slug" field to one of them.`,
        );
      }
      seen.add(slug);

      const youtubeId = youtubeIdFrom(entry.video);

      return {
        name: entry.name,
        creator: entry.creator,
        levelId: entry.levelId,
        macros,
        video: entry.video,
        description: entry.description,
        addedAt: entry.addedAt,
        slug,
        youtubeId,
        // Two sizes on purpose. The list renders these between 74 and 225px
        // wide, where mqdefault (320x180) is still oversampled and weighs 44%
        // less: about 1.23 MB saved across the whole home page. Share cards and
        // anything full width need the bigger one.
        thumbnailUrl:
          entry.thumbnail ||
          (youtubeId ? `https://img.youtube.com/vi/${youtubeId}/mqdefault.jpg` : null),
        thumbnailLargeUrl:
          entry.thumbnail ||
          (youtubeId ? `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg` : null),
        searchIndex: [
          entry.name,
          entry.creator,
          entry.levelId,
          ...macros.flatMap((m) => [m.author, m.recorder, m.downloadType]),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase(),
      } satisfies Level;
    });

  // Ordering is alphabetical by level name, always. numeric:true keeps
  // "Level 2" ahead of "Level 10"; base sensitivity ignores case and accents.
  levels.sort((a, b) =>
    a.name.localeCompare(b.name, "en", { numeric: true, sensitivity: "base" }),
  );

  cache = levels;
  return cache;
}

export function getLevelBySlug(slug: string): Level | undefined {
  return getAllLevels().find((l) => l.slug === slug);
}

/** Alphabetical neighbours, for the prev/next links on a detail page. */
export function getNeighbours(slug: string): { prev: Level | null; next: Level | null } {
  const all = getAllLevels();
  const i = all.findIndex((l) => l.slug === slug);
  if (i === -1) return { prev: null, next: null };
  return { prev: all[i - 1] ?? null, next: all[i + 1] ?? null };
}

/** Total macro count across every level, for the About page and metadata. */
export function getMacroCount(): number {
  return getAllLevels().reduce((sum, l) => sum + l.macros.length, 0);
}
