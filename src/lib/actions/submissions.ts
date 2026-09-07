"use server";

import { revalidatePath } from "next/cache";
import { createClient, getUser } from "@/lib/supabase/server";
import {
  createSubmissionSignedUrl,
  deleteSubmissionObject,
  deleteSubmissionObjectByPath,
  isStorageAdminConfigured,
} from "@/lib/supabase/storage-admin";
import { isCurrentUserAdmin } from "@/lib/admin";
import { sendSubmissionResultBestEffort } from "@/lib/actions/submissionResultEmail";
import { MIN_REJECTION_REASON, LIMITS, submissionErrorMessage } from "@/lib/submissions";
import { assetFileName } from "@/lib/publish/assetName";

/**
 * Server actions for everything after a submission exists.
 *
 * A server action is a POST endpoint anyone can call, so each one authenticates
 * for itself and then hands the decision to the database. None of them is the
 * real gate:
 *
 *   * withdraw_submission matches on ownership AND pending status in its own
 *     WHERE clause;
 *   * every review RPC calls private.is_admin() inside the function.
 *
 * So the checks here produce a decent message and avoid pointless work; they
 * are not the security boundary.
 *
 * STORAGE CLEANUP, THE SHAPE OF IT
 * --------------------------------
 * The database and Storage cannot share a transaction, so the order is chosen
 * so the survivable failure is the one that happens:
 *
 *   1. the RPC deletes the row and writes the notification, atomically;
 *   2. the RPC returns the storage_path it read off that row;
 *   3. this action deletes exactly that object with the server-only helper.
 *
 * If step 3 fails the result is an invisible orphan in a private, unlistable
 * bucket. There is never a visible row pointing at a missing file, and the row
 * is never recreated. The failure is logged with an id and nothing else.
 */

type Result = { ok: true } | { ok: false; error: string };

/** Never let a raw Storage or Postgres string reach a browser. */
function logCleanupFailure(kind: string, id: string) {
  console.error(`[submissions] orphaned object after ${kind}`, { id });
}

/**
 * Migration 0011 returns a JSON text envelope while keeping the RPC's historic
 * SQL `text` return type. Accept the older plain path as well so application and
 * database deploys do not have to land in the same instant.
 */
function reviewOutcome(data: unknown): { storagePath: string | null; notificationId: string | null } {
  if (typeof data !== "string") return { storagePath: null, notificationId: null };
  try {
    const parsed = JSON.parse(data) as { storage_path?: unknown; notification_id?: unknown };
    return {
      storagePath: typeof parsed.storage_path === "string" ? parsed.storage_path : null,
      notificationId: typeof parsed.notification_id === "string" ? parsed.notification_id : null,
    };
  } catch {
    return { storagePath: data, notificationId: null };
  }
}

