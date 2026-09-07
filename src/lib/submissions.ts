import { SUBMISSION_RECORDERS, type SubmissionRecorder } from "./types";

/**
 * Submission field rules, mirrored from the database.
 *
 * The database is the authority: every one of these limits also exists as a
 * CHECK constraint in `0003_phase2c_submissions.sql`. These exist so a visitor
 * gets a sentence rather than a constraint name, and so the server route can
 * reject a bad request before touching Storage. Changing a limit means changing
 * it in both places.
 */

export const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2 MB, also the bucket's limit

export const LIMITS = {
  levelName: 100,
  levelId: 12,
  levelCreator: 50,
  macroAuthor: 50,
  notes: 1000,
  videoUrl: 500,
  rejectionReason: 500,
} as const;

export const MIN_REJECTION_REASON = 3;

export interface SubmissionFields {
  levelName: string;
  levelId: string;
  levelCreator: string;
  videoUrl: string;
  recorder: string;
  macroAuthor: string;
  notes: string;
}

export type FieldErrors = Partial<Record<keyof SubmissionFields | "file", string>>;

const LEVEL_ID = /^[0-9]{1,12}$/;

/**
 * Validates the text fields. Returns one message per bad field, in the site's
 * voice, never a database error.
 *
 * Runs in the browser for immediate feedback AND on the server, where it is the
 * one that counts.
 */
export function validateSubmission(fields: SubmissionFields): FieldErrors {
  const errors: FieldErrors = {};
  const levelName = fields.levelName.trim();
  const levelId = fields.levelId.trim();
  const levelCreator = fields.levelCreator.trim();
  const videoUrl = fields.videoUrl.trim();
  const macroAuthor = fields.macroAuthor.trim();
  const notes = fields.notes.trim();

  if (!levelName) errors.levelName = "Enter the level name.";
  else if (levelName.length > LIMITS.levelName)
    errors.levelName = `Keep the level name under ${LIMITS.levelName} characters.`;

  if (!levelId) errors.levelId = "Enter the level ID.";
  else if (!LEVEL_ID.test(levelId))
    errors.levelId = "That level ID is invalid. It should be digits only, as shown in game.";

  if (levelCreator && levelCreator.length > LIMITS.levelCreator)
    errors.levelCreator = `Keep the creator name under ${LIMITS.levelCreator} characters.`;

  if (!macroAuthor) errors.macroAuthor = "Enter who recorded the macro.";
  else if (macroAuthor.length > LIMITS.macroAuthor)
    errors.macroAuthor = `Keep the macro author under ${LIMITS.macroAuthor} characters.`;

  if (!SUBMISSION_RECORDERS.includes(fields.recorder as SubmissionRecorder))
    errors.recorder = "Choose which tool recorded this macro.";

  if (notes.length > LIMITS.notes)
    errors.notes = `Keep notes under ${LIMITS.notes} characters.`;

  if (videoUrl) {
    if (videoUrl.length > LIMITS.videoUrl) {
      errors.videoUrl = "That link is too long.";
    } else if (!/^https?:\/\//i.test(videoUrl)) {
      // The same rule the database enforces, so a javascript: or data: value
      // can never be stored, let alone rendered into a link later.
      errors.videoUrl = "The video link must start with http:// or https://";
    }
  }

  return errors;
}

/** True when nothing is wrong. */
export function isClean(errors: FieldErrors): boolean {
  return Object.keys(errors).length === 0;
}

/** Trimmed values, ready to send. Empty optional fields become null. */
export function normaliseSubmission(fields: SubmissionFields) {
  const t = (v: string) => v.trim();
  return {
    levelName: t(fields.levelName),
    levelId: t(fields.levelId),
    levelCreator: t(fields.levelCreator) || null,
    videoUrl: t(fields.videoUrl) || null,
    recorder: fields.recorder,
    macroAuthor: t(fields.macroAuthor),
    notes: t(fields.notes) || null,
  };
}

export function validateFile(file: { name: string; size: number } | null): string | null {
  if (!file) return "Choose the .gdr2 macro file.";
  if (!file.name.toLowerCase().endsWith(".gdr2")) return "The file must be a .gdr2 macro.";
  if (file.size === 0) return "That file is empty.";
  if (file.size > MAX_FILE_BYTES) return "The file is too large. The limit is 2 MB.";
  return null;
}

