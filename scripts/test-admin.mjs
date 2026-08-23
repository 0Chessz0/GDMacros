/**
 * Tests for the revamped admin portal: the three tools, the submission editor,
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

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const src = {
  hub: read("src/app/admin/page.tsx"),
  subs: read("src/app/admin/submissions/page.tsx"),
  notices: read("src/app/admin/notices/page.tsx"),
  status: read("src/app/admin/status/page.tsx"),
  queue: read("src/components/admin/ReviewQueue.tsx"),
  editor: read("src/components/admin/EditSubmission.tsx"),
  board: read("src/components/admin/StatusBoard.tsx"),
  editAction: read("src/lib/actions/submissionEdit.ts"),
  healthAction: read("src/lib/actions/health.ts"),
  migration: read("supabase/migrations/0008_admin_submission_edit.sql"),
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
]) {
  check(`the ${name} route exists`, fs.existsSync(path.join(ROOT, file)));
}

check("the hub offers exactly three tools", (src.hub.match(/href: "\/admin\//g) ?? []).length === 3);
check("the hub links check submissions", src.hub.includes('"/admin/submissions"'));
check("the hub links mail everyone", src.hub.includes('"/admin/notices"'));
check("the hub links statistics", src.hub.includes('"/admin/status"'));
check("the hub does not render the review queue itself", !/ReviewQueue/.test(src.hub));
check("the hub does not render the mail tool itself", !/LegalNotices/.test(src.hub));

/* Every page checks for itself. The hub having rendered is not a permission. */
for (const [name, text] of [
  ["hub", src.hub],
  ["submissions", src.subs],
  ["notices", src.notices],
  ["status", src.status],
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
    src.status.includes("next=/admin/status"),
);
check("the mail tool is unchanged, only relocated", /<LegalNotices/.test(src.notices));
check(
  "queue navigation points at the new route",
  /\/admin\/submissions\?status=/.test(src.queue) && !/"\/admin\?status/.test(src.queue),
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

check("the editor is reachable from the queue", /EditSubmission/.test(src.queue));
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
  !/\b(1[01][0-9]|2[0-9][0-9])\b/.test(src.board.replace(/[0-9]+ ?(ms|px|%)/g, "")),
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
check("the GitHub probe only reads a repo", /\/repos\/\$\{config\.GITHUB_ORG\}/.test(src.healthAction));
check("the Resend probe only lists domains", /domains\.list\(\)/.test(src.healthAction));
check("the Lanyard probe uses a configured owner", /OWNERS\[0\]\.discordId/.test(src.healthAction));
check("no probe accepts a caller-supplied target", !/function .*\(.*url.*\).*fetch/.test(src.healthAction));
check("upstream errors are passed through safeDetail", (src.healthAction.match(/safeDetail\(/g) ?? []).length >= 4);
check("no secret name is rendered by the board", !/RESEND_|SUPABASE_SECRET|GITHUB_PUBLISHER/.test(src.board));
check(
  "the board says why Vercel traffic stats are absent",
  /Vercel API token/.test(flat(src.board)),
);
check("checks are on demand, not on a timer", !/setInterval/.test(src.board));

/* ------------------------------------------------------------------ */

console.log(`\n${passed} passed, ${failed} failed`);
if (failures.length) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  - ${f}`);
}
process.exit(failed ? 1 : 0);
