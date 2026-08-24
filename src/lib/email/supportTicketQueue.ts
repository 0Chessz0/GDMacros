import "server-only";

import { isSupportTicketSenderConfigured, sendSupportTicketEmail } from "./supportTicket";
import {
  claimSupportTicketEmail,
  isSupportTicketEmailQueueConfigured,
  recordSupportTicketEmail,
} from "@/lib/supabase/support-ticket-email-admin";

export async function claimAndSendSupportTicketEmail(
  notificationId: string | null,
): Promise<"none" | "sent" | "failed"> {
  try {
    if (!isSupportTicketEmailQueueConfigured || !isSupportTicketSenderConfigured) return "failed";
    const claimed = await claimSupportTicketEmail(notificationId);
    if (claimed.error) return "failed";
    const job = claimed.job;
    if (!job) return "none";

    const outcome = await sendSupportTicketEmail({
      notificationId: job.notification_id,
      recipient: job.recipient_email,
      subject: job.subject,
      html: job.html_body,
      text: job.text_body,
    });
    const recorded = await recordSupportTicketEmail(
      job.notification_id,
      job.lease_id,
      outcome.ok ? "sent" : outcome.status,
      outcome.ok ? outcome.providerMessageId : null,
      outcome.ok ? null : outcome.category,
    );
    return outcome.ok && recorded ? "sent" : "failed";
  } catch {
    return "failed";
  }
}

export interface SupportTicketDrainResult {
  ok: boolean;
  attempted: number;
  sent: number;
  failed: number;
  drained: boolean;
}

export async function drainSupportTicketEmailQueue(max = 20): Promise<SupportTicketDrainResult> {
  const result: SupportTicketDrainResult = {
    ok: false,
    attempted: 0,
    sent: 0,
    failed: 0,
    drained: false,
  };
  if (!isSupportTicketEmailQueueConfigured) return result;
  result.ok = true;
  if (!isSupportTicketSenderConfigured) return result;

  for (let i = 0; i < Math.max(1, max); i++) {
    const outcome = await claimAndSendSupportTicketEmail(null);
    if (outcome === "none") {
      result.drained = true;
      break;
    }
    result.attempted++;
    if (outcome === "sent") result.sent++;
    else {
      result.failed++;
      break;
    }
  }
  return result;
}
