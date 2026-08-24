"use server";

import { createClient, getUser } from "@/lib/supabase/server";
import { isCurrentUserAdmin } from "@/lib/admin";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getAllLevels, getMacroCount } from "@/lib/macros";
import { site } from "@/lib/site";
import { OWNERS } from "@/lib/owners";
import { lanyardUrl } from "@/lib/lanyard";
import { lookupLevel } from "@/lib/gdbrowser";
import { verifyVideo } from "@/lib/youtube";
import {
  analyticsUrl,
  analyticsWindow,
  isAnalyticsConfigured,
  parseDays,
  parsePages,
  parseTotals,
  summarise,
  type TrafficSummary,
} from "@/lib/vercelAnalytics";
import {
  CHECK_LABELS,
  CHECK_TIMEOUT_MS,
  catalogStats,
  safeDetail,
  type CheckId,
  type CheckResult,
  type CheckState,
  type OperationsSummary,
  type SiteStats,
} from "@/lib/health";

/**
 * The status page's probes.
 *
 * Every one of these runs on the SERVER, because most of them need a credential
 * the browser must never hold: the GitHub App key, the Resend key, the Supabase
 * session. The browser asks "how is everything", and gets back seven labels and
 * seven states.
 *
 * Authorisation is checked here on every call, not once when the page loaded.
 * A server action is a POST endpoint anyone on the internet can reach, so the
 * page having rendered proves nothing about the request that follows it.
 *
 * These probes are all READS. Nothing here uploads, commits, sends, deletes or
 * changes any state anywhere, so the status page cannot be used as a way to
 * make something happen.
 */

async function guard(): Promise<boolean> {
  const user = await getUser();
  if (!user) return false;
  return await isCurrentUserAdmin();
}

/** Wraps a probe with a timeout and turns any throw into a result. */
async function probe(
  id: CheckId,
  run: () => Promise<{ state: CheckState; detail: string }>,
): Promise<CheckResult> {
  const started = Date.now();
  const label = CHECK_LABELS[id];

  try {
    const outcome = await Promise.race([
      run(),
      new Promise<{ state: CheckState; detail: string }>((_, reject) =>
        setTimeout(() => reject(new Error("Timed out")), CHECK_TIMEOUT_MS),
      ),
    ]);
    return { id, label, ms: Date.now() - started, ...outcome };
  } catch (e) {
    return {
      id,
      label,
      state: "down",
      ms: Date.now() - started,
      detail: safeDetail(e, "Did not respond"),
    };
  }
}

