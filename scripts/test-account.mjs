/**
 * Account experience regression checks: accepted history, catalog-credit
 * author pages, notifications, settings and submission-result email.
 *
 * No network, database or provider key is used. Pure catalog logic executes
 * through jiti; route, RLS and action wiring is asserted from source text.
 */
import { createJiti } from "jiti";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
let passed = 0;
let failed = 0;
const failures = [];
const check = (name, condition, detail = "") => {
  if (condition) passed++;
  else {
    failed++;
    failures.push(`${name}${detail ? ` -- ${detail}` : ""}`);
  }
};
const eq = (name, actual, expected) =>
  check(name, Object.is(actual, expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), "utf8");
const flat = (text) => text.replace(/\s+/g, " ");

const stub = path.join(ROOT, "node_modules", ".gdm-test-stubs");
fs.mkdirSync(stub, { recursive: true });
fs.writeFileSync(path.join(stub, "server-only.mjs"), "export {};\n");
const jiti = createJiti(path.join(ROOT, "scripts", "test-account.mjs"), {
  alias: { "server-only": path.join(stub, "server-only.mjs"), "@": path.join(ROOT, "src") },
  interopDefault: true,
  moduleCache: false,
});

const authors = await jiti.import(path.join(ROOT, "src/lib/authors.ts"));
const macros = await jiti.import(path.join(ROOT, "src/lib/macros.ts"));

const src = {
  migration: read("supabase/migrations/0011_account_experience.sql"),
  // Read in order so a later migration that moves a legal version wins, the
  // same way the database sees it.
  legalMigrations:
    read("supabase/migrations/0011_account_experience.sql") +
    read("supabase/migrations/0012_privacy_version_2026_08_24.sql"),
  authors: read("src/lib/authors.ts"),
  authorPage: read("src/app/author/[slug]/page.tsx"),
  macroPage: read("src/app/macro/[slug]/page.tsx"),
  sitemap: read("src/app/sitemap.ts"),
  submissionsPage: read("src/app/submissions/page.tsx"),
  submissionsUi: read("src/components/submissions/MySubmissions.tsx"),
  published: read("src/lib/publishedSubmissions.ts"),
  notificationsPage: read("src/app/notifications/page.tsx"),
  notificationsUi: read("src/components/notifications/NotificationCenter.tsx"),
  settingsPage: read("src/app/settings/page.tsx"),
  settingsUi: read("src/components/settings/SubmissionEmailSettings.tsx"),
  settingsAction: read("src/lib/actions/accountSettings.ts"),
  accountLink: read("src/components/AccountLink.tsx"),
  navbar: read("src/components/Navbar.tsx"),
  middleware: read("src/middleware.ts"),
  middlewareLib: read("src/lib/supabase/middleware.ts"),
  resultSender: read("src/lib/email/submissionResult.ts"),
  resultAction: read("src/lib/actions/submissionResultEmail.ts"),
  resultAdmin: read("src/lib/supabase/result-email-admin.ts"),
  submissionAction: read("src/lib/actions/submissions.ts"),
  publishAction: read("src/lib/actions/publish.ts"),
  publisher: read("src/lib/publish/publisher.ts"),
  privacy: read("src/app/privacy/page.tsx"),
  legal: read("src/lib/legal.ts"),
};

