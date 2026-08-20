import "server-only";

/**
 * GDBrowser, the only place this project talks to it.
 *
 * Server-side only, for the same reason the desktop app puts it in the Electron
 * main process: GDBrowser sends no CORS headers for us, so a browser cannot
 * make this call at all.
 *
 * Verified against the live service on 2026-08-20, see
 * `.claude/reference/upstream-services.md`. Two things there are worth
 * repeating because they are not what you would guess:
 *
 *   * A MISSING LEVEL ANSWERS HTTP 500 WITH THE BODY `-1`, not 404. So status
 *     alone can never decide "not found", and a 500 must not be reported as an
 *     outage. The body is the signal.
 *   * The creator is a plain string in `author`. There is no nested object.
 */

const BASE = "https://gdbrowser.com/api";
const TIMEOUT_MS = 8000;
const MAX_RESULTS = 12;
export const MAX_QUERY_LENGTH = 60;

/** The only fields we take. Everything else GDBrowser returns is ignored. */
export interface GdLevel {
  levelId: string;
  name: string;
  creator: string;
  difficulty: string;
  downloads: number | null;
  likes: number | null;
  length: string;
  stars: number | null;
  songName: string;
  platformer: boolean;
}

export type GdResult<T> = { ok: true; data: T } | { ok: false; reason: GdFailure };

/**
 * Deliberately a small closed set rather than a message. The caller decides the
 * wording, so no upstream text can ever reach a visitor.
 */
export type GdFailure = "not-found" | "bad-request" | "unavailable" | "timeout";

/* ------------------------------------------------------------------ */
/* A short cache                                                       */
/* ------------------------------------------------------------------ */

/**
 * Levels barely change, and a submitter will look the same one up repeatedly
 * while filling the form. This keeps that off GDBrowser without pretending to
 * be a real cache: it is per server instance, bounded, and short lived.
 */
const CACHE_MS = 5 * 60 * 1000;
const CACHE_MAX = 200;
const cache = new Map<string, { at: number; value: unknown }>();

function cached<T>(key: string): T | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_MS) {
    cache.delete(key);
    return null;
  }
  return hit.value as T;
}

function remember(key: string, value: unknown) {
  // Oldest out first. Map preserves insertion order, so this is enough.
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { at: Date.now(), value });
}

/* ------------------------------------------------------------------ */
/* Parsing                                                             */
/* ------------------------------------------------------------------ */

const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};
const text = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/**
 * Validates the shape rather than trusting it. A response that does not carry a
 * usable name and id is treated as no result at all, which is what stops a
 * changed upstream format from quietly producing empty submissions.
 */
function toLevel(raw: unknown): GdLevel | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  const levelId = text(r.id);
  const name = text(r.name);
  if (!/^[0-9]{1,12}$/.test(levelId)) return null;
  if (!name) return null;

  return {
    levelId,
    name,
    // GDBrowser returns an empty author for some levels rather than omitting it.
    creator: text(r.author) || "Unknown",
    difficulty: text(r.difficulty),
    downloads: num(r.downloads),
    likes: num(r.likes),
    length: text(r.length),
    stars: num(r.stars),
    songName: text(r.songName),
    platformer: r.platformer === true,
  };
}

/* ------------------------------------------------------------------ */
/* Requests                                                            */
/* ------------------------------------------------------------------ */

async function get(path: string): Promise<{ status: number; body: string } | "timeout" | null> {
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: { "User-Agent": "GDMacros-Website" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    return { status: res.status, body: await res.text() };
  } catch (e) {
    // A timeout is worth telling apart from being offline, because the wording
    // a visitor should see differs.
    if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) return "timeout";
    return null;
  }
}

/** `-1` is GDBrowser's "no such level", and it arrives with a 500. */
const isMissing = (body: string) => body.trim() === "-1";

/**
 * Accepts a bare id, or anything containing one, so pasting a GDBrowser link or
 * a level URL works as well as typing the number. Same idea as the desktop app.
 */
export function extractLevelId(input: string): string | null {
  const t = String(input ?? "").trim();
  if (/^[0-9]{1,12}$/.test(t)) return t;
  const m = t.match(/([0-9]{3,12})/);
  return m ? m[1] : null;
}

/**
 * One level, by id. This is the call the submit route uses to re-verify a
 * submission, so it is the one that decides what actually gets stored.
 */
export async function lookupLevel(rawId: string): Promise<GdResult<GdLevel>> {
  const id = extractLevelId(rawId);
  if (!id) return { ok: false, reason: "bad-request" };

  const key = `level:${id}`;
  const hit = cached<GdLevel>(key);
  if (hit) return { ok: true, data: hit };

  const res = await get(`/level/${encodeURIComponent(id)}`);
  if (res === "timeout") return { ok: false, reason: "timeout" };
  if (res === null) return { ok: false, reason: "unavailable" };
  if (isMissing(res.body)) return { ok: false, reason: "not-found" };
  if (res.status >= 400) return { ok: false, reason: "unavailable" };

  let parsed: unknown;
  try {
    parsed = JSON.parse(res.body);
  } catch {
    return { ok: false, reason: "unavailable" };
  }

  const level = toLevel(parsed);
  if (!level) return { ok: false, reason: "not-found" };

  remember(key, level);
  return { ok: true, data: level };
}

/**
 * Levels by name. Returns at most MAX_RESULTS, because this feeds a picker and
 * a long list is neither useful nor kind to GDBrowser.
 */
export async function searchLevels(rawQuery: string): Promise<GdResult<GdLevel[]>> {
  const query = String(rawQuery ?? "").trim();
  if (!query || query.length > MAX_QUERY_LENGTH) return { ok: false, reason: "bad-request" };

  // A pure number is an id, and looking it up directly is both faster and more
  // accurate than searching for it as text.
  if (/^[0-9]{1,12}$/.test(query)) {
    const one = await lookupLevel(query);
    // Written out rather than as a ternary so the narrowing is explicit: a
    // single-level result has to become a one-element list.
    if (!one.ok) return { ok: false, reason: one.reason };
    return { ok: true, data: [one.data] };
  }

  const key = `search:${query.toLowerCase()}`;
  const hit = cached<GdLevel[]>(key);
  if (hit) return { ok: true, data: hit };

  const res = await get(`/search/${encodeURIComponent(query)}?count=${MAX_RESULTS}`);
  if (res === "timeout") return { ok: false, reason: "timeout" };
  if (res === null) return { ok: false, reason: "unavailable" };
  if (isMissing(res.body)) return { ok: true, data: [] };
  if (res.status >= 400) return { ok: false, reason: "unavailable" };

  let parsed: unknown;
  try {
    parsed = JSON.parse(res.body);
  } catch {
    return { ok: false, reason: "unavailable" };
  }
  if (!Array.isArray(parsed)) return { ok: false, reason: "unavailable" };

  const levels = parsed
    .map(toLevel)
    .filter((l): l is GdLevel => l !== null)
    .slice(0, MAX_RESULTS);

  remember(key, levels);
  return { ok: true, data: levels };
}

/** The wording a visitor sees. No upstream text, ever. */
export function gdErrorMessage(reason: GdFailure): string {
  switch (reason) {
    case "not-found":
      return "No Geometry Dash level matched that.";
    case "bad-request":
      return "Enter a level name or a level ID.";
    case "timeout":
      return "The Geometry Dash level lookup timed out. Please try again.";
    default:
      return "We couldn't verify that Geometry Dash level right now. Please try again.";
  }
}
