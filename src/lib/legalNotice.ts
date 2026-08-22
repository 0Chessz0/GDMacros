/**
 * Legal notice broadcast: batching, idempotency and message rendering.
 *
 * Pure. No Resend import, no database, no secrets, so the rules that decide who
 * gets what can be tested exhaustively without a network.
 *
 * WHAT THIS IS, AND IS NOT
 * ------------------------
 * This is a transactional notice channel for Terms changes, Privacy changes and
 * important account or service messages. It is NOT a mailing list. There is no
 * audience, no campaign, no subscriber state and no unsubscribe, because there
 * is nothing to unsubscribe from: having an account is the only reason anyone
 * receives one. Resend's Broadcast and Audience features are deliberately not
 * used, since those model marketing.
 */

import { escapeHtml } from "./escapeHtml";
import { PRIVACY_PATH, TERMS_PATH } from "./legal";
import { SUPPORT_EMAIL } from "./support";

/** Sender identity. The private forwarding mailbox is never the sender. */
export const NOTICE_FROM = `GDMacros <${SUPPORT_EMAIL}>`;
export const NOTICE_REPLY_TO = SUPPORT_EMAIL;

/**
 * Resend accepts at most 100 messages per batch call. Verified against the
 * installed SDK, which types `batch.send` as a plain array and imposes no
 * smaller limit of its own, so the cap is the API's and belongs here.
 */
export const MAX_BATCH_SIZE = 100;

export type NoticeType = "terms" | "privacy" | "terms_and_privacy" | "service";

export const NOTICE_TYPES: { value: NoticeType; label: string }[] = [
  { value: "terms", label: "Terms of Service update" },
  { value: "privacy", label: "Privacy Policy update" },
  { value: "terms_and_privacy", label: "Terms and Privacy update" },
  { value: "service", label: "Important account or service notice" },
];

export function isNoticeType(v: unknown): v is NoticeType {
  return NOTICE_TYPES.some((t) => t.value === v);
}

/** Which documents a notice type links to. */
export function linkedDocuments(type: NoticeType): ("terms" | "privacy")[] {
  switch (type) {
    case "terms":
      return ["terms"];
    case "privacy":
      return ["privacy"];
    case "terms_and_privacy":
      return ["terms", "privacy"];
    default:
      return [];
  }
}

/* ------------------------------------------------------------------ *
 * Batching
 * ------------------------------------------------------------------ */

/**
 * Splits recipients into fixed, numbered batches.
 *
 * DETERMINISM IS THE POINT. Membership is decided ONCE, when the run is
 * prepared, and stored. It is never recomputed as "the next 100 pending
 * users", because that set shifts as deliveries resolve and as accounts are
 * created: a retry would then send to a different group under the same
 * idempotency key, which is exactly how a legal notice gets sent twice to one
 * person and never to another.
 *
 * Input is sorted by user id first, so the same population always produces the
 * same batches regardless of the order the enumeration happened to return.
 */
export function planBatches(userIds: string[], size = MAX_BATCH_SIZE): string[][] {
  const capped = Math.max(1, Math.min(size, MAX_BATCH_SIZE));
  const unique = [...new Set(userIds.filter((id) => typeof id === "string" && id.length > 0))];
  unique.sort();

  const out: string[][] = [];
  for (let i = 0; i < unique.length; i += capped) out.push(unique.slice(i, i + capped));
  return out;
}

/**
 * The idempotency key for one batch.
 *
 * Stable across retries by construction: it is derived only from the run id and
 * the batch number, both of which are fixed when the run is prepared. If a
 * batch reached Resend but our own state update failed, the retry presents the
 * same key and Resend returns the original result instead of sending again.
 */
export function batchIdempotencyKey(runId: string, batchNumber: number): string {
  return `legal-notice/${runId}/batch/${batchNumber}`;
}

/**
 * How long Resend's idempotency window can be relied on.
 *
 * Past this, presenting the same key is no longer a guarantee of deduplication,
 * so a batch whose outcome is still unknown must NOT be retried blindly. It is
 * marked for a human instead: sending a duplicate legal notice is worse than
 * leaving one batch for an operator to look at.
 */
export const IDEMPOTENCY_WINDOW_HOURS = 24;

export function isBeyondIdempotencyWindow(sentAt: string | number | Date, now: number): boolean {
  const t = sentAt instanceof Date ? sentAt.getTime() : new Date(sentAt).getTime();
  if (!Number.isFinite(t)) return true;
  return now - t > IDEMPOTENCY_WINDOW_HOURS * 3600 * 1000;
}

/* ------------------------------------------------------------------ *
 * Message rendering
 * ------------------------------------------------------------------ */

export interface NoticeContent {
  type: NoticeType;
  subject: string;
  /** Plain text written by the admin. Never HTML. */
  message: string;
  termsVersion: string;
  privacyVersion: string;
  effectiveDate?: string | null;
  /** Canonical origin, e.g. https://www.gdmacros.com */
  siteUrl: string;
}

/**
 * Turns admin-written plain text into paragraphs.
 *
 * The admin supplies TEXT, never markup. Every character is escaped before it
 * reaches the template, so a pasted `<script>` or `<img onerror=...>` is
 * rendered as literal text in the mail rather than executed by whatever client
 * opens it. Only the newline-to-paragraph conversion is structural, and it is
 * applied after escaping, so it cannot be used to inject a tag.
 */
