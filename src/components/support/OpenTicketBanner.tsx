"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { BellIcon } from "@/components/icons";

interface OpenTicket {
  id: string;
  ticket_number: number;
  title: string;
}

export default function OpenTicketBanner() {
  const [tickets, setTickets] = useState<OpenTicket[]>([]);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const supabase = createClient();
    if (!supabase) return;
    const client = supabase;
    let active = true;

    async function load() {
      const { data: auth } = await client.auth.getUser();
      if (!auth.user) return;
      const { data } = await client
        .from("support_tickets")
        .select("id,ticket_number,title")
        .eq("opened_by", auth.user.id)
        .eq("status", "open")
        .order("updated_at", { ascending: false })
        .limit(5);
      if (active) setTickets((data ?? []) as OpenTicket[]);
    }

    void load();
    const onChanged = () => void load();
    window.addEventListener("gdmacros:support-changed", onChanged);
    return () => {
      active = false;
      window.removeEventListener("gdmacros:support-changed", onChanged);
    };
  }, []);

  if (tickets.length === 0) return null;
  const first = tickets[0];
  return (
    <div className="sticky top-16 z-30 border-b border-accent/25 bg-nav/95 shadow-sm backdrop-blur-md">
      <div className="mx-auto flex max-w-[1320px] items-center gap-3 px-4 py-2.5 text-[12.5px] sm:px-6">
        <BellIcon className="h-4 w-4 shrink-0 text-accent-soft" />
        <p className="min-w-0 flex-1 truncate text-text-dim">
          {tickets.length === 1 ? "You have a support ticket open:" : `You have ${tickets.length} support tickets open. Latest:`}{" "}
          <span translate="no" className="notranslate font-semibold text-text">#{first.ticket_number} {first.title}</span>
        </p>
        <Link href={`/support/tickets/${first.id}`} className="shrink-0 font-semibold text-accent-soft hover:underline">
          Open ticket
        </Link>
      </div>
    </div>
  );
}
