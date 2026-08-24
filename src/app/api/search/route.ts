import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rateLimit";
import { gdErrorMessage, searchLevels, MAX_QUERY_LENGTH as GD_MAX } from "@/lib/gdbrowser";
import {
  searchVideos,
  verifyVideo,
  videoIdFromUrl,
  ytErrorMessage,
  MAX_QUERY_LENGTH as YT_MAX,
} from "@/lib/youtube";

/**
 * The submit form's lookup endpoint: Geometry Dash levels and YouTube videos.
 *
 * Server-side because neither upstream can be called from a browser. GDBrowser
 * and YouTube send no CORS headers for us, and the YouTube scrape depends on a
 * User-Agent a page is not allowed to set.
 *
 * SIGNED IN ONLY. Not because the results are secret, they are public either
 * way, but because an open endpoint here would turn the site into a free proxy
 * for scraping YouTube, and the rate limiting that would follow would land on
 * us. Only people who can actually submit a macro can use it.
 *
 * No API key is involved in any branch. See
 * `.claude/reference/upstream-services.md`.
 */

export const runtime = "nodejs";

const bad = (status: number, error: string) => NextResponse.json({ error }, { status });

/**
 * Twenty searches a minute per account.
 *
 * Comfortably above a person typing into a search box, and far below the loop
 * that would get our datacentre IP throttled by YouTube. Keyed on the account
 * id rather than an IP, because the route already requires a session and an IP
 * is both shared and spoofable behind a proxy.
 */
const SEARCH_LIMIT = 20;
const SEARCH_WINDOW_MS = 60_000;

export async function GET(request: NextRequest) {
  const user = await getUser();
  if (!user) return bad(401, "Sign in to search.");

  const limit = rateLimit(`search:${user.id}`, SEARCH_LIMIT, SEARCH_WINDOW_MS);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many searches. Wait a moment and try again." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  const { searchParams } = new URL(request.url);
  const kind = searchParams.get("kind");
  const q = (searchParams.get("q") ?? "").trim();

  /* ---- Geometry Dash levels, by name or id ---- */
  if (kind === "level") {
    if (!q || q.length > GD_MAX) return bad(400, "Enter a level name or a level ID.");
    const res = await searchLevels(q);
    if (!res.ok) return bad(res.reason === "bad-request" ? 400 : 502, gdErrorMessage(res.reason));
    return NextResponse.json({ levels: res.data });
  }

  /* ---- YouTube, by search text ---- */
  if (kind === "video") {
    if (!q || q.length > YT_MAX) return bad(400, "Enter something to search for.");
    const res = await searchVideos(q);
    if (!res.ok) return bad(res.reason === "bad-request" ? 400 : 502, ytErrorMessage(res.reason));
    return NextResponse.json({ videos: res.data });
  }

  /*
   * ---- One pasted YouTube link or id, verified ----
   * The manual fallback for the day the scrape stops working. Still no key:
   * oEmbed is official, public and answers 400 for anything that is not a real
   * public video.
   */
  if (kind === "verify") {
    const videoId = videoIdFromUrl(q);
    if (!videoId) return bad(400, "That does not look like a YouTube link.");
    const res = await verifyVideo(videoId);
    if (!res.ok) return bad(res.reason === "not-found" ? 404 : 502, ytErrorMessage(res.reason));
    return NextResponse.json({ video: res.data });
  }

  return bad(400, "Unknown search type.");
}
