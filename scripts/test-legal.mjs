/**
 * Tests for the legal and support update: Terms, Privacy, FAQ, the report
 * broken-report flow, signup acceptance, the legal notice broadcast, and the
 * Discord owner cards.
 *
 * Run with `npm run test:legal`. No network, no Resend, no database, no key.
 *
 * Two kinds of check live here, and both matter:
 *
 *   * behaviour, against the real modules loaded from src/ with jiti;
 *   * COPY AND WIRING, by reading the page sources. A privacy policy that
 *     silently goes stale is the failure mode this whole task existed to fix,
 *     so "the FAQ does not hardcode a catalog total" is worth asserting even
 *     though it is a statement about text rather than about a function.
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

const jiti = createJiti(path.join(ROOT, "scripts", "test-legal.mjs"), {
  alias: { "server-only": path.join(STUB, "server-only.mjs"), "@": path.join(ROOT, "src") },
  interopDefault: true,
  moduleCache: false,
});

const legal = await jiti.import(path.join(ROOT, "src/lib/legal.ts"));
const notice = await jiti.import(path.join(ROOT, "src/lib/legalNotice.ts"));
const lanyard = await jiti.import(path.join(ROOT, "src/lib/lanyard.ts"));
const owners = await jiti.import(path.join(ROOT, "src/lib/owners.ts"));

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const src = {
  faq: read("src/app/faq/page.tsx"),
  privacy: read("src/app/privacy/page.tsx"),
  terms: read("src/app/terms/page.tsx"),
  about: read("src/app/about/page.tsx"),
  signup: read("src/components/auth/SignupForm.tsx"),
  footer: read("src/components/Footer.tsx"),
  sitemap: read("src/app/sitemap.ts"),
  mySubs: read("src/components/submissions/MySubmissions.tsx"),
  notifUi: read("src/components/notifications/NotificationCenter.tsx"),
  submit: read("src/app/submit/page.tsx"),
  report: read("src/components/ReportBroken.tsx"),
  supportActions: read("src/lib/actions/supportTickets.ts"),
  adminPage: read("src/app/admin/page.tsx"),
  adminUi: read("src/components/admin/LegalNotices.tsx"),
  actions: read("src/lib/actions/legalNotice.ts"),
  authAdmin: read("src/lib/supabase/auth-admin.ts"),
  noticeSender: read("src/lib/email/notice.ts"),
  // Later migrations may advance one legal document without rewriting the
  // immutable migration that originally created the table. Read the ordered
  // history so the final matching row is the database's current value.
  migration:
    read("supabase/migrations/0007_legal_acceptance_and_notices.sql") +
    read("supabase/migrations/0011_account_experience.sql") +
    read("supabase/migrations/0012_privacy_version_2026_08_24.sql"),
  ownerCard: read("src/components/DiscordOwnerCard.tsx"),
};

const catalog = JSON.parse(read("data/macros.json"));

/**
 * Collapses whitespace.
 *
 * JSX wraps prose across source lines, so a phrase like "the law wins" is
 * stored with a newline and indentation in the middle of it, and a plain regex
 * silently never matches. Every assertion about COPY runs against this rather
 * than against the raw file.
 */
const flat = (t) => t.replace(/\s+/g, " ");
const prose = Object.fromEntries(Object.entries(src).map(([k, v]) => [k, flat(v)]));

/* ------------------------------------------------------------------ *
 * 1. Accepted submission wording
 * ------------------------------------------------------------------ */
console.log("Accepted submission wording");

check(
  "accepted copy no longer says it is listed by hand",
  !/by hand/i.test(src.mySubs),
  "MySubmissions still mentions doing it by hand",
);
check(
  "accepted copy says the macro is live",
  // Results moved out of /submissions and into the notification centre, which
  // is the single place an outcome is now read and dismissed.
  /Your macro is now live on GDMacros\./.test(src.notifUi),
  "expected wording missing",
);
check(
  "results no longer appear on the submissions page as well",
  !/was accepted\.|was rejected\./.test(src.mySubs),
  "an outcome is shown in two places, so dismiss is ambiguous",
);
check(
  "accepted copy does not explain the pipeline",
  !/GitHub Release|Vercel|git commit/i.test(src.mySubs),
);
check("submit page no longer says listing is done by hand", !/done by hand/i.test(src.submit));
check(
  "submit page says publishing is automatic",
  /published to the site automatically/i.test(src.submit),
);
check(
  "rejection wording is untouched",
  /was rejected\./.test(src.notifUi) && /rejection_reason/.test(src.notifUi),
);
check(
  "admin queue no longer claims nothing is published automatically",
  !/never (uploaded|added)|nothing is ever uploaded/i.test(src.adminPage),
);

/* ------------------------------------------------------------------ *
 * 2. Report broken
 * ------------------------------------------------------------------ */
console.log("Report broken");

