import "server-only";

import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "./config";

const SECRET_KEY = process.env.SUPABASE_SECRET_KEY ?? "";
export const isSupportTicketEmailQueueConfigured = Boolean(SUPABASE_URL && SECRET_KEY);

function adminClient() {
  if (!isSupportTicketEmailQueueConfigured) throw new Error("Support email queue is not configured");
  return createClient(SUPABASE_URL, SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
export interface ClaimedSupportTicketEmail {
  notification_id: string;
  user_id: string;
  recipient_email: string;
  subject: string;
  html_body: string;
  text_body: string;
  first_attempt_at: string | null;
  lease_id: string;
}

function firstRow(data: unknown): ClaimedSupportTicketEmail | null {
  const candidate = Array.isArray(data) ? data[0] : data;
  if (!candidate || typeof candidate !== "object") return null;
  const row = candidate as Partial<ClaimedSupportTicketEmail>;
  if (
    typeof row.notification_id !== "string" ||
    typeof row.user_id !== "string" ||
    typeof row.recipient_email !== "string" ||
    typeof row.subject !== "string" ||
    typeof row.html_body !== "string" ||
    typeof row.text_body !== "string" ||
    typeof row.lease_id !== "string"
  ) return null;

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

export async function claimSupportTicketEmail(notificationId: string | null) {
  try {
    const { data, error } = await adminClient().rpc("claim_support_ticket_email", {
      p_notification: notificationId,
    });
    return { job: error ? null : firstRow(data), error: Boolean(error) };
  } catch {
    return { job: null, error: true };
  }
}

export async function recordSupportTicketEmail(
  notificationId: string,
  leaseId: string,
  status: "sent" | "retryable" | "failed",
  providerMessageId: string | null,
  errorCategory: string | null,
): Promise<boolean> {
  try {
    const { data, error } = await adminClient().rpc("record_support_ticket_email", {
      p_notification: notificationId,
      p_lease: leaseId,
      p_status: status,
      p_provider_message_id: providerMessageId,
      p_error: errorCategory,
    });
    return !error && data === true;
  } catch {
    return false;
  }
}

export async function purgeExpiredSupportTickets(): Promise<number | null> {
  try {
    const { data, error } = await adminClient().rpc("purge_expired_support_tickets");
    return error ? null : Number(data ?? 0);
  } catch {
    return null;
  }
}