/* ------------------------------------------------------------------ */
/* Turning backend failures into sentences                             */
/* ------------------------------------------------------------------ */

/**
 * Maps a raw error from PostgREST, an RPC or Storage onto something a person
 * can act on.
 *
 * Nothing raw ever reaches the browser: no SQLSTATE, no constraint name, no
 * Supabase internals. Anything unrecognised falls through to one neutral
 * sentence rather than leaking the original.
 */
export function submissionErrorMessage(raw: unknown): string {
  const text =
    typeof raw === "string"
      ? raw
      : ((raw as { message?: string })?.message ?? "");
  const t = text.toLowerCase();

  if (t.includes("choose a username")) return "You need to choose a username before submitting.";
  if (t.includes("not authenticated")) return "Sign in again and retry.";
  if (t.includes("no uploaded file")) return "The upload did not finish. Try sending it again.";
  if (t.includes("not authorised")) return "You do not have permission to do that.";
  // Deliberately says nothing about why, by whom, or for how long, and never
  // the private moderation note.
  if (t.includes("submission ban")) return "You are not allowed to make macro submissions.";
  if (t.includes("already being handled"))
    return "Another admin is already handling that submission.";
  if (t.includes("not being processed"))
    return "That submission is no longer being processed.";
  if (t.includes("already reviewed") || t.includes("not found or already reviewed"))
    return "This submission has already been reviewed.";
  if (t.includes("not found, not yours, or already reviewed"))
    return "That submission cannot be withdrawn any more.";
  if (t.includes("rejection reason is required"))
    return `Give a reason of at least ${MIN_REJECTION_REASON} characters.`;
  if (t.includes("submission content is immutable"))
    return "This submission cannot be changed after it was sent.";

  // Constraint names, mapped rather than shown.
  if (t.includes("level_id_format")) return "That level ID is invalid.";
  if (t.includes("level_name_len")) return "That level name is too long.";
  if (t.includes("macro_author_len")) return "That macro author name is too long.";
  if (t.includes("level_creator_len")) return "That creator name is too long.";
  if (t.includes("notes_len")) return "Those notes are too long.";
  if (t.includes("video_url_safe")) return "That video link is not a valid http or https link.";
  if (t.includes("reason_len")) return "That reason is too long.";
  if (t.includes("file_size")) return "The file is too large. The limit is 2 MB.";
  if (t.includes("recorder")) return "Choose xdBot or Mega Hack.";

  return "Something went wrong. Please try again.";
}

/**
 * The two states a LIVE submission can be in.
 *
 * There is no approved or rejected submission any more: an outcome deletes the
 * row and leaves a small notification instead, so those live in
 * `submission_notifications` rather than here.
 */
export const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  processing: "Being published",
};

/** One outcome the submitter is told about, after the submission itself is gone. */
export interface NotificationRow {
  id: string;
  submission_id: string | null;
  level_name: string;
  level_id: string | null;
  macro_author: string | null;
  recorder: string | null;
  outcome: "accepted" | "rejected";
  rejection_reason: string | null;
  read_at: string | null;
  created_at: string;
}

/** The bounded columns shown for a submitter's dismissible result notices. */
export const NOTIFICATION_COLUMNS =
  "id,submission_id,level_name,level_id,macro_author,recorder,outcome,rejection_reason,read_at,created_at";

/** One accepted submission retained as private, account-linked publication history. */
export interface PublishedSubmissionRow {
  submission_id: string;
  level_name: string;
  level_id: string;
  macro_author: string;
  recorder: string;
  download_url: string;
  published_at: string;
}

export const PUBLISHED_SUBMISSION_COLUMNS =
  "submission_id,level_name,level_id,macro_author,recorder,download_url,published_at";

export interface PublishedSubmissionView extends PublishedSubmissionRow {
  /** The live catalog page, once the verified download URL is found there. */
  macro_href: string | null;
}

export interface SubmissionRow {
  id: string;
  level_name: string;
  level_id: string;
  level_creator: string | null;
  video_url: string | null;
  recorder: string;
  macro_author: string;
  notes: string | null;
  status: string;
  created_at: string;
}

/** The columns a submitter is allowed to see. No storage path, no reviewer. */
export const OWN_COLUMNS =
  "id,level_name,level_id,level_creator,video_url,recorder,macro_author,notes,status,created_at";

export function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
