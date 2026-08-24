import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import BackToAdmin from "@/components/admin/BackToAdmin";
import SupportTicketBans, { type SupportTicketBanRow } from "@/components/admin/SupportTicketBans";
import { isCurrentUserAdmin } from "@/lib/admin";
import { createClient, getUser } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  SUPPORT_STATUS_LABEL,
  SUPPORT_TICKET_COLUMNS,
  ticketDate,
  type SupportTicketRow,
} from "@/lib/supportTickets";

export const metadata: Metadata = { title: "Admin inbox", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
const FILTERS = new Set(["open", "resolved", "closed", "all"]);

export default async function AdminInboxPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  if (!isSupabaseConfigured) redirect("/login");
  const user = await getUser();
  if (!user) redirect("/login?next=/admin/inbox");
  if (!(await isCurrentUserAdmin())) notFound();

  const params = await searchParams;
  const filter = params.status && FILTERS.has(params.status) ? params.status : "open";
  const supabase = await createClient();
  let query = supabase!.from("support_tickets").select(SUPPORT_TICKET_COLUMNS).order("updated_at", { ascending: false });
  if (filter !== "all") query = query.eq("status", filter);
  const [{ data, error }, banResult] = await Promise.all([
    query,
    supabase!.rpc("list_support_ticket_bans"),
  ]);
  const tickets = (data ?? []) as SupportTicketRow[];
  const ownerIds = [...new Set(tickets.map((ticket) => ticket.opened_by))];
  const names = new Map<string, string>();
  if (ownerIds.length > 0) {
    const { data: profiles } = await supabase!.from("profiles").select("id,username").in("id", ownerIds);
    for (const profile of profiles ?? []) names.set(profile.id, profile.username);
  }
  const bans = banResult.error ? [] : ((banResult.data ?? []) as SupportTicketBanRow[]);

  return (
    <div className="mx-auto w-full max-w-[900px] px-4 py-10 sm:px-6 sm:py-14">
      <BackToAdmin />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-extrabold tracking-tight text-text sm:text-[26px]">Admin inbox</h1>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">Suggestions and broken-macro reports. Ticket text is private to its owner and admins.</p>
        </div>
        <span className="rounded-lg bg-surface-2 px-2.5 py-1 text-[11.5px] font-semibold text-muted tabular-nums">{tickets.length} shown</span>
      </div>

      <nav className="mt-5 flex flex-wrap gap-2" aria-label="Inbox filters">
        {["open", "resolved", "closed", "all"].map((status) => (
          <Link key={status} href={`/admin/inbox?status=${status}`} className={`rounded-lg border px-3 py-1.5 text-[12.5px] font-semibold capitalize ${filter === status ? "border-accent bg-accent/10 text-accent-soft" : "border-border text-muted hover:text-text"}`}>{status}</Link>
        ))}
      </nav>

      {error ? (
        <div className="card mt-5 px-6 py-12 text-center text-[13px] text-muted">The inbox could not be loaded. Migration 0014 may not be applied yet.</div>
      ) : tickets.length === 0 ? (
        <div className="card mt-5 px-6 py-14 text-center text-[13px] text-muted">No {filter === "all" ? "" : filter} tickets.</div>
      ) : (
        <div className="mt-5 flex flex-col gap-3">
          {tickets.map((ticket) => (
            <Link key={ticket.id} href={`/support/tickets/${ticket.id}`} className="card group flex flex-col gap-3 px-4 py-4 transition-[border-color,transform] hover:-translate-y-px hover:border-accent/40 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <span className="min-w-0">
                <span className="block text-[11.5px] font-semibold tracking-wide text-muted uppercase">#{ticket.ticket_number} · {ticket.kind === "suggestion" ? "Suggestion" : "Broken macro report"}</span>
                <span className="mt-1 block truncate text-[15px] font-bold text-text group-hover:text-accent-soft">{ticket.title}</span>
                <span className="mt-1 block text-[12px] text-muted">by <span translate="no" className="notranslate text-text-dim">{names.get(ticket.opened_by) ?? "(no username)"}</span> · updated {ticketDate(ticket.updated_at)}</span>
              </span>
              <span className={`w-fit shrink-0 rounded-full border px-2.5 py-1 text-[11.5px] font-semibold ${ticket.status === "open" ? "border-amber/40 bg-amber/10 text-amber" : ticket.status === "resolved" ? "border-green/40 bg-green/10 text-green" : "border-border bg-surface-2 text-muted"}`}>{SUPPORT_STATUS_LABEL[ticket.status]}</span>
            </Link>
          ))}
        </div>
      )}

      <SupportTicketBans initial={bans} />
    </div>
  );
}
