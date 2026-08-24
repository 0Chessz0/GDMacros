import "server-only";

import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "./config";

/**
 * Narrow service-role access for the private submission-result email queue.
 *
 * Frozen recipients and message bodies must never be returned by a browser-
 * executable RPC. These two wrappers are the only code allowed to invoke the
 * service-role-only claim/record functions, and the raw privileged client never
 * leaves this module.
 */

const SECRET_KEY = process.env.SUPABASE_SECRET_KEY ?? "";
export const isResultEmailQueueConfigured = Boolean(SUPABASE_URL && SECRET_KEY);

function adminClient() {
  if (!isResultEmailQueueConfigured) throw new Error("Result email queue is not configured");
  return createClient(SUPABASE_URL, SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export interface ClaimedResultEmail {
  notification_id: string;
  user_id: string;
  recipient_email: string;
  subject: string;
  html_body: string;
  text_body: string;
  first_attempt_at: string | null;
  lease_id: string;
}

function firstRow(data: unknown): ClaimedResultEmail | null {
  const candidate = Array.isArray(data) ? data[0] : data;
  if (!candidate || typeof candidate !== "object") return null;

  const row = candidate as Partial<ClaimedResultEmail>;
  if (
    typeof row.notification_id !== "string" ||
    typeof row.user_id !== "string" ||
    typeof row.recipient_email !== "string" ||
    typeof row.subject !== "string" ||
    typeof row.html_body !== "string" ||
    typeof row.text_body !== "string" ||
    typeof row.lease_id !== "string"
  ) {
    return null;
  }

  return {
    notification_id: row.notification_id,
    user_id: row.user_id,
    recipient_email: row.recipient_email,
    subject: row.subject,
    html_body: row.html_body,
    text_body: row.text_body,
    first_attempt_at: typeof row.first_attempt_at === "string" ? row.first_attempt_at : null,
    lease_id: row.lease_id,
  };
}

export async function claimResultEmail(
  notificationId: string | null,
  userId: string | null,
): Promise<{ job: ClaimedResultEmail | null; error: boolean }> {
  try {
    const { data, error } = await adminClient().rpc("claim_submission_result_email", {
      p_notification: notificationId,
      p_user: userId,
    });
    if (error) return { job: null, error: true };
    return { job: firstRow(data), error: false };
  } catch {
    return { job: null, error: true };
  }
}

export async function recordResultEmail(
  notificationId: string,
  leaseId: string,
  status: "sent" | "retryable" | "failed",
  providerMessageId: string | null,
  errorCategory: string | null,
): Promise<boolean> {
  try {
    const { data, error } = await adminClient().rpc("record_submission_result_email", {
      p_notification: notificationId,
      p_lease: leaseId,
      p_status: status,
      p_provider_message_id: providerMessageId,
      p_error: errorCategory,
    });
    return !error && data === true;
  } catch {
    // The job remains leased and becomes claimable with the exact same frozen
    // payload and idempotency key after the database's stale-claim window.
    return false;
  }
}
