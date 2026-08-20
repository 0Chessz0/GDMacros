"use client";

import { useState, useTransition } from "react";
import {
  banSubmissionEmail,
  unbanSubmissionEmail,
  type BanRow,
} from "@/lib/actions/submissions";
import { formatDate } from "@/lib/submissions";

/**
 * Submission bans.
 *
 * The only place in the whole site where an email address is shown, and only
 * for addresses a moderator typed in themselves. There is no account directory:
 * this cannot list, search or reveal anyone who has not been banned.
 *
 * The private moderation reason is shown to admins here and never to the banned
 * person, who only ever sees "You are not allowed to make macro submissions."
 */
export default function SubmissionBans({ initial }: { initial: BanRow[] }) {
  const [bans, setBans] = useState(initial);
  const [email, setEmail] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();

  function refresh(next: BanRow[]) {
    setBans(next);
  }

  function add() {
    setError(null);
    setNotice(null);
    setBusy("add");
    startTransition(async () => {
      const res = await banSubmissionEmail(email, reason);
      setBusy(null);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const lower = email.trim().toLowerCase();
      // Optimistic, and replaced by the server's own list on the next load.
      refresh([
        {
          email_lower: lower,
          reason: reason.trim(),
          created_at: new Date().toISOString(),
          banned_by_username: "you",
          has_account: false,
        },
        ...bans.filter((b) => b.email_lower !== lower),
      ]);
      setEmail("");
      setReason("");
      setNotice("That address can no longer make new submissions.");
    });
  }

  function remove(target: string) {
    setError(null);
    setNotice(null);
    setBusy(target);
    startTransition(async () => {
      const res = await unbanSubmissionEmail(target);
      setBusy(null);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      refresh(bans.filter((b) => b.email_lower !== target));
      setNotice("That address can submit again.");
    });
  }

  return (
    <section className="mt-10">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-[16px] font-bold text-text">Submission bans</h2>
          <p className="mt-0.5 text-[12.5px] text-muted">
            Stops an address making new submissions. They can still sign in, browse and download.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="rounded-lg border border-border bg-surface px-3 py-1.5 text-[12.5px] font-semibold text-text-dim transition-colors hover:text-text"
        >
          {open ? "Hide" : `Manage (${bans.length})`}
        </button>
      </div>

      {open && (
        <div className="card p-4 sm:p-5">
          <div className="flex flex-col gap-3">
            <div>
              <label htmlFor="ban-email" className="block text-[12.5px] font-semibold text-text-dim">
                Email address
              </label>
              <input
                id="ban-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="off"
                placeholder="someone@example.com"
                className="mt-1.5 h-10 w-full rounded-xl border border-border bg-surface px-3.5 text-[13.5px] text-text outline-none transition-colors placeholder:text-muted focus:border-accent"
              />
              <p className="mt-1.5 text-[12px] text-muted">
                Matched case-insensitively. An address with no account yet can be banned in advance.
              </p>
            </div>

            <div>
              <label htmlFor="ban-reason" className="block text-[12.5px] font-semibold text-text-dim">
                Reason, for moderators only
              </label>
              <textarea
                id="ban-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                maxLength={500}
                placeholder="Never shown to the person who is banned"
                className="mt-1.5 w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-[13px] text-text outline-none transition-colors placeholder:text-muted focus:border-accent"
              />
            </div>

            {error && (
              <p role="alert" className="text-[12.5px] text-rose">
                {error}
              </p>
            )}
            {notice && <p className="text-[12.5px] text-green">{notice}</p>}

            <div>
              <button
                type="button"
                onClick={add}
                disabled={busy !== null || email.trim().length < 3 || reason.trim().length < 3}
                className="rounded-xl bg-rose px-4 py-2.5 text-[13.5px] font-semibold text-white transition-[background-color,transform] duration-200 ease-out active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busy === "add" ? "Saving..." : "Ban from submitting"}
              </button>
            </div>
          </div>

          <div className="mt-5 border-t border-border-soft pt-4">
            <h3 className="mb-2.5 text-[12px] font-bold tracking-wide text-muted uppercase">
              Banned addresses
            </h3>
            {bans.length === 0 ? (
              <p className="py-3 text-[13px] text-muted">Nobody is banned.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {bans.map((b) => (
                  <div
                    key={b.email_lower}
                    className="flex flex-wrap items-start justify-between gap-2 rounded-xl border border-border-soft bg-surface-2/40 px-3.5 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold break-all text-text">
                        <span className="selectable">{b.email_lower}</span>
                      </p>
                      <p className="mt-0.5 text-[12.5px] leading-relaxed text-text-dim">
                        {b.reason}
                      </p>
                      <p className="mt-1 text-[11.5px] text-muted">
                        {formatDate(b.created_at)} by{" "}
                        <span translate="no" className="notranslate">
                          {b.banned_by_username}
                        </span>
                        {b.has_account ? " · linked to an account" : " · no account yet"}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => remove(b.email_lower)}
                      disabled={busy !== null}
                      className="shrink-0 rounded-lg border border-border bg-surface px-3 py-1.5 text-[12px] font-semibold text-text-dim transition-colors hover:text-text disabled:opacity-60"
                    >
                      {busy === b.email_lower ? "Removing..." : "Unban"}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
