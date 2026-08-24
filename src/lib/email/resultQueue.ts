import "server-only";

import {
  isSubmissionResultSenderConfigured,
  sendSubmissionResultEmail,
} from "./submissionResult";
import {
  claimResultEmail,
  isResultEmailQueueConfigured,
  recordResultEmail,
  type ClaimedResultEmail,
} from "../supabase/result-email-admin";

/**
 * Claiming and sending one queued submission-result email.
 *
 * WHY THIS IS NOT IN THE ACTIONS FILE
 * -----------------------------------
 * `lib/actions/submissionResultEmail.ts` carries `"use server"`, which makes
 * every export a POST endpoint anyone on the internet can call. That is correct
 * for the two owner-scoped entry points there, both of which resolve the caller
 * with `getUser()` first.
 *
 * A drain is different: it takes no owner and claims whatever is next, so
 * exporting it from that file would publish an unauthenticated way to make the
 * server send mail. It lives here, `server-only` rather than `"use server"`, so
 * it is importable by trusted server code and reachable by nothing else. The
 * cron route is the only caller that passes no owner, and it authenticates
 * itself before doing so.
 */

function recordOutcome(
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
  return recordResultEmail(job.notification_id, job.lease_id, outcome.status, null, outcome.category);
}

/**
 * Claims one job and sends it.
 *
 * `expectedUserId` of null means "whatever is next", which only the cron worker
 * passes. A non-null value restricts the claim to that account's own jobs.
 */
export async function claimAndSendResultEmail(
  notificationId: string | null,
  expectedUserId: string | null,
): Promise<"none" | "sent" | "failed"> {
  try {
    const claimed = await claimResultEmail(notificationId, expectedUserId);
    if (claimed.error) return "failed";
    const job = claimed.job;
    if (!job) return "none";

    // The service-only RPC is the real boundary. These comparisons are defence
    // in depth so a future SQL regression cannot make an owner retry send
    // somebody else's job, or an exact hook send a different notification.
    const wrongOwner = expectedUserId !== null && job.user_id !== expectedUserId;
    const wrongNotification = notificationId !== null && job.notification_id !== notificationId;
    if (wrongOwner || wrongNotification) {
      await recordResultEmail(job.notification_id, job.lease_id, "failed", null, "claim_mismatch");
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
    // The outcome and the in-app notification already committed. A mail failure
    // must never make an acceptance or rejection appear to have failed.
    return "failed";
  }
}

export interface DrainResult {
  ok: boolean;
  attempted: number;
  sent: number;
  failed: number;
  /** True when the queue emptied rather than the batch cap being reached. */
  drained: boolean;
}

/**
 * Empties as much of the queue as one invocation safely can.
 *
 * BOUNDED ON PURPOSE. A serverless invocation has a wall-clock limit, and each
 * job is a network round trip to Resend, so an unbounded loop would be killed
 * partway through with no record of where it stopped. The cap means a large
 * backlog drains over several runs instead of one run dying repeatedly. Nothing
 * is lost either way: an unclaimed job stays queued, and a claimed one becomes
 * claimable again once its lease expires.
 *
 * Stops early on the first failure rather than grinding through the whole
 * batch. If Resend is refusing, the next twenty attempts will be refused too,
 * and each one burns an attempt counter for no gain.
 */
export async function drainResultEmailQueue(max = 20): Promise<DrainResult> {
  const result: DrainResult = { ok: false, attempted: 0, sent: 0, failed: 0, drained: false };

  if (!isResultEmailQueueConfigured) return result;
  result.ok = true;

  // With no sender configured there is nothing to send, but a claim still
  // performs the database's expiry sweep, which is the part that scrubs frozen
  // recipients whose retry window has passed. Worth running on its own.
  if (!isSubmissionResultSenderConfigured) {
    await claimResultEmail(null, null);
    return result;
  }

  for (let i = 0; i < Math.max(1, max); i++) {
    const outcome = await claimAndSendResultEmail(null, null);
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
