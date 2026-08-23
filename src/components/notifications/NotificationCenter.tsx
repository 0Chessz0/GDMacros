"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { dismissNotification, markNotificationsRead } from "@/lib/actions/submissions";
import { formatDate, type NotificationRow } from "@/lib/submissions";
import { BellIcon, CheckIcon } from "@/components/icons";

export default function NotificationCenter({
  initial,
  hrefBySubmission,
}: {
  initial: NotificationRow[];
  hrefBySubmission: Record<string, string>;
}) {
  const [items, setItems] = useState(initial);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (!initial.some((item) => item.read_at === null)) return;

    void markNotificationsRead().then((result) => {
      if (!result.ok) return;
      setItems((current) => current.map((item) => ({ ...item, read_at: item.read_at ?? new Date().toISOString() })));
      window.dispatchEvent(new CustomEvent("gdmacros:notifications-read"));
    });
  }, [initial]);

  function dismiss(id: string) {
    setError(null);
    setBusyId(id);
    startTransition(async () => {
      const result = await dismissNotification(id);
      if (result.ok) setItems((current) => current.filter((item) => item.id !== id));
      else setError(result.error);
      setBusyId(null);
    });
  }

  if (items.length === 0) {
    return (
      <div className="card flex flex-col items-center gap-3 px-6 py-16 text-center">
        <span className="grid h-12 w-12 place-items-center rounded-full bg-surface-2 text-muted">
          <BellIcon className="h-5 w-5" />
        </span>
        <p className="text-[15px] font-semibold text-text">You are all caught up</p>
        <p className="max-w-sm text-[13px] leading-relaxed text-muted">
          Accepted and rejected submission results will appear here.
        </p>
        <Link href="/submissions" className="text-[13px] font-medium text-accent-soft hover:underline">
          View your submissions
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <div role="alert" className="rounded-xl border border-rose/40 bg-rose/10 px-4 py-3 text-[12.5px] text-rose">
          {error}
        </div>
      )}

      {items.map((notification) => {
        const href = notification.submission_id
          ? hrefBySubmission[notification.submission_id]
          : undefined;

        return (
          <article
            key={notification.id}
            className={`card relative overflow-hidden p-4 sm:p-5 ${
              notification.outcome === "accepted" ? "border-green/30" : "border-rose/30"
            }`}
          >
            {notification.read_at === null && (
              <span className="absolute top-0 bottom-0 left-0 w-1 bg-accent" aria-label="Unread" />
            )}
            <div className="flex items-start gap-3">
              <span
                className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full ${
                  notification.outcome === "accepted"
                    ? "bg-green/12 text-green"
                    : "bg-rose/12 text-rose"
                }`}
              >
                {notification.outcome === "accepted" ? (
                  <CheckIcon className="h-[17px] w-[17px]" />
                ) : (
                  <span className="text-[18px] font-semibold leading-none">!</span>
                )}
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-[13.5px] leading-relaxed text-text">
                      <span className="font-bold" translate="no">{notification.level_name}</span>{" "}
                      <span className={notification.outcome === "accepted" ? "text-green" : "text-rose"}>
                        was {notification.outcome}.
                      </span>
                    </p>
                    {(notification.level_id || notification.recorder) && (
                      <p className="mt-1 text-[12px] text-muted">
                        {notification.level_id && <>Level {notification.level_id}</>}
                        {notification.level_id && notification.recorder && " · "}
                        {notification.recorder}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => dismiss(notification.id)}
                    disabled={busyId === notification.id}
                    className="shrink-0 text-[12px] text-muted transition-colors hover:text-text disabled:opacity-50"
                  >
                    {busyId === notification.id ? "Dismissing..." : "Dismiss"}
                  </button>
                </div>

                {notification.outcome === "rejected" && notification.rejection_reason && (
                  <p className="mt-2.5 rounded-lg bg-surface-2 px-3 py-2.5 text-[12.5px] leading-relaxed text-text-dim">
                    <span className="text-muted">Reason:</span> {notification.rejection_reason}
                  </p>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                  <span className="text-[11.5px] text-muted">{formatDate(notification.created_at)}</span>
                  {href && (
                    <Link href={href} className="text-[12px] font-medium text-accent-soft hover:underline">
                      View live macro
                    </Link>
                  )}
                </div>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
