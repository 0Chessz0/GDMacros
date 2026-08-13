import { GD_BROWSER } from "./site";

/** Level pages on GD Browser: https://gdbrowser.com/<levelId> */
export function levelUrl(levelId: number | string): string {
  return `${GD_BROWSER}/${levelId}`;
}

/**
 * Download hosts we recognise get a brand-ish accent; anything else falls back
 * to the neutral chip, so a new host still renders correctly.
 */
const HOST_ACCENT: Record<string, string> = {
  "google drive": "#4285f4",
  mediafire: "#0084ff",
  dropbox: "#0061fe",
  mega: "#d9272e",
  github: "#8b949e",
  discord: "#5865f2",
  onedrive: "#0364b8",
};

export function hostAccent(downloadType: string): string | null {
  return HOST_ACCENT[downloadType.trim().toLowerCase()] ?? null;
}

/** A link that hasn't been filled in yet shouldn't render as a working button. */
export function isPlaceholderLink(link: string | undefined): boolean {
  if (!link) return true;
  return !/^https?:\/\//i.test(link);
}
