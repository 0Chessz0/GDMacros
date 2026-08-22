import "server-only";

import { Resend } from "resend";
import type { NoticeMessage } from "../legalNotice";

/**
 * Sending legal and account notices, in bounded batches.
 *
 * Reuses RESEND_SUPPORT_API_KEY, the key that already sends support replies.
 * Notices come from support@gdmacros.com and are answered at
 * support@gdmacros.com, so they belong to the same identity: a second key would
 * be another secret to hold with no separation gained.
 *
 * Transactional batch sending only. Resend's Broadcast and Audience features
 * model marketing campaigns with subscriber state and unsubscribe handling, and
 * this is not that: these are account notices to people who have an account,
 * and there is nothing to subscribe to.
 */

const API_KEY = process.env.RESEND_SUPPORT_API_KEY ?? "";

export const isNoticeSenderConfigured = Boolean(API_KEY);

function client(): Resend {
  if (!API_KEY) throw new Error("Notice sending is not configured");
  return new Resend(API_KEY);
}

export type BatchOutcome =
  | { ok: true; messageIds: (string | null)[] }
  /**
   * `ambiguous` means the request may or may not have been delivered to Resend.
   * It is deliberately distinct from a clean failure: a clean failure can be
   * retried, whereas an ambiguous one can only be retried safely while the
   * idempotency key still protects it.
   */
  | { ok: false; ambiguous: boolean; category: string };

/**
 * Sends one prepared batch under a fixed idempotency key.
 *
 * The key is derived from the run and batch number, so a retry of the same
 * batch presents the same key and Resend returns the original result instead of
 * sending a second copy. That is the entire defence against somebody receiving
 * a legal notice twice, and it only works because batch membership is frozen
 * when the run is prepared.
 */
export async function sendNoticeBatch(
  messages: NoticeMessage[],
  idempotencyKey: string,
): Promise<BatchOutcome> {
  if (messages.length === 0) return { ok: true, messageIds: [] };

  try {
    const { data, error } = await client().batch.send(
      messages.map((m) => ({
        from: m.from,
        to: m.to,
        replyTo: m.replyTo,
        subject: m.subject,
        html: m.html,
        text: m.text,
      })),
      { idempotencyKey },
    );

    if (error || !data) {
      const status = (error as { statusCode?: number } | null)?.statusCode;
      // A timeout or a 5xx may have been processed anyway, so the outcome is
      // unknown rather than known-failed.
      const ambiguous = status === undefined || status >= 500 || status === 429;
      return { ok: false, ambiguous, category: `send_${status ?? "network"}` };
    }

    const ids = (data.data ?? []) as { id?: string }[];
    return { ok: true, messageIds: messages.map((_, i) => ids[i]?.id ?? null) };
  } catch {
    // An exception here is almost always a network fault mid-flight, which is
    // precisely the case where the request may still have been accepted.
    return { ok: false, ambiguous: true, category: "send_exception" };
  }
}

/**
 * A single test message to the admin's own address.
 *
 * Not part of any run, and given no idempotency key: a test is meant to be
 * repeatable, and it never touches delivery state.
 */
export async function sendNoticeTest(message: NoticeMessage): Promise<BatchOutcome> {
  try {
    const { data, error } = await client().emails.send({
      from: message.from,
      to: message.to,
      replyTo: message.replyTo,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });
    if (error || !data) {
      const status = (error as { statusCode?: number } | null)?.statusCode;
      return { ok: false, ambiguous: false, category: `test_${status ?? "network"}` };
    }
    return { ok: true, messageIds: [data.id] };
  } catch {
    return { ok: false, ambiguous: false, category: "test_exception" };
  }
}
