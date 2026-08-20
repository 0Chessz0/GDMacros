import "server-only";

/**
 * YouTube search and verification, with NO API KEY.
 *
 * This is the GDMacros App's mechanism, moved server-side. The app does it in
 * the Electron main process; a browser cannot, because YouTube sends no CORS
 * headers for us and a page cannot set the User-Agent the scrape depends on.
 * Our equivalent of that main process is a route handler.
 *
 * Two separate no-key mechanisms, doing different jobs:
 *
 *   SEARCH      the ordinary results page, reading the `ytInitialData` blob
 *               YouTube embeds in it. Unofficial. Verified working 2026-08-20.
 *   VERIFY      https://www.youtube.com/oembed, which is official, public and
 *               keyless. 200 for a real public video, 400 for one that does not
 *               exist or is not public.
 *
 * Neither needs a key, a Google Cloud project, a quota or a secret.
 *
 * The scrape is the fragile half: YouTube can change the page or challenge a
 * datacentre IP at any time. That is precisely why manual URL entry stays in
 * the UI, and why a failed search never blocks a submission.
 */

const RESULTS_URL = "https://www.youtube.com/results?search_query=";
const OEMBED_URL = "https://www.youtube.com/oembed";
const TIMEOUT_MS = 12000;
const MAX_RESULTS = 12;
export const MAX_QUERY_LENGTH = 100;

/** Without a desktop browser User-Agent YouTube serves a page with no payload. */
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

export interface YtVideo {
  videoId: string;
  title: string;
  channel: string;
  duration: string;
  views: string;
  published: string;
  /** Derived rather than parsed. Deterministic, so there is no array to read. */
  thumbnail: string;
  isLive: boolean;
}

export type YtResult<T> = { ok: true; data: T } | { ok: false; reason: YtFailure };
export type YtFailure = "bad-request" | "no-results" | "unavailable" | "timeout" | "not-found";

/* ------------------------------------------------------------------ */
/* Video ids and canonical URLs                                        */
/* ------------------------------------------------------------------ */

/** YouTube ids are exactly 11 characters from this alphabet. */
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

export function isVideoId(value: string): boolean {
  return VIDEO_ID.test(String(value ?? ""));
}

/**
 * Pulls a video id out of a pasted link, accepting only YouTube hosts.
 *
 * Parsed with the URL parser rather than a regex, so a lookalike host like
 * `youtube.com.evil.example` cannot pass: the check is on the parsed hostname,
 * not on the string containing "youtube.com".
 */
