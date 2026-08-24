import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import TicketThread from "@/components/support/TicketThread";
import { isCurrentUserAdmin } from "@/lib/admin";
import { getUserAndProfile } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  SUPPORT_TICKET_COLUMNS,
  SUPPORT_TICKET_MESSAGE_COLUMNS,
  type SupportTicketMessageRow,
  type SupportTicketRow,
} from "@/lib/supportTickets";

export const metadata: Metadata = { title: "Support ticket", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function SupportTicketPage({ params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured) redirect("/login");
  const { id } = await params;
  const { user, profile } = await getUserAndProfile();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/support/tickets/${id}`)}`);
  if (!profile) redirect("/welcome");

  const supabase = await createClient();
  const [ticketResult, messageResult, admin] = await Promise.all([
    supabase!.from("support_tickets").select(SUPPORT_TICKET_COLUMNS).eq("id", id).maybeSingle(),
    supabase!.from("support_ticket_messages").select(SUPPORT_TICKET_MESSAGE_COLUMNS).eq("ticket_id", id).order("created_at"),
    isCurrentUserAdmin(),
  ]);
  if (ticketResult.error || !ticketResult.data) notFound();

  const ticket = ticketResult.data as SupportTicketRow;
  const messages = (messageResult.data ?? []) as SupportTicketMessageRow[];
  const authorIds = [...new Set(messages.map((message) => message.author_id).filter((id): id is string => Boolean(id)))];
  const names = new Map<string, string>();
  if (authorIds.length > 0) {
    const { data } = await supabase!.from("profiles").select("id,username").in("id", authorIds);
    for (const row of data ?? []) names.set(row.id, row.username);
  }

  return (
    <div className="mx-auto w-full max-w-[980px] px-4 py-8 sm:px-6 sm:py-11">
      <TicketThread
        ticket={ticket}
        messages={messages.map((message) => ({
          ...message,
          username: (message.author_id ? names.get(message.author_id) : null) ?? (message.author_role === "admin" ? "GDMacros admin" : "User"),
        }))}
        isAdmin={admin}
      />
    </div>
  );
}