console.log("Catalog-credit authors");
const allAuthors = authors.getAllAuthors();
const allLevels = macros.getAllLevels();
const macroCount = allLevels.reduce((sum, level) => sum + level.macros.length, 0);
check("the catalog has author pages", allAuthors.length > 0);
eq("every macro appears under exactly one author", allAuthors.reduce((sum, author) => sum + author.macroCount, 0), macroCount);
eq("author slugs are unique", new Set(allAuthors.map((author) => author.slug)).size, allAuthors.length);
check("author names group without case sensitivity", allAuthors.filter((author) => author.name.toLowerCase() === "chesszdc").length === 1);
check("every slug resolves back to the same author", allAuthors.every((author) => authors.getAuthorBySlug(author.slug) === author));
check("name lookup ignores casing", authors.findAuthorByName("cHeSsZdC")?.name.toLowerCase() === "chesszdc");
check("the index is explicitly a catalog credit", /catalog credit/i.test(src.authors));
check("the public page is statically generated", /generateStaticParams/.test(src.authorPage) && /force-static/.test(src.authorPage));
check("the public page uses a placeholder avatar", /UserIcon/.test(src.authorPage));
check("the public page offers no avatar upload", !/type=["']file|upload.*avatar|change.*photo/i.test(src.authorPage));
check(
  "the profile page claims no disclaimer about ownership",
  !/not a verified account profile|does not identify who controls/i.test(flat(src.authorPage)),
  "the old credit-is-not-ownership disclaimer is back",
);
check(
  "the profile page says whose macros it lists",
  /Every macro on GDMacros credited to/i.test(flat(src.authorPage)),
);
check("the profile page is labelled a profile", /Profile/.test(src.authorPage));
check("macro detail links author credits", /\/author\/\$\{author\.slug\}/.test(src.macroPage));
check("author links are outside the download anchor", src.macroPage.indexOf("href={`/author/") < src.macroPage.indexOf("href={macro.downloadLink}"));
check("the sitemap includes every author page", /getAllAuthors/.test(src.sitemap) && /\/author\//.test(src.sitemap));

console.log("Accepted submission history");
check("the page queries the account ledger", /from\("published_submissions"\)/.test(src.submissionsPage));
check("the ledger is resolved by verified download URL", /downloadLink/.test(src.published) && /download_url/.test(src.published));
check("accepted links target the exact macro card", /#macro-\$\{macro\.position\}/.test(src.published));
check("the resolver never matches a username", !/username|profile/i.test(src.published));
check("accepted history is collapsible", /<details/.test(src.submissionsUi) && /<summary/.test(src.submissionsUi));
check("accepted history links live macros", /View live macro/.test(src.submissionsUi));
check(
  "the history explains why older macros are absent",
  /macros published before then are not in it/i.test(flat(src.submissionsUi)),
);
check("published history is owned by a UUID", /create table if not exists public\.published_submissions/i.test(src.migration) && /user_id\s+uuid/i.test(src.migration));
check("the ledger has owner-only RLS", /published_submissions[\s\S]*enable row level security/i.test(src.migration) && /auth\.uid\(\)[\s\S]*user_id/i.test(src.migration));
check("acceptance records the verified asset URL", /asset_url/i.test(src.migration) && /insert into public\.published_submissions/i.test(src.migration));
check("the finish RPC still requires live verification", /live_verified/i.test(src.migration));
check("history and notification commit in the same finish function", /finish_processing[\s\S]*published_submissions[\s\S]*submission_notifications/i.test(src.migration));

console.log("Notifications and settings");
for (const [name, text, route] of [
  ["notifications", src.notificationsPage, "/notifications"],
  ["settings", src.settingsPage, "/settings"],
]) {
  check(`${name} checks a user server side`, /getUserAndProfile/.test(text));
  check(`${name} redirects anonymous visitors`, new RegExp(`next=${route}`).test(text));
  check(`${name} is dynamic`, /dynamic = "force-dynamic"/.test(text));
  check(`${name} is not indexed`, /robots: \{ index: false/.test(text));
}
check("both routes are middleware protected", src.middleware.includes('"/settings/:path*"') && src.middleware.includes('"/notifications/:path*"'));
check("the session guard protects both routes", src.middlewareLib.includes('"/settings"') && src.middlewareLib.includes('"/notifications"'));
check("notifications track read time", /add column if not exists read_at/i.test(src.migration));
check("mark-read derives caller identity", /mark_submission_notifications_read[\s\S]*auth\.uid\(\)/i.test(src.migration));
check("notification table has no direct update grant", !/^\s*grant\s+update[^;]*submission_notifications/im.test(src.migration));
check("settings live outside public profiles", /create table if not exists public\.account_settings/i.test(src.migration));
check("settings save has no user-id parameter", /set_submission_email_preferences\(\s*p_accepted\s+boolean,\s*p_rejected\s+boolean/i.test(src.migration));
check("email toggles are independent", /email_submission_accepted/.test(src.settingsUi + src.settingsPage + src.migration) && /email_submission_rejected/.test(src.settingsUi + src.settingsPage + src.migration));
check("in-app results stay on when email is off", /always created, even when email is off/i.test(flat(src.settingsPage)));
check("settings contain no theme control", !/ThemeToggle|light mode|dark mode/i.test(src.settingsUi + src.settingsPage));
check("the global navbar keeps the theme control", /<ThemeToggle\s*\/>/.test(src.navbar));
check("the bell is inside the signed-in branch", src.accountLink.indexOf("if (!signedIn)") < src.accountLink.indexOf('href="/notifications"'));
check("settings are inside the signed-in account menu", src.accountLink.indexOf("if (!signedIn)") < src.accountLink.indexOf('href="/settings"'));
check("opening notification centre marks results read", /markNotificationsRead/.test(src.notificationsUi));
check("dismissing is still owner-scoped through the existing action", /dismissNotification/.test(src.notificationsUi));

console.log("Transactional result email");
check("the sender is server only", src.resultSender.startsWith('import "server-only"'));
check("the Resend key is never public", /RESEND_SUPPORT_API_KEY/.test(src.resultSender) && !/NEXT_PUBLIC_RESEND/.test(src.resultSender + src.resultAction));
check("each email uses a stable notification key", /submission-result\/\$\{notificationId\}/.test(src.resultSender));
check("the private outbox is not browser readable", /private\.submission_result_email_jobs/i.test(src.migration) && /revoke all[\s\S]*submission_result_email_jobs/i.test(src.migration));
check("frozen recipients are service-role only", /claim_submission_result_email\(uuid, uuid\)[\s\S]*revoke all[\s\S]*authenticated[\s\S]*grant execute[\s\S]*service_role/i.test(src.migration) && /result-email-admin/.test(src.resultAction));
check("the privileged queue wrapper is server only", src.resultAdmin.startsWith('import "server-only"'));
check("the raw privileged queue client is not exported", !/export\s+(?:const|function)\s+adminClient/.test(src.resultAdmin));
check("the outbox is triggered by result insertion", /after insert on public\.submission_notifications/i.test(src.migration));
check("disabled email does not prevent a notification", /return new/i.test(src.migration) && /email_submission_/i.test(src.migration));
check("the frozen payload is bounded", /html_body[\s\S]*check|constraint[\s\S]*html_body/i.test(src.migration));
check("ambiguous failures are retryable", /429/.test(src.resultSender) && />= 500/.test(src.resultSender));
check("repairable provider configuration failures remain retryable", /statusCode === 401/.test(src.resultSender) && /statusCode === 403/.test(src.resultSender));
check("unrepairable 4xx failures do not loop", /status: "failed"/.test(src.resultSender));
check("the owner retry is bounded", /i < 3/.test(src.resultAction));
check("missing queue configuration claims nothing", /if \(!isResultEmailQueueConfigured\) return/.test(src.resultAction));
check("missing sender configuration only runs the privacy sweep", /if \(!isSubmissionResultSenderConfigured\)[\s\S]{0,160}claimResultEmail\(null, null\)[\s\S]{0,80}return/.test(src.resultAction));
check("every claim receives a fresh lease identity", /lease_id\s*=\s*gen_random_uuid\(\)/i.test(src.migration));
check("recording requires the exact current lease", /record_submission_result_email[\s\S]*p_lease uuid[\s\S]*j\.lease_id = p_lease/i.test(src.migration));
check("late workers cannot move a replacement lease", /return found/i.test(src.migration) && /data === true/.test(src.resultAdmin));
check("record RPC errors are checked", /const \{ data, error \}[\s\S]*return !error && data === true/.test(src.resultAdmin));
check("attempted expired jobs are swept globally", /where j\.status in \('sending', 'retryable'\)[\s\S]*first_attempt_at is not null[\s\S]*23 hours/i.test(src.migration));
check("never-attempted jobs do not age out", /j\.first_attempt_at is null\s*or j\.first_attempt_at > now\(\) - interval '23 hours'/i.test(src.migration));
check("accept and reject both kick best-effort delivery", (src.submissionAction.match(/sendSubmissionResultBestEffort/g) ?? []).length >= 3);
check("the automated publisher parses the result envelope", /parseFinishEnvelope\(finishData\)/.test(src.publisher));
check("the automated publisher receives the email hook", /runPublish\(supabase, id, sendSubmissionResultBestEffort\)/.test(src.publishAction));
check("review RPC return stays deploy-compatible text", /finish_processing\(p_id uuid\)[\s\S]*returns text/i.test(src.migration) && /reject_submission\(p_id uuid, p_reason text\)[\s\S]*returns text/i.test(src.migration));
check("the action accepts both JSON envelopes and legacy paths", /JSON\.parse/.test(src.submissionAction) && /storagePath: data/.test(src.submissionAction));

console.log("Privacy");
//
// Derived, never hardcoded. These used to name the date, which meant every
// version bump also meant editing this file, and a test that must be edited
// on every release is one that eventually gets edited to whatever makes it
// pass. The only property worth asserting is that the app and the database
// agree.
//
const appPrivacyVersion = /PRIVACY_VERSION = "(\d{4}-\d{2}-\d{2})"/.exec(src.legal)?.[1] ?? null;
check("the app declares a privacy version", Boolean(appPrivacyVersion), String(appPrivacyVersion));
check(
  "privacy no longer separates credit from account ownership",
  !/matching credit is not verified|does not prove that an account owns/i.test(flat(src.privacy)),
);
check(
  "privacy states the username is the public name on your macros",
  /the name shown on macros you record/i.test(flat(src.privacy)),
);
check(
  "privacy discloses result email settings",
  /submission results, if you have those switched on in Settings/i.test(flat(src.privacy)),
);
check(
  "privacy says results still appear on the site with email off",
  /results still appear on the site/i.test(flat(src.privacy)),
);
check(
  "privacy discloses that a retry may hold the address",
  /copy of the destination address is held only for as long as the retry is safe/i.test(flat(src.privacy)),
);
check(
  "privacy says the held address is erased",
  /erased once the message is settled/i.test(flat(src.privacy)),
);
check(
  "privacy bounds how long a delivery record holds an address",
  /hold a destination address only while a retry could still need it/i.test(flat(src.privacy)),
);
check(
  "privacy still refuses to build a mailing list from them",
  /never used to build a mailing list/i.test(flat(src.privacy)),
);
{
  // Last write wins, exactly as the database sees it: an insert seeds the row,
  // a later update moves it.
  let dbPrivacyVersion = null;
  for (const m of src.legalMigrations.matchAll(
    /\('privacy',\s*'(\d{4}-\d{2}-\d{2})'/g,
  )) dbPrivacyVersion = m[1];
  for (const m of src.legalMigrations.matchAll(
    /set\s+version\s*=\s*'(\d{4}-\d{2}-\d{2})'[\s\S]{0,200}?where\s+doc\s*=\s*'privacy'/gi,
  )) dbPrivacyVersion = m[1];

  eq("the database mirrors the app's privacy version", dbPrivacyVersion, appPrivacyVersion);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failures.length) {
  console.log("\nFailures:");
  for (const failure of failures) console.log(`  - ${failure}`);
}
process.exit(failed ? 1 : 0);
