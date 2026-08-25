/**
 * Support inbox and operational admin-tool regression checks.
 *
 * Offline by design: no Supabase, Resend, GitHub or Vercel call is made. Pure
 * error mapping executes directly; database boundaries and route wiring are
 * asserted from source because those are the parts most likely to regress.
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
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), "utf8");
const exists = (relative) => fs.existsSync(path.join(ROOT, relative));
const flat = (text) => text.replace(/\s+/g, " ");

const jiti = createJiti(path.join(ROOT, "scripts", "test-support.mjs"), {
  alias: { "@": path.join(ROOT, "src") },
  interopDefault: true,
  moduleCache: false,
});
const support = await jiti.import(path.join(ROOT, "src/lib/supportTickets.ts"));

const src = {
  migration: read("supabase/migrations/0014_support_inbox_and_admin_tools.sql"),
  replyMigration: read("supabase/migrations/0015_support_reply_notifications.sql"),
  actions: read("src/lib/actions/supportTickets.ts"),
  adminActions: read("src/lib/actions/adminTools.ts"),
  email: read("src/lib/email/supportTicket.ts"),
  emailQueue: read("src/lib/email/supportTicketQueue.ts"),
  emailAdmin: read("src/lib/supabase/support-ticket-email-admin.ts"),
  report: read("src/components/ReportBroken.tsx"),
  banner: read("src/components/support/OpenTicketBanner.tsx"),
  thread: read("src/components/support/TicketThread.tsx"),
  suggestion: read("src/components/support/SuggestionForm.tsx"),
  supportPage: read("src/app/support/page.tsx"),
  newPage: read("src/app/support/new/page.tsx"),
  ticketPage: read("src/app/support/tickets/[id]/page.tsx"),
  inbox: read("src/app/admin/inbox/page.tsx"),
  activity: read("src/app/admin/activity/page.tsx"),
  quality: read("src/app/admin/quality/page.tsx"),
  qualityUi: read("src/components/admin/QualityCheckCard.tsx"),
  bans: read("src/components/admin/SupportTicketBans.tsx"),
  bulk: read("src/components/admin/BulkPublishPanel.tsx"),
  queue: read("src/components/admin/ReviewQueue.tsx"),
  publish: read("src/lib/actions/publish.ts"),
  notifications: read("src/app/notifications/page.tsx"),
  supportNotifications: read("src/components/notifications/SupportNotifications.tsx"),
  accountLink: read("src/components/AccountLink.tsx"),
  layout: read("src/app/layout.tsx"),
  navbar: read("src/components/Navbar.tsx"),
  footer: read("src/components/Footer.tsx"),
  settings: read("src/app/settings/page.tsx"),
  proxy: read("src/proxy.ts"),
  middleware: read("src/lib/supabase/middleware.ts"),
  cron: read("src/app/api/cron/maintenance/route.ts"),
  privacy: read("src/app/privacy/page.tsx"),
};
const mig = flat(src.migration);
const replyMig = flat(src.replyMigration);

console.log("Support routes and entry points");
for (const route of [
  "src/app/support/page.tsx",
  "src/app/support/new/page.tsx",
  "src/app/support/tickets/[id]/page.tsx",
  "src/app/admin/inbox/page.tsx",
  "src/app/admin/activity/page.tsx",
  "src/app/admin/quality/page.tsx",
]) check(`${route} exists`, exists(route));

for (const [name, page] of [
  ["support list", src.supportPage],
  ["new suggestion", src.newPage],
  ["ticket thread", src.ticketPage],
]) {
  check(`${name} requires a real user`, /getUserAndProfile\(\)/.test(page));
  check(`${name} redirects signed-out visitors`, /redirect\([^)]*login/.test(page));
  check(`${name} is dynamic`, /dynamic = "force-dynamic"/.test(page));
  check(`${name} is not indexable`, /robots: \{ index: false/.test(page));
}
check("support routes refresh sessions in Proxy", /"\/support\/:path\*"/.test(src.proxy));
check("support routes are protected before rendering", /PROTECTED = \[[^\]]*"\/support"/.test(src.middleware));
check("the sitewide layout mounts the open-ticket banner", /<OpenTicketBanner/.test(src.layout));
check("the banner is invisible without an open ticket", /tickets\.length === 0\) return null/.test(src.banner));
check("the open-ticket notification stays pinned below the navbar", /sticky top-16/.test(src.banner));
check("the banner links the latest ticket", /\/support\/tickets\/\$\{first\.id\}/.test(src.banner));
check("the navbar links tickets", /href: "\/support"/.test(src.navbar));
check("the navbar links suggestions", /href: "\/support\/new"/.test(src.navbar));
check("the footer links suggestions", /href="\/support\/new"/.test(src.footer));
check("settings links support without changing theme access", /href="\/support"/.test(src.settings));

console.log("Broken reports and suggestions");
check("the broken button has explicit confirmation", /Report \{name\} as broken\?/.test(src.report));
check("the broken button creates a ticket", /createBrokenMacroTicket\(slug\)/.test(src.report));
check("the broken button opens neither email nor GitHub", !/mailto:|issues\/new/i.test(src.report));
check("the broken report context is looked up server side", /getLevelBySlug\(slug\.trim\(\)\)/.test(src.actions));
check("known file URLs are copied from the catalog", /level\.macros[\s\S]*macro\.downloadLink/.test(src.actions));
check("suggestions create a private ticket action", /createSuggestionTicket\(title, body\)/.test(src.suggestion));
check("successful creation opens the returned thread", /router\.push\(result\.href\)/.test(src.suggestion + src.report));
check("actions authenticate independently of their pages", /async function createTicket[\s\S]*getUser\(\)/.test(src.actions));
check("refreshed thread props are rendered instead of frozen in client state", !/useState\(initialMessages\)/.test(src.thread));
check("ticket identity is never accepted from the browser", /v_uid uuid := \(select auth\.uid\(\)\)/.test(mig));
check("blocked accounts cannot create tickets", /support tickets blocked/.test(mig));
check("open-ticket spam is bounded", /status = 'open'\) >= 5/.test(mig));
check("comment length is bounded in app and database", support.SUPPORT_TICKET_LIMITS.message === 5000 && /between 1 and 5000/.test(mig));
check("comments are rate limited per author", /interval '1 hour'[\s\S]{0,100}>= 30/.test(mig));
check("threads stop accepting comments after closure", /t\.status = 'open'/.test(mig));
check("a closed ticket maps to a useful error", /closed or no longer available/i.test(support.supportTicketError({ message: "ticket unavailable or closed" })));
check("a block maps to a useful error", /cannot open new support tickets/i.test(support.supportTicketError({ message: "support tickets blocked" })));

console.log("Privacy and database boundaries");
check("tickets and messages have separate tables", /create table public\.support_tickets/.test(mig) && /create table public\.support_ticket_messages/.test(mig));
check("both support tables enable RLS", (mig.match(/alter table public\.support_ticket(?:s|_messages) enable row level security/g) ?? []).length === 2);
check("browser roles receive read only", /grant select on public\.support_tickets to authenticated/.test(mig) && /grant select on public\.support_ticket_messages to authenticated/.test(mig));
check("there is no browser insert grant", !/grant insert on public\.support_ticket/.test(mig));
check("owners or admins alone can read tickets", /auth\.uid\(\)\) = opened_by or private\.is_admin\(\)/.test(mig));
check("message reads inherit the ticket owner check", /support_ticket_messages for select[\s\S]*t\.opened_by = \(select auth\.uid\(\)\) or private\.is_admin\(\)/.test(mig));
check("expired transcripts are denied exactly at their deadline", /delete_after is null or delete_after > now\(\)/.test(mig));
check("the privacy page names private ticket visibility", /Only you and the admins can read that thread/i.test(flat(src.privacy)));
check("the privacy page names the fixed retention", /permanently deleted 30 days after closure/i.test(flat(src.privacy)));

console.log("Closing, notifications, email and retention");
check("only admins can close in the action", /closeSupportTicket[\s\S]*isCurrentUserAdmin\(\)/.test(src.actions));
check("only admins can close in the database", /close_support_ticket[\s\S]*if not private\.is_admin\(\)/.test(mig));
check("closure supports resolved and other closure", /not in \('resolved', 'closed'\)/.test(mig));
check("closure sets a 30-day deletion deadline", /now\(\) \+ interval '30 days'/.test(mig));
check("closure and notification share one transaction", /update public\.support_tickets[\s\S]*insert into public\.account_notifications/.test(mig));
check("the notification states permanent deletion", /permanently deleted/.test(mig));
check("the thread states the exact deletion date", /ticketDate\(ticket\.delete_after\)/.test(src.thread));
check("the notification links the transcript", /\/support\/tickets\/\$\{item\.ticket_id\}/.test(src.supportNotifications));
check("the notification page loads both result types", /submission_notifications/.test(src.notifications) && /account_notifications/.test(src.notifications));
check("the bell counts both result types", /submission_notifications/.test(src.accountLink) && /account_notifications/.test(src.accountLink));
check("dismissing hides rather than deleting the durable email job", /set dismissed_at = now\(\)/.test(mig) && !/delete from public\.account_notifications n where n\.id = p_id/.test(mig));
check("the closure trigger freezes the email payload", /queue_support_ticket_email[\s\S]*recipient_email, subject, html_body, text_body/.test(mig));
check("missing recipient cancels cleanly", /'cancelled'.*'recipient_missing'/.test(mig));
check("the email contains the transcript URL", /\/support\/tickets\//.test(mig));
check("the email states the deletion date", /permanently deleted after/.test(mig));
check("the sender is server-only", src.email.startsWith('import "server-only"'));
check("the sender uses the existing support key", /RESEND_SUPPORT_API_KEY/.test(src.email));
check("the queue uses the privileged key only server side", src.emailAdmin.startsWith('import "server-only"') && /SUPABASE_SECRET_KEY/.test(src.emailAdmin));
check("each closure email is idempotent", /support-ticket\/\$\{message\.notificationId\}/.test(src.email));
check("the close action attempts immediate delivery", /claimAndSendSupportTicketEmail\(data\)/.test(src.actions));
check("nightly maintenance drains support email", /drainSupportTicketEmailQueue\(\)/.test(src.cron));
check("nightly maintenance also purges expired tickets", /purgeExpiredSupportTickets\(\)/.test(src.cron));
check("Postgres schedules physical deletion every minute", /cron\.schedule\( 'gdmacros-purge-expired-support-tickets', '\* \* \* \* \*'/.test(mig));
check("physical deletion is indexed and time bounded", /support_tickets_retention_idx/.test(mig) && /delete_after <= now\(\)/.test(mig));
check("only service role can call the purge RPC", /revoke all on function public\.purge_expired_support_tickets\(\) from public, anon, authenticated; grant execute on function public\.purge_expired_support_tickets\(\) to service_role/.test(mig));

console.log("Reply notifications");
check("reply notifications have their own kind", /support_ticket_reply/.test(replyMig));
check("the opening message is not treated as a reply", /m\.id <> new\.id[\s\S]*return new/.test(replyMig));
check("admin replies notify the ticket owner", /new\.author_role = 'admin'[\s\S]*v_owner[\s\S]*'support_ticket_reply'/.test(replyMig));
check("owner replies notify every admin", /from public\.user_roles r[\s\S]*r\.role = 'admin'/.test(replyMig));
check("reply alerts coalesce per recipient and ticket", /unique \(user_id, ticket_id, kind\)/.test(replyMig) && /on conflict \(user_id, ticket_id, kind\) do update/.test(replyMig));
check("a fresh reply becomes unread and visible again", /read_at = null[\s\S]*dismissed_at = null/.test(replyMig));
check("replying clears the author's stale alert", /dismissed_at = coalesce[\s\S]*n\.user_id = new\.author_id/.test(replyMig));
check("reply alerts never enter the closure email queue", /when \(new\.kind = 'support_ticket_closed'\)/.test(replyMig));
check("reply alerts inherit the ticket deletion deadline", /expire_support_ticket_reply_notifications[\s\S]*expires_at = new\.delete_after/.test(replyMig));
check("reply alerts render differently from closures", /item\.kind === "support_ticket_reply"/.test(src.supportNotifications) && /Open reply/.test(src.supportNotifications));

console.log("Admin inbox and blocks");
for (const [name, page] of [["inbox", src.inbox], ["activity", src.activity], ["quality", src.quality]]) {
  check(`${name} checks the admin role`, /isCurrentUserAdmin\(\)/.test(page));
  check(`${name} hides from non-admins`, /notFound\(\)/.test(page));
  check(`${name} requires a signed-in user`, /getUser\(\)/.test(page));
}
check("the inbox filters open, resolved, closed and all", /\["open", "resolved", "closed", "all"\]/.test(src.inbox));
check("the inbox never selects account email", !/select\([^)]*email/.test(src.inbox));
check("blocks prevent new tickets only", /Blocks opening new tickets only|Blocks opening new tickets|Blocks opening/i.test(src.migration) || /Blocks opening new tickets only/i.test(src.bans));
check("admins cannot block another admin", /cannot ban an administrator/.test(mig));
check("the block action checks admin in app and RPC", /banSupportTicketUser[\s\S]*isCurrentUserAdmin\(\)/.test(src.actions) && /ban_support_ticket_user[\s\S]*private\.is_admin\(\)/.test(mig));
check("unblocking is available", /unbanSupportTicketUser/.test(src.bans) && /unban_support_ticket_user/.test(mig));

console.log("Bulk publishing");
check("only pending rows can be selected", /row\.status === "pending"/.test(src.queue));
check("the queue offers select all and clear", /Select all pending/.test(src.queue) && /Clear selection/.test(src.queue));
check("bulk publishing asks for confirmation", /Yes, publish all/.test(src.bulk));
check("bulk publishing claims through the existing transition", /startProcessing\(row\.id\)/.test(src.bulk));
check("bulk publishing uses the normal publisher", /publishMacroForBatch\(row\.id\)/.test(src.bulk));
check("the batch action calls the same crash-safe core", /publishMacroForBatch[\s\S]*runPublish\(supabase, id, sendSubmissionResultBestEffort\)/.test(src.publish));
check("items publish sequentially", /for \(const row of rows\)/.test(src.bulk) && !/Promise\.all/.test(src.bulk));
check("one item failure does not abort the queue", /catch \{[\s\S]*setItem\(row\.id, "failed"/.test(src.bulk));
check("the running lock always releases", /finally \{[\s\S]*onRunningChange\(false\)/.test(src.bulk));
check("the admin can stop after the current item", /Stop after current/.test(src.bulk));

console.log("Activity and random quality checks");
check("review activity is private", /create table private\.admin_review_activity/.test(mig));
check("submission changes are captured by trigger", /create trigger capture_submission_activity/.test(mig));
check("decisions are captured by trigger", /create trigger capture_submission_outcome_activity/.test(mig));
check("publisher checkpoints and errors are captured", /create trigger capture_publish_activity/.test(mig) && /publish_error/.test(mig));
check("the timeline RPC reveals rows only to admins", /admin_review_activity[\s\S]*where private\.is_admin\(\)/.test(mig));
check("quality history is private", /create table private\.macro_quality_checks/.test(mig));
check("the quality action re-derives catalog metadata", /getAllLevels\(\)[\s\S]*macro\.downloadLink === downloadUrl/.test(src.adminActions));
check("the database also checks admin for a quality write", /record_macro_quality_check[\s\S]*if not private\.is_admin\(\)/.test(mig));
check("issues require a note", /outcome === "issue" && cleanNote\.length < 3/.test(src.adminActions) && /quality_issue_note/.test(mig));
check("recently checked downloads are avoided", /checkedRecently[\s\S]*fresh = all\.filter/.test(src.quality));
check("the pick uses cryptographic server randomness", /randomInt\(pool\.length\)/.test(src.quality));
check("admins can skip without recording", /Skip and pick another/.test(src.qualityUi));
check("quality results record who checked them", /checked_by/.test(mig) && /checked_by_username/.test(mig));

console.log(`\n${passed} passed, ${failed} failed`);
if (failures.length) {
  console.log("\nFailures:");
  for (const failure of failures) console.log(`  - ${failure}`);
}
process.exit(failed ? 1 : 0);
