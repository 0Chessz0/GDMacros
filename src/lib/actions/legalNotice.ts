"use server";

import { createClient, getUser } from "@/lib/supabase/server";
import { isCurrentUserAdmin } from "@/lib/admin";
import { emailForUser, isAuthAdminConfigured, listAccountIds, resolveEmails } from "@/lib/supabase/auth-admin";
import { isNoticeSenderConfigured, sendNoticeBatch, sendNoticeTest } from "@/lib/email/notice";
import { site } from "@/lib/site";
import { PRIVACY_VERSION, TERMS_VERSION } from "@/lib/legal";
import {
  MAX_BATCH_SIZE,
  SEND_CONFIRMATION,
  batchIdempotencyKey,
  buildBatchMessages,
  isBeyondIdempotencyWindow,
  isNoticeType,
  renderNoticeHtml,
  renderNoticeText,
  type NoticeContent,
  type NoticeType,
} from "@/lib/legalNotice";

/**
 * The legal notice broadcast, as server actions.
 *
 * A server action is a POST endpoint anyone on the internet can call, so none
 * of these is the security boundary. Every RPC below calls
 * `private.can_send_legal_notice()` for itself, exactly as the review and
 * publish functions call `private.is_admin()`. The checks here fail fast with a
 * usable message and avoid doing expensive work for someone who will be
 * refused anyway.
 *
 * WHAT NEVER CROSSES THIS BOUNDARY
 * --------------------------------
 * An email address. Recipients are enumerated as account uuids, stored as
 * account uuids, and resolved to addresses only inside `sendNextBatch`, which
 * puts each address into exactly one outgoing message and returns counts. No
 * shape returned by any function in this file contains an address or a list of
 * accounts.
 */

export interface NoticeDraft {
  type: string;
  subject: string;
  message: string;
  effectiveDate?: string | null;
}

export interface PreviewResult {
  ok: boolean;
  error?: string;
  recipientCount?: number;
  truncated?: boolean;
  html?: string;
  text?: string;
  termsVersion?: string;
  privacyVersion?: string;
}

export interface RunProgress {
  ok: boolean;
  error?: string;
  runId?: string;
  status?: string;
  total?: number;
  sent?: number;
  pending?: number;
  failed?: number;
  needsReview?: number;
  batchCount?: number;
  done?: boolean;
}

function contentFrom(draft: NoticeDraft, type: NoticeType): NoticeContent {
  return {
    type,
    subject: draft.subject.trim(),
    message: draft.message.trim(),
    termsVersion: TERMS_VERSION,
    privacyVersion: PRIVACY_VERSION,
    effectiveDate: draft.effectiveDate?.trim() || null,
    siteUrl: site.url,
  };
}

function validate(draft: NoticeDraft): { type: NoticeType } | { error: string } {
  if (!isNoticeType(draft.type)) return { error: "Pick a notice type." };
  const subject = draft.subject?.trim() ?? "";
  const message = draft.message?.trim() ?? "";
  if (subject.length < 3 || subject.length > 200) return { error: "Subject must be 3 to 200 characters." };
  if (message.length < 3 || message.length > 5000) return { error: "Message must be 3 to 5000 characters." };
  // The admin writes TEXT. Markup is escaped at render time, so this is a
  // usability guard rather than the defence: it tells someone pasting HTML that
  // it will not do what they expect, instead of silently showing them tags.
  if (/<[a-z!/][^>]*>/i.test(message)) {
    return { error: "Write plain text. HTML is not accepted and would be shown as literal text." };
  }
  return { type: draft.type };
}

async function guard(): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const user = await getUser();
  if (!user) return { ok: false, error: "Not signed in." };
  if (!(await isCurrentUserAdmin())) return { ok: false, error: "Not authorised." };
  if (!isAuthAdminConfigured) return { ok: false, error: "Account lookup is not configured." };
  if (!isNoticeSenderConfigured) return { ok: false, error: "Email sending is not configured." };
  return { ok: true, userId: user.id };
}

