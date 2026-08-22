/**
 * The public support address, and the prefilled mail links that use it.
 *
 * `support@gdmacros.com` is the ONLY contact address that may appear anywhere
 * in the site. Mail to it is received by Resend, forwarded by
 * `/api/email/inbound` to a private mailbox, and answered from the same
 * address. The private forwarding mailbox is never named in the product, in
 * this file, or in any page: it is an implementation detail and publishing it
 * would defeat the point of having a support address at all.
 */

export const SUPPORT_EMAIL = "support@gdmacros.com";
export const SUPPORT_MAILTO = `mailto:${SUPPORT_EMAIL}`;

/**
 * Builds a `mailto:` URL.
 *
 * Encoding is the whole reason this exists. `mailto:` bodies are percent
 * encoded, not form encoded, so `URLSearchParams` is wrong here: it turns a
 * space into `+`, which mail clients render literally, so every space in a
 * level name would arrive as a plus sign. `encodeURIComponent` is what the
 * scheme actually wants.
 */
export function buildMailto(to: string, subject: string, body: string): string {
  const q = `subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  return `mailto:${to}?${q}`;
}

export interface ReportedMacro {
  author?: string | null;
  recorder?: string | null;
  downloadUrl?: string | null;
}

export interface BrokenMacroReport {
  levelName: string;
  levelId: number | string;
  /** Canonical page for the macro, e.g. https://www.gdmacros.com/macro/acheron */
  pageUrl?: string | null;
  /**
   * Every macro listed on that page.
   *
   * The report button is per LEVEL, not per download, because that is where it
   * sits in the UI. A level usually carries one file per recorder, so the body
   * adapts: a single macro is filled in directly, and several are listed with a
   * question asking which one failed. Either way the reporter never has to go
   * and copy a download URL by hand.
   */
  macros?: ReportedMacro[];
}

/** Placeholders left for the reporter to replace. Asserted by the tests. */
export const REPORT_PROBLEM_PLACEHOLDER = "[Write what is broken here]";
export const REPORT_EXTRA_PLACEHOLDER = "[Optional]";
export const REPORT_WHICH_PLACEHOLDER = "[Say which one, or all of them]";

/**
 * The subject line for a broken macro report.
 *
 * Prefixed so support mail sorts and filters, and carrying the level and
 * recorder so the mailbox is triageable without opening anything.
 */
export function brokenMacroSubject(r: Pick<BrokenMacroReport, "levelName" | "macros">): string {
  const level = (r.levelName ?? "").trim() || "Unknown level";
  const macros = r.macros ?? [];
  // Only name the recorder when there is exactly one, so the subject cannot
  // claim a specific file when the reporter has not chosen one yet.
  const recorder = macros.length === 1 ? (macros[0].recorder ?? "").trim() : "";
  return recorder
    ? `[GDMacros Broken Macro] ${level} - ${recorder}`
    : `[GDMacros Broken Macro] ${level}`;
}

/**
 * The prefilled body.
 *
 * Every fact we already know is filled in, because a report that arrives
 * without the level or the download URL costs a round trip to be useful, and
 * most people will not bother with the round trip. The reporter should only
 * have to type what went wrong.
 *
 * Fields we do not have are omitted rather than rendered as "unknown", so the
 * mail does not arrive full of blanks.
 */
export function brokenMacroBody(r: BrokenMacroReport): string {
  const lines: string[] = [
    "Hi GDMacros Support,",
    "",
    "I'm reporting a problem with this macro.",
    "",
    `Level: ${(r.levelName ?? "").trim() || "(not given)"}`,
    `Level ID: ${String(r.levelId ?? "").trim() || "(not given)"}`,
  ];

  const macros = (r.macros ?? []).filter(Boolean);

  if (macros.length === 1) {
    const m = macros[0];
    const author = (m.author ?? "").trim();
    const recorder = (m.recorder ?? "").trim();
    const download = (m.downloadUrl ?? "").trim();
    if (author) lines.push(`Macro author: ${author}`);
    if (recorder) lines.push(`Recorder: ${recorder}`);
    if (download) lines.push(`Download: ${download}`);
  }

  const page = (r.pageUrl ?? "").trim();
  if (page) lines.push(`Page: ${page}`);

  if (macros.length > 1) {
    lines.push("", "Macros on this page:");
    for (const m of macros) {
      const bits = [(m.recorder ?? "").trim(), (m.author ?? "").trim()].filter(Boolean).join(" by ");
      const download = (m.downloadUrl ?? "").trim();
      lines.push(`- ${bits || "macro"}${download ? `: ${download}` : ""}`);
    }
    lines.push("", "Which one is broken?", REPORT_WHICH_PLACEHOLDER);
  }

  lines.push(
    "",
    "What is wrong?",
    REPORT_PROBLEM_PLACEHOLDER,
    "",
    "Anything else?",
    REPORT_EXTRA_PLACEHOLDER,
  );

  return lines.join("\n");
}

/** The complete `mailto:` for a broken macro report. */
export function buildBrokenMacroMailto(r: BrokenMacroReport): string {
  return buildMailto(SUPPORT_EMAIL, brokenMacroSubject(r), brokenMacroBody(r));
}
