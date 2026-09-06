/**
 * Public Discord presence for the configured GDMacros owner, via Lanyard.
 *
 * Everything here is pure: it takes whatever Lanyard returned and turns it into
 * a small, safe shape for rendering. No fetching, no React, no side effects, so
 * every malformed-response case can be tested without a network.
 *
 * THE RULE THAT MATTERS
 * ---------------------
 * Nothing in this file may throw on unexpected input. Lanyard is a third party
 * we do not control, the About page must render regardless, and a presence
 * widget is never worth breaking a page over. Every accessor below treats the
 * response as untrusted and falls back rather than assuming a shape.
 *
 * This is deliberately NOT a general Discord lookup. Only the ids in
 * `owners.ts` are ever requested, and no visitor input reaches the URL.
 */

/** The four states Discord actually reports. */
export type PresenceStatus = "online" | "idle" | "dnd" | "offline";

const STATUS_LABEL: Record<PresenceStatus, string> = {
  online: "Online",
  idle: "Idle",
  dnd: "Do Not Disturb",
  offline: "Offline",
};

/**
 * Label and dot colour.
 *
 * The label is always rendered next to the dot, so status never depends on
 * colour alone. That is an accessibility requirement, not a nicety: red and
 * green are the two states colour blind viewers are least able to separate.
 */
export function statusLabel(status: PresenceStatus): string {
  return STATUS_LABEL[status] ?? STATUS_LABEL.offline;
}

export function statusDotClass(status: PresenceStatus): string {
  switch (status) {
    case "online":
      return "bg-green";
    case "idle":
      return "bg-amber-400";
    case "dnd":
      return "bg-rose";
    default:
      return "bg-muted";
  }
}

/** What a card needs, and nothing else. */
export interface OwnerPresence {
  /** Discord's global/display name when set, else the username. */
  displayName: string | null;
  /** The @handle. */
  username: string | null;
  avatarUrl: string | null;
  status: PresenceStatus;
  /** A single human readable activity line, or null when there is nothing. */
  activity: string | null;
  /** Custom status text, rendered separately from the activity line. */
  customStatus: string | null;
  /** Album art for Spotify, when the response carried it. */
  activityArtUrl: string | null;
}

const str = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t : null;
};

const obj = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

function toStatus(v: unknown): PresenceStatus {
  return v === "online" || v === "idle" || v === "dnd" ? v : "offline";
}

/**
 * Builds the CDN URL for an avatar hash.
 *
 * Never hardcoded per owner: the hash changes whenever someone edits their
 * profile, and a pinned URL would rot silently into a broken image. When the
 * hash is missing Discord's own default avatar is used, which is derived from
 * the account id and always resolves.
 */
export function avatarUrl(userId: string, hash: unknown): string | null {
  const h = str(hash);
  if (h) {
    const ext = h.startsWith("a_") ? "gif" : "png";
    return `https://cdn.discordapp.com/avatars/${userId}/${h}.${ext}?size=128`;
  }
  if (!/^\d{5,25}$/.test(userId)) return null;
  // Post-username-migration default: (id >> 22) % 6.
  const index = Number((BigInt(userId) >> 22n) % 6n);
  return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
}

/** Discord's activity `type` enum, as far as it is worth rendering. */
function activityLine(a: Record<string, unknown>): string | null {
  const name = str(a.name);
  const type = typeof a.type === "number" ? a.type : null;
  const details = str(a.details);
  const state = str(a.state);

  switch (type) {
    case 0:
      return name ? `Playing ${name}` : null;
    case 1:
      return name ? `Streaming ${name}` : null;
    case 2: {
      // Listening. Spotify fills details with the track and state with artists.
      if (name === "Spotify" && details) {
        return state ? `Listening to Spotify: ${details} - ${state}` : `Listening to Spotify: ${details}`;
      }
      return name ? `Listening to ${name}` : null;
    }
    case 3:
      return name ? `Watching ${name}` : null;
    case 5:
      return name ? `Competing in ${name}` : null;
    default:
      return name ? name : null;
  }
}

/**
 * The custom status (activity type 4), which Discord models as an activity but
 * which reads as a quote rather than as "doing something".
 */
function customStatusLine(a: Record<string, unknown>): string | null {
  const state = str(a.state);
  const emojiName = str(obj(a.emoji)?.name);
  if (!state && !emojiName) return null;
  return [emojiName, state].filter(Boolean).join(" ");
}

/**
 * Normalises one Lanyard `/v1/users/<id>` response.
 *
 * Returns null when the payload is unusable, which the card renders as its
 * offline fallback rather than as an error.
 */
export function parseLanyard(userId: string, payload: unknown): OwnerPresence | null {
  const root = obj(payload);
  if (!root) return null;
  if (root.success === false) return null;

  const d = obj(root.data);
  if (!d) return null;

  const user = obj(d.discord_user) ?? {};
  const activitiesRaw = Array.isArray(d.activities) ? d.activities : [];
  const activities = activitiesRaw.map(obj).filter((a): a is Record<string, unknown> => a !== null);

  let custom: string | null = null;
  let line: string | null = null;
  for (const a of activities) {
    if (a.type === 4) {
      custom = custom ?? customStatusLine(a);
      continue;
    }
    line = line ?? activityLine(a);
  }

  // Spotify gets its own top-level object, which is richer than the activity.
  const spotify = obj(d.spotify);
  let art: string | null = null;
  if (spotify) {
    const song = str(spotify.song);
    const artist = str(spotify.artist);
    if (song) line = artist ? `Listening to Spotify: ${song} - ${artist}` : `Listening to Spotify: ${song}`;
    art = str(spotify.album_art_url);
  }

  return {
    displayName: str(user.global_name) ?? str(user.display_name) ?? str(user.username),
    username: str(user.username),
    avatarUrl: avatarUrl(userId, user.avatar),
    status: toStatus(d.discord_status),
    activity: line,
    customStatus: custom,
    activityArtUrl: art,
  };
}

/** The one endpoint this feature talks to. */
export function lanyardUrl(userId: string): string {
  return `https://api.lanyard.rest/v1/users/${encodeURIComponent(userId)}`;
}
