"use server";

import { isCurrentUserAdmin } from "@/lib/admin";
import { isSubmissionResultSenderConfigured } from "@/lib/email/submissionResult";
import { claimAndSendResultEmail } from "@/lib/email/resultQueue";
import { getUser } from "@/lib/supabase/server";
import { claimResultEmail, isResultEmailQueueConfigured } from "@/lib/supabase/result-email-admin";

export interface RetryMySubmissionResultEmailsResult {
  ok: boolean;
  attempted: number;
  sent: number;
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

    await claimAndSendResultEmail(id, null);
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
      const outcome = await claimAndSendResultEmail(null, user.id);
      if (outcome === "none") break;
      result.attempted++;
      if (outcome === "sent") result.sent++;
    }
  } catch {
    result.ok = false;
  }

  return result;
}
