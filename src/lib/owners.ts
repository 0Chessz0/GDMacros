/**
 * The GDMacros owner, kept in a fixed list so the UI can remain data-driven.
 *
 * These ids are hardcoded ON PURPOSE. The About page is not a Discord lookup
 * tool: no query string, route parameter or other visitor input may ever reach
 * the Lanyard URL, because that would turn the site into an open proxy for
 * pulling any Discord user's presence. Adding an owner is a code change.
 */

export interface Owner {
  /** Name used on GDMacros, e.g. the macro author credit. */
  name: string;
  /** What they do here. */
  role: string;
  /** Public Discord snowflake. */
  discordId: string;
}

export const OWNERS: readonly Owner[] = [
  { name: "Chessz", role: "Owner", discordId: "1488686761264549939" },
] as const;

/** The public profile link Discord itself serves. Never an invite. */
export function discordProfileUrl(discordId: string): string {
  return `https://discord.com/users/${encodeURIComponent(discordId)}`;
}

/** Only these ids may be requested. Used to reject anything else. */
export function isOwnerId(id: string): boolean {
  return OWNERS.some((o) => o.discordId === id);
}
