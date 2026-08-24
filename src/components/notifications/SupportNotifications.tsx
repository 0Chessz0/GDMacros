"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import {
  dismissAccountNotification,
  markAccountNotificationsRead,
} from "@/lib/actions/supportTickets";
import { ticketDate, type AccountNotificationRow } from "@/lib/supportTickets";
import { CheckIcon } from "@/components/icons";

export default function SupportNotifications({ initial }: { initial: AccountNotificationRow[] }) {
  const [items, setItems] = useState(initial);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (!initial.some((item) => item.read_at === null)) return;
    void markAccountNotificationsRead().then((result) => {
      if (!result.ok) return;
      setItems((current) => current.map((item) => ({ ...item, read_at: item.read_at ?? new Date().toISOString() })));
      window.dispatchEvent(new CustomEvent("gdmacros:notifications-read"));
    });
  }, [initial]);

  function dismiss(id: string) {
    setError(null);
    setBusyId(id);
    startTransition(async () => {
      const result = await dismissAccountNotification(id);
      if (result.ok) setItems((current) => current.filter((item) => item.id !== id));
      else setError(result.error);
      setBusyId(null);
    });
  }

  if (items.length === 0) return null;
  return (
    <section className="mb-5">
      <h2 className="mb-2.5 text-[13px] font-bold text-text-dim">Support</h2>
      {error && <p role="alert" className="mb-3 rounded-xl border border-rose/30 bg-rose/10 px-4 py-3 text-[12.5px] text-rose">{error}</p>}
      <div className="flex flex-col gap-3">
        {items.map((item) => (
          <article key={item.id} className="card relative overflow-hidden border-green/30 p-4 sm:p-5">
            {item.read_at === null && <span className="absolute inset-y-0 left-0 w-1 bg-accent" aria-label="Unread" />}
            <div className="flex items-start gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-green/12 text-green"><CheckIcon className="h-[17px] w-[17px]" /></span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-[13.5px] font-bold text-text">{item.title}</p>
                    <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{item.message}</p>
                    <p className="mt-1.5 text-[11.5px] text-rose">Transcript deletion: {ticketDate(item.expires_at)}</p>
                  </div>
                  <button type="button" onClick={() => dismiss(item.id)} disabled={busyId === item.id} className="text-[12px] text-muted hover:text-text disabled:opacity-50">{busyId === item.id ? "Dismissing..." : "Dismiss"}</button>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-4">
                  <span className="text-[11.5px] text-muted">{ticketDate(item.created_at)}</span>
                  <Link href={`/support/tickets/${item.ticket_id}`} className="text-[12px] font-semibold text-accent-soft hover:underline">Read transcript</Link>
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
