/**
 * Shapes and classification for the admin status page.
 *
 * Pure. No network, no secrets, no imports that touch either, so the rules for
 * what counts as healthy can be tested without standing anything up.
 *
 * WHAT A CHECK MAY REPORT
 * -----------------------
 * A label, a state, a duration, and a SHORT human detail. Never a key, never a
 * URL with a token in it, never a raw upstream error body. The status page is
 * behind an admin gate, but "only an admin can see it" is not a reason to put
 * a credential on a page: the whole point of the checks is that they exercise
 * the credentials, so an error string is exactly where one would leak.
 */

/** The services the status page probes, in display order. */
export const CHECK_IDS = [
  "supabase",
  "github",
  "vercel",
  "gdbrowser",
  "youtube",
  "resend",
  "lanyard",
] as const;

export type CheckId = (typeof CHECK_IDS)[number];

export const CHECK_LABELS: Record<CheckId, string> = {
  supabase: "Supabase",
  github: "GitHub publishing",
  vercel: "Vercel deployment",
  gdbrowser: "GDBrowser",
  youtube: "YouTube verification",
  resend: "Resend",
  lanyard: "Lanyard",
};

export const CHECK_DESCRIPTIONS: Record<CheckId, string> = {
  supabase: "Accounts, submissions and the database behind them.",
  github: "The App credentials that upload macros and commit the catalog.",
  vercel: "Whether production is serving the commit it should be.",
  gdbrowser: "Level lookups used by the submit form.",
  youtube: "The keyless check that a showcase video is real.",
  resend: "Support email in and out, and account notices.",
  lanyard: "Discord presence on the About page.",
};

/**
 * Three states, not two.
 *
 * `degraded` exists because "not configured" and "broken" are different
 * problems with different fixes, and collapsing them into one red light sends
 * whoever is on call to look in the wrong place. A missing environment variable
 * locally is expected; the same thing in production is not.
 */
export type CheckState = "ok" | "degraded" | "down";

export interface CheckResult {
  id: CheckId;
  label: string;
  state: CheckState;
  /** Round trip in milliseconds, when a request was actually made. */
  ms: number | null;
  /** One short line. Safe to render. Never a secret, a token or a raw body. */
  detail: string;
}

/** How long any single probe may take before it is called down. */
export const CHECK_TIMEOUT_MS = 8000;

/**
 * A check that took a long time but answered is still working.
 *
 * Kept as a separate idea from the state so a slow upstream shows up as a
 * warning on an otherwise green row rather than being reported as an outage.
 */
export const SLOW_MS = 2500;

export function isSlow(result: CheckResult): boolean {
  return result.state === "ok" && result.ms !== null && result.ms >= SLOW_MS;
}

/** The worst state present, which is what the page's summary shows. */
export function overallState(results: CheckResult[]): CheckState {
  if (results.some((r) => r.state === "down")) return "down";
  if (results.some((r) => r.state === "degraded")) return "degraded";
  return "ok";
}

export function countByState(results: CheckResult[]): Record<CheckState, number> {
  return {
    ok: results.filter((r) => r.state === "ok").length,
    degraded: results.filter((r) => r.state === "degraded").length,
    down: results.filter((r) => r.state === "down").length,
  };
}

export const STATE_LABEL: Record<CheckState, string> = {
  ok: "Responding",
  degraded: "Degraded",
  down: "Not responding",
};

/**
 * Colour AND text, always together.
 *
 * The label is rendered next to the dot on every row, so a status is never
 * conveyed by colour alone. Red and green are the two a colour blind viewer is
 * least able to separate, which is exactly the pair this would otherwise rely
 * on.
 */
export const STATE_DOT: Record<CheckState, string> = {
  ok: "bg-green",
  degraded: "bg-amber-400",
  down: "bg-rose",
};

/**
 * Trims an upstream message down to something safe to display.
 *
 * Upstream errors are unpredictable and can contain a request URL, a header
 * echo or a whole response body. Only a short, single-line, length-capped
 * version is ever shown, and anything that looks like a credential is dropped
 * outright rather than truncated, because a truncated key is still a key.
 */
export function safeDetail(input: unknown, fallback = "Failed"): string {
  const raw = typeof input === "string" ? input : input instanceof Error ? input.message : "";
  const oneLine = raw.replace(/\s+/g, " ").trim();
  if (!oneLine) return fallback;

  // Anything resembling a token, a bearer header or a signed URL is refused
  // rather than shortened.
  if (/(?:re_|whsec_|sk_|eyJ|Bearer\s|ghp_|gho_|github_pat_)/i.test(oneLine)) return fallback;
  if (/[?&](?:token|key|signature|sig|access_token)=/i.test(oneLine)) return fallback;

  return oneLine.length > 120 ? `${oneLine.slice(0, 117)}...` : oneLine;
}

/** Site statistics shown alongside the checks. All derived, none hardcoded. */
export interface SiteStats {
  levels: number;
  macros: number;
  recorders: { recorder: string; count: number }[];
  pendingSubmissions: number | null;
  processingSubmissions: number | null;
  accounts: number | null;
  commit: string | null;
  ref: string | null;
  env: string;
}

/** Counts the catalog. Takes the parsed catalog so it stays testable. */
export function catalogStats(catalog: { macros?: { recorder?: string }[] }[]): {
  levels: number;
  macros: number;
  recorders: { recorder: string; count: number }[];
} {
  const tally = new Map<string, number>();
  let macros = 0;

  for (const level of catalog ?? []) {
    for (const macro of level.macros ?? []) {
      macros++;
      const key = macro.recorder ?? "Unknown";
      tally.set(key, (tally.get(key) ?? 0) + 1);
    }
  }

  return {
    levels: (catalog ?? []).length,
    macros,
    // Sorted by count then name, so the order does not jump around between
    // loads when two recorders are level.
    recorders: [...tally.entries()]
      .map(([recorder, count]) => ({ recorder, count }))
      .sort((a, b) => b.count - a.count || a.recorder.localeCompare(b.recorder)),
  };
}
