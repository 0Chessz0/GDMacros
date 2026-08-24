import type { Gdr2Metadata } from "./gdr2";

/**
 * Turning a file's own header into things a reviewer should look at.
 *
 * Pure: metadata in, findings out. No network, no database, no file access, so
 * every rule can be tested against a handmade header without standing anything
 * up.
 *
 * WHY THIS EXISTS
 * ---------------
 * A macro was published with the two recorders swapped. Nothing in the review
 * screen could have caught it, because the only evidence was inside the file
 * and nothing read it. Correcting it afterwards meant renaming release assets
 * through a temporary name and two catalog commits. This is the check that
 * would have shown it before the first upload.
 */

export type FindingLevel = "ok" | "warn" | "info";

export interface Finding {
  id: string;
  level: FindingLevel;
  label: string;
  /** What the file says. Rendered as-is. */
  value: string;
  /** Why it matters, when it is not obvious. */
  note?: string;
}

export interface SubmissionClaim {
  levelId: string;
  levelName: string;
  recorder: string;
}

/**
 * Which recorder a file was actually written for.
 *
 * NOT `botName`. Every file in this catalog declares `xdBot`, including the
 * ones published as Mega Hack, because they are all xdBot recordings and some
 * have been converted. Reading the declared name would agree with itself and
 * tell a reviewer nothing.
 *
 * The extension block is the real signal. xdBot writes a large one; converting
 * a recording for Mega Hack strips it, which is what takes a 450 KB file down
 * to a few hundred bytes. Checked against 24 catalog files, twelve of each
 * recorder, and the separation was total: every xdBot entry had one, every
 * Mega Hack entry did not.
 *
 * Returned as a guess rather than a fact, because it is an inference from how
 * the file was produced rather than a field the format sets aside for it.
 */
export function recorderFromFile(meta: Gdr2Metadata): "xdBot" | "Mega Hack" {
  return meta.extensionBytes > 0 ? "xdBot" : "Mega Hack";
}

const fmtDuration = (seconds: number | null): string => {
  if (seconds === null) return "not recorded";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s.toFixed(1)}s` : `${s.toFixed(2)}s`;
};

const fmtBytes = (n: number): string =>
  n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(2)} MB` : `${(n / 1024).toFixed(1)} KB`;

/**
 * Everything worth showing, with the disagreements marked.
 *
 * Findings are ordered by how much they should change a decision: the two that
 * can be objectively wrong first, then context. Nothing here blocks anything;
 * a reviewer can still publish a file whose header disagrees with the form,
 * because there are legitimate reasons for that and being overruled by a
 * heuristic is worse than being warned by one.
 */
export function reviewFindings(
  meta: Gdr2Metadata,
  claim: SubmissionClaim,
  fileBytes: number,
  sha256: string,
): Finding[] {
  const findings: Finding[] = [];

  /* ---- the level the recording is actually for ---- */
  const declaredId = String(meta.levelId);
  const levelMatches = declaredId === String(claim.levelId).trim();
  findings.push({
    id: "level",
    level: levelMatches ? "ok" : "warn",
    label: "Level in the file",
    value: meta.levelName ? `${meta.levelName} (${declaredId})` : declaredId,
    note: levelMatches
      ? undefined
      : `The form says ${claim.levelId}. The recording is for a different level, or the ID was mistyped.`,
  });

  /* ---- the recorder it was written for ---- */
  const guess = recorderFromFile(meta);
  const recorderMatches = guess === claim.recorder.trim();
  findings.push({
    id: "recorder",
    level: recorderMatches ? "ok" : "warn",
    label: "Recorder the file looks written for",
    value: guess,
    note: recorderMatches
      ? undefined
      : `The form says ${claim.recorder}. The extension block is ${
          meta.extensionBytes > 0 ? "present, which is how a raw xdBot recording looks" : "absent, which is how a recording converted for Mega Hack looks"
        }. Worth opening before publishing.`,
  });

  /* ---- context, none of it a pass or fail ---- */
  findings.push({
    id: "framerate",
    level: meta.framerate !== null && meta.framerate < 60 ? "warn" : "info",
    label: "Framerate",
    value: meta.framerate === null ? "not recorded" : `${meta.framerate} FPS`,
    note:
      meta.framerate !== null && meta.framerate < 60
        ? "Unusually low. A macro recorded below 60 FPS often desyncs for other people."
        : undefined,
  });

  findings.push({ id: "duration", level: "info", label: "Length", value: fmtDuration(meta.duration) });

  findings.push({
    id: "declaredBot",
    level: "info",
    label: "Declared by the file",
    value: `${meta.botName || "unknown"} v${meta.botVersion}`,
    note: "The tool that originally recorded it. A converted file still names the original recorder, so this is not the same question as the row above.",
  });

  if (meta.platformer) {
    findings.push({
      id: "platformer",
      level: "info",
      label: "Mode",
      value: "Platformer",
      note: "Platformer recordings use both player slots legitimately.",
    });
  }

  findings.push({
    id: "size",
    level: "info",
    label: "File",
    value: `${fmtBytes(fileBytes)}, extension block ${meta.extensionBytes > 0 ? fmtBytes(meta.extensionBytes) : "absent"}`,
  });

  findings.push({
    id: "sha256",
    level: "info",
    label: "SHA-256",
    // Short enough to compare by eye, long enough to be unambiguous here.
    value: sha256.slice(0, 16),
    note: "Identifies this exact file. Two submissions with the same hash are the same upload.",
  });

  return findings;
}

/** True when anything needs a second look before publishing. */
export function hasWarnings(findings: Finding[]): boolean {
  return findings.some((f) => f.level === "warn");
}

/**
 * Whether the catalog already carries this level and recorder.
 *
 * A duplicate is not automatically wrong: a better recording legitimately
 * replaces an older one. It just should not happen by accident, which is what
 * it looked like when one level ended up with two entries for the same
 * recorder under slightly different filenames.
 */
export function findExistingEntry(
  catalog: { name: string; levelId: string | number; macros: { recorder: string; author: string }[] }[],
  claim: SubmissionClaim,
): { recorder: string; author: string } | null {
  const level = catalog.find((l) => String(l.levelId) === String(claim.levelId).trim());
  if (!level) return null;
  return (
    level.macros.find((m) => m.recorder.trim() === claim.recorder.trim()) ?? null
  );
}
