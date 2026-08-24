/**
 * A small per-caller rate limit.
 *
 * WHAT THIS PROTECTS, AND FROM WHOM
 * ---------------------------------
 * `/api/search` is authenticated, so this is not about anonymous abuse. It is
 * about a signed-in account hammering it: every call is a server-side request
 * to GDBrowser or to YouTube's results page, made from OUR datacentre IP. One
 * user in a loop therefore gets the whole site rate limited by an upstream we
 * do not control, and search breaks for everybody. The manual URL fallback on
 * the submit form exists because that was always foreseeable.
 *
 * WHAT IT IS NOT
 * --------------
 * This is per instance, in memory. Serverless means several instances can be
 * live at once, so the real ceiling is the limit times however many are warm,
 * and a cold start forgets everything. That is a genuine weakness and it is
 * written down rather than glossed over.
 *
 * It is still worth having. The threat is one session in a tight loop, and that
 * traffic lands on a small number of instances, so a per instance bucket blunts
 * exactly the case that hurts. A shared counter would need a round trip to the
 * database on every keystroke of a search box, which would cost every honest
 * user real latency to defend against a rare one. If the ceiling ever needs to
 * be exact, that is the trade to revisit.
 */

interface Bucket {
  /** Timestamps of calls inside the window, oldest first. */
  hits: number[];
}

const buckets = new Map<string, Bucket>();

/**
 * Bounds memory. Without it a long-lived instance accumulates one entry per
 * caller forever, which is a slow leak rather than a limit.
 */
const MAX_TRACKED = 5000;

export interface RateLimitResult {
  ok: boolean;
  /** Calls still allowed in the current window. */
  remaining: number;
  /** Seconds until the window frees up. Only meaningful when `ok` is false. */
  retryAfter: number;
}

/**
 * A sliding window, rather than a fixed one.
 *
 * A fixed window lets somebody spend the whole allowance at 0:59 and the whole
 * next allowance at 1:01, which is double the intended burst at exactly the
 * wrong moment. Keeping the timestamps costs a few numbers per caller and
 * removes that edge entirely.
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): RateLimitResult {
  if (buckets.size > MAX_TRACKED) buckets.clear();

  const cutoff = now - windowMs;
  const bucket = buckets.get(key) ?? { hits: [] };

  // Drop anything that has aged out of the window.
  const hits = bucket.hits.filter((t) => t > cutoff);

  if (hits.length >= limit) {
    buckets.set(key, { hits });
    const oldest = hits[0];
    return {
      ok: false,
      remaining: 0,
      retryAfter: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000)),
    };
  }

  hits.push(now);
  buckets.set(key, { hits });
  return { ok: true, remaining: limit - hits.length, retryAfter: 0 };
}

/** Test seam. Never called by application code. */
export function __resetRateLimits() {
  buckets.clear();
}
