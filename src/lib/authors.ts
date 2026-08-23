import "server-only";

import { getAllLevels, slugify } from "./macros";
import type { Level, Macro, Recorder } from "./types";

export interface AuthorMacroCredit {
  level: Level;
  macro: Macro;
}

export interface AuthorRecorderSummary {
  recorder: Recorder;
  count: number;
}

/** A catalog credit, not a claim that this name belongs to a site account. */
export interface CatalogAuthor {
  name: string;
  slug: string;
  macroCount: number;
  levelCount: number;
  recorders: readonly AuthorRecorderSummary[];
  credits: readonly AuthorMacroCredit[];
}

interface AuthorGroup {
  key: string;
  variants: Map<string, number>;
  credits: AuthorMacroCredit[];
}

interface AuthorIndex {
  all: readonly CatalogAuthor[];
  byName: ReadonlyMap<string, CatalogAuthor>;
  bySlug: ReadonlyMap<string, CatalogAuthor>;
}

let cache: AuthorIndex | null = null;

/** Case-insensitive identity for a displayed catalog credit. */
function authorKey(name: string): string {
  return name.trim().normalize("NFKC").toLocaleLowerCase("en");
}

/**
 * Picks the spelling used most often in the catalog. A lexical tie-break keeps
 * the result independent of JSON ordering, so casing cannot flip between builds.
 */
function canonicalName(variants: Map<string, number>): string {
  return [...variants.entries()]
    .sort(([aName, aCount], [bName, bCount]) => {
      if (aCount !== bCount) return bCount - aCount;
      return aName < bName ? -1 : aName > bName ? 1 : 0;
    })[0][0];
}

/**
 * A reversible, URL-safe suffix for the rare case where two different author
 * names collapse to the same readable slug. `slugify` never emits `--`, so a
 * suffixed collision cannot collide with an ordinary readable slug.
 */
function collisionSuffix(key: string): string {
  return Buffer.from(key, "utf8").toString("base64url");
}

function buildIndex(): AuthorIndex {
  const groups = new Map<string, AuthorGroup>();

  for (const level of getAllLevels()) {
    for (const macro of level.macros) {
      const display = macro.author.trim().normalize("NFKC");
      const key = authorKey(display);
      let group = groups.get(key);

      if (!group) {
        group = { key, variants: new Map(), credits: [] };
        groups.set(key, group);
      }

      group.variants.set(display, (group.variants.get(display) ?? 0) + 1);
      group.credits.push({ level, macro });
    }
  }

  const prepared = [...groups.values()].map((group) => {
    const name = canonicalName(group.variants);
    return { group, name, baseSlug: slugify(name) || "author" };
  });

  const baseCounts = new Map<string, number>();
  for (const item of prepared) {
    baseCounts.set(item.baseSlug, (baseCounts.get(item.baseSlug) ?? 0) + 1);
  }

  const all = prepared
    .map(({ group, name, baseSlug }): CatalogAuthor => {
      const recorderCounts = new Map<Recorder, number>();
      for (const { macro } of group.credits) {
        recorderCounts.set(macro.recorder, (recorderCounts.get(macro.recorder) ?? 0) + 1);
      }

      const recorders = [...recorderCounts.entries()]
        .map(([recorder, count]) => ({ recorder, count }))
        .sort((a, b) => b.count - a.count || a.recorder.localeCompare(b.recorder));

      const slug =
        baseCounts.get(baseSlug) === 1
          ? baseSlug
          : `${baseSlug}--${collisionSuffix(group.key)}`;

      return {
        name,
        slug,
        macroCount: group.credits.length,
        levelCount: new Set(group.credits.map(({ level }) => level.slug)).size,
        recorders,
        credits: group.credits,
      };
    })
    .sort((a, b) =>
      a.name.localeCompare(b.name, "en", { numeric: true, sensitivity: "base" }),
    );

  return {
    all,
    byName: new Map(all.map((author) => [authorKey(author.name), author])),
    bySlug: new Map(all.map((author) => [author.slug, author])),
  };
}

function index(): AuthorIndex {
  cache ??= buildIndex();
  return cache;
}

export function getAllAuthors(): readonly CatalogAuthor[] {
  return index().all;
}

export function getAuthorBySlug(slug: string): CatalogAuthor | undefined {
  return index().bySlug.get(slug);
}

export function findAuthorByName(name: string): CatalogAuthor | undefined {
  return index().byName.get(authorKey(name));
}