export function renderMessageHtml(message: string): string {
  return String(message ?? "")
    .split(/\n{2,}/)
    .map((para) => para.trim())
    .filter(Boolean)
    .map(
      (para) =>
        `<p style="margin:0 0 14px">${escapeHtml(para).split("\n").join("<br />")}</p>`,
    )
    .join("");
}

/** Absolute canonical links, built from the site origin rather than hardcoded. */
export function documentLinks(type: NoticeType, siteUrl: string): { label: string; url: string }[] {
  const base = String(siteUrl ?? "").replace(/\/$/, "");
  return linkedDocuments(type).map((doc) =>
    doc === "terms"
      ? { label: "Terms of Service", url: `${base}${TERMS_PATH}` }
      : { label: "Privacy Policy", url: `${base}${PRIVACY_PATH}` },
  );
}

const FOOTER_TEXT =
  "You are receiving this because you have a GDMacros account. This is an important account and service notice, not a marketing email.";

export function renderNoticeHtml(c: NoticeContent): string {
  const links = documentLinks(c.type, c.siteUrl);

  const versionRows: string[] = [];
  for (const doc of linkedDocuments(c.type)) {
    const v = doc === "terms" ? c.termsVersion : c.privacyVersion;
    const name = doc === "terms" ? "Terms of Service" : "Privacy Policy";
    versionRows.push(`${escapeHtml(name)} version ${escapeHtml(v)}`);
  }
  if (c.effectiveDate) versionRows.push(`Effective ${escapeHtml(c.effectiveDate)}`);

  const linkHtml = links.length
    ? `<p style="margin:0 0 14px">${links
        .map(
          (l) =>
            `<a href="${escapeHtml(l.url)}" style="color:#3b82f6;text-decoration:underline">${escapeHtml(
              l.label,
            )}</a>`,
        )
        .join(" &nbsp;·&nbsp; ")}</p>`
    : "";

  const versionHtml = versionRows.length
    ? `<p style="margin:0 0 14px;color:#6b7280;font-size:13px">${versionRows.join("<br />")}</p>`
    : "";

  return [
    `<div style="font:15px/1.6 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111827;max-width:560px;margin:0 auto;padding:24px">`,
    `<p style="margin:0 0 20px;font-size:18px;font-weight:800;letter-spacing:.04em;text-transform:uppercase">GDMacros</p>`,
    renderMessageHtml(c.message),
    linkHtml,
    versionHtml,
    `<hr style="border:0;border-top:1px solid #e5e7eb;margin:20px 0" />`,
    `<p style="margin:0 0 8px;color:#6b7280;font-size:12px">${escapeHtml(FOOTER_TEXT)}</p>`,
    `<p style="margin:0;color:#6b7280;font-size:12px">Questions: <a href="mailto:${escapeHtml(
      SUPPORT_EMAIL,
    )}" style="color:#3b82f6">${escapeHtml(SUPPORT_EMAIL)}</a></p>`,
    `</div>`,
  ].join("");
}

export function renderNoticeText(c: NoticeContent): string {
  const lines = ["GDMacros", "", String(c.message ?? "").trim(), ""];

  for (const l of documentLinks(c.type, c.siteUrl)) lines.push(`${l.label}: ${l.url}`);
  for (const doc of linkedDocuments(c.type)) {
    const v = doc === "terms" ? c.termsVersion : c.privacyVersion;
    lines.push(`${doc === "terms" ? "Terms of Service" : "Privacy Policy"} version ${v}`);
  }
  if (c.effectiveDate) lines.push(`Effective ${c.effectiveDate}`);

  lines.push("", "-".repeat(48), FOOTER_TEXT, `Questions: ${SUPPORT_EMAIL}`);
  return lines.filter((l) => l !== undefined).join("\n");
}

export interface NoticeMessage {
  from: string;
  to: string;
  replyTo: string;
  subject: string;
  html: string;
  text: string;
}

/**
 * One message per recipient.
 *
 * Each address is its own message with a single `to`. Never a shared To or Cc:
 * that would disclose the whole account list to every account holder, which is
 * a data breach rather than a formatting mistake.
 */
export function buildBatchMessages(emails: string[], c: NoticeContent): NoticeMessage[] {
  const html = renderNoticeHtml(c);
  const text = renderNoticeText(c);
  const subject = String(c.subject ?? "").trim() || "Important GDMacros account notice";

  return emails.map((to) => ({
    from: NOTICE_FROM,
    to,
    replyTo: NOTICE_REPLY_TO,
    subject,
    html,
    text,
  }));
}

/* ------------------------------------------------------------------ *
 * Progress
 * ------------------------------------------------------------------ */

export interface RunCounts {
  total: number;
  sent: number;
  pending: number;
  failed: number;
  needsReview: number;
}

export function runIsComplete(c: RunCounts): boolean {
  return c.total > 0 && c.pending === 0 && c.failed === 0 && c.needsReview === 0;
}

/** The phrase an admin must type before a run may start. */
export const SEND_CONFIRMATION = "SEND TO ALL ACCOUNTS";
