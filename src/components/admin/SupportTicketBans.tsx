"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { unbanSupportTicketUser } from "@/lib/actions/supportTickets";
import { ticketDate } from "@/lib/supportTickets";

export interface SupportTicketBanRow {
  ban_id: string;
  username: string;
  reason: string;
  created_at: string;
}
export default function SupportTicketBans({ initial }: { initial: SupportTicketBanRow[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function remove(id: string) {
    setError(null);
    setBusyId(id);
    startTransition(async () => {
      const result = await unbanSupportTicketUser(id);
      if (result.ok) {
        setRows((current) => current.filter((row) => row.ban_id !== id));
        router.refresh();
      } else setError(result.error);
      setBusyId(null);
    });
  }

  return (
    <details className="card mt-8 overflow-hidden">
      <summary className="cursor-pointer px-5 py-4 text-[13.5px] font-bold text-text">
        Blocked from new tickets <span className="ml-2 text-muted tabular-nums">{rows.length}</span>
      </summary>
      <div className="border-t border-border-soft px-5 py-3">
        {error && <p className="mb-3 text-[12.5px] text-rose">{error}</p>}
        {rows.length === 0 ? (
          <p className="py-3 text-[12.5px] text-muted">Nobody is blocked.</p>
        ) : rows.map((row) => (
          <div key={row.ban_id} className="flex flex-col gap-2 border-b border-border-soft py-3 last:border-0 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p translate="no" className="notranslate text-[13px] font-bold text-text">{row.username}</p>
              <p className="mt-0.5 text-[12px] text-muted">{row.reason} · {ticketDate(row.created_at)}</p>
            </div>
            <button type="button" onClick={() => remove(row.ban_id)} disabled={busyId === row.ban_id} className="w-fit text-[12.5px] font-semibold text-accent-soft hover:underline disabled:opacity-60">
              {busyId === row.ban_id ? "Removing..." : "Allow new tickets"}
            </button>
          </div>
        ))}
      </div>
    </details>
  );
}
