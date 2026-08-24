/**
 * Tests for the revamped admin portal: its six tools, the submission editor,
 * and the status board.
 *
 * Run with `npm run test:admin`. No network, no database, no keys.
 *
 * Behaviour is tested against the real pure modules; routing, authorisation and
 * copy are tested by reading the sources, because "every page re-checks the
 * role" is a wiring property and wiring is exactly what rots silently.
 */
import { createJiti } from "jiti";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

let passed = 0;
let failed = 0;
const failures = [];
const check = (name, cond, detail = "") => {
  if (cond) passed++;
  else {
    failed++;
    failures.push(`${name}${detail ? ` -- ${detail}` : ""}`);
  }
};
const eq = (name, a, b) =>
  check(name, Object.is(a, b), `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);

const STUB = path.join(ROOT, "node_modules", ".gdm-test-stubs");
fs.mkdirSync(STUB, { recursive: true });
fs.writeFileSync(path.join(STUB, "server-only.mjs"), "export {};\n");

const jiti = createJiti(path.join(ROOT, "scripts", "test-admin.mjs"), {
  alias: { "server-only": path.join(STUB, "server-only.mjs"), "@": path.join(ROOT, "src") },
  interopDefault: true,
  moduleCache: false,
});

const health = await jiti.import(path.join(ROOT, "src/lib/health.ts"));
const va = await jiti.import(path.join(ROOT, "src/lib/vercelAnalytics.ts"));
const rl = await jiti.import(path.join(ROOT, "src/lib/rateLimit.ts"));
const review = await jiti.import(path.join(ROOT, "src/lib/gdr2Review.ts"));

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const src = {
  hub: read("src/app/admin/page.tsx"),
  subs: read("src/app/admin/submissions/page.tsx"),
  notices: read("src/app/admin/notices/page.tsx"),
  status: read("src/app/admin/status/page.tsx"),
  inbox: read("src/app/admin/inbox/page.tsx"),
  activity: read("src/app/admin/activity/page.tsx"),
  quality: read("src/app/admin/quality/page.tsx"),
  queue: read("src/components/admin/ReviewQueue.tsx"),
  editor: read("src/components/admin/EditSubmission.tsx"),
  board: read("src/components/admin/StatusBoard.tsx"),
  editAction: read("src/lib/actions/submissionEdit.ts"),
  healthAction: read("src/lib/actions/health.ts"),
  middleware: read("src/proxy.ts"),
  migration: read("supabase/migrations/0008_admin_submission_edit.sql"),
  fix: read("supabase/migrations/0009_fix_admin_submission_edit.sql"),
  raceFix: read("supabase/migrations/0010_lock_submission_edits_before_publish.sql"),
  analytics: read("src/lib/vercelAnalytics.ts"),
  ops: read("supabase/migrations/0013_operations_visibility.sql"),
  cron: read("src/app/api/cron/maintenance/route.ts"),
  emailQueue: read("src/lib/email/resultQueue.ts"),
  resultAction: read("src/lib/actions/submissionResultEmail.ts"),
  searchRoute: read("src/app/api/search/route.ts"),
  ciWorkflow: read(".github/workflows/ci.yml"),
  vercelJson: read("vercel.json"),
  inspectAction: read("src/lib/actions/submissionInspect.ts"),
  inspectUi: read("src/components/admin/InspectSubmission.tsx"),
  gdr2: read("src/lib/gdr2.ts"),
};
const flat = (t) => t.replace(/\s+/g, " ");

/* ------------------------------------------------------------------ *
 * 1. The portal
 * ------------------------------------------------------------------ */
console.log("Admin portal");

for (const [name, file] of [
  ["submissions", "src/app/admin/submissions/page.tsx"],
  ["notices", "src/app/admin/notices/page.tsx"],
  ["status", "src/app/admin/status/page.tsx"],
  ["inbox", "src/app/admin/inbox/page.tsx"],
  ["activity", "src/app/admin/activity/page.tsx"],
  ["quality", "src/app/admin/quality/page.tsx"],
]) {
  check(`the ${name} route exists`, fs.existsSync(path.join(ROOT, file)));
}

check("the hub offers exactly six tools", (src.hub.match(/href: "\/admin\//g) ?? []).length === 6);
check("the hub links check submissions", src.hub.includes('"/admin/submissions"'));
check("the hub links mail everyone", src.hub.includes('"/admin/notices"'));
check("the hub links statistics", src.hub.includes('"/admin/status"'));
check("the hub links the support inbox", src.hub.includes('"/admin/inbox"'));
check("the hub links review activity", src.hub.includes('"/admin/activity"'));
check("the hub links random quality checks", src.hub.includes('"/admin/quality"'));
check("the hub does not render the review queue itself", !/ReviewQueue/.test(src.hub));
check("the hub does not render the mail tool itself", !/LegalNotices/.test(src.hub));

/* Every page checks for itself. The hub having rendered is not a permission. */
for (const [name, text] of [
  ["hub", src.hub],
  ["submissions", src.subs],
  ["notices", src.notices],
  ["status", src.status],
  ["inbox", src.inbox],
  ["activity", src.activity],
  ["quality", src.quality],
]) {
  check(`${name} re-checks the role server side`, /isCurrentUserAdmin\(\)/.test(text));
  check(`${name} 404s a non-admin rather than explaining`, /notFound\(\)/.test(text));
  check(`${name} requires a signed-in user`, /getUser\(\)/.test(text));
  check(`${name} is never statically cached`, /dynamic = "force-dynamic"/.test(text));
  check(`${name} is not indexable`, /robots: \{ index: false/.test(text));
}

check(
  "each tool page redirects to its own route after login",
  src.subs.includes("next=/admin/submissions") &&
    src.notices.includes("next=/admin/notices") &&
    src.status.includes("next=/admin/status") &&
    src.inbox.includes("next=/admin/inbox") &&
    src.activity.includes("next=/admin/activity") &&
    src.quality.includes("next=/admin/quality"),
);
check("the mail tool is unchanged, only relocated", /<LegalNotices/.test(src.notices));
check(
  "queue navigation points at the new route",
  /\/admin\/submissions\?status=/.test(src.queue) && !/"\/admin\?status/.test(src.queue),
);
check(
  "session refresh covers every admin subroute",
  /"\/admin\/:path\*"/.test(src.middleware),
  "new admin pages would otherwise miss the auth middleware",
);

/* ------------------------------------------------------------------ *
 * 2. Editing a submission
 * ------------------------------------------------------------------ */
console.log("Submission editing");

const mig = src.migration;
check("the editor has its own RPC", /create or replace function public\.admin_update_submission/.test(mig));
check("the RPC checks the role itself", /private\.is_admin\(\)/.test(mig));
check("the RPC pins search_path", /set search_path = ''/.test(mig));
check("the RPC is revoked from anon", /from anon;/.test(mig));
check("the RPC is security definer", /security definer/.test(mig));

check(
  "editing is refused once publishing has started",
  /v_state is not null and v_state <> 'not_started'/.test(mig),
  "an edit could rename an asset that is already uploaded",
);
check(
  "the guard reads the real publish state",
  /from private\.submission_publish_state/.test(mig),
);
check("only live submissions are editable", /not in \('pending', 'processing'\)/.test(mig));
check("the submitter cannot be reassigned", !/submitted_by\s*=/.test(mig));
check("the status cannot be changed here", !/set[\s\S]{0,200}status\s*=/.test(mig));
check("the notes are not rewritable", !/\bnotes\s*=/.test(mig));
check("the uploaded file is untouched", !/storage_path\s*=/.test(mig));

check(
  "null means leave alone, empty means clear",
  /when p_video_url is null then s\.video_url/.test(mig) && /when trim\(p_video_url\) = '' then null/.test(mig),
);

// The action re-derives from the upstreams rather than trusting typed text.
check("a changed level id is confirmed with GDBrowser", /lookupLevel\(levelId\)/.test(src.editAction));
check("the level name comes from GDBrowser, not the form", /p_level_name = level\.data\.name/.test(src.editAction));
check("the creator comes from GDBrowser too", /p_level_creator = level\.data\.creator/.test(src.editAction));
check("a video link is verified with YouTube", /verifyVideo\(videoId\)/.test(src.editAction));
check("the video is stored canonical", /canonicalUrl\(videoId\)/.test(src.editAction));
check("a non-YouTube link is refused", /does not look like a YouTube link/.test(src.editAction));
check("the recorder is checked against the allowed list", /RECORDERS as readonly string\[\]\)\.includes/.test(src.editAction));
check("the action checks the role before doing work", /isCurrentUserAdmin\(\)/.test(src.editAction));
check(
  "a publish-already-started refusal is explained rather than flattened",
  /publishing has already started/i.test(src.editAction),
);
check("nothing to change is refused", /Nothing to change/.test(src.editAction));

/* ---- the freeze trigger, which 0008 alone could never get past ---- */
{
  const freeze = read("supabase/migrations/0004_phase2c_fix_freeze_trigger.sql");
  const fix = src.fix;

  // The columns the editor writes are exactly the ones 0004 froze. Without
  // 0009 every edit raises, which is what actually happened on the preview.
  const editorColumns = ["level_name", "level_id", "level_creator", "video_url", "recorder", "macro_author"];
  check(
    "0004 really does freeze the columns the editor writes",
    editorColumns.every((c) => freeze.includes(`new.${c}`)),
    "the premise of this fix no longer holds",
  );

  check("0009 replaces the freeze trigger", /create or replace function private\.freeze_submission_fields/.test(fix));
  check("0009 replaces the editor too", /create or replace function public\.admin_update_submission/.test(fix));

  // The exception is one transaction-local flag, set by one function.
  check("the trigger looks for a transaction-local flag", /current_setting\('gdmacros\.content_edit', true\)/.test(fix));
  check("the editor raises that flag", /set_config\('gdmacros\.content_edit', 'on', true\)/.test(fix));
  check("the editor lowers it again", /set_config\('gdmacros\.content_edit', 'off', true\)/.test(fix));
  check(
    "the flag is transaction-local, so it cannot leak between requests",
    !/set_config\('gdmacros\.content_edit', '[a-z]+', false\)/.test(fix),
  );
  check(
    "exactly one function sets the flag",
    (fix.match(/set_config\('gdmacros\.content_edit'/g) ?? []).length === 2,
    "more than one place raises the edit flag",
  );

  // The flag must be raised only AFTER every check, never before.
  const body = fix.split("create or replace function public.admin_update_submission")[1] ?? "";
  const flagAt = body.indexOf("set_config('gdmacros.content_edit', 'on'");
  check("the flag is raised after the admin check", body.indexOf("private.is_admin()") < flagAt && flagAt > 0);
  check("the flag is raised after the publish-state check", body.indexOf("v_state is not null") < flagAt);
  check("the flag is raised after the status check", body.indexOf("not in ('pending', 'processing')") < flagAt);

  // Fields that are nobody's to correct stay frozen whatever the flag says.
  const always = fix.split("if not v_editing then")[0] ?? "";
  for (const col of ["id", "submitted_by", "notes", "file_size", "created_at"]) {
    check(`${col} stays frozen even during an edit`, always.includes(`new.${col}`), col);
  }
  check(
    "the submitter's notes are never editable",
    /new\.notes\s+is distinct from old\.notes/.test(always),
  );
}

/* ---- serialize the editor with the publisher's pending -> processing claim ---- */
{
  const raceFix = src.raceFix;
  const body = raceFix.split("create or replace function public.admin_update_submission")[1] ?? "";
  const lockAt = body.indexOf("for update");
  const pendingAt = body.indexOf("v_status <> 'pending'");
  const stateAt = body.indexOf("submission_publish_state");
  const flagAt = body.indexOf("set_config('gdmacros.content_edit', 'on'");

  check("0010 replaces the editor RPC", /create or replace function public\.admin_update_submission/.test(raceFix));
  check("0010 locks the submission row", /select s\.status into v_status[\s\S]{0,160}for update;/.test(body));
  check("the final editor only accepts pending rows", /if v_status <> 'pending'/.test(body));
  check(
    "any existing publish state blocks an edit",
    /if exists \([\s\S]{0,220}private\.submission_publish_state/.test(body),
  );
  check("the row is locked before status is trusted", lockAt > 0 && lockAt < pendingAt);
  check("every race guard runs before the trigger bypass", pendingAt < flagAt && stateAt < flagAt);
  check("the final editor still checks the admin role", /private\.is_admin\(\)/.test(body));
  check("the final editor still pins search_path", /set search_path = ''/.test(raceFix));
  check(
    "the trigger bypass remains transaction-local",
    !/set_config\('gdmacros\.content_edit', '[a-z]+', false\)/.test(raceFix),
  );
}

/* ---- the failure the user actually saw must now be legible ---- */
check(
  "an immutable-content refusal names the missing migration",
  /Migration 0009 has not been applied/.test(src.editAction),
  "the reviewer would see a generic failure again",
);
check(
  "a missing function names the missing migration",
  /Migration 0008 has not been applied/.test(src.editAction),
);
check(
  "any other database error is surfaced rather than swallowed",
  /Could not update: \$\{safeDetail\(/.test(src.editAction),
  "the generic message is back",
);
check("surfaced errors still go through safeDetail", /safeDetail\(raw/.test(src.editAction));

check("the editor is reachable from the queue", /EditSubmission/.test(src.queue));
check("a successful publish claim closes the editor", /setClaimed\(true\);\s*setEditing\(false\);\s*setOpen\(true\)/.test(src.queue));
check("the editor only renders while still pending", /editing && status === "pending"/.test(src.queue));
check("the editor sends only what changed", /!== row\.macro_author \? macroAuthor\.trim\(\) : undefined/.test(src.editor));
check("the notes are shown but not editable", !/notes/i.test(src.editor.replace(/NOTES are shown but not editable[\s\S]{0,80}/i, "")));
check("clearing the video is possible", /Leave the video empty to remove it/.test(flat(src.editor)));
check("the name is locked when the id changes", /disabled=\{idChanged\}/.test(src.editor));

/* ------------------------------------------------------------------ *
 * 3. Status board
 * ------------------------------------------------------------------ */
console.log("Status board");

eq("seven services are checked", health.CHECK_IDS.length, 7);
for (const id of ["supabase", "github", "vercel", "gdbrowser", "youtube", "resend", "lanyard"]) {
  check(`${id} is one of them`, health.CHECK_IDS.includes(id));
  check(`${id} has a label`, Boolean(health.CHECK_LABELS[id]));
  check(`${id} has a description`, Boolean(health.CHECK_DESCRIPTIONS[id]));
}

const r = (id, state, ms = 100) => ({ id, label: id, state, ms, detail: "" });
eq("all ok is ok", health.overallState([r("a", "ok"), r("b", "ok")]), "ok");
eq("one degraded degrades the whole", health.overallState([r("a", "ok"), r("b", "degraded")]), "degraded");
eq("one down beats a degraded", health.overallState([r("a", "degraded"), r("b", "down")]), "down");
eq("nothing checked reads as ok", health.overallState([]), "ok");

const counts = health.countByState([r("a", "ok"), r("b", "ok"), r("c", "down")]);
eq("counts ok", counts.ok, 2);
eq("counts down", counts.down, 1);
eq("counts degraded", counts.degraded, 0);

check("a fast ok is not slow", !health.isSlow(r("a", "ok", 100)));
check("a slow ok is flagged", health.isSlow(r("a", "ok", 5000)));
check("a down service is not also flagged slow", !health.isSlow(r("a", "down", 9000)));
check("every state has a label", ["ok", "degraded", "down"].every((s) => health.STATE_LABEL[s]));
check("every state has a distinct dot", new Set(["ok", "degraded", "down"].map((s) => health.STATE_DOT[s])).size === 3);

/* Details must never carry a credential. */
eq("a plain message survives", health.safeDetail("Not found"), "Not found");
eq("an Error message survives", health.safeDetail(new Error("Boom")), "Boom");
eq("an empty message falls back", health.safeDetail(""), "Failed");
eq("a null falls back", health.safeDetail(null), "Failed");
check("newlines are collapsed", !health.safeDetail("a\n\nb").includes("\n"));
check("a long message is capped", health.safeDetail("x".repeat(500)).length <= 120);

for (const secret of [
  "bad key re_abc123def456",
  "whsec_abcdef1234567890",
  "Authorization: Bearer abc.def.ghi",
  "eyJhbGciOiJIUzI1NiJ9.payload",
  "token ghp_0123456789abcdef",
  "https://x/y?token=abcdef123456",
  "https://x/y?signature=deadbeef",
]) {
  eq(`a credential-looking detail is refused: ${secret.slice(0, 22)}`, health.safeDetail(secret), "Failed");
}

// Catalog statistics are derived, never hardcoded.
const cat = health.catalogStats([
  { macros: [{ recorder: "xdBot" }, { recorder: "Mega Hack" }] },
  { macros: [{ recorder: "xdBot" }] },
]);
eq("levels counted", cat.levels, 2);
eq("macros counted", cat.macros, 3);
eq("the busiest recorder is first", cat.recorders[0].recorder, "xdBot");
eq("its count is right", cat.recorders[0].count, 2);
eq("an empty catalog counts zero", health.catalogStats([]).macros, 0);
check("a level with no macros does not throw", health.catalogStats([{}]).levels === 1);
check("a missing recorder is bucketed, not dropped", health.catalogStats([{ macros: [{}] }]).recorders[0].recorder === "Unknown");

const real = JSON.parse(read("data/macros.json"));
const realStats = health.catalogStats(real);
eq("the real catalog counts its own levels", realStats.levels, real.length);
check("the real catalog has macros", realStats.macros > 0, String(realStats.macros));
check(
  "no catalog total is hardcoded in the board",
  // Layout numbers are not data. Percentages, pixel sizes and the sparkline's
  // own scaling maths are stripped before looking for a stray catalog total.
  !/\b(1[01][0-9]|2[0-9][0-9])\b/.test(
    src.board.replace(/[0-9]+ ?(ms|px|%)/g, "").replace(/\* 100|Math\.max\([^)]*\)|slice\([^)]*\)/g, ""),
  ),
  "a literal count appears in the status board",
);

/* Authorisation and safety of the probes. */
check("the health action checks the role", /isCurrentUserAdmin\(\)/.test(src.healthAction));
check("the stats action checks the role too", /guard\(\)/.test(src.healthAction));
check("every probe has a timeout", /CHECK_TIMEOUT_MS/.test(src.healthAction));
check("probes run in parallel", /Promise\.all\(\[/.test(src.healthAction));
check(
  "no probe writes anything",
  !/\.(insert|update|upsert|delete)\(|\.send\(|\.batch\./.test(src.healthAction),
  "a status probe mutates state",
);
check(
  "the GitHub probe reads both publishing repositories",
  /config\.SOURCE_REPO/.test(src.healthAction) &&
    /config\.DOWNLOADS_REPO/.test(src.healthAction) &&
    /const \[source, downloads\] = await Promise\.all/.test(src.healthAction),
);
check("the Resend probe only lists domains", /domains\.list\(\)/.test(src.healthAction));
check("the Lanyard probe uses a configured owner", /OWNERS\[0\]\.discordId/.test(src.healthAction));
check("no probe accepts a caller-supplied target", !/function .*\(.*url.*\).*fetch/.test(src.healthAction));
check("upstream errors are passed through safeDetail", (src.healthAction.match(/safeDetail\(/g) ?? []).length >= 4);
check("no secret name is rendered by the board", !/RESEND_|SUPABASE_SECRET|GITHUB_PUBLISHER/.test(src.board));
check(
  "the board explains how to turn traffic on when it is off",
  /Vercel access token/.test(flat(src.board)) &&
    /Traffic is not configured here/.test(flat(src.board)) &&
    !/project-scoped/i.test(flat(src.board)),
);
check("the board renders traffic when it is available", /Vercel Web Analytics/.test(src.board));
check("the traffic chart has an accessible label", /aria-label=/.test(src.board));
check("an unexpected action failure clears the loading state", /finally \{[\s\S]{0,80}setBusy\(false\)/.test(src.board));
check("checks are on demand, not on a timer", !/setInterval/.test(src.board));

/* ------------------------------------------------------------------ *
 * 4. Vercel Web Analytics
 * ------------------------------------------------------------------ */
console.log("Vercel traffic");

/* Endpoint shape, taken from Vercel's documented API rather than invented. */
const target = { projectId: "prj_abc", teamId: "team_xyz" };
const aggUrl = new URL(
  va.analyticsUrl("visits/aggregate", target, { since: "2026-08-01", until: "2026-08-07", by: "day" }),
);
eq("the documented host", aggUrl.host, "api.vercel.com");
eq("the documented path", aggUrl.pathname, "/v1/query/web-analytics/visits/aggregate");
eq("project id is sent", aggUrl.searchParams.get("projectId"), "prj_abc");
eq("team id is sent", aggUrl.searchParams.get("teamId"), "team_xyz");
eq("the grouping is sent", aggUrl.searchParams.get("by"), "day");
eq("the range is sent", aggUrl.searchParams.get("since"), "2026-08-01");

const countUrl = new URL(
  va.analyticsUrl("visits/count", target, { since: "2026-08-01", until: "2026-08-07" }),
);
eq("the documented count path", countUrl.pathname, "/v1/query/web-analytics/visits/count");
eq("the count uses the same start date", countUrl.searchParams.get("since"), "2026-08-01");
eq("the count uses the same end date", countUrl.searchParams.get("until"), "2026-08-07");

// An empty teamId is NOT the same as omitting it, and the API rejects it.
check(
  "a personal account omits teamId entirely",
  !new URL(va.analyticsUrl("visits/count", { projectId: "prj_abc" })).searchParams.has("teamId"),
);
check(
  "a blank teamId is omitted too",
  !new URL(va.analyticsUrl("visits/count", { projectId: "p", teamId: "" })).searchParams.has("teamId"),
);
check(
  "an undefined param is dropped",
  !new URL(va.analyticsUrl("visits/count", target, { limit: undefined })).searchParams.has("limit"),
);

/* The window must stay inside the smallest plan's reporting window. */
const NOW = new Date("2026-08-22T10:00:00Z");
eq("the window ends today", va.analyticsWindow(NOW).until, "2026-08-22");
eq("seven days back, inclusive", va.analyticsWindow(NOW).since, "2026-08-16");
eq("a huge request is clamped", va.analyticsWindow(NOW, 9999).since, "2026-07-26");
eq("a zero request still asks for one day", va.analyticsWindow(NOW, 0).since, "2026-08-22");
check("the clamp stays inside the Hobby reporting window", va.MAX_WINDOW_DAYS <= 28);

/* Parsing an unpredictable third-party response must never throw. */
const days = va.parseDays({
  version: 1,
  data: [
    { timestamp: "2026-08-17T00:00:00.000Z", pageviews: 245, visitors: 201 },
    { timestamp: "2026-08-16T00:00:00.000Z", pageviews: 220, visitors: 180 },
  ],
});
eq("both days parse", days.length, 2);
eq("days are sorted oldest first", days[0].day, "2026-08-16");
eq("the time component is dropped", days[1].day, "2026-08-17");
eq("pageviews survive", days[1].pageviews, 245);

const pages = va.parsePages({
  data: [
    { requestPath: "/macro/acheron", pageviews: 100, visitors: 80 },
    { requestPath: "/", pageviews: 400, visitors: 300 },
    { requestPath: "Others", pageviews: 900, visitors: 700 },
  ],
});
eq("pages are sorted busiest first", pages[0].path, "/");
eq("page views survive", pages[0].pageviews, 400);
check("the Others bucket is not presented as a page", !pages.some((page) => page.path === "Others"));
eq("a row with no path rejects the page breakdown", va.parsePages({ data: [{ pageviews: 5 }] }), null);

const totals = va.parseTotals({ data: { pageviews: 500, visitors: 300 } });
check("the count response parses", Boolean(totals));
eq("counted pageviews survive", totals?.pageviews, 500);
eq("counted visitors survive", totals?.visitors, 300);
eq("an invalid count response is rejected", va.parseTotals({ data: [] }), null);
eq("a partial count response is rejected", va.parseTotals({ data: { pageviews: 5 } }), null);

for (const [label, bad] of [
  ["null", null],
  ["a string", "no"],
  ["no data key", { version: 1 }],
  ["data is not an array", { data: {} }],
  ["a null row", { data: [null] }],
  ["non-numeric counts", { data: [{ timestamp: "2026-08-16T00:00:00.000Z", pageviews: "many" }] }],
]) {
  let threw = false;
  try {
    va.parseDays(bad);
    va.parsePages(bad);
    va.parseTotals(bad);
  } catch {
    threw = true;
  }
  check(`a malformed analytics response does not throw: ${label}`, !threw);
}
eq(
  "a malformed daily row rejects the breakdown",
  va.parseDays({
    data: [{ timestamp: "2026-08-16T00:00:00.000Z", pageviews: "many", visitors: 2 }],
  }),
  null,
);

const summary = va.summarise({ since: "a", until: "b" }, totals, days, pages);
eq("the exact count supplies pageview totals", summary.pageviews, 500);
eq("daily unique visitors are not incorrectly added together", summary.visitors, 300);
eq("the daily chart is preserved", summary.days.length, 2);
eq("the page breakdown is preserved", summary.pages.length, 2);
const partial = va.summarise({ since: "a", until: "b" }, totals, null, null);
eq("missing daily data stays unavailable", partial.days, null);
eq("missing page data stays unavailable", partial.pages, null);

check("analytics is optional", !va.isAnalyticsConfigured({ projectId: "" }, "tok"));
check("whitespace-only analytics config is absent", !va.isAnalyticsConfigured({ projectId: "  " }, "  "));
check("a token alone is not enough", !va.isAnalyticsConfigured({}, "tok"));
check("a project alone is not enough", !va.isAnalyticsConfigured({ projectId: "prj" }, undefined));
check("both together are enough", va.isAnalyticsConfigured({ projectId: "prj" }, "tok"));

/* The token must never escape the server. */
check("the pure module holds no token", !/process\.env/.test(src.analytics));
check("the action reads the token server side", /process\.env\.VERCEL_ANALYTICS_TOKEN/.test(src.healthAction));
check("the token is sent as a bearer header", /Bearer \$\{token\}/.test(src.healthAction));
check("exact period totals use the count endpoint", /analyticsUrl\("visits\/count", target, win\)/.test(src.healthAction));
check("top pages use exact request paths", /by: "requestPath"/.test(src.healthAction));
eq("all three analytics queries use the same window", (src.healthAction.match(/\.\.\.win|target, win/g) ?? []).length, 3);
check("optional analytics requests settle independently", /Promise\.allSettled\(\[/.test(src.healthAction));
check("failed aggregates remain unavailable, not fake zeroes", /days === null[\s\S]{0,100}pages === null/.test(src.healthAction));
check("partial analytics is identified in the panel", /Some analytics breakdowns are unavailable/.test(src.healthAction));
check("a blank explicit project id falls back to Vercel's system id", /explicitProjectId \|\| automaticProjectId/.test(src.healthAction));
check("a missing token degrades rather than errors", /traffic: null/.test(src.healthAction));
check(
  "traffic can never break the status page",
  /catch \{[\s\S]{0,200}traffic: null/.test(src.healthAction),
  "an analytics failure could take the page down",
);
check("the traffic action is admin gated", /getTrafficStats[\s\S]{0,400}guard\(\)/.test(src.healthAction));
check(
  "no analytics error carries the request url",
  !/analyticsUrl[\s\S]{0,120}error:/.test(src.healthAction),
  "a url carrying the token could reach the browser",
);
check("the token name never reaches the client component", !/VERCEL_ANALYTICS_TOKEN/.test(src.board));

/* ------------------------------------------------------------------ *
 * 5. Operations: CI, stuck work, rate limiting, the nightly job
 * ------------------------------------------------------------------ */
console.log("Operations");

/* ---- every suite actually runs in CI ---- */
for (const suite of ["publish", "migrate", "email", "legal", "admin", "account", "translate"]) {
  check(`CI runs test:${suite}`, src.ciWorkflow.includes(`npm run test:${suite}`),
    "a suite that nothing runs is documentation with a worse format");
}
check("CI still validates the catalog", /npm run validate/.test(src.ciWorkflow));
check("CI still typechecks and builds", /tsc --noEmit/.test(src.ciWorkflow) && /npm run build/.test(src.ciWorkflow));
check("CI runs on pull requests", /pull_request/.test(src.ciWorkflow));

/* ---- stuck work is visible, as counts only ---- */
check("the summary RPC exists", /create or replace function public\.admin_operations_summary/.test(src.ops));
check("it checks the admin role itself", /private\.is_admin\(\)/.test(src.ops));
check("it pins search_path", /set search_path = ''/.test(src.ops));
check("it is revoked from anon", /from anon;/.test(src.ops));
check("it counts stuck publications", /submission_publish_state[\s\S]{0,120}last_error is not null/.test(src.ops));
check("it counts result emails needing review", /submission_result_email_jobs[\s\S]{0,120}needs_review/.test(src.ops));
check("it counts notice batches needing review", /legal_notice_deliveries[\s\S]{0,120}needs_review/.test(src.ops));
check(
  "it returns no identifying column",
  !/select[\s\S]{0,400}(recipient_email|user_id|submission_id|level_name)/.test(
    src.ops.split("return query")[1] ?? "",
  ),
  "the status board would leak who is affected",
);
check("the board renders the attention panel", /Needs attention/.test(src.board));
check("a missing migration is named rather than generic", /Migration 0013 has not been applied/.test(src.healthAction));

// Pending is shown but must not trigger the alarm: every accept passes through
// it for a moment.
{
  const quiet = { stuckPublishes: 0, resultEmailsNeedingReview: 0, resultEmailsFailed: 0, resultEmailsPending: 5, noticeBatchesNeedingReview: 0 };
  check("queued email alone is not an alarm", !health.needsAttention(quiet));
  check("a stuck publish is an alarm", health.needsAttention({ ...quiet, stuckPublishes: 1 }));
  check("a failed email is an alarm", health.needsAttention({ ...quiet, resultEmailsFailed: 1 }));
  check("an ambiguous email is an alarm", health.needsAttention({ ...quiet, resultEmailsNeedingReview: 1 }));
  check("an ambiguous notice batch is an alarm", health.needsAttention({ ...quiet, noticeBatchesNeedingReview: 1 }));
  check("nothing stuck is quiet", !health.needsAttention({ ...quiet, resultEmailsPending: 0 }));
}

/* ---- the search rate limit ---- */
{
  rl.__resetRateLimits();
  const NOW = 1_000_000;
  let allowed = 0;
  for (let i = 0; i < 25; i++) if (rl.rateLimit("u1", 20, 60_000, NOW).ok) allowed++;
  eq("the limit is enforced", allowed, 20);

  const blocked = rl.rateLimit("u1", 20, 60_000, NOW);
  check("a blocked call says how long to wait", blocked.retryAfter > 0 && blocked.retryAfter <= 60);
  check("another account is unaffected", rl.rateLimit("u2", 20, 60_000, NOW).ok);

  // Sliding, not fixed: the window must not hand out a fresh allowance at a
  // boundary, which would double the burst at exactly the wrong moment.
  check("still blocked just before the window ends", !rl.rateLimit("u1", 20, 60_000, NOW + 59_000).ok);
  check("allowed once the window has passed", rl.rateLimit("u1", 20, 60_000, NOW + 61_000).ok);

  check("the route applies it per account", /rateLimit\(`search:\$\{user\.id\}`/.test(src.searchRoute));
  check("the route answers 429 with Retry-After", /status: 429/.test(src.searchRoute) && /Retry-After/.test(src.searchRoute));
  check("the limit runs after authentication", src.searchRoute.indexOf("getUser()") < src.searchRoute.indexOf("rateLimit("));
}

/* ---- the nightly job ---- */
check("a cron entry exists", /"path": "\/api\/cron\/maintenance"/.test(src.vercelJson));
check(
  "the schedule is daily at most",
  // Hobby refuses anything more frequent AT DEPLOY TIME, so a stray */15 would
  // not be a slow job, it would be a failed deployment.
  !/"schedule":\s*"[^"]*\*\/\d/.test(src.vercelJson),
  "a sub-daily expression fails deployment on Hobby",
);
check("the job requires the shared secret", /Bearer \$\{secret/.test(src.cron));
check(
  "the secret comparison is constant time",
  /timingSafeEqual/.test(src.cron),
  "=== returns early on the first wrong byte, which is a timing oracle",
);
check(
  "a length mismatch is refused before comparing",
  /a\.length !== b\.length/.test(src.cron),
  "timingSafeEqual throws on unequal buffers",
);
check(
  "the header is trimmed before comparison",
  /authorization"\)\?\.trim\(\)/.test(src.cron),
  "HTTP strips edge whitespace from a field value",
);
check("a missing secret refuses rather than allows", /!secret \|\|/.test(src.cron));
{
  // Comments stripped: the doc comment says the job logs no recipient, which is
  // the opposite of the thing being looked for.
  const cronCode = src.cron.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  check(
    "the job reports counts only",
    !/recipient|email_address|notification_id/.test(cronCode),
    "the cron log would carry an identifying value",
  );
}
check("the drain is bounded", /max = 20/.test(src.emailQueue) && /Math\.max\(1, max\)/.test(src.emailQueue));
check("the drain stops on the first failure", /result\.failed\+\+;\s*break;/.test(src.emailQueue));

check(
  "the drain is NOT a server action",
  // Comments stripped: the module's own doc comment explains why it is not a
  // server action, and therefore contains the exact directive being looked for.
  !/"use server"/.test(
    src.emailQueue.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, ""),
  ) && /import "server-only"/.test(src.emailQueue),
  "an ownerless drain exported from a use-server file would be a public way to make the server send mail",
);
check("the owner-scoped actions reuse the same worker", /claimAndSendResultEmail/.test(src.resultAction));
check(
  "the actions file no longer keeps its own copy",
  !/async function recordOutcome/.test(src.resultAction),
  "lease handling would exist in two places",
);


/* ------------------------------------------------------------------ *
 * 6. Reading an uploaded macro's own header
 * ------------------------------------------------------------------ */
console.log("Submission inspection");

/**
 * A header as the two recorders actually produce them.
 *
 * The distinguishing field is the extension block, not the declared bot name:
 * every file in this catalog says xdBot, including the ones published as Mega
 * Hack, because they are all xdBot recordings and some have been converted.
 * Verified against 24 real catalog files, twelve of each recorder, with total
 * separation.
 */
const header = (over = {}) => ({
  version: 2,
  botName: "xdBot",
  botVersion: 1,
  levelId: 73667628,
  levelName: "Acheron",
  duration: 66.15,
  framerate: 240,
  gameVersion: 22,
  platformer: false,
  lowDetail: false,
  coins: 0,
  author: "",
  description: "",
  extensionBytes: 452049,
  ...over,
});
const claim = (over = {}) => ({ levelId: "73667628", levelName: "Acheron", recorder: "xdBot", ...over });
const byId = (list, id) => list.find((f) => f.id === id);
const hash = (c) => c.repeat(64);

/* ---- the recorder inference ---- */
eq("an extension block means xdBot", review.recorderFromFile(header()), "xdBot");
eq("no extension block means Mega Hack", review.recorderFromFile(header({ extensionBytes: 0 })), "Mega Hack");
check(
  "the declared bot name is NOT used",
  review.recorderFromFile(header({ botName: "Mega Hack", extensionBytes: 452049 })) === "xdBot",
  "every catalog file declares xdBot, so trusting the name would agree with itself",
);

/* ---- the exact bug this was built for ---- */
{
  // squeak: a converted file (no extension block) submitted as xdBot.
  const f = review.reviewFindings(header({ extensionBytes: 0 }), claim({ recorder: "xdBot" }), 579, hash("a"));
  const rec = byId(f, "recorder");
  eq("a converted file submitted as xdBot is flagged", rec.level, "warn");
  eq("and it names what the file looks like", rec.value, "Mega Hack");
  check("the note explains the evidence", /extension block is absent/i.test(rec.note ?? ""));
  check("the whole report is marked as needing a look", review.hasWarnings(f));
}
{
  // The mirror: a raw recording submitted as Mega Hack.
  const f = review.reviewFindings(header(), claim({ recorder: "Mega Hack" }), 452637, hash("b"));
  eq("a raw file submitted as Mega Hack is flagged", byId(f, "recorder").level, "warn");
}
{
  const f = review.reviewFindings(header(), claim(), 452637, hash("c"));
  eq("a matching recorder is not flagged", byId(f, "recorder").level, "ok");
  check("and nothing else is either", !review.hasWarnings(f));
}

/* ---- the level the recording is for ---- */
{
  const f = review.reviewFindings(header(), claim({ levelId: "128" }), 1000, hash("d"));
  const lvl = byId(f, "level");
  eq("a level mismatch is flagged", lvl.level, "warn");
  check("the note names the submitted id", /128/.test(lvl.note ?? ""));
  check("the value names the id in the file", /73667628/.test(lvl.value));
}
check(
  "a matching level is not flagged",
  byId(review.reviewFindings(header(), claim(), 1000, hash("e")), "level").level === "ok",
);
check(
  "whitespace around a submitted id does not cause a false mismatch",
  byId(review.reviewFindings(header(), claim({ levelId: " 73667628 " }), 1000, hash("f")), "level").level === "ok",
);

/* ---- context rows ---- */
{
  const f = review.reviewFindings(header({ framerate: 30 }), claim(), 1000, hash("g"));
  eq("a low framerate is flagged", byId(f, "framerate").level, "warn");
  check("the note explains desync", /desync/i.test(byId(f, "framerate").note ?? ""));
}
eq(
  "240 fps is not flagged",
  byId(review.reviewFindings(header(), claim(), 1000, hash("h")), "framerate").level,
  "info",
);
eq(
  "a missing framerate is not invented",
  byId(review.reviewFindings(header({ framerate: null }), claim(), 1000, hash("i")), "framerate").value,
  "not recorded",
);
eq(
  "a missing duration is not invented",
  byId(review.reviewFindings(header({ duration: null }), claim(), 1000, hash("j")), "duration").value,
  "not recorded",
);
check(
  "a long recording reads in minutes",
  /1m/.test(byId(review.reviewFindings(header({ duration: 66.15 }), claim(), 1000, hash("k")), "duration").value),
);
check(
  "the declared bot is shown but explained as a different question",
  /not the same question/i.test(
    byId(review.reviewFindings(header(), claim(), 1000, hash("l")), "declaredBot").note ?? "",
  ),
);
check(
  "platformer is only mentioned when true",
  !byId(review.reviewFindings(header(), claim(), 1000, hash("m")), "platformer") &&
    Boolean(byId(review.reviewFindings(header({ platformer: true }), claim(), 1000, hash("n")), "platformer")),
);
check(
  "the hash is shortened rather than dumped",
  byId(review.reviewFindings(header(), claim(), 1000, hash("z")), "sha256").value.length < 64,
);

/* ---- duplicate detection ---- */
{
  const cat = [
    { name: "Acheron", levelId: "73667628", macros: [{ recorder: "xdBot", author: "Zoink" }] },
  ];
  const dup = review.findExistingEntry(cat, claim({ recorder: "xdBot" }));
  check("an existing entry for the same level and recorder is found", dup?.author === "Zoink");
  check(
    "a different recorder on that level is not a duplicate",
    review.findExistingEntry(cat, claim({ recorder: "Mega Hack" })) === null,
  );
  check("an unknown level is not a duplicate", review.findExistingEntry(cat, claim({ levelId: "1" })) === null);
  check("an empty catalog is handled", review.findExistingEntry([], claim()) === null);
}

/* ---- the parser and the action ---- */
check(
  "the metadata reader is separate from the upload gate",
  /export function readGdr2Metadata/.test(src.gdr2) && /export function checkGdr2/.test(src.gdr2),
);
check("the reader returns null rather than throwing", /catch \{[\s\S]{0,60}return null/.test(src.gdr2));
check("the action checks the admin role", /isCurrentUserAdmin\(\)/.test(src.inspectAction));
check(
  "the claim comes from the row, not the caller",
  /from\("submissions"\)[\s\S]{0,300}\.eq\("id", id\)/.test(src.inspectAction),
  "otherwise a modified request could compare the file against invented details",
);
check("it reads the private object server side", /downloadSubmissionObject/.test(src.inspectAction));
check(
  "it writes nothing",
  // Scoped to query-builder writes. A bare /\.update\(/ also matches
  // createHash(...).update(bytes), which is the hash being fed, not a row
  // being changed.
  !/\.from\("[^"]+"\)[\s\S]{0,120}\.(insert|update|upsert|delete)\(/.test(src.inspectAction) &&
    !/\.rpc\(|publishMacro|approveSubmission/.test(src.inspectAction),
  "inspection must not be able to change a submission",
);
check("the file is hashed for identity", /createHash\("sha256"\)/.test(src.inspectAction));
check("it is loaded on demand, not with the queue", /Inspect file/.test(src.inspectUi));
check("the queue offers it", /InspectSubmission/.test(src.queue));


/* ------------------------------------------------------------------ */

console.log(`\n${passed} passed, ${failed} failed`);
if (failures.length) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  - ${f}`);
}
process.exit(failed ? 1 : 0);
