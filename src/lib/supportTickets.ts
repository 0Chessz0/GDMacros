export const SUPPORT_TICKET_LIMITS = {
  title: 120,
  message: 5000,
  closeReason: 500,
} as const;

export type SupportTicketKind = "suggestion" | "broken_macro";
export type SupportTicketStatus = "open" | "resolved" | "closed";

export interface SupportTicketRow {
  id: string;
  ticket_number: number;
  opened_by: string;
  kind: SupportTicketKind;
  title: string;
  macro_slug: string | null;
  macro_name: string | null;
  macro_level_id: string | null;
  status: SupportTicketStatus;
  close_reason: string | null;
  closed_at: string | null;
  delete_after: string | null;
  created_at: string;
  updated_at: string;
}

export interface SupportTicketMessageRow {
  id: string;
  ticket_id: string;
  author_id: string | null;
  author_role: "user" | "admin";
  body: string;
  created_at: string;
}

export interface AccountNotificationRow {
  id: string;
  kind: "support_ticket_closed";
  ticket_id: string;
  title: string;
  message: string;
  read_at: string | null;
  expires_at: string;
  created_at: string;
}

export const SUPPORT_TICKET_COLUMNS =
  "id,ticket_number,opened_by,kind,title,macro_slug,macro_name,macro_level_id,status,close_reason,closed_at,delete_after,created_at,updated_at";

export const SUPPORT_TICKET_MESSAGE_COLUMNS =
  "id,ticket_id,author_id,author_role,body,created_at";

export const ACCOUNT_NOTIFICATION_COLUMNS =
  "id,kind,ticket_id,title,message,read_at,expires_at,created_at";

export const SUPPORT_STATUS_LABEL: Record<SupportTicketStatus, string> = {
  open: "Open",
  resolved: "Resolved",
  closed: "Closed",
};

export function supportTicketError(error: unknown): string {
  const message = String((error as { message?: string })?.message ?? "").toLowerCase();
  if (message.includes("not authenticated")) return "Sign in again and retry.";
  if (message.includes("choose a username")) return "Choose a username before opening a ticket.";
  if (message.includes("support tickets blocked")) {
    return "Your account cannot open new support tickets.";
  }
  if (message.includes("too many open tickets")) {
    return "You already have five open tickets. Close one before opening another.";
  }
  if (message.includes("ticket unavailable or closed")) {
    return "That ticket is closed or no longer available.";
  }
  if (message.includes("message rate limit")) return "Too many comments. Wait a while before replying again.";
  if (message.includes("ticket message limit")) return "This thread is full. An admin must close it and open a follow-up if needed.";
  if (message.includes("not found or already closed")) return "That ticket is already closed.";
  if (message.includes("not authorised")) return "You do not have permission to do that.";
  if (message.includes("cannot ban an administrator")) return "Administrators cannot be blocked.";
  if (message.includes("invalid title")) return "Use a title between 5 and 120 characters.";
  if (message.includes("invalid message")) return "Write between 3 and 5,000 characters.";
  if (message.includes("invalid close reason")) return "Give a reason between 3 and 500 characters.";
  return "That could not be saved. Please try again.";
}

export function ticketDate(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