/**
 * Renders the notice and counts who would receive it.
 *
 * Returns the COUNT and never the list. An admin deciding whether to send needs
 * to know how many people it reaches; they do not need every account holder's
 * address in their browser, and putting it there would turn one compromised
 * admin session into a full account dump.
 */
export async function previewNotice(draft: NoticeDraft): Promise<PreviewResult> {
  const g = await guard();
  if (!g.ok) return { ok: false, error: g.error };

  const v = validate(draft);
  if ("error" in v) return { ok: false, error: v.error };

  let recipients: { ids: string[]; truncated: boolean };
  try {
    recipients = await listAccountIds();
  } catch {
    return { ok: false, error: "Could not count accounts right now." };
  }

  const content = contentFrom(draft, v.type);
  return {
    ok: true,
    recipientCount: recipients.ids.length,
    truncated: recipients.truncated,
    html: renderNoticeHtml(content),
    text: renderNoticeText(content),
    termsVersion: TERMS_VERSION,
    privacyVersion: PRIVACY_VERSION,
  };
}

/** One test message to the signed-in admin's own address. Creates no run. */
export async function sendTestNotice(draft: NoticeDraft): Promise<{ ok: boolean; error?: string }> {
  const g = await guard();
  if (!g.ok) return { ok: false, error: g.error };

  const v = validate(draft);
  if ("error" in v) return { ok: false, error: v.error };

  const to = await emailForUser(g.userId);
  if (!to) return { ok: false, error: "Your account has no email address." };

  const [message] = buildBatchMessages([to], contentFrom(draft, v.type));
  const out = await sendNoticeTest(message);
  return out.ok ? { ok: true } : { ok: false, error: "The test message could not be sent." };
}

/**
 * Freezes the recipient list and creates the run.
 *
 * Nothing is sent here. Preparation and sending are separate on purpose: the
 * batch membership has to exist, and be stable, before the first message goes
 * out, or a retry could not reproduce it.
 */
export async function prepareNotice(
  draft: NoticeDraft,
  confirmation: string,
): Promise<RunProgress> {
  const g = await guard();
  if (!g.ok) return { ok: false, error: g.error };

  const v = validate(draft);
  if ("error" in v) return { ok: false, error: v.error };

  if (confirmation.trim() !== SEND_CONFIRMATION) {
    return { ok: false, error: `Type ${SEND_CONFIRMATION} exactly to continue.` };
  }

  let recipients: { ids: string[]; truncated: boolean };
  try {
    recipients = await listAccountIds();
  } catch {
    return { ok: false, error: "Could not list accounts right now." };
  }
  if (recipients.truncated) {
    return { ok: false, error: "Account enumeration did not finish. Nothing was prepared." };
  }
  if (recipients.ids.length === 0) return { ok: false, error: "There are no accounts to notify." };

  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Database unavailable." };

  const { data, error } = await supabase.rpc("legal_notice_prepare", {
    p_type: v.type,
    p_subject: draft.subject.trim(),
    p_message: draft.message.trim(),
    p_effective_date: draft.effectiveDate?.trim() || null,
    p_user_ids: recipients.ids,
    p_batch_size: MAX_BATCH_SIZE,
  });

  if (error) return { ok: false, error: "The notice could not be prepared." };
  const row = (data as { run_id: string; recipient_count: number; batch_count: number }[])?.[0];
  if (!row) return { ok: false, error: "The notice could not be prepared." };

  return {
    ok: true,
    runId: row.run_id,
    status: "prepared",
    total: row.recipient_count,
    sent: 0,
    pending: row.recipient_count,
    failed: 0,
    needsReview: 0,
    batchCount: row.batch_count,
    done: row.recipient_count === 0,
  };
}

/**
 * Sends exactly one batch, then returns.
 *
 * One bounded batch per request is the whole design. A single request that
 * stays alive until every message is sent would be killed by the platform's
 * timeout partway through, with no record of how far it got. Instead the UI
 * calls this repeatedly, and because progress is written to the database after
 * every batch, a refresh, a crash or an admin closing the page resumes from the
 * next unsent batch rather than from the beginning.
 */