export function videoIdFromUrl(input: string): string | null {
  const raw = String(input ?? "").trim();
  if (!raw) return null;

  // A bare id is accepted too, since that is what the picker hands over.
  if (isVideoId(raw)) return raw;

  let url: URL;
  try {
    url = new URL(raw.includes("://") ? raw : `https://${raw}`);
  } catch {
    return null;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return null;

  const host = url.hostname.toLowerCase().replace(/^www\./, "").replace(/^m\./, "");

  if (host === "youtu.be") {
    const id = url.pathname.slice(1).split("/")[0];
    return isVideoId(id) ? id : null;
  }

  if (host === "youtube.com" || host === "music.youtube.com" || host === "youtube-nocookie.com") {
    const v = url.searchParams.get("v");
    if (v && isVideoId(v)) return v;
    // /embed/<id>, /shorts/<id>, /live/<id>
    const m = url.pathname.match(/^\/(?:embed|shorts|live|v)\/([A-Za-z0-9_-]{11})/);
    if (m) return m[1];
    return null;
  }

  return null;
}

/** The one URL shape ever stored. */
export function canonicalUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

export function thumbnailFor(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
}

/* ------------------------------------------------------------------ */
/* Verification, official and keyless                                  */
/* ------------------------------------------------------------------ */

export interface YtOEmbed {
  videoId: string;
  title: string;
  channel: string;
  thumbnail: string;
  url: string;
}

/**
 * Confirms a video exists and is public, using YouTube's own oEmbed endpoint.
 *
 * 200 means a real public video and hands back its title and channel; 400 means
 * it does not exist or is private. No key involved.
 */
export async function verifyVideo(videoId: string): Promise<YtResult<YtOEmbed>> {
  if (!isVideoId(videoId)) return { ok: false, reason: "bad-request" };

  try {
    const res = await fetch(
      `${OEMBED_URL}?url=${encodeURIComponent(canonicalUrl(videoId))}&format=json`,
      { signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" },
    );

    if (res.status === 400 || res.status === 401 || res.status === 403 || res.status === 404) {
      return { ok: false, reason: "not-found" };
    }
    if (!res.ok) return { ok: false, reason: "unavailable" };

    const j = (await res.json()) as Record<string, unknown>;
    const title = typeof j.title === "string" ? j.title : "";
    if (!title) return { ok: false, reason: "unavailable" };

    return {
      ok: true,
      data: {
        videoId,
        title,
        channel: typeof j.author_name === "string" ? j.author_name : "",
        thumbnail: typeof j.thumbnail_url === "string" ? j.thumbnail_url : thumbnailFor(videoId),
        url: canonicalUrl(videoId),
      },
    };
  } catch (e) {
    if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) {
      return { ok: false, reason: "timeout" };
    }
    return { ok: false, reason: "unavailable" };
  }
}

/* ------------------------------------------------------------------ */
/* Search, the app's scrape                                            */
/* ------------------------------------------------------------------ */

/**
 * Pulls the JSON blob YouTube embeds in its results page.
 *
 * Brace-matched rather than regex-terminated, because the payload contains
 * every bracket you can think of and a greedy or lazy pattern gets it wrong
 * either way. Ported from the desktop app, which has been doing this reliably.
 */
function extractYtInitialData(html: string): unknown {
  const marker = "ytInitialData";
  let at = html.indexOf(marker);

  while (at !== -1) {
    const brace = html.indexOf("{", at);
    if (brace === -1) return null;

    // Only accept a brace that follows an assignment, not a stray mention.
    if (html.slice(at + marker.length, brace).replace(/[\s=:]/g, "") === "") {
      let depth = 0;
      let inString = false;
      let escaped = false;

      for (let i = brace; i < html.length; i++) {
        const ch = html[i];
        if (inString) {
          if (escaped) escaped = false;
          else if (ch === "\\") escaped = true;
          else if (ch === '"') inString = false;
          continue;
        }
        if (ch === '"') inString = true;
        else if (ch === "{") depth++;
        else if (ch === "}") {
          depth--;
          if (depth === 0) {
            try {
              return JSON.parse(html.slice(brace, i + 1));
            } catch {
              return null;
            }
          }
        }
      }
      return null;
    }
    at = html.indexOf(marker, at + marker.length);
  }
  return null;
}

/**
 * Walks the whole payload for videoRenderer nodes, wherever they now live.
 *
 * Structure-agnostic on purpose: YouTube moves these around between layouts,
 * and searching the tree survives that where a fixed path would not.
 */
function collectVideoRenderers(node: unknown, out: Record<string, unknown>[] = []) {
  if (!node || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    for (const item of node) collectVideoRenderers(item, out);
    return out;
  }
  const obj = node as Record<string, unknown>;
  const vr = obj.videoRenderer as Record<string, unknown> | undefined;
  if (vr && typeof vr.videoId === "string") out.push(vr);
  for (const key of Object.keys(obj)) {
    if (key !== "videoRenderer") collectVideoRenderers(obj[key], out);
  }
  return out;
}

/** Handles both `simpleText` and a `runs` array. */
function runsToText(field: unknown): string {
  if (!field || typeof field !== "object") return "";
  const f = field as Record<string, unknown>;
  if (typeof f.simpleText === "string") return f.simpleText;
  if (Array.isArray(f.runs)) {
    return f.runs.map((r) => (r && typeof r === "object" ? String((r as Record<string, unknown>).text ?? "") : "")).join("");
  }
  return "";
}

export async function searchVideos(rawQuery: string): Promise<YtResult<YtVideo[]>> {
  const query = String(rawQuery ?? "").trim();
  if (!query || query.length > MAX_QUERY_LENGTH) return { ok: false, reason: "bad-request" };

  try {
    const res = await fetch(RESULTS_URL + encodeURIComponent(query), {
      headers: { "User-Agent": BROWSER_UA, "Accept-Language": "en-US,en;q=0.9" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });

    if (!res.ok) return { ok: false, reason: "unavailable" };

    const data = extractYtInitialData(await res.text());
    if (!data) return { ok: false, reason: "unavailable" };

    const videos = collectVideoRenderers(data)
      .slice(0, MAX_RESULTS)
      .map((v): YtVideo => {
        const videoId = String(v.videoId);
        const duration = runsToText(v.lengthText);
        return {
          videoId,
          title: runsToText(v.title),
          channel: runsToText(v.ownerText) || runsToText(v.longBylineText),
          duration,
          views: runsToText(v.shortViewCountText) || runsToText(v.viewCountText),
          published: runsToText(v.publishedTimeText),
          thumbnail: thumbnailFor(videoId),
          // A live stream has no length and is never the right showcase.
          isLive: duration === "",
        };
      })
      .filter((v) => isVideoId(v.videoId) && v.title !== "");

    if (videos.length === 0) return { ok: false, reason: "no-results" };
    return { ok: true, data: videos };
  } catch (e) {
    if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) {
      return { ok: false, reason: "timeout" };
    }
    return { ok: false, reason: "unavailable" };
  }
}

/** The wording a visitor sees. No upstream text, ever. */
export function ytErrorMessage(reason: YtFailure): string {
  switch (reason) {
    case "bad-request":
      return "Enter something to search for.";
    case "no-results":
      return "No videos found for that search.";
    case "not-found":
      return "That video could not be found on YouTube. Check the link.";
    case "timeout":
      return "The YouTube search timed out. You can paste a link instead.";
    default:
      return "YouTube search is unavailable right now. You can paste a link instead.";
  }
}
