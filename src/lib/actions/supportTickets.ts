"use server";

import { revalidatePath } from "next/cache";
import { isCurrentUserAdmin } from "@/lib/admin";
import { claimAndSendSupportTicketEmail } from "@/lib/email/supportTicketQueue";
import { getLevelBySlug } from "@/lib/macros";
import { createClient, getUser } from "@/lib/supabase/server";
import {
  SUPPORT_TICKET_LIMITS,
  supportTicketError,
  type SupportTicketStatus,
} from "@/lib/supportTickets";

type TicketResult =
  | { ok: true; href: string; ticketNumber: number }
  | { ok: false; error: string; loginHref?: string };
type Result = { ok: true } | { ok: false; error: string };

function firstTicket(data: unknown): { ticket_id: string; ticket_number: number } | null {
  const candidate = Array.isArray(data) ? data[0] : data;
  if (!candidate || typeof candidate !== "object") return null;
  const row = candidate as { ticket_id?: unknown; ticket_number?: unknown };
  const number = typeof row.ticket_number === "number" ? row.ticket_number : Number(row.ticket_number);
  if (typeof row.ticket_id !== "string" || !Number.isSafeInteger(number)) return null;
  return { ticket_id: row.ticket_id, ticket_number: number };
}

async function createTicket(input: {
  kind: "suggestion" | "broken_macro";
  title: string;
  body: string;
  macroSlug?: string;
  macroName?: string;
  macroLevelId?: string;
}): Promise<TicketResult> {
  const user = await getUser();
  if (!user) {
    const next = input.kind === "suggestion" ? "/support/new" : `/macro/${input.macroSlug ?? ""}`;
    return { ok: false, error: "Sign in to open a support ticket.", loginHref: `/login?next=${encodeURIComponent(next)}` };
  }

  const title = input.title.trim();
  const body = input.body.trim();
  if (title.length < 5 || title.length > SUPPORT_TICKET_LIMITS.title) {
    return { ok: false, error: "Use a title between 5 and 120 characters." };
  }
  if (body.length < 3 || body.length > SUPPORT_TICKET_LIMITS.message) {
    return { ok: false, error: "Write between 3 and 5,000 characters." };
  }

  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Support tickets are unavailable right now." };
  const { data, error } = await supabase.rpc("create_support_ticket", {
    p_kind: input.kind,
    p_title: title,
    p_body: body,
    p_macro_slug: input.macroSlug ?? null,
    p_macro_name: input.macroName ?? null,
    p_macro_level_id: input.macroLevelId ?? null,
  });
  if (error) return { ok: false, error: supportTicketError(error) };
  const ticket = firstTicket(data);
  if (!ticket) return { ok: false, error: "The ticket was opened but could not be displayed. Reload Support." };

  revalidatePath("/support");
  return {
    ok: true,
    href: `/support/tickets/${ticket.ticket_id}`,
    ticketNumber: ticket.ticket_number,
  };
}

export async function createSuggestionTicket(title: string, body: string): Promise<TicketResult> {
  return createTicket({ kind: "suggestion", title, body });
}

/** The macro context is derived from the catalog, never trusted from the page. */
export async function createBrokenMacroTicket(slug: string): Promise<TicketResult> {
  const level = getLevelBySlug(slug.trim());
  if (!level) return { ok: false, error: "That macro is no longer in the catalog." };

  const files = level.macros
    .map((macro) => `${macro.recorder} by ${macro.author}: ${macro.downloadLink}`)
    .join("\n");
  const body = [
    `I am reporting the downloads on the ${level.name} macro page as broken.`,
    "",
    `Level ID: ${level.levelId}`,
    `Page: /macro/${level.slug}`,
    "",
    "Files on this page:",
    files,
    "",
    "Please check which download is failing. I can add more detail in this thread.",
  ].join("\n");

  return createTicket({
    kind: "broken_macro",
    title: `Broken macro: ${level.name}`,
    body,
    macroSlug: level.slug,
    macroName: level.name,
    macroLevelId: String(level.levelId),
  });
}

export async function addSupportTicketMessage(ticketId: string, body: string): Promise<Result> {
  const user = await getUser();
  if (!user) return { ok: false, error: "Sign in again and retry." };
  const text = body.trim();
  if (text.length < 1 || text.length > SUPPORT_TICKET_LIMITS.message) {
    return { ok: false, error: "Write a message up to 5,000 characters." };
  }
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Support tickets are unavailable right now." };
  const { error } = await supabase.rpc("add_support_ticket_message", {
    p_ticket: ticketId,
    p_body: text,
  });
  if (error) return { ok: false, error: supportTicketError(error) };
  revalidatePath(`/support/tickets/${ticketId}`);
  revalidatePath("/admin/inbox");
  return { ok: true };
}

export async function closeSupportTicket(
  ticketId: string,
  status: Exclude<SupportTicketStatus, "open">,
  reason: string,
): Promise<Result> {
  if (!(await isCurrentUserAdmin())) return { ok: false, error: "You do not have permission to do that." };
  const text = reason.trim();
  if (text.length < 3 || text.length > SUPPORT_TICKET_LIMITS.closeReason) {
    return { ok: false, error: "Give a reason between 3 and 500 characters." };
  }
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Support tickets are unavailable right now." };
  const { data, error } = await supabase.rpc("close_support_ticket", {
    p_ticket: ticketId,
    p_status: status,
    p_reason: text,
  });
  if (error) return { ok: false, error: supportTicketError(error) };

  if (typeof data === "string") await claimAndSendSupportTicketEmail(data);
  revalidatePath(`/support/tickets/${ticketId}`);
  revalidatePath("/support");
  revalidatePath("/notifications");
  revalidatePath("/admin/inbox");
  revalidatePath("/admin");
  return { ok: true };
}

export async function banSupportTicketUser(ticketId: string, reason: string): Promise<Result> {
  if (!(await isCurrentUserAdmin())) return { ok: false, error: "You do not have permission to do that." };
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Support controls are unavailable right now." };
  const { error } = await supabase.rpc("ban_support_ticket_user", {
    p_ticket: ticketId,
    p_reason: reason.trim(),
  });
  if (error) return { ok: false, error: supportTicketError(error) };
  revalidatePath("/admin/inbox");
  return { ok: true };
}

export async function unbanSupportTicketUser(banId: string): Promise<Result> {
  if (!(await isCurrentUserAdmin())) return { ok: false, error: "You do not have permission to do that." };
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Support controls are unavailable right now." };
  const { data, error } = await supabase.rpc("unban_support_ticket_user", { p_ban: banId });
  if (error || data !== true) return { ok: false, error: "That block could not be removed." };
  revalidatePath("/admin/inbox");
  return { ok: true };
}

export async function markAccountNotificationsRead(): Promise<Result> {
  const user = await getUser();
  if (!user) return { ok: false, error: "Sign in again and retry." };
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Notifications are unavailable right now." };
  const { error } = await supabase.rpc("mark_account_notifications_read", { p_id: null });
  return error ? { ok: false, error: "Notifications could not be marked as read." } : { ok: true };
}

export async function dismissAccountNotification(id: string): Promise<Result> {
  const user = await getUser();
  if (!user) return { ok: false, error: "Sign in again and retry." };
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Notifications are unavailable right now." };
  const { data, error } = await supabase.rpc("dismiss_account_notification", { p_id: id });
  if (error || data !== true) return { ok: false, error: "That notification could not be dismissed." };
  revalidatePath("/notifications");
  return { ok: true };
}
