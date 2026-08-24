"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  addSupportTicketMessage,
  banSupportTicketUser,
  closeSupportTicket,
} from "@/lib/actions/supportTickets";
import {
  SUPPORT_STATUS_LABEL,
  SUPPORT_TICKET_LIMITS,
  ticketDate,
  type SupportTicketMessageRow,
  type SupportTicketRow,
} from "@/lib/supportTickets";
import { CheckIcon, UserIcon } from "@/components/icons";

interface ThreadMessage extends SupportTicketMessageRow {
  username: string;
}

function statusTone(status: SupportTicketRow["status"]) {
  if (status === "open") return "border-amber/40 bg-amber/10 text-amber";
  if (status === "resolved") return "border-green/40 bg-green/10 text-green";
  return "border-border bg-surface-2 text-muted";
}

export default function TicketThread({
  ticket,
  messages,
  isAdmin,
}: {
  ticket: SupportTicketRow;
  messages: ThreadMessage[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [closeMode, setCloseMode] = useState<"resolved" | "closed" | null>(null);
  const [closeReason, setCloseReason] = useState("");
  const [banReason, setBanReason] = useState("");
  const [showBan, setShowBan] = useState(false);
  const [pending, startTransition] = useTransition();

  function comment() {
    setError(null);
    startTransition(async () => {
      const result = await addSupportTicketMessage(ticket.id, body);
      if (result.ok) {
        setBody("");
        window.dispatchEvent(new CustomEvent("gdmacros:support-changed"));
        router.refresh();
      } else setError(result.error);
    });
  }

  function closeTicket() {
    if (!closeMode) return;
    setError(null);
    startTransition(async () => {
      const result = await closeSupportTicket(ticket.id, closeMode, closeReason);
      if (result.ok) {
        window.dispatchEvent(new CustomEvent("gdmacros:support-changed"));
        router.refresh();
      } else setError(result.error);
    });
  }

  function blockUser() {
    setError(null);
    startTransition(async () => {
      const result = await banSupportTicketUser(ticket.id, banReason);
      if (result.ok) {
        setShowBan(false);
        setBanReason("");
      } else setError(result.error);
    });
  }

  return (
    <>
      <header className="border-b border-border-soft pb-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[12px] font-semibold tracking-wide text-muted uppercase">
              {ticket.kind === "suggestion" ? "Suggestion" : "Broken macro report"} · Ticket #{ticket.ticket_number}
            </p>
            <h1 className="mt-1 break-words text-[24px] leading-tight font-extrabold tracking-tight text-text sm:text-[31px]">
              {ticket.title}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[12.5px] text-muted">
              <span className={`rounded-full border px-2.5 py-1 font-semibold ${statusTone(ticket.status)}`}>
                {SUPPORT_STATUS_LABEL[ticket.status]}
              </span>
              <span>Opened {ticketDate(ticket.created_at)} · {messages.length} comment{messages.length === 1 ? "" : "s"}</span>
            </div>
          </div>
          <Link href={isAdmin ? "/admin/inbox" : "/support"} className="rounded-lg border border-border px-3 py-2 text-[12.5px] font-semibold text-text-dim hover:border-accent/40 hover:text-text">
            Return to tickets
          </Link>
        </div>

        {ticket.macro_slug && (
          <Link href={`/macro/${ticket.macro_slug}`} className="mt-4 inline-flex rounded-lg border border-accent/30 bg-accent/10 px-3 py-2 text-[12.5px] font-medium text-accent-soft hover:bg-accent/15">
            View {ticket.macro_name} · Level {ticket.macro_level_id}
          </Link>
        )}

        {ticket.status !== "open" && ticket.delete_after && (
          <div className="mt-4 rounded-xl border border-rose/30 bg-rose/10 px-4 py-3 text-[12.5px] leading-relaxed text-text-dim">
            <strong className="text-text">{SUPPORT_STATUS_LABEL[ticket.status]}:</strong> {ticket.close_reason}{" "}
            This ticket and its complete transcript will be permanently deleted after {ticketDate(ticket.delete_after)}.
          </div>
        )}
      </header>

      <section aria-label="Ticket transcript" className="mt-6 flex flex-col gap-4">
        {messages.map((message) => (
          <article key={message.id} className="flex items-start gap-3">
            <span className={`mt-1 grid h-10 w-10 shrink-0 place-items-center rounded-full border ${message.author_role === "admin" ? "border-accent/40 bg-accent/10 text-accent-soft" : "border-border bg-surface-2 text-muted"}`}>
              {message.author_role === "admin" ? <CheckIcon className="h-[18px] w-[18px]" /> : <UserIcon className="h-[18px] w-[18px]" />}
            </span>
            <div className="min-w-0 flex-1 overflow-hidden rounded-xl border border-border bg-surface">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-soft bg-surface-2/55 px-4 py-2.5 text-[12px]">
                <p>
                  <span translate="no" className="notranslate font-bold text-text">{message.username}</span>{" "}
                  <span className="text-muted">commented {ticketDate(message.created_at)}</span>
                </p>
                {message.author_role === "admin" && <span className="rounded-md border border-accent/30 px-2 py-0.5 font-semibold text-accent-soft">GDMacros admin</span>}
              </div>
              <p className="selectable whitespace-pre-wrap break-words px-4 py-4 text-[13.5px] leading-7 text-text-dim">{message.body}</p>
            </div>
          </article>
        ))}
      </section>

      {ticket.status === "open" ? (
        <section className="card mt-7 p-4 sm:p-5">
          <h2 className="text-[14px] font-bold text-text">Add a comment</h2>
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            maxLength={SUPPORT_TICKET_LIMITS.message}
            rows={7}
            placeholder={isAdmin ? "Reply as GDMacros admin" : "Add more detail or answer the admin"}
            className="mt-3 w-full resize-y rounded-xl border border-border bg-bg px-3.5 py-3 text-[13.5px] leading-relaxed text-text outline-none placeholder:text-muted focus:border-accent"
          />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <span className="text-[11.5px] text-muted tabular-nums">{body.length}/{SUPPORT_TICKET_LIMITS.message}</span>
            <button type="button" onClick={comment} disabled={pending || body.trim().length === 0} className="rounded-xl bg-accent px-4 py-2.5 text-[13px] font-bold text-white hover:bg-accent-hover disabled:opacity-60">
              {pending ? "Sending..." : "Comment"}
            </button>
          </div>
        </section>
      ) : (
        <p className="card mt-7 px-5 py-5 text-center text-[13px] text-muted">This ticket is closed and the transcript is read-only.</p>
      )}

      {isAdmin && ticket.status === "open" && (
        <section className="mt-7 border-t border-border-soft pt-5">
          <h2 className="text-[14px] font-bold text-text">Admin controls</h2>
          {!closeMode ? (
            <div className="mt-3 flex flex-wrap gap-2.5">
              <button type="button" onClick={() => setCloseMode("resolved")} className="rounded-lg border border-green/40 bg-green/10 px-3.5 py-2 text-[12.5px] font-semibold text-green">Resolve ticket</button>
              <button type="button" onClick={() => setCloseMode("closed")} className="rounded-lg border border-border px-3.5 py-2 text-[12.5px] font-semibold text-text-dim">Close for another reason</button>
              <button type="button" onClick={() => setShowBan((value) => !value)} className="rounded-lg border border-rose/30 px-3.5 py-2 text-[12.5px] font-semibold text-rose">Block new tickets</button>
            </div>
          ) : (
            <div className="mt-3 rounded-xl border border-border bg-surface p-4">
              <p className="text-[12.5px] leading-relaxed text-text-dim">
                The owner will get an in-app notification and email linking to this transcript. It will be deleted permanently after 30 days.
              </p>
              <textarea value={closeReason} onChange={(event) => setCloseReason(event.target.value)} maxLength={SUPPORT_TICKET_LIMITS.closeReason} rows={3} placeholder={closeMode === "resolved" ? "Explain how this was resolved" : "Why is this being closed?"} className="mt-3 w-full rounded-lg border border-border bg-bg px-3 py-2.5 text-[13px] text-text outline-none focus:border-accent" />
              <div className="mt-3 flex gap-2.5">
                <button type="button" onClick={closeTicket} disabled={pending || closeReason.trim().length < 3} className={`rounded-lg px-3.5 py-2 text-[12.5px] font-bold text-white disabled:opacity-60 ${closeMode === "resolved" ? "bg-green" : "bg-rose"}`}>{pending ? "Closing..." : closeMode === "resolved" ? "Confirm resolved" : "Confirm close"}</button>
                <button type="button" onClick={() => setCloseMode(null)} disabled={pending} className="text-[12.5px] text-muted hover:text-text">Cancel</button>
              </div>
            </div>
          )}

          {showBan && (
            <div className="mt-3 rounded-xl border border-rose/30 bg-rose/5 p-4">
              <p className="text-[12.5px] text-text-dim">This prevents the ticket owner from opening new tickets. Existing tickets remain available.</p>
              <input value={banReason} onChange={(event) => setBanReason(event.target.value)} maxLength={500} placeholder="Reason for blocking new tickets" className="mt-3 h-10 w-full rounded-lg border border-border bg-bg px-3 text-[13px] text-text outline-none focus:border-rose/50" />
              <button type="button" onClick={blockUser} disabled={pending || banReason.trim().length < 3} className="mt-3 rounded-lg bg-rose px-3.5 py-2 text-[12.5px] font-bold text-white disabled:opacity-60">Confirm block</button>
            </div>
          )}
        </section>
      )}

      {error && <p role="alert" className="mt-4 rounded-xl border border-rose/30 bg-rose/10 px-4 py-3 text-[12.5px] text-rose">{error}</p>}
    </>
  );
}
