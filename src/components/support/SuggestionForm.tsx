"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createSuggestionTicket } from "@/lib/actions/supportTickets";
import { SUPPORT_TICKET_LIMITS } from "@/lib/supportTickets";

export default function SuggestionForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createSuggestionTicket(title, body);
      if (result.ok) {
        window.dispatchEvent(new CustomEvent("gdmacros:support-changed"));
        router.push(result.href);
      }
      else if (result.loginHref) router.push(result.loginHref);
      else setError(result.error);
    });
  }

  return (
    <form onSubmit={submit} className="card mt-6 p-5 sm:p-6">
      <label className="block">
        <span className="text-[12.5px] font-semibold text-text-dim">Title</span>
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={SUPPORT_TICKET_LIMITS.title}
          required
          placeholder="What would make GDMacros better?"
          className="mt-2 h-11 w-full rounded-xl border border-border bg-surface-2 px-3.5 text-[13.5px] text-text outline-none placeholder:text-muted focus:border-accent"
        />
      </label>

      <label className="mt-5 block">
        <span className="text-[12.5px] font-semibold text-text-dim">Suggestion</span>
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          maxLength={SUPPORT_TICKET_LIMITS.message}
          required
          rows={9}
          placeholder="Explain the idea, why it would help, and anything we should be careful about."
          className="mt-2 w-full resize-y rounded-xl border border-border bg-surface-2 px-3.5 py-3 text-[13.5px] leading-relaxed text-text outline-none placeholder:text-muted focus:border-accent"
        />
        <span className="mt-1.5 block text-right text-[11.5px] text-muted tabular-nums">
          {body.length}/{SUPPORT_TICKET_LIMITS.message}
        </span>
      </label>

      {error && <p role="alert" className="mt-3 text-[12.5px] text-rose">{error}</p>}

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border-soft pt-4">
        <p className="max-w-md text-[12px] leading-relaxed text-muted">
          This opens a private thread between you and the GDMacros admins.
        </p>
        <button
          type="submit"
          disabled={pending || title.trim().length < 5 || body.trim().length < 3}
          className="rounded-xl bg-accent px-4 py-2.5 text-[13.5px] font-bold text-white transition-[background-color,transform] hover:bg-accent-hover active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Opening..." : "Open suggestion"}
        </button>
      </div>
    </form>
  );
}
