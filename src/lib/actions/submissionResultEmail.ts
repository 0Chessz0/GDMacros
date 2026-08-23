"use server";

import { isCurrentUserAdmin } from "@/lib/admin";
import {
  isSubmissionResultSenderConfigured,
  sendSubmissionResultEmail,
} from "@/lib/email/submissionResult";
import { getUser } from "@/lib/supabase/server";
import {
  claimResultEmail,
  isResultEmailQueueConfigured,
  recordResultEmail,
  type ClaimedResultEmail,
} from "@/lib/supabase/result-email-admin";

export interface RetryMySubmissionResultEmailsResult {
  ok: boolean;
  attempted: number;
  sent: number;
}

async function recordOutcome(
  job: ClaimedResultEmail,
  outcome: Awaited<ReturnType<typeof sendSubmissionResultEmail>>,
): Promise<boolean> {
  if (outcome.ok) {
    return recordResultEmail(
      job.notification_id,
      job.lease_id,
      "sent",
      outcome.providerMessageId,
      null,
    );
  }

  return recordResultEmail(
    job.notification_id,
    job.lease_id,
    outcome.status,
    null,
    outcome.category,
  );
}

async function claimAndSend(
  notificationId: string | null,
  expectedUserId: string | null,
): Promise<"none" | "sent" | "failed"> {
  try {
    const claimed = await claimResultEmail(notificationId, expectedUserId);
    if (claimed.error) return "failed";
    const job = claimed.job;
    if (!job) return "none";

    // The service-only RPC is the real boundary. Keep these comparisons as
    // defence in depth so a future SQL regression cannot make an owner retry
    // send somebody else's job or an exact hook send a different notification.
    const wrongOwner = expectedUserId !== null && job.user_id !== expectedUserId;
    const wrongNotification = notificationId !== null && job.notification_id !== notificationId;
    if (wrongOwner || wrongNotification) {
      await recordResultEmail(
        job.notification_id,
        job.lease_id,
        "failed",
        null,
        "claim_mismatch",
      );
      return "failed";
    }

    const outcome = await sendSubmissionResultEmail({
      notificationId: job.notification_id,
      recipient: job.recipient_email,
      subject: job.subject,
      html: job.html_body,
      text: job.text_body,
    });

    const recorded = await recordOutcome(job, outcome);
    return outcome.ok && recorded ? "sent" : "failed";
  } catch {
    // The database outcome and in-app notification already committed. A mail
    // failure cannot make acceptance or rejection appear to have failed.
    return "failed";
  }
}

/** Best-effort delivery hook called after an admin outcome commits. */
export async function sendSubmissionResultBestEffort(notificationId: string): Promise<void> {
  try {
    if (!isResultEmailQueueConfigured) return;
    const id = notificationId.trim();
    if (!id) return;

    const user = await getUser();
    if (!user || !(await isCurrentUserAdmin())) return;

    // A queue visit still performs the privacy sweep even while Resend is not
    // configured. Never claim a pending payload until there is a sender.
    if (!isSubmissionResultSenderConfigured) {
      await claimResultEmail(null, null);
      return;
    }

    await claimAndSend(id, null);
  } catch {
    // Never throw into the accepted/rejected outcome that called this hook.
  }
}

/**
 * Retries at most three queued jobs belonging to the signed-in account.
 * The server validates the user and passes only that UUID to the privileged,
 * service-role queue wrapper; no recipient or message crosses into the client.
 */
export async function retryMySubmissionResultEmails(): Promise<RetryMySubmissionResultEmailsResult> {
  const result: RetryMySubmissionResultEmailsResult = { ok: false, attempted: 0, sent: 0 };

  try {
    if (!isResultEmailQueueConfigured) return result;

    const user = await getUser();
    if (!user) return result;

    result.ok = true;
    if (!isSubmissionResultSenderConfigured) {
      await claimResultEmail(null, null);
      return result;
    }

    for (let i = 0; i < 3; i++) {
      const outcome = await claimAndSend(null, user.id);
      if (outcome === "none") break;
      result.attempted++;
      if (outcome === "sent") result.sent++;
    }
  } catch {
    result.ok = false;
  }

  return result;
}