export async function withdrawSubmission(id: string): Promise<Result> {
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Submissions are unavailable right now." };

  const user = await getUser();
  if (!user) return { ok: false, error: "Sign in again and retry." };

  const { data, error } = await supabase.rpc("withdraw_submission", { p_id: id });
  if (error) return { ok: false, error: submissionErrorMessage(error) };

  if (typeof data === "string" && isStorageAdminConfigured) {
    const cleaned = await deleteSubmissionObject(user.id, id);
    if (!cleaned.ok) logCleanupFailure("withdrawal", id);
  }

  revalidatePath("/submissions");
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Review lifecycle                                                    */
/* ------------------------------------------------------------------ */

/**
 * pending -> processing.
 *
 * Deliberately does NOT tell the submitter anything. They are not accepted yet;
 * an admin has only picked the submission up to publish it by hand.
 */
export async function startProcessing(id: string): Promise<Result> {
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Review is unavailable right now." };
  if (!(await isCurrentUserAdmin()))
    return { ok: false, error: "You do not have permission to do that." };

  const { error } = await supabase.rpc("start_processing", { p_id: id });
  if (error) return { ok: false, error: submissionErrorMessage(error) };

  /*
   * Deliberately NO revalidatePath here.
   *
   * revalidatePath inside a server action makes the router refresh the route as
   * soon as the action resolves. Claiming a submission moves it out of the
   * Pending filter, so that refresh would unmount the very card whose button
   * was just pressed, taking the publishing modal with it. The caller shows the
   * claim locally and refreshes when the modal is closed instead.
   */
  return { ok: true };
}

/** processing -> pending, so someone else can pick it up. */
export async function releaseProcessing(id: string): Promise<Result> {
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Review is unavailable right now." };
  if (!(await isCurrentUserAdmin()))
    return { ok: false, error: "You do not have permission to do that." };

  const { error } = await supabase.rpc("release_processing", { p_id: id });
  if (error) return { ok: false, error: submissionErrorMessage(error) };

  revalidatePath("/admin");
  return { ok: true };
}

/**
 * Done and Close. The ONLY thing that finalises an accepted submission.
 *
 * Closing the dialog, refreshing, navigating away and closing the browser all
 * do nothing, because none of them reaches this.
 *
 * The path comes back from the RPC, read off the row being deleted. It is never
 * accepted from the browser, so this cannot be pointed at another object.
 */
export async function finishProcessing(id: string): Promise<Result> {
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Review is unavailable right now." };
  if (!(await isCurrentUserAdmin()))
    return { ok: false, error: "You do not have permission to do that." };

  const { data, error } = await supabase.rpc("finish_processing", { p_id: id });
  if (error) return { ok: false, error: submissionErrorMessage(error) };

  const outcome = reviewOutcome(data);

  // The row and its notification are already committed. A failure below leaves
  // an invisible orphan, which is the accepted trade, and must not undo that.
  if (outcome.storagePath && isStorageAdminConfigured) {
    const cleaned = await deleteSubmissionObjectByPath(outcome.storagePath);
    if (!cleaned.ok) logCleanupFailure("publishing", id);
  }

  if (outcome.notificationId) {
    await sendSubmissionResultBestEffort(outcome.notificationId);
  }

  revalidatePath("/admin");
  revalidatePath("/submissions");
  revalidatePath("/notifications");
  return { ok: true };
}

/**
 * Rejects a pending submission and cleans up immediately.
 *
 * Same shape as finishing: the RPC deletes the row and writes exactly one
 * notification atomically, then hands back the trusted path.
 */
export async function rejectSubmission(id: string, reason: string): Promise<Result> {
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Review is unavailable right now." };
  if (!(await isCurrentUserAdmin()))
    return { ok: false, error: "You do not have permission to do that." };

  const trimmed = reason.trim();
  if (trimmed.length < MIN_REJECTION_REASON)
    return { ok: false, error: `Give a reason of at least ${MIN_REJECTION_REASON} characters.` };
  if (trimmed.length > LIMITS.rejectionReason)
    return { ok: false, error: `Keep the reason under ${LIMITS.rejectionReason} characters.` };

  const { data, error } = await supabase.rpc("reject_submission", {
    p_id: id,
    p_reason: trimmed,
  });
  if (error) return { ok: false, error: submissionErrorMessage(error) };

  const outcome = reviewOutcome(data);

  if (outcome.storagePath && isStorageAdminConfigured) {
    const cleaned = await deleteSubmissionObjectByPath(outcome.storagePath);
    if (!cleaned.ok) logCleanupFailure("rejection", id);
  }


  if (outcome.notificationId) {
    await sendSubmissionResultBestEffort(outcome.notificationId);
  }

  revalidatePath("/admin");
  revalidatePath("/submissions");
  revalidatePath("/notifications");
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Downloads                                                           */
/* ------------------------------------------------------------------ */

/**
 * A short-lived signed URL for one submission's file. Admin only.
 *
 * Used from two places: inspecting a submission before deciding on it, and
 * while publishing one by hand. Both are READ ONLY. This changes no status,
 * claims nothing, notifies nobody and writes no database field.
 *
 * The path is built from the row's own submitted_by, read back from the
 * database, rather than from anything the caller sends, so even a real admin
 * cannot ask this to sign an arbitrary path. Nothing permanent is ever stored
 * or rendered.
 */
export async function getSubmissionDownloadUrl(
  id: string,
): Promise<{ url: string } | { error: string }> {
  const supabase = await createClient();
  if (!supabase) return { error: "Downloads are unavailable right now." };
  if (!(await isCurrentUserAdmin()))
    return { error: "You do not have permission to do that." };
  if (!isStorageAdminConfigured) {
    console.error("[submissions] storage admin is not configured");
    return { error: "Downloads are unavailable right now." };
  }

  const { data, error } = await supabase
    .from("submissions")
    .select("id,submitted_by,status,level_name,recorder,macro_author")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return { error: "That submission could not be found." };

  // Only a live submission has a file. Redundant today, since those are the
  // only two states that exist, but it keeps the rule explicit if that changes.
  if (data.status !== "pending" && data.status !== "processing") {
    return { error: "That submission is no longer available." };
  }

  const downloadName = assetFileName({
    macroAuthor: data.macro_author,
    levelName: data.level_name,
    recorder: data.recorder,
  });
  const signed = await createSubmissionSignedUrl(data.submitted_by, data.id, downloadName, 120);
  if ("error" in signed) {
    console.error("[submissions] could not sign download", { id });
    return { error: "That file could not be prepared for download." };
  }
  return { url: signed.url };
}

/* ------------------------------------------------------------------ */
/* Notifications                                                       */
/* ------------------------------------------------------------------ */

/**
 * Dismisses one outcome notification.
 *
 * The delete policy scopes this to the caller's own rows, so no id filter here
 * is doing security work. Deleting a notification touches nothing else:
 * notifications are standalone and have no link to any live submission.
 */
export async function dismissNotification(id: string): Promise<Result> {
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "That is unavailable right now." };

  const user = await getUser();
  if (!user) return { ok: false, error: "Sign in again and retry." };

  const { error } = await supabase.from("submission_notifications").delete().eq("id", id);
  if (error) return { ok: false, error: "That could not be dismissed. Try again." };

  revalidatePath("/submissions");
  revalidatePath("/notifications");
  return { ok: true };
}

/** Marks one result, or every result when id is omitted, as read. */
export async function markNotificationsRead(id?: string): Promise<Result> {
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "That is unavailable right now." };

  const user = await getUser();
  if (!user) return { ok: false, error: "Sign in again and retry." };

  const { error } = await supabase.rpc("mark_submission_notifications_read", {
    p_id: id ?? null,
  });
  if (error) return { ok: false, error: "Those notifications could not be marked as read." };

  revalidatePath("/notifications");
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Submission bans                                                     */
/* ------------------------------------------------------------------ */

export interface BanRow {
  email_lower: string;
  reason: string;
  created_at: string;
  banned_by_username: string;
  has_account: boolean;
}

/**
 * The ban list. Admin only, enforced inside the RPC.
 *
 * This is the only place an email address reaches a page, and only for
 * addresses a moderator typed in themselves. It cannot list anyone who has not
 * been banned, so it is not an account directory.
 */
export async function listSubmissionBans(): Promise<{ bans: BanRow[] } | { error: string }> {
  const supabase = await createClient();
  if (!supabase) return { error: "That is unavailable right now." };
  if (!(await isCurrentUserAdmin())) return { error: "You do not have permission to do that." };

  const { data, error } = await supabase.rpc("list_submission_bans");
  if (error) return { error: "The ban list could not be loaded." };
  return { bans: (data ?? []) as BanRow[] };
}

export async function banSubmissionEmail(email: string, reason: string): Promise<Result> {
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "That is unavailable right now." };
  if (!(await isCurrentUserAdmin()))
    return { ok: false, error: "You do not have permission to do that." };

  const { error } = await supabase.rpc("ban_submission_email", {
    p_email: email.trim(),
    p_reason: reason.trim(),
  });
  if (error) return { ok: false, error: banErrorMessage(error) };

  revalidatePath("/admin");
  return { ok: true };
}

export async function unbanSubmissionEmail(email: string): Promise<Result> {
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "That is unavailable right now." };
  if (!(await isCurrentUserAdmin()))
    return { ok: false, error: "You do not have permission to do that." };

  const { error } = await supabase.rpc("unban_submission_email", { p_email: email.trim() });
  if (error) return { ok: false, error: banErrorMessage(error) };

  revalidatePath("/admin");
  return { ok: true };
}

/** Admin-facing wording. Still never a raw Postgres string. */
function banErrorMessage(raw: unknown): string {
  const t = String((raw as { message?: string })?.message ?? "").toLowerCase();
  if (t.includes("not authorised")) return "You do not have permission to do that.";
  if (t.includes("does not look like an email")) return "That does not look like an email address.";
  if (t.includes("reason of 3 to 500")) return "Give a reason between 3 and 500 characters.";
  if (t.includes("is an administrator")) return "That account is an administrator and cannot be banned.";
  if (t.includes("not banned")) return "That address is not banned.";
  return "That could not be saved. Please try again.";
}
