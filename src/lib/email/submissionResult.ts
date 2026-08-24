import "server-only";

import { Resend } from "resend";
import { SUPPORT_EMAIL } from "@/lib/support";

/**
 * The transport for one frozen submission-result email.
 *
 * The database prepares the complete payload before it is claimed. That is
 * important for Resend idempotency: a retry must use the same recipient and
 * body as the first attempt, not rebuild either from mutable account data.
 * Nothing in this module logs or returns those frozen fields.
 */

const API_KEY = process.env.RESEND_SUPPORT_API_KEY ?? "";
const FROM = `GDMacros <${SUPPORT_EMAIL}>`;

export const isSubmissionResultSenderConfigured = Boolean(API_KEY);

export interface SubmissionResultEmail {
  notificationId: string;
  recipient: string;
  subject: string;
  html: string;
  text: string;
}

export type SubmissionResultSendOutcome =
  | { ok: true; providerMessageId: string }
  | {
      ok: false;
      /** Transient or repairable failures keep the frozen job retryable. */
      status: "retryable" | "failed";
      ambiguous: boolean;
      /** A coarse operational category. Never a provider message or payload. */
      category: string;
    };

/** Stable for every attempt at the same frozen notification payload. */
export function submissionResultIdempotencyKey(notificationId: string): string {
  return `submission-result/${notificationId}`;
}

function failure(statusCode?: number): SubmissionResultSendOutcome {
  // Network, timeout, rate-limit and provider failures may have happened after
  // Resend accepted the request. Authentication, billing and sending-domain
  // failures definitely did not, but are still repairable configuration. Both
  // groups preserve the frozen job; `ambiguous` distinguishes duplicate risk.
  if (
    statusCode === undefined ||
    statusCode === 401 ||
    statusCode === 402 ||
    statusCode === 403 ||
    statusCode === 408 ||
    statusCode === 425 ||
    statusCode === 429 ||
    statusCode >= 500
  ) {
    return {
      ok: false,
      status: "retryable",
      ambiguous:
        statusCode === undefined ||
        statusCode === 408 ||
        statusCode === 425 ||
        statusCode === 429 ||
        statusCode >= 500,
      category: `send_${statusCode ?? "network"}`,
    };
  }

  // Other concrete 4xx responses mean the request or recipient was refused in
  // a way that changing deployment configuration will not repair.
  if (statusCode >= 400 && statusCode < 500) {
    return {
      ok: false,
      status: "failed",
      ambiguous: false,
      category: `send_${statusCode}`,
    };
  }

  // Resend normally reports either 4xx or 5xx. An unexpected status is treated
  // conservatively because delivery cannot be proven from it.
  return {
    ok: false,
    status: "retryable",
    ambiguous: true,
    category: `send_${statusCode}`,
  };
}

/**
 * Sends one already-frozen result email.
 *
 * This function never throws, and its result contains no address, subject or
 * body. The API key is supplied explicitly so the SDK cannot silently borrow a
 * differently named environment variable.
 */
export async function sendSubmissionResultEmail(
  message: SubmissionResultEmail,
): Promise<SubmissionResultSendOutcome> {
  if (!API_KEY) {
    return {
      ok: false,
      status: "failed",
      ambiguous: false,
      category: "send_not_configured",
    };
  }

  try {
    const resend = new Resend(API_KEY);
    const { data, error } = await resend.emails.send(
      {
        from: FROM,
        to: message.recipient,
        replyTo: SUPPORT_EMAIL,
        subject: message.subject,
        html: message.html,
        text: message.text,
      },
      { idempotencyKey: submissionResultIdempotencyKey(message.notificationId) },
    );

    if (error || !data?.id) {
      return failure((error as { statusCode?: number } | null)?.statusCode);
    }

    return { ok: true, providerMessageId: data.id };
  } catch {
    return failure();
  }
}
