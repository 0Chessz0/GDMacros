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

/**
 * Pulls the actual filename out of a download URL so the page can say what you
 * are about to get before you click, rather than just "DOWNLOAD".
 *
 * MediaFire puts the name second from the end and encodes spaces as "+", which
 * decodeURIComponent leaves alone, so that is swapped first.
 */
export function fileNameFromUrl(url: string): string | null {
  try {
    const { pathname } = new URL(url);
    const parts = pathname.split("/").filter(Boolean);
    const candidate = [...parts].reverse().find((p) => /\.[a-z0-9]{2,5}$/i.test(p));
    if (!candidate) return null;
    return decodeURIComponent(candidate.replace(/\+/g, " "));
  } catch {
    return null;
  }
}

/** The bare host, for telling people which site a download link leaves to. */
export function hostNameFromUrl(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}
