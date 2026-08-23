/**
 * Querying Vercel Web Analytics.
 *
 * Pure: builds URLs and parses responses. No fetch, no token, so the query
 * shapes and the parsing of an unpredictable third-party response can be tested
 * without a network or a credential.
 *
 * Endpoint shapes come from Vercel's Web Analytics API documentation, not from
 * memory:
 *
 *   GET https://api.vercel.com/v1/query/web-analytics/visits/aggregate
 *   GET https://api.vercel.com/v1/query/web-analytics/visits/count
 *
 * Authorization: Bearer <token>. `projectId` is required. Vercel access tokens
 * are scoped to a personal account or team. Requests for a team-owned project
 * must also carry that team's `teamId`; personal-account projects omit it.
 */

export const ANALYTICS_BASE = "https://api.vercel.com/v1/query/web-analytics";

/** How much history the panel asks for. */
export const WINDOW_DAYS = 7;

/**
 * Kept well inside the smallest reporting window Vercel offers.
 *
 * Hobby guarantees one month, Pro twelve. Seven days is comfortably inside
 * either, so the panel does not silently return nothing on the cheaper plan.
 */
export const MAX_WINDOW_DAYS = 28;

export interface AnalyticsTarget {
  projectId: string;
  /** Required for a team-owned project; omitted for a personal-account project. */
  teamId?: string | null;
}

/** `YYYY-MM-DD` in UTC, which is what the API expects. */
export function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * The date range to ask for.
 *
 * `now` is a parameter rather than read from the clock so the window can be
 * asserted in a test. Clamped so a caller cannot ask for more history than the
 * plan is guaranteed to hold and get a confusingly empty answer back.
 */
export function analyticsWindow(now: Date, days = WINDOW_DAYS): { since: string; until: string } {
  const span = Math.max(1, Math.min(Math.floor(days), MAX_WINDOW_DAYS));
  const until = new Date(now.getTime());
  const since = new Date(now.getTime() - (span - 1) * 86_400_000);
  return { since: isoDay(since), until: isoDay(until) };
}

/**
 * Builds one query URL.
 *
 * `teamId` is only appended when there is one: sending an empty `teamId` is not
 * the same as omitting it, and the API rejects the former.
 */
export function analyticsUrl(
  path: "visits/aggregate" | "visits/count",
  target: AnalyticsTarget,
  params: Record<string, string | number | undefined> = {},
): string {
  const url = new URL(`${ANALYTICS_BASE}/${path}`);
  url.searchParams.set("projectId", target.projectId.trim());
  if (target.teamId?.trim()) url.searchParams.set("teamId", target.teamId.trim());

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "") continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

export interface DayRow {
  day: string;
  pageviews: number;
  visitors: number;
}

export interface PageRow {
  path: string;
  pageviews: number;
  visitors: number;
}

export interface TrafficTotals {
  pageviews: number;
  visitors: number;
}

export interface TrafficSummary {
  since: string;
  until: string;
  pageviews: number;
  visitors: number;
  /** Oldest first, or null when this optional breakdown was unavailable. */
  days: DayRow[] | null;
  /** Busiest first, or null when this optional breakdown was unavailable. */
  pages: PageRow[] | null;
}

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const str = (v: unknown): string => (typeof v === "string" ? v : "");

/** Exact totals from a `visits/count` response, or null if its shape is invalid. */
export function parseTotals(payload: unknown): TrafficTotals | null {
  if (!payload || typeof payload !== "object") return null;
  const data = (payload as { data?: unknown }).data;
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;

  const { pageviews, visitors } = data as Record<string, unknown>;
  if (
    typeof pageviews !== "number" ||
    !Number.isFinite(pageviews) ||
    typeof visitors !== "number" ||
    !Number.isFinite(visitors)
  ) {
    return null;
  }

  return { pageviews, visitors };
}

/** The `data` array of an aggregate response, or null for a malformed response. */
function rows(payload: unknown): Record<string, unknown>[] | null {
  if (!payload || typeof payload !== "object") return null;
  const data = (payload as { data?: unknown }).data;
  if (!Array.isArray(data)) return null;
  if (!data.every((r) => Boolean(r) && typeof r === "object" && !Array.isArray(r))) return null;
  return data as Record<string, unknown>[];
}

/**
 * Parses a `by=day` aggregate.
 *
 * Rows come back with an ISO `timestamp`; only the date part is kept, because
 * the panel groups by day and a time component would just be noise. Sorted here
 * rather than trusted, so a chart cannot come out backwards if the API ever
 * changes its ordering.
 */
export function parseDays(payload: unknown): DayRow[] | null {
  const data = rows(payload);
  if (!data) return null;
  if (
    !data.every(
      (r) =>
        typeof r.timestamp === "string" &&
        Boolean(r.timestamp) &&
        typeof r.pageviews === "number" &&
        Number.isFinite(r.pageviews) &&
        typeof r.visitors === "number" &&
        Number.isFinite(r.visitors),
    )
  ) {
    return null;
  }

  return data
    .map((r) => ({
      day: str(r.timestamp).slice(0, 10),
      pageviews: num(r.pageviews),
      visitors: num(r.visitors),
    }))
    .sort((a, b) => a.day.localeCompare(b.day));
}

/**
 * Parses a `by=requestPath` aggregate.
 *
 * `requestPath` is the exact page path, unlike `route`, which is the framework
 * pattern and would combine every `/macro/[slug]` page into one row. Vercel can
 * also return an `Others` bucket when a limit is used; that is not a page and is
 * deliberately left out of the list.
 */
export function parsePages(payload: unknown): PageRow[] | null {
  const data = rows(payload);
  if (!data) return null;
  if (
    !data.every(
      (r) =>
        typeof r.requestPath === "string" &&
        Boolean(r.requestPath) &&
        typeof r.pageviews === "number" &&
        Number.isFinite(r.pageviews) &&
        typeof r.visitors === "number" &&
        Number.isFinite(r.visitors),
    )
  ) {
    return null;
  }

  return data
    .map((r) => ({
      path: str(r.requestPath),
      pageviews: num(r.pageviews),
      visitors: num(r.visitors),
    }))
    .filter((r) => r.path && r.path.toLowerCase() !== "others")
    .sort((a, b) => b.pageviews - a.pageviews);
}

/** Combines the exact period count with the two optional breakdowns. */
export function summarise(
  window: { since: string; until: string },
  totals: TrafficTotals,
  days: DayRow[] | null,
  pages: PageRow[] | null,
): TrafficSummary {
  return {
    since: window.since,
    until: window.until,
    pageviews: totals.pageviews,
    visitors: totals.visitors,
    days,
    pages,
  };
}

/** Whether the panel can be shown at all. */
export function isAnalyticsConfigured(target: Partial<AnalyticsTarget>, token: string | undefined): boolean {
  return Boolean(token?.trim() && target.projectId?.trim());
}
