import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { MailIcon } from "@/components/icons";
import { getUserAndProfile } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  SUPPORT_STATUS_LABEL,
  SUPPORT_TICKET_COLUMNS,
  ticketDate,
  type SupportTicketRow,
} from "@/lib/supportTickets";

export const metadata: Metadata = { title: "Support tickets", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function SupportPage() {
  if (!isSupabaseConfigured) redirect("/login");
  const { user, profile } = await getUserAndProfile();
  if (!user) redirect("/login?next=/support");
  if (!profile) redirect("/welcome");

  const supabase = await createClient();
  const { data, error } = await supabase!
    .from("support_tickets")
    .select(SUPPORT_TICKET_COLUMNS)
    .eq("opened_by", user.id)
    .order("updated_at", { ascending: false });
  const tickets = (data ?? []) as SupportTicketRow[];

  return (
    <div className="mx-auto w-full max-w-[780px] px-4 py-10 sm:px-6 sm:py-14">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-xl border border-border bg-surface text-accent-soft"><MailIcon className="h-5 w-5" /></span>
            <div>
              <h1 className="text-[22px] font-extrabold tracking-tight text-text sm:text-[26px]">Support tickets</h1>
              <p className="mt-1 text-[13px] text-muted">Private conversations with the GDMacros admins.</p>
            </div>
          </div>
        </div>
        <Link href="/support/new" className="rounded-xl bg-accent px-4 py-2.5 text-[13px] font-bold text-white hover:bg-accent-hover">Send a suggestion</Link>
      </div>

      {error ? (
        <div className="card mt-6 px-6 py-12 text-center text-[13px] text-muted">Your tickets could not be loaded. Reload the page.</div>
      ) : tickets.length === 0 ? (
        <div className="card mt-6 flex flex-col items-center gap-3 px-6 py-14 text-center">
          <p className="text-[15px] font-bold text-text">No support tickets</p>
          <p className="max-w-md text-[13px] leading-relaxed text-muted">Suggestions and broken-macro reports will appear here as private comment threads.</p>
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-3">
          {tickets.map((ticket) => (
            <Link key={ticket.id} href={`/support/tickets/${ticket.id}`} className="card group flex flex-col gap-3 px-4 py-4 transition-[border-color,transform] hover:-translate-y-px hover:border-accent/40 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <span className="min-w-0">
                <span className="block text-[11.5px] font-semibold tracking-wide text-muted uppercase">#{ticket.ticket_number} · {ticket.kind === "suggestion" ? "Suggestion" : "Broken macro"}</span>
                <span className="mt-1 block truncate text-[15px] font-bold text-text group-hover:text-accent-soft">{ticket.title}</span>
                <span className="mt-1 block text-[11.5px] text-muted">Updated {ticketDate(ticket.updated_at)}</span>
              </span>
              <span className={`w-fit shrink-0 rounded-full border px-2.5 py-1 text-[11.5px] font-semibold ${ticket.status === "open" ? "border-amber/40 bg-amber/10 text-amber" : ticket.status === "resolved" ? "border-green/40 bg-green/10 text-green" : "border-border bg-surface-2 text-muted"}`}>
                {SUPPORT_STATUS_LABEL[ticket.status]}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