check("broken reports no longer open email", !/mailto:|buildBrokenMacroMailto|SUPPORT_MAILTO/.test(src.report));
check("broken reports no longer open GitHub", !/issues\/new|github/i.test(src.report));
check("the component asks for confirmation", /Report \{name\} as broken\?/.test(src.report));
check("the confirmation says a private thread opens", /private support thread/i.test(src.report));
check("the component calls the ticket action with only a slug", /createBrokenMacroTicket\(slug\)/.test(src.report));
check("the action resolves the slug from the server catalog", /getLevelBySlug\(slug\.trim\(\)\)/.test(src.supportActions));
check("the action includes every known download in the private first message", /level\.macros[\s\S]*macro\.downloadLink/.test(src.supportActions));
check("the action never accepts macro metadata from the browser", /createBrokenMacroTicket\(slug: string\)/.test(src.supportActions));
const macroPage = read("src/app/macro/[slug]/page.tsx");
check("the macro page passes only the trusted lookup key", /<ReportBroken[\s\S]{0,120}slug=\{level\.slug\}/.test(macroPage) && !/macros=\{level\.macros\.map/.test(macroPage));

/* ------------------------------------------------------------------ *
 * 3. FAQ
 * ------------------------------------------------------------------ */
console.log("FAQ");

const levelCount = catalog.length;
const macroCount = catalog.reduce((n, l) => n + (l.macros ?? []).length, 0);

check("FAQ derives counts from the catalog", /getMacroCount\(\)/.test(src.faq) && /getAllLevels\(\)/.test(src.faq));
check(
  "FAQ hardcodes no catalog total",
  !new RegExp(`${macroCount}\\s+downloads`).test(src.faq) && !/\b(212|222|220)\s+downloads/.test(src.faq),
  "a literal download total is written into the copy",
);
check("FAQ does not present MediaFire as the current host", !/MediaFire/i.test(src.faq));
check("FAQ names GitHub Releases as the host", /GitHub Releases/.test(src.faq));
check("FAQ names the downloads repository", /GDMacros-downloads/.test(src.faq));
check("FAQ carries the support address", src.faq.includes("SUPPORT_EMAIL"));
check("FAQ explains automatic publishing", /published to the site automatically/i.test(src.faq));
check("FAQ does not say an admin uploads it by hand", !/by hand|manually upload/i.test(src.faq));
check("FAQ links the install guide", /href="\/install"/.test(src.faq));
check("FAQ links guidelines and submit", /href="\/guidelines"/.test(src.faq) && /href="\/submit"/.test(src.faq));
check("FAQ links terms and privacy", /href="\/terms"/.test(src.faq) && /href="\/privacy"/.test(src.faq));
check("FAQ refuses to promise macros are ban-safe", /cannot promise/i.test(src.faq));
check(
  "FAQ does not claim every level has both recorders",
  !/every level has both/i.test(src.faq),
);
check("FAQ says a .gdr2 is not an executable", /not an installer and not an executable/i.test(src.faq));
check("catalog currently has macros to count", levelCount > 0 && macroCount > 0, `${levelCount}/${macroCount}`);

/* ------------------------------------------------------------------ *
 * 4. Terms and Privacy
 * ------------------------------------------------------------------ */
console.log("Terms and Privacy");

check("terms route exists", fs.existsSync(path.join(ROOT, "src/app/terms/page.tsx")));
check("terms renders its version from the shared source", /TERMS_VERSION/.test(src.terms));
check("terms renders its effective date", /TERMS_EFFECTIVE_DATE/.test(src.terms));
check("privacy renders its version from the shared source", /PRIVACY_VERSION/.test(src.privacy));
check("privacy renders its updated date", /PRIVACY_EFFECTIVE_DATE/.test(src.privacy));

check("footer links terms", /href="\/terms"/.test(src.footer));
check("footer links privacy", /href="\/privacy"/.test(src.footer));
check("footer links faq and guidelines", /href="\/faq"/.test(src.footer) && /href="\/guidelines"/.test(src.footer));
check("sitemap lists /terms", /"\/terms"/.test(src.sitemap));
check("sitemap lists /privacy", /"\/privacy"/.test(src.sitemap));

check(
  "privacy does not present MediaFire as the current host",
  !/(is|are) hosted on MediaFire|downloads?[^.]{0,40}from MediaFire/i.test(prose.privacy),
  "a present-tense MediaFire hosting claim survives",
);
check("privacy states nothing links to MediaFire any more", /nothing in the catalog links to MediaFire/i.test(src.privacy));
{
  // "GitHub issue" appears once, and only inside an instruction NOT to use one.
  // The check is that every mention is negated, rather than that the phrase is
  // absent, because telling people to stay away from a public tracker is
  // exactly what the policy should say.
  const mentions = [...prose.privacy.matchAll(/.{0,24}GitHub issue/gi)].map((m) => m[0]);
  check("privacy mentions a GitHub issue only to warn against it", mentions.length > 0);
  check(
    "no mention directs account matters to a GitHub issue",
    mentions.every((m) => /do not|don't|never/i.test(m)),
    mentions.join(" | "),
  );
}
check("privacy tells people NOT to use a public issue", /do not open a public GitHub issue/i.test(src.privacy));
check("privacy carries the support address", src.privacy.includes("SUPPORT_EMAIL"));
check("terms carries the support address", src.terms.includes("SUPPORT_EMAIL"));

for (const [label, text] of [["privacy", src.privacy], ["terms", src.terms]]) {
  check(`${label} names no invented company`, !/\b(Inc\.|Ltd\.|LLC|GmbH|registered office)\b/i.test(text));
  check(`${label} does not claim a lawyer reviewed it`, !/reviewed by (a |our )?(lawyer|attorney|counsel)/i.test(text));
  check(`${label} promises no absolute security`, !/(completely|totally|100%|fully) secure/i.test(text));
  check(`${label} claims no blanket GDPR compliance`, !/(fully|completely) (GDPR|CCPA)[- ]compliant/i.test(text));
}
check("privacy admits security is not a guarantee", /Nobody can promise perfect security/i.test(src.privacy));
check("terms does not pretend to waive mandatory law", /the law wins/i.test(prose.terms));

// The support email path, as actually implemented.
check("privacy names Resend in the support path", /Resend receives the message/i.test(src.privacy));
check("privacy names the webhook step", /calls a webhook/i.test(src.privacy));
check("privacy names Gmail as the private mailbox", /private mailbox, which is a Google Gmail account/i.test(src.privacy));
check("privacy lists what support mail contains", /attachments/i.test(src.privacy));
check(
  "privacy never publishes the forwarding mailbox address",
  !/gdmacros\.com@gmail\.com/.test(src.privacy),
);
check("privacy covers legal notice emails", /Terms|Privacy/.test(src.privacy) && /not a newsletter and not advertising/i.test(src.privacy));
check(
  "privacy covers records of messages sent",
  /records hold the message and its delivery state/i.test(prose.privacy),
);
check(
  "privacy is honest that a retry may hold the address briefly",
  // This replaces an older, narrower claim that no second copy was ever kept.
  // That was true of the legal-notice broadcast and NOT of the submission
  // result queue, which freezes the address so a retry cannot go somewhere
  // else. The policy now states the actual behaviour and its limit.
  /copy of the destination address is held only for as long as the retry is safe/i.test(prose.privacy) &&
    /erased once the message is settled/i.test(prose.privacy),
);
check(
  "privacy still refuses to become a mailing list",
  /never used to build a mailing list/i.test(prose.privacy),
);
check("privacy covers the signup acceptance record", /which version of the/i.test(src.privacy));
check("privacy covers automatic publishing", /publishing happens automatically/i.test(src.privacy));
check("privacy says the private upload is deleted after publication", /private copy of your upload is deleted/i.test(src.privacy));
check("privacy covers Vercel analytics", /Web Analytics and Speed Insights/i.test(src.privacy));
check("privacy covers local storage keys", /gdm-theme/.test(src.privacy) && /gdmacros:favorites/.test(src.privacy));
check("privacy covers the supabase session cookie", /session cookie/i.test(src.privacy));
check("privacy covers google translate", /googtrans/i.test(src.privacy));
check("privacy says GDBrowser lookups are server side", /made by our server/i.test(src.privacy));
check("privacy says youtube search uses no api key", /uses no API key/i.test(src.privacy));
check("privacy does not claim a YouTube Data API key", !/YouTube Data API/i.test(src.privacy));
check("privacy covers Lanyard on the about page", /Lanyard/.test(src.privacy));
check("privacy says the Lanyard request comes from the browser", /request is made by your browser/i.test(src.privacy));
check("privacy states the support transcript retention", /permanently deleted[\s\S]{0,80}30 days after closure/i.test(prose.privacy));
check("privacy explains support thread visibility", /Only you and the admins can read that thread/i.test(prose.privacy));
check("privacy explains account deletion", /Deleting your account removes the account/i.test(src.privacy));

check("terms covers submissions representations", /you have permission from the person/i.test(src.terms));
check("terms grants a licence without claiming ownership", /We do not claim to own it/i.test(src.terms));
check("terms licence is non-exclusive", /non-exclusive/i.test(src.terms));
check("terms covers renaming the public asset", /Renaming the public file/i.test(src.terms));
check("terms covers backups", /backup copies/i.test(src.terms));
check("terms says publication survives account deletion", /does not automatically remove a macro/i.test(src.terms));
check("terms disclaims RobTop affiliation", /not affiliated with, endorsed by, or connected to RobTop/i.test(prose.terms));
check("terms refuses to promise leaderboard acceptance", /they can change them, and none of them answer to/i.test(src.terms));
check("terms says a macro completion is not a manual completion", /not a manual completion/i.test(src.terms));
check("terms lists third party services", /GitHub, Supabase, Vercel, Resend, YouTube/i.test(src.terms));
check("terms covers moderation", /Turn down a submission/i.test(src.terms));
check("terms does not promise appeals are guaranteed", /not promising\s+a formal appeals process/i.test(src.terms));
check("terms says future re-acceptance is not assumed from an email", /an email on its own is not us claiming/i.test(src.terms));

/* ------------------------------------------------------------------ *
 * 5. Legal versions
 * ------------------------------------------------------------------ */
console.log("Legal versions");

check("terms version is a date", /^\d{4}-\d{2}-\d{2}$/.test(legal.TERMS_VERSION));
check("privacy version is a date", /^\d{4}-\d{2}-\d{2}$/.test(legal.PRIVACY_VERSION));
eq("terms path", legal.TERMS_PATH, "/terms");
eq("privacy path", legal.PRIVACY_PATH, "/privacy");
eq("dates render in a fixed zone", legal.formatLegalDate("2026-08-22"), "22 August 2026");
eq("a malformed date renders as itself", legal.formatLegalDate("nonsense"), "nonsense");

// The database stamps acceptance from its own copy, so the two must agree or
// accounts would be recorded against a version nobody ever published.
//
// A document's version is SET by an insert tuple when the table is first
// seeded, and later MOVED by an update. Both forms are read, in migration
// order, so the last one wins. Reading only the insert form silently kept
// asserting a version that a later migration had already replaced.
//
const seeded = {};

// ('privacy', '2026-08-23', '2026-08-23')
for (const m of src.migration.matchAll(
  /\('(terms|privacy)',\s*'(\d{4}-\d{2}-\d{2})',\s*'(\d{4}-\d{2}-\d{2})'\s*[,)]/g,
)) {
  seeded[m[1]] = { version: m[2], effective: m[3] };
}

// set version = '...', effective_date = '...' ... where doc = '...'
for (const m of src.migration.matchAll(
  /set\s+version\s*=\s*'(\d{4}-\d{2}-\d{2})'\s*,\s*effective_date\s*=\s*'(\d{4}-\d{2}-\d{2})'[\s\S]{0,200}?where\s+doc\s*=\s*'(terms|privacy)'/gi,
)) {
  seeded[m[3]] = { version: m[1], effective: m[2] };
}
eq("migration seeds the same terms version", seeded.terms?.version, legal.TERMS_VERSION);
eq("migration seeds the same privacy version", seeded.privacy?.version, legal.PRIVACY_VERSION);
eq("migration seeds the same terms date", seeded.terms?.effective, legal.TERMS_EFFECTIVE_DATE);
eq("migration seeds the same privacy date", seeded.privacy?.effective, legal.PRIVACY_EFFECTIVE_DATE);

/* ------------------------------------------------------------------ *
 * 6. Signup acceptance
 * ------------------------------------------------------------------ */
console.log("Signup acceptance");

check(
  "signup shows the exact agreement sentence",
  /By creating an account, you agree to the/.test(src.signup) &&
    /Terms of Service/.test(src.signup) &&
    /and acknowledge the/.test(src.signup) &&
    /Privacy Policy/.test(src.signup),
);
check("signup links terms", /href="\/terms"/.test(src.signup));
check("signup links privacy", /href="\/privacy"/.test(src.signup));
check("the notice is small but not hidden", /text-\[12px\]/.test(src.signup));
check(
  "the notice is not hidden by opacity or display",
  !/hidden|sr-only|opacity-0/.test(src.signup.split("By creating an account")[0].slice(-400)),
);
check(
  "the browser never sends a version it claims to accept",
  !/TERMS_VERSION|PRIVACY_VERSION|legal_acceptance/.test(src.signup),
  "signup form references a version, which the server must decide",
);

const mig = src.migration;
check("acceptance is stamped by a trigger on account creation", /after insert on auth\.users/.test(mig));
check("the trigger reads versions from the database", /from private\.legal_documents/.test(mig));
check("the acceptance table stores the user uuid", /user_id\s+uuid not null references auth\.users/.test(mig));
check("acceptance records the terms version", /terms_version\s+text not null/.test(mig));
check("acceptance records the privacy version", /privacy_version\s+text not null/.test(mig));
check("acceptance records a timestamp", /accepted_at\s+timestamptz/.test(mig));
check("acceptance records the source", /source\s+text not null default 'account_creation'/.test(mig));
check("acceptance stores no email", !/legal_acceptances[\s\S]{0,900}?email/.test(mig));
check("acceptance stores no ip address", !/ip_address|inet/.test(mig));
check("acceptance stores no user agent", !/user_agent/.test(mig));
check("existing accounts are not backfilled", /deliberately NOT backfilled/i.test(mig));
check("no insert into acceptances from a backfill select", !/insert into private\.legal_acceptances[\s\S]{0,200}select .*from auth\.users/i.test(mig));
check("the trigger cannot block signup", /exception[\s\S]{0,120}when others[\s\S]{0,80}return new/.test(mig));

/* ------------------------------------------------------------------ *
 * 7. Legal notice: batching and idempotency
 * ------------------------------------------------------------------ */
console.log("Legal notice batching");

eq("resend batch cap", notice.MAX_BATCH_SIZE, 100);

const ids = Array.from({ length: 250 }, (_, i) => `user-${String(i).padStart(3, "0")}`);
const batches = notice.planBatches(ids);
eq("250 recipients become 3 batches", batches.length, 3);
eq("first batch is full", batches[0].length, 100);
eq("last batch holds the remainder", batches[2].length, 50);
check("no batch exceeds the cap", batches.every((b) => b.length <= notice.MAX_BATCH_SIZE));
eq("every recipient appears once", batches.flat().length, new Set(batches.flat()).size);
eq("no recipient is lost", batches.flat().length, 250);

const shuffled = [...ids].sort(() => Math.random() - 0.5);
check(
  "batch membership does not depend on input order",
  JSON.stringify(notice.planBatches(shuffled)) === JSON.stringify(batches),
  "reordering the same accounts produced different batches",
);
check("duplicates collapse", notice.planBatches(["a", "a", "b"]).flat().length === 2);
check("a size above the cap is clamped", notice.planBatches(ids, 5000)[0].length === 100);

eq(
  "idempotency key is deterministic",
  notice.batchIdempotencyKey("run-1", 2),
  "legal-notice/run-1/batch/2",
);
check(
  "the same batch always yields the same key",
  notice.batchIdempotencyKey("run-1", 2) === notice.batchIdempotencyKey("run-1", 2),
);
check(
  "different batches yield different keys",
  notice.batchIdempotencyKey("run-1", 2) !== notice.batchIdempotencyKey("run-1", 3),
);
check(
  "different runs yield different keys",
  notice.batchIdempotencyKey("run-2", 2) !== notice.batchIdempotencyKey("run-1", 2),
);

const now = Date.parse("2026-08-22T12:00:00Z");
check("a recent batch is still protected", !notice.isBeyondIdempotencyWindow("2026-08-22T11:00:00Z", now));
check("an old batch is beyond the window", notice.isBeyondIdempotencyWindow("2026-08-20T11:00:00Z", now));
check("an unparseable timestamp is treated as expired", notice.isBeyondIdempotencyWindow("nonsense", now));

/* ------------------------------------------------------------------ *
 * 8. Legal notice: message content
 * ------------------------------------------------------------------ */
console.log("Legal notice content");

const content = {
  type: "terms_and_privacy",
  subject: "We have updated the Terms",
  message: "We changed how submissions are licensed.\n\nNothing you have to do.",
  termsVersion: "2026-08-22",
  privacyVersion: "2026-08-22",
  effectiveDate: "2026-09-01",
  siteUrl: "https://www.gdmacros.com",
};

const msgs = notice.buildBatchMessages(["a@example.com", "b@example.com"], content);
eq("one message per recipient", msgs.length, 2);
eq("each message has a single recipient", msgs[0].to, "a@example.com");
check("no message carries a second address", msgs.every((m) => typeof m.to === "string" && !m.to.includes(",")));
check("nobody is cc'd", msgs.every((m) => !("cc" in m) && !("bcc" in m)));
check(
  "no message mentions another recipient",
  !msgs[0].html.includes("b@example.com") && !msgs[0].text.includes("b@example.com"),
);
eq("From is the support address", msgs[0].from, "GDMacros <support@gdmacros.com>");
eq("Reply-To is the support address", msgs[0].replyTo, "support@gdmacros.com");
check("the private mailbox is never the sender", !JSON.stringify(msgs).includes("gmail.com"));
eq("subject comes from the notice", msgs[0].subject, "We have updated the Terms");

const html = msgs[0].html;
check("terms link is absolute and correct", html.includes("https://www.gdmacros.com/terms"));
check("privacy link is absolute and correct", html.includes("https://www.gdmacros.com/privacy"));
check("the effective date is shown", html.includes("2026-09-01"));
check("versions are shown", html.includes("2026-08-22"));
check("the footer explains why they got it", /not a marketing email/i.test(html));
check("support address is in the footer", html.includes("support@gdmacros.com"));
check("the text part carries the links too", msgs[0].text.includes("https://www.gdmacros.com/terms"));

// Only the relevant document is linked.
const termsOnly = notice.buildBatchMessages(["a@b.c"], { ...content, type: "terms" })[0];
check("a terms notice links terms", termsOnly.html.includes("/terms"));
check("a terms notice does not link privacy", !termsOnly.html.includes("/privacy"));
const privacyOnly = notice.buildBatchMessages(["a@b.c"], { ...content, type: "privacy" })[0];
check("a privacy notice links privacy", privacyOnly.html.includes("/privacy"));
check("a privacy notice does not link terms", !privacyOnly.html.includes("/terms"));
const serviceOnly = notice.buildBatchMessages(["a@b.c"], { ...content, type: "service" })[0];
check("a service notice links neither document", !serviceOnly.html.includes("/terms") && !serviceOnly.html.includes("/privacy"));

// Escaping. The admin writes text; nothing they type may become markup.
const evil = notice.buildBatchMessages(["a@b.c"], {
  ...content,
  message: '<script>alert(1)</script> and <img src=x onerror=y> plus "quotes" & ampersands',
})[0];
check("script tags are escaped", !evil.html.includes("<script>"), "raw script tag reached the email");
check("the escaped text is still visible", evil.html.includes("&lt;script&gt;"));
check("img onerror is escaped", !/<img src=x/.test(evil.html));
check("ampersands are escaped", evil.html.includes("&amp;"));
check("quotes are escaped", evil.html.includes("&quot;") || evil.html.includes("&#39;"));
check("paragraphs still render", evil.html.includes("<p style="));

check("blank lines become paragraphs", (msgs[0].html.match(/<p style="margin:0 0 14px"/g) ?? []).length >= 2);
check("an empty subject falls back", notice.buildBatchMessages(["a@b.c"], { ...content, subject: "  " })[0].subject.length > 0);

eq("the confirmation phrase", notice.SEND_CONFIRMATION, "SEND TO ALL ACCOUNTS");
check("notice types are the four expected", notice.NOTICE_TYPES.length === 4);
check("an unknown notice type is rejected", !notice.isNoticeType("marketing"));
check("a known notice type is accepted", notice.isNoticeType("terms"));

check("run completion needs everything resolved", notice.runIsComplete({ total: 3, sent: 3, pending: 0, failed: 0, needsReview: 0 }));
check("a pending delivery means incomplete", !notice.runIsComplete({ total: 3, sent: 2, pending: 1, failed: 0, needsReview: 0 }));
check("a needs-review delivery means incomplete", !notice.runIsComplete({ total: 3, sent: 2, pending: 0, failed: 0, needsReview: 1 }));

/* ------------------------------------------------------------------ *
 * 9. Legal notice: authorisation and leakage
 * ------------------------------------------------------------------ */
console.log("Legal notice authorisation");

check("signed-out callers are refused", /if \(!user\) return \{ ok: false, error: "Not signed in\." \}/.test(src.actions));
check("non-admins are refused", /isCurrentUserAdmin\(\)/.test(src.actions));
check("no action authorises by username", !/username/i.test(src.actions));
check("no action authorises by email", !/=== ?"[^"]*@/.test(src.actions));
check("every notice RPC checks the database capability", (mig.match(/private\.can_send_legal_notice\(\)/g) ?? []).length >= 6);
check("the capability is its own function", /create or replace function private\.can_send_legal_notice/.test(mig));
check("prepare is guarded", /function public\.legal_notice_prepare[\s\S]{0,1400}?can_send_legal_notice/.test(mig));
check("claim is guarded", /function public\.legal_notice_claim_batch[\s\S]{0,700}?can_send_legal_notice/.test(mig));
check("record is guarded", /function public\.legal_notice_record_batch[\s\S]{0,700}?can_send_legal_notice/.test(mig));
check("content is guarded", /function public\.legal_notice_content[\s\S]{0,700}?can_send_legal_notice/.test(mig));
check("anon cannot execute any notice rpc", (mig.match(/from anon;/g) ?? []).length >= 6);
check("notice tables have RLS on", (mig.match(/enable row level security/g) ?? []).length >= 4);
check("notice tables have no policy at all", !/create policy[\s\S]*legal_notice/i.test(mig));
check("delivery state lives in the private schema", /create table if not exists private\.legal_notice_deliveries/.test(mig));
check("runs live in the private schema", /create table if not exists private\.legal_notice_runs/.test(mig));
check("every function pins search_path", (mig.match(/set search_path = ''/g) ?? []).length >= 7);

check("recipients are enumerated server side", /listAccountIds/.test(src.actions));
check("enumeration paginates", /page\+\+|page <= MAX_PAGES/.test(src.authAdmin) && /perPage/.test(src.authAdmin));
check("enumeration has a termination guard", /MAX_PAGES/.test(src.authAdmin));
check("the account module is server-only", src.authAdmin.startsWith('import "server-only";'));
check("the notice sender is server-only", src.noticeSender.startsWith('import "server-only";'));
check(
  "preview returns a count, never a list",
  /recipientCount\?: number/.test(src.actions) && !/recipientEmails|emails\?: string\[\]/.test(src.actions),
);
check(
  "no action returns an email list",
  !/return \{[^}]*emails/.test(src.actions),
  "a server action returns addresses",
);
check(
  "the admin UI holds no address-shaped value",
  !/@[a-z0-9.-]+\.[a-z]{2,}/i.test(src.adminUi),
  "an email address literal is present in the admin component",
);
check(
  "the admin UI renders no recipient list",
  !/recipients?\.map|emails\.map|recipientEmails/.test(src.adminUi),
);
check(
  "the admin UI reads only counts from the run",
  /run\.sent|run\.pending|run\.failed|run\.needsReview/.test(src.adminUi),
);
{
  // The column list only, so the surrounding comment explaining that no address
  // is stored does not itself trip the check.
  const block =
    mig.split("create table if not exists private.legal_notice_deliveries (")[1]?.split("\n);")[0] ?? "";
  check("the delivery table declares no email column", block.length > 0 && !/email/i.test(block), block.slice(0, 120));
  check("the delivery table keys on the account uuid", /user_id\s+uuid not null references auth\.users/.test(block));
}
check("addresses are resolved only at send time", /resolveEmails\(batch\.user_ids\)/.test(src.actions));

check("an ambiguous batch is parked, not retried", /needs_review/.test(src.actions) && /outcome\.ambiguous \? "needs_review" : "failed"/.test(src.actions));
check("a sent delivery is never re-resolved", /d\.status <> 'sent'/.test(mig));
check("claim only returns unresolved deliveries", /status in \('pending', 'failed'\)/.test(mig));
check("batch membership is assigned once at prepare time", /row_number\(\) over \(order by u\.id\)/.test(mig));
check("the UI sends one batch per request", /sendNextBatch/.test(src.adminUi));
check("resume reads the next unsent batch rather than restarting", /legal_notice_claim_batch/.test(src.actions));
check("the confirmation phrase gates the run", /confirmation\.trim\(\) !== SEND_CONFIRMATION/.test(src.actions));
check("the UI requires the confirmation too", /SEND_CONFIRMATION/.test(src.adminUi));
check("raw HTML is refused with an explanation", /HTML is not accepted/.test(src.actions));
check("the marketing warning is shown", /not a marketing mailing list/i.test(prose.adminUi));
check("test sends create no run", /Creates no run/i.test(src.actions) || /No run was created/.test(src.adminUi));
check("the test goes to the admin's own address", /emailForUser\(g\.userId\)/.test(src.actions));
check("batch sends use the idempotency key", /batchIdempotencyKey\(runId, batch\.batch_number\)/.test(src.actions));
check("the sender passes the key to Resend", /idempotencyKey/.test(src.noticeSender));
{
  /*
   * The client bundle must never be able to reach the private forwarding
   * address. legalNotice.ts is imported by a CLIENT component, so it must not
   * import the module that holds that address: relying on the bundler to
   * tree-shake an unused constant is a silent dependency on an optimisation,
   * and it breaks the moment somebody imports a second thing from that file.
   */
  const ln = read("src/lib/legalNotice.ts");
  check(
    "legalNotice does not import the module holding the forwarding address",
    !/from "[.][/]email[/]support"/.test(ln),
    "a client-reachable module imports email/support",
  );
  check("the shared escaper is used instead", /from "[.][/]escapeHtml"/.test(ln));
  check(
    "the shared escaper holds no address",
    !/@[a-z0-9.-]+[.][a-z]{2,}/i.test(read("src/lib/escapeHtml.ts")),
  );
}

check("broadcasts and audiences are not used", !/\.broadcasts\.|\.audiences\./.test(src.noticeSender + src.actions));
{
  /*
   * No real email can be sent from this suite.
   *
   * Asserted structurally rather than by scanning this file for a provider
   * name, which would match the scanner itself. What matters is which modules
   * are EXECUTED: the client that can actually send lives in email/notice.ts,
   * which is never imported here, and the server-only modules are read as
   * text for their assertions rather than loaded and run.
   */
  const self = read("scripts/test-legal.mjs");
  const executed = [...self.matchAll(/jiti[.]import[(]path[.]join[(]ROOT, "([^"]+)"[)][)]/g)].map((m) => m[1]);
  check("modules are executed through jiti", executed.length > 0, executed.join(", "));
  check(
    "no module that can send email is executed",
    executed.every((m) => !/email[/]notice|email[/]transport|actions[/]/.test(m)),
    executed.join(", "),
  );
  check(
    "the sender and the actions are only read as text",
    /noticeSender: read[(]/.test(self) && /actions: read[(]/.test(self),
  );
  check("no live network call is made", !/await fetch[(]/.test(self));
}

/* ------------------------------------------------------------------ *
 * 10. Owners and Lanyard
 * ------------------------------------------------------------------ */
console.log("Owners and Lanyard");

eq("one owner is configured", owners.OWNERS.length, 1);
eq("Chessz id", owners.OWNERS[0].discordId, "1488686761264549939");
eq("profile link for Chessz", owners.discordProfileUrl(owners.OWNERS[0].discordId), "https://discord.com/users/1488686761264549939");
check("the owner id is recognised", owners.isOwnerId("1488686761264549939"));
check("an arbitrary id is not an owner", !owners.isOwnerId("123456789012345678"));
check("no invite link is invented", !/discord\.gg/.test(src.about + src.ownerCard));
check(
  "no visitor input can choose the id",
  !/searchParams|useSearchParams|params\./.test(src.ownerCard),
  "the card reads a parameter",
);
check("the card only iterates the configured owners", /OWNERS\.map/.test(src.ownerCard));

const payload = (over = {}) => ({
  success: true,
  data: {
    discord_user: { username: "chesszdc", global_name: "Chessz", avatar: "abc123" },
    discord_status: "online",
    activities: [],
    ...over,
  },
});

const online = lanyard.parseLanyard("1488686761264549939", payload());
eq("online status", online.status, "online");
eq("online label", lanyard.statusLabel("online"), "Online");
eq("idle label", lanyard.statusLabel("idle"), "Idle");
eq("dnd label reads in full", lanyard.statusLabel("dnd"), "Do Not Disturb");
eq("offline label", lanyard.statusLabel("offline"), "Offline");
eq("idle parses", lanyard.parseLanyard("1", payload({ discord_status: "idle" })).status, "idle");
eq("dnd parses", lanyard.parseLanyard("1", payload({ discord_status: "dnd" })).status, "dnd");
eq("offline parses", lanyard.parseLanyard("1", payload({ discord_status: "offline" })).status, "offline");
eq("an unknown status falls back to offline", lanyard.parseLanyard("1", payload({ discord_status: "weird" })).status, "offline");
check("every status has a distinct dot class", new Set(["online", "idle", "dnd", "offline"].map(lanyard.statusDotClass)).size === 4);

eq("display name prefers the global name", online.displayName, "Chessz");
eq("username is kept", online.username, "chesszdc");
check("avatar url is built from the hash", online.avatarUrl.includes("/avatars/1488686761264549939/abc123.png"));
check("animated avatars use gif", lanyard.avatarUrl("1", "a_deadbeef").endsWith(".gif?size=128"));
check("a missing avatar falls back to a default", lanyard.avatarUrl("1488686761264549939", null).includes("/embed/avatars/"));
check("no avatar url is hardcoded anywhere", !/cdn\.discordapp\.com\/avatars\/(1488686761264549939|836846354781175818)\//.test(src.ownerCard + src.about));

eq("no activity means no activity line", online.activity, null);
eq(
  "playing renders",
  lanyard.parseLanyard("1", payload({ activities: [{ type: 0, name: "Geometry Dash" }] })).activity,
  "Playing Geometry Dash",
);
eq(
  "watching renders",
  lanyard.parseLanyard("1", payload({ activities: [{ type: 3, name: "a video" }] })).activity,
  "Watching a video",
);
const spotify = lanyard.parseLanyard(
  "1",
  payload({
    activities: [{ type: 2, name: "Spotify", details: "Song", state: "Artist" }],
    spotify: { song: "Song", artist: "Artist", album_art_url: "https://i.scdn.co/x.jpg" },
  }),
);
eq("spotify renders compactly", spotify.activity, "Listening to Spotify: Song - Artist");
eq("album art is kept", spotify.activityArtUrl, "https://i.scdn.co/x.jpg");
eq(
  "a custom status renders with its emoji",
  lanyard.parseLanyard("1", payload({ activities: [{ type: 4, state: "brb", emoji: { name: "🎮" } }] })).customStatus,
  "🎮 brb",
);
check(
  "a custom status is not treated as an activity",
  lanyard.parseLanyard("1", payload({ activities: [{ type: 4, state: "brb" }] })).activity === null,
);

// Malformed input must never throw.
for (const [label, bad] of [
  ["null", null],
  ["a string", "nope"],
  ["an empty object", {}],
  ["success false", { success: false }],
  ["no data", { success: true }],
  ["data is not an object", { success: true, data: 5 }],
  ["activities is not an array", payload({ activities: "no" })],
  ["an activity is null", payload({ activities: [null] })],
  ["an activity has no name", payload({ activities: [{ type: 0 }] })],
  ["discord_user missing", { success: true, data: { discord_status: "online" } }],
  ["spotify is malformed", payload({ spotify: { song: 5 } })],
]) {
  let threw = false;
  let out;
  try {
    out = lanyard.parseLanyard("1", bad);
  } catch {
    threw = true;
  }
  check(`malformed payload does not throw: ${label}`, !threw);
  check(`malformed payload returns null or a safe shape: ${label}`, threw || out === null || typeof out === "object");
}

eq("lanyard url for the owner", lanyard.lanyardUrl("1488686761264549939"), "https://api.lanyard.rest/v1/users/1488686761264549939");
check("the fallback still shows the owner", /Discord status unavailable/.test(src.ownerCard));
check("the fallback still links the profile", /discordProfileUrl/.test(src.ownerCard));
check("presence failures do not blank the owner card", /allSettled/.test(src.ownerCard));
check("refresh is not aggressive", /REFRESH_MS = 4[0-9]_?[0-9]*|REFRESH_MS = [3-9][0-9]_000/.test(src.ownerCard));
check("no empty activity box is rendered", /presence\?\.activity && \(/.test(src.ownerCard));
check("the build does not depend on Lanyard", /"use client"/.test(src.ownerCard.slice(0, 40)));
check("about page shows the owner section", /Meet the owner/.test(src.about));
check("about page carries the support mailto", /SUPPORT_MAILTO/.test(src.about));
check(
  "the private mailbox appears nowhere in rendered output",
  !/gdmacros\.com@gmail\.com/.test(src.about + src.ownerCard + src.faq + src.terms + src.privacy + src.adminUi),
);

/* ------------------------------------------------------------------ */

console.log(`\n${passed} passed, ${failed} failed`);
if (failures.length) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  - ${f}`);
}
process.exit(failed ? 1 : 0);
