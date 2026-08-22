"use client";

import { useEffect, useState } from "react";
import { OWNERS, discordProfileUrl, type Owner } from "@/lib/owners";
import {
  lanyardUrl,
  parseLanyard,
  statusDotClass,
  statusLabel,
  type OwnerPresence,
} from "@/lib/lanyard";
import { DiscordIcon, ExternalIcon } from "./icons";

/**
 * Live Discord presence for the two site owners, via Lanyard.
 *
 * Fetched in the BROWSER, on purpose. Presence changes constantly, so baking it
 * into the build would ship a status that is stale the moment it is deployed,
 * and it would make `next build` depend on a third party being up. Nothing on
 * this page is allowed to break the About page.
 *
 * Polling is deliberately slow. A status that is up to a minute behind is fine
 * for a profile card, and hammering a free community API for a nicety would be
 * rude. There is no WebSocket here because it would buy about fifty seconds of
 * freshness in exchange for reconnect handling and a socket lifecycle.
 */

const REFRESH_MS = 45_000;

function useOwnerPresence(): Record<string, OwnerPresence | null> {
  const [presence, setPresence] = useState<Record<string, OwnerPresence | null>>({});

  useEffect(() => {
    let cancelled = false;

    async function load() {
      // Each owner is fetched independently so one failure cannot blank the
      // other card. `allSettled`, never `all`.
      const results = await Promise.allSettled(
        OWNERS.map(async (o) => {
          const res = await fetch(lanyardUrl(o.discordId), { cache: "no-store" });
          if (!res.ok) throw new Error(String(res.status));
          return [o.discordId, parseLanyard(o.discordId, await res.json())] as const;
        }),
      );
      if (cancelled) return;

      const next: Record<string, OwnerPresence | null> = {};
      for (const r of results) {
        if (r.status === "fulfilled") next[r.value[0]] = r.value[1];
      }
      // Merge rather than replace, so a single failed refresh keeps showing the
      // last good status instead of flickering to "unavailable".
      setPresence((prev) => ({ ...prev, ...next }));
    }

    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return presence;
}

function Card({ owner, presence }: { owner: Owner; presence: OwnerPresence | null }) {
  const status = presence?.status ?? "offline";
  const profile = discordProfileUrl(owner.discordId);

  return (
    <div className="card flex flex-col gap-4 p-5">
      <div className="flex items-start gap-4">
        {presence?.avatarUrl ? (
          // A plain img: the project sets `images.unoptimized`, so next/image
          // would add a remote-host config for no benefit. An avatar that fails
          // to load falls back to the initial below via onError.
          <img
            src={presence.avatarUrl}
            alt=""
            width={64}
            height={64}
            loading="lazy"
            className="h-16 w-16 shrink-0 rounded-full border border-border bg-surface-2 object-cover"
          />
        ) : (
          <span className="grid h-16 w-16 shrink-0 place-items-center rounded-full border border-border bg-surface-2 text-[22px] font-bold text-muted">
            {owner.name.slice(0, 1)}
          </span>
        )}

        <div className="min-w-0 flex-1">
          <p className="truncate text-[16px] font-bold text-text">
            {presence?.displayName ?? owner.name}
          </p>
          {presence?.username && (
            <p translate="no" className="notranslate truncate text-[13px] text-muted">
              @{presence.username}
            </p>
          )}
          <p className="mt-1 inline-flex items-center rounded-md bg-surface-2 px-2 py-0.5 text-[11px] font-semibold tracking-wider text-muted uppercase">
            {owner.role}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 text-[13px] text-text-dim">
        {/* The label is always rendered, so status never depends on colour. */}
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${statusDotClass(status)}`} />
        {presence ? statusLabel(status) : "Discord status unavailable"}
      </div>

      {presence?.customStatus && (
        <p className="text-[13px] leading-relaxed text-muted italic">{presence.customStatus}</p>
      )}

      {/* No empty activity box: rendered only when there is something to say. */}
      {presence?.activity && (
        <div className="flex items-center gap-3 rounded-lg border border-border-soft bg-surface-2/60 px-3 py-2.5">
          {presence.activityArtUrl && (
            <img
              src={presence.activityArtUrl}
              alt=""
              width={36}
              height={36}
              loading="lazy"
              className="h-9 w-9 shrink-0 rounded object-cover"
            />
          )}
          <p className="min-w-0 flex-1 truncate text-[13px] text-text-dim">{presence.activity}</p>
        </div>
      )}

      <a
        href={profile}
        target="_blank"
        rel="noopener noreferrer"
        className="group inline-flex w-fit items-center gap-2 rounded-lg border border-border px-3.5 py-2 text-[13px] font-semibold text-text-dim transition-colors hover:border-accent/40 hover:text-accent-soft"
      >
        <DiscordIcon className="h-4 w-4" />
        View Discord profile
        <ExternalIcon className="h-3.5 w-3.5 opacity-60" />
      </a>
    </div>
  );
}

/**
 * Both owner cards.
 *
 * Renders immediately from the configured owner list, before any request
 * finishes and whether or not one ever does. Presence only ever adds detail to
 * a card that already exists.
 */
export default function DiscordOwnerCards() {
  const presence = useOwnerPresence();

  return (
    <div className="mt-6 grid gap-4 sm:grid-cols-2">
      {OWNERS.map((o) => (
        <Card key={o.discordId} owner={o} presence={presence[o.discordId] ?? null} />
      ))}
    </div>
  );
}
