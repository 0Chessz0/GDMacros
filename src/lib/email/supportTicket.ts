import "server-only";

import { Resend } from "resend";
import { SUPPORT_EMAIL } from "@/lib/support";

const API_KEY = process.env.RESEND_SUPPORT_API_KEY ?? "";
const FROM = `GDMacros <${SUPPORT_EMAIL}>`;

export const isSupportTicketSenderConfigured = Boolean(API_KEY);

export interface SupportTicketEmail {
  notificationId: string;
  recipient: string;
  subject: string;
  html: string;
  text: string;
}
export type SupportTicketSendOutcome =
  | { ok: true; providerMessageId: string }
  | { ok: false; status: "retryable" | "failed"; category: string };

function failure(statusCode?: number): SupportTicketSendOutcome {
  const retryable =
    statusCode === undefined ||
    statusCode === 401 ||
    statusCode === 402 ||
    statusCode === 403 ||
    statusCode === 408 ||
    statusCode === 425 ||
    statusCode === 429 ||
    statusCode >= 500;
  return {
    ok: false,
    status: retryable ? "retryable" : "failed",
    category: `send_${statusCode ?? "network"}`,
  };
}

export async function sendSupportTicketEmail(
  message: SupportTicketEmail,
): Promise<SupportTicketSendOutcome> {
  if (!API_KEY) return { ok: false, status: "failed", category: "send_not_configured" };

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
      { idempotencyKey: `support-ticket/${message.notificationId}` },
    );
    if (error || !data?.id) return failure((error as { statusCode?: number } | null)?.statusCode);
    return { ok: true, providerMessageId: data.id };
  } catch {
    return failure();
  }
}
