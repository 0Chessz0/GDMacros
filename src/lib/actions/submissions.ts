"use server";

import { revalidatePath } from "next/cache";
import { createClient, getUser } from "@/lib/supabase/server";
import {
  createSubmissionSignedUrl,
  deleteSubmissionObject,
  isStorageAdminConfigured,
} from "@/lib/supabase/storage-admin";
import { isCurrentUserAdmin } from "@/lib/admin";
import { MIN_REJECTION_REASON, LIMITS, submissionErrorMessage } from "@/lib/submissions";

/**
 * Server actions for everything after a submission exists.
 *
 * A server action is a POST endpoint anyone can call, so each one authenticates
 * for itself and then hands the decision to the database. None of them is the
 * real gate:
 *
 *   * withdraw_submission matches on ownership AND pending status in its own
 *     WHERE clause, so somebody else's row simply does not match;
 *   * approve_submission and reject_submission each call private.is_admin()
 *     inside the function.
 *
 * So the checks here exist to produce a decent message and to avoid pointless
 * work, not to be the security boundary.
 */

type Result = { ok: true } | { ok: false; error: string };

export async function withdrawSubmission(id: string): Promise<Result> {
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Submissions are unavailable right now." };

  const user = await getUser();
  if (!user) return { ok: false, error: "Sign in again and retry." };

  // Returns the storage path of the row it deleted. Ownership and pending
  // status are enforced inside the function, not here.
  const { data, error } = await supabase.rpc("withdraw_submission", { p_id: id });
  if (error) return { ok: false, error: submissionErrorMessage(error) };

  // Row first, then file. If this delete fails the result is an orphaned
  // private object, which is invisible and sweepable; there is never a row
  // pointing at nothing.
  if (typeof data === "string" && isStorageAdminConfigured) {
    const cleaned = await deleteSubmissionObject(user.id, id);
    if (!cleaned.ok) console.error("[submissions] orphaned object after withdrawal", { id });
  }

  revalidatePath("/submissions");
  return { ok: true };
}

export async function approveSubmission(id: string): Promise<Result> {
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Review is unavailable right now." };
  if (!(await isCurrentUserAdmin())) return { ok: false, error: "You do not have permission to do that." };

  const { error } = await supabase.rpc("approve_submission", { p_id: id });
  if (error) return { ok: false, error: submissionErrorMessage(error) };

  revalidatePath("/admin");
  return { ok: true };
}

export async function rejectSubmission(id: string, reason: string): Promise<Result> {
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Review is unavailable right now." };
  if (!(await isCurrentUserAdmin())) return { ok: false, error: "You do not have permission to do that." };

  const trimmed = reason.trim();
  if (trimmed.length < MIN_REJECTION_REASON) {
    return { ok: false, error: `Give a reason of at least ${MIN_REJECTION_REASON} characters.` };
  }
  if (trimmed.length > LIMITS.rejectionReason) {
    return { ok: false, error: `Keep the reason under ${LIMITS.rejectionReason} characters.` };
  }

  const { error } = await supabase.rpc("reject_submission", { p_id: id, p_reason: trimmed });
  if (error) return { ok: false, error: submissionErrorMessage(error) };

  revalidatePath("/admin");
  return { ok: true };
}

/**
 * A short-lived signed URL for one submission's file.
 *
 * Admin only, checked against the database before anything is minted. The URL
 * is generated on demand and never stored: no permanent Storage URL exists in
 * the database or in any rendered page, and the bucket itself stays private and
 * unlistable.
 *
 * The path is derived from the row's own submitted_by, read back from the
 * database, rather than from anything the caller sends. So even a valid admin
 * cannot ask this to sign an arbitrary path.
 */
export async function getSubmissionDownloadUrl(
  id: string,
): Promise<{ url: string } | { error: string }> {
  const supabase = await createClient();
  if (!supabase) return { error: "Downloads are unavailable right now." };
  if (!(await isCurrentUserAdmin())) return { error: "You do not have permission to do that." };
  if (!isStorageAdminConfigured) {
    console.error("[submissions] storage admin is not configured");
    return { error: "Downloads are unavailable right now." };
  }

  const { data, error } = await supabase
    .from("submissions")
    .select("id,submitted_by")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return { error: "That submission could not be found." };

  const signed = await createSubmissionSignedUrl(data.submitted_by, data.id, 60);
  if ("error" in signed) {
    console.error("[submissions] could not sign download", { id });
    return { error: "That file could not be prepared for download." };
  }
  return { url: signed.url };
}