/** A fetch that cannot hang, for the probes that talk to a plain URL. */
async function timedFetch(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS - 500);
  try {
    return await fetch(url, { ...init, cache: "no-store", signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------------------------------------------ *
 * The individual checks
 * ------------------------------------------------------------------ */

async function checkSupabase() {
  return probe("supabase", async () => {
    if (!isSupabaseConfigured) return { state: "degraded" as const, detail: "Not configured here" };
    const supabase = await createClient();
    if (!supabase) return { state: "degraded" as const, detail: "No client" };

    // A head count on a public table: cheap, read-only, and it exercises the
    // real PostgREST path rather than just checking a URL is set.
    const { error, count } = await supabase
      .from("profiles")
      .select("id", { count: "exact", head: true });

    if (error) return { state: "down" as const, detail: safeDetail(error.message) };
    return { state: "ok" as const, detail: `${count ?? 0} profiles` };
  });
}

async function checkGithub() {
  return probe("github", async () => {
    const config = await import("@/lib/github/config");
    if (!config.isPublisherConfigured) {
      return { state: "degraded" as const, detail: "Publisher credentials not configured here" };
    }

    const { ghFetch, tokenDiagnostics, githubErrorMessage } = await import("@/lib/github/client");
    try {
      // Publishing touches both repositories: the asset goes to downloads and
      // the catalog commit goes to source. Read both so a partial GitHub App
      // installation cannot report green and then fail halfway through a
      // publish. These are reads, never writes.
      const [source, downloads] = await Promise.all([
        ghFetch<{ full_name?: string }>({
          url: `${config.GITHUB_API}/repos/${config.GITHUB_ORG}/${config.SOURCE_REPO}`,
          timeoutMs: CHECK_TIMEOUT_MS - 500,
        }),
        ghFetch<{ full_name?: string }>({
          url: `${config.GITHUB_API}/repos/${config.GITHUB_ORG}/${config.DOWNLOADS_REPO}`,
          timeoutMs: CHECK_TIMEOUT_MS - 500,
        }),
      ]);
      const perms = tokenDiagnostics().permissions;
      const canWrite = perms.contents === "write";
      return {
        state: canWrite ? ("ok" as const) : ("degraded" as const),
        detail: canWrite
          ? `${source.data?.full_name ?? config.SOURCE_REPO} + ${downloads.data?.full_name ?? config.DOWNLOADS_REPO}, contents: write`
          : "Token cannot write contents",
      };
    } catch (e) {
      return { state: "down" as const, detail: safeDetail(githubErrorMessage(e)) };
    }
  });
}

async function checkVercel() {
  return probe("vercel", async () => {
    const expected = process.env.VERCEL_GIT_COMMIT_SHA ?? null;
    const res = await timedFetch(`${site.url}/api/version`);
    if (!res.ok) return { state: "down" as const, detail: `Production returned ${res.status}` };

    const body = (await res.json()) as { commit?: string; ref?: string; env?: string };
    const live = body.commit ?? null;

    if (!expected) {
      // Running locally, where Vercel injects nothing. Reporting "down" here
      // would be a lie about production.
      return {
        state: "degraded" as const,
        detail: live ? `Production on ${live.slice(0, 7)}, cannot compare from here` : "No commit reported",
      };
    }
    if (!live) return { state: "down" as const, detail: "Production reported no commit" };

    return live === expected
      ? { state: "ok" as const, detail: `Serving ${live.slice(0, 7)} on ${body.ref ?? "main"}` }
      : {
          state: "degraded" as const,
          detail: `This build is ${expected.slice(0, 7)}, production serves ${live.slice(0, 7)}`,
        };
  });
}

async function checkGdbrowser() {
  return probe("gdbrowser", async () => {
    // Stereo Madness. The first level in the game, so it cannot be deleted or
    // renamed out from under this check.
    const res = await lookupLevel("128");
    if (!res.ok) return { state: "down" as const, detail: `Lookup failed: ${res.reason}` };
    return { state: "ok" as const, detail: `Resolved "${res.data.name}"` };
  });
}

async function checkYoutube() {
  return probe("youtube", async () => {
    // The oEmbed endpoint, which is the exact mechanism the submit form uses to
    // decide whether a showcase video is real. No API key involved.
    const res = await verifyVideo("dQw4w9WgXcQ");
    if (!res.ok) {
      // "not-found" means oEmbed answered and said no, which is the endpoint
      // working correctly on a video that has since gone private. That is not
      // an outage on our side.
      const state = res.reason === "not-found" ? ("degraded" as const) : ("down" as const);
      return { state, detail: `oEmbed: ${res.reason}` };
    }
    return { state: "ok" as const, detail: "oEmbed responding, no key needed" };
  });
}

async function checkResend() {
  return probe("resend", async () => {
    if (!process.env.RESEND_SUPPORT_API_KEY) {
      return { state: "degraded" as const, detail: "Support key not configured here" };
    }
    const { Resend } = await import("resend");
    const client = new Resend(process.env.RESEND_SUPPORT_API_KEY);

    // Listing domains is the cheapest authenticated READ. It sends nothing and
    // changes nothing, so running this check can never deliver an email.
    const { data, error } = await client.domains.list();
    if (error) return { state: "down" as const, detail: safeDetail(error.message) };

    const domains = (data?.data ?? []) as { name?: string; status?: string }[];
    const ours = domains.find((d) => d.name === "gdmacros.com");
    if (!ours) return { state: "degraded" as const, detail: "gdmacros.com not listed" };
    return ours.status === "verified"
      ? { state: "ok" as const, detail: "gdmacros.com verified" }
      : { state: "degraded" as const, detail: `gdmacros.com is ${ours.status ?? "unknown"}` };
  });
}

async function checkLanyard() {
  return probe("lanyard", async () => {
    // Only a configured owner id is ever requested, here as everywhere else.
    const res = await timedFetch(lanyardUrl(OWNERS[0].discordId));
    if (!res.ok) return { state: "down" as const, detail: `Returned ${res.status}` };
    const body = (await res.json()) as { success?: boolean };
    return body?.success
      ? { state: "ok" as const, detail: "Presence available" }
      : { state: "degraded" as const, detail: "Responded without data" };
  });
}

/* ------------------------------------------------------------------ *
 * Entry points
 * ------------------------------------------------------------------ */

export async function runHealthChecks(): Promise<{ ok: boolean; results?: CheckResult[]; error?: string }> {
  if (!(await guard())) return { ok: false, error: "Not authorised." };

  // All at once. Seven sequential probes with an eight second ceiling each
  // could take the better part of a minute; in parallel the page is as slow as
  // the slowest single service.
  const results = await Promise.all([
    checkSupabase(),
    checkGithub(),
    checkVercel(),
    checkGdbrowser(),
    checkYoutube(),
    checkResend(),
    checkLanyard(),
  ]);

  return { ok: true, results };
}

/**
 * Vercel Web Analytics for the last week.
 *
 * Optional by design. Without a token this returns null and the panel says so,
 * exactly like every other "not configured here" path: a missing analytics
 * token must never be able to break the status page.
 *
 * The token is read server side and never leaves this function. Scope it to
 * the personal account or team that owns the project, and keep it out of logs,
 * return values and error messages.
 */
export async function getTrafficStats(): Promise<{
  ok: boolean;
  traffic?: TrafficSummary | null;
  error?: string;
}> {
  if (!(await guard())) return { ok: false, error: "Not authorised." };

  const token = process.env.VERCEL_ANALYTICS_TOKEN?.trim();
  const explicitProjectId = process.env.VERCEL_ANALYTICS_PROJECT_ID?.trim();
  const automaticProjectId = process.env.VERCEL_PROJECT_ID?.trim();
  const target = {
    // The explicit variable works everywhere. VERCEL_PROJECT_ID is the
    // automatic Vercel fallback when system variables are exposed.
    projectId: explicitProjectId || automaticProjectId || "",
    // Vercel requires this for a team-owned project, even when the token itself
    // is scoped to that team. Personal-account projects leave it unset.
    teamId: process.env.VERCEL_ANALYTICS_TEAM_ID?.trim() || null,
  };

  if (!isAnalyticsConfigured(target, token)) return { ok: true, traffic: null };

  const win = analyticsWindow(new Date());
  const headers = { Authorization: `Bearer ${token}` };

  try {
    const [countResult, byDayResult, byPageResult] = await Promise.allSettled([
      timedFetch(analyticsUrl("visits/count", target, win), { headers }),
      timedFetch(analyticsUrl("visits/aggregate", target, { ...win, by: "day" }), { headers }),
      timedFetch(
        analyticsUrl("visits/aggregate", target, { ...win, by: "requestPath", limit: 5 }),
        { headers },
      ),
    ]);

    if (countResult.status === "rejected") {
      return { ok: true, traffic: null, error: "Analytics did not respond" };
    }
    const count = countResult.value;

    // A 403 here means the token is wrong or lacks this project. Reported as
    // "unavailable" rather than as an outage: it is a configuration problem,
    // and the status of the SITE is unaffected either way.
    if (!count.ok) return { ok: true, traffic: null, error: `Analytics returned ${count.status}` };

    const totals = parseTotals(await count.json());
    if (!totals) return { ok: true, traffic: null, error: "Analytics returned an unexpected response" };

    // The exact totals are still useful when one optional aggregate is down.
    // Keep "unavailable" distinct from a legitimate empty result so the UI
    // never claims there were zero days/pages merely because a request failed.
    let days: ReturnType<typeof parseDays> = null;
    let pages: ReturnType<typeof parsePages> = null;
    if (byDayResult.status === "fulfilled" && byDayResult.value.ok) {
      try {
        days = parseDays(await byDayResult.value.json());
      } catch {
        // Partial analytics is called out below; totals remain exact.
      }
    }
    if (byPageResult.status === "fulfilled" && byPageResult.value.ok) {
      try {
        pages = parsePages(await byPageResult.value.json());
      } catch {
        // Partial analytics is called out below; totals remain exact.
      }
    }

    const missing = [days === null ? "daily" : null, pages === null ? "page" : null].filter(Boolean);
    return {
      ok: true,
      traffic: summarise(win, totals, days, pages),
      error: missing.length ? "Some analytics breakdowns are unavailable" : undefined,
    };
  } catch {
    // Never surfaces the URL or the header, either of which carries the token.
    return { ok: true, traffic: null, error: "Analytics did not respond" };
  }
}

/**
 * Work that has stopped and is waiting for a person.
 *
 * All three subsystems live in the `private` schema, which PostgREST does not
 * expose, so this goes through a read-only RPC that checks the admin role for
 * itself. It returns counts and nothing that identifies a submission, an
 * account or a recipient.
 */
export async function getOperationsSummary(): Promise<{
  ok: boolean;
  ops?: OperationsSummary;
  error?: string;
}> {
  if (!(await guard())) return { ok: false, error: "Not authorised." };

  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Database unavailable." };

  const { data, error } = await supabase.rpc("admin_operations_summary");
  if (error) {
    // Almost always means migration 0013 has not been applied yet. Said plainly
    // rather than as a generic failure, because that was the exact trap the
    // submission editor fell into.
    const missing = /could not find the function|PGRST202/i.test(error.message ?? "");
    return {
      ok: false,
      error: missing
        ? "Operations summary unavailable. Migration 0013 has not been applied."
        : `Could not read operations: ${safeDetail(error.message, "unknown database error")}`,
    };
  }

  const row = (data as Record<string, number>[])?.[0];
  if (!row) return { ok: false, error: "Operations summary returned nothing." };

  return {
    ok: true,
    ops: {
      stuckPublishes: row.stuck_publishes ?? 0,
      resultEmailsNeedingReview: row.result_emails_needing_review ?? 0,
      resultEmailsFailed: row.result_emails_failed ?? 0,
      resultEmailsPending: row.result_emails_pending ?? 0,
      noticeBatchesNeedingReview: row.notice_batches_needing_review ?? 0,
    },
  };
}

/**
 * Counts worth looking at, none of them hardcoded.
 *
 * Submission and account counts come back as numbers only. No submitter, no
 * username, no address: this page answers "how much", never "who".
 */
export async function getSiteStats(): Promise<{ ok: boolean; stats?: SiteStats; error?: string }> {
  if (!(await guard())) return { ok: false, error: "Not authorised." };

  const levels = getAllLevels();
  const cat = catalogStats(levels as unknown as { macros?: { recorder?: string }[] }[]);

  let pending: number | null = null;
  let processing: number | null = null;
  let accounts: number | null = null;

  const supabase = await createClient();
  if (supabase) {
    // RLS still applies. An admin sees every submission because the 2C policy
    // says so, not because this code asked nicely.
    const [p, pr] = await Promise.all([
      supabase.from("submissions").select("id", { count: "exact", head: true }).eq("status", "pending"),
      supabase.from("submissions").select("id", { count: "exact", head: true }).eq("status", "processing"),
    ]);
    pending = p.error ? null : (p.count ?? 0);
    processing = pr.error ? null : (pr.count ?? 0);

    // Accounts are counted through the privileged reader, which is the only
    // thing that can see auth.users. Only the LENGTH is used.
    try {
      const { isAuthAdminConfigured, listAccountIds } = await import("@/lib/supabase/auth-admin");
      if (isAuthAdminConfigured) accounts = (await listAccountIds()).ids.length;
    } catch {
      accounts = null;
    }
  }

  return {
    ok: true,
    stats: {
      levels: cat.levels,
      // getMacroCount is the catalog's own helper, so this number is the same
      // one the FAQ prints rather than a second opinion.
      macros: getMacroCount(),
      recorders: cat.recorders,
      pendingSubmissions: pending,
      processingSubmissions: processing,
      accounts,
      commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
      ref: process.env.VERCEL_GIT_COMMIT_REF ?? null,
      env: process.env.VERCEL_ENV ?? "development",
    },
  };
}