export async function sendNextBatch(runId: string): Promise<RunProgress> {
  const g = await guard();
  if (!g.ok) return { ok: false, error: g.error };

  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Database unavailable." };

  const { data: claimed, error: claimError } = await supabase.rpc("legal_notice_claim_batch", {
    p_run: runId,
  });
  if (claimError) return { ok: false, error: "Could not read the next batch." };

  const batch = (claimed as { batch_number: number; user_ids: string[] }[])?.[0];
  if (!batch) return await runStatus(runId);

  // The run's own stored copy is the source of truth for every batch, including
  // retries, so a later edit to the draft in the browser cannot make a
  // half-sent run say two different things to two halves of the account list.
  const { data: stored, error: readError } = await supabase.rpc("legal_notice_content", {
    p_run: runId,
  });
  const row = (stored as {
    notice_type: string;
    subject: string;
    message: string;
    terms_version: string;
    privacy_version: string;
    effective_date: string | null;
  }[])?.[0];

  if (readError || !row) return { ok: false, error: "Could not read the prepared notice." };

  const content: NoticeContent = {
    type: row.notice_type as NoticeType,
    subject: row.subject,
    message: row.message,
    termsVersion: row.terms_version,
    privacyVersion: row.privacy_version,
    effectiveDate: row.effective_date,
    siteUrl: site.url,
  };

  let emails: Map<string, string>;
  try {
    emails = await resolveEmails(batch.user_ids);
  } catch {
    return { ok: false, error: "Could not resolve recipients. Nothing was sent." };
  }

  // Order matches the RPC's `order by user_id`, so message N corresponds to
  // user N and the returned ids line up on the way back.
  const ordered = [...batch.user_ids].sort();
  const addresses = ordered.map((id) => emails.get(id)).filter((e): e is string => Boolean(e));

  const messages = buildBatchMessages(addresses, content);
  const key = batchIdempotencyKey(runId, batch.batch_number);
  const outcome = await sendNoticeBatch(messages, key);

  if (outcome.ok) {
    await supabase.rpc("legal_notice_record_batch", {
      p_run: runId,
      p_batch: batch.batch_number,
      p_status: "sent",
      p_message_ids: outcome.messageIds,
      p_error: null,
    });
  } else {
    // An ambiguous outcome is NOT marked failed. A failed batch is retried, and
    // retrying something that may already have gone out is how a person
    // receives a legal notice twice. It is parked for a human instead.
    await supabase.rpc("legal_notice_record_batch", {
      p_run: runId,
      p_batch: batch.batch_number,
      p_status: outcome.ambiguous ? "needs_review" : "failed",
      p_message_ids: null,
      p_error: outcome.category,
    });
  }

  return await runStatus(runId);
}

/** Counts only. Safe to poll, and safe to render. */
export async function runStatus(runId?: string): Promise<RunProgress> {
  const g = await guard();
  if (!g.ok) return { ok: false, error: g.error };

  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Database unavailable." };

  const { data, error } = await supabase.rpc("legal_notice_latest");
  if (error) return { ok: false, error: "Could not read the run." };

  const rows = (data ?? []) as {
    id: string;
    status: string;
    recipient_count: number;
    batch_count: number;
    sent: number;
    pending: number;
    failed: number;
    needs_review: number;
  }[];
  const row = runId ? rows.find((r) => r.id === runId) : rows[0];
  if (!row) return { ok: true, done: true };

  return {
    ok: true,
    runId: row.id,
    status: row.status,
    total: row.recipient_count,
    sent: row.sent,
    pending: row.pending,
    failed: row.failed,
    needsReview: row.needs_review,
    batchCount: row.batch_count,
    done: row.pending === 0 && row.failed === 0,
  };
}

/**
 * Whether an unresolved batch may still be retried safely.
 *
 * Exposed so the UI can explain why a `needs_review` batch has no retry button
 * once Resend's idempotency window has passed: beyond it, presenting the same
 * key no longer guarantees deduplication, and an unnecessary duplicate legal
 * notice is worse than an operator looking at one batch by hand.
 */
export async function batchStillProtected(sentAt: string): Promise<boolean> {
  return !isBeyondIdempotencyWindow(sentAt, Date.now());
}
