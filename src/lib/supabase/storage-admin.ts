import "server-only";

import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "./config";

/**
 * The ONLY place in this project that touches a privileged Supabase key.
 *
 * Why a privileged key is needed at all
 * -------------------------------------
 * The `macro-submissions` bucket has no storage policies for `anon` or
 * `authenticated`, so no browser client can upload, download, list or delete an
 * object, not even under its own user id. That is deliberate: without it a
 * client could upload straight to Storage and skip the magic-byte check, the
 * size limit and the whole intended sequence. Object operations therefore have
 * to run somewhere trusted, with a key that bypasses those policies.
 *
 * How it is kept narrow
 * ---------------------
 *   * `import "server-only"` is the first line. Importing this module from a
 *     client component fails the BUILD rather than leaking at runtime.
 *   * The key comes from SUPABASE_SECRET_KEY, which has no NEXT_PUBLIC_ prefix,
 *     so Next will not inline it into any browser bundle.
 *   * The raw client is never exported. Only the three narrow operations below
 *     leave this file, and each one is confined to this one bucket.
 *   * It is used for STORAGE ONLY. Every database write still goes through the
 *     user's own session and RLS, so this never becomes a general purpose
 *     skeleton key. There is no exported helper here that touches a table.
 *   * Nothing here logs the key, the client, or any full error object that
 *     might carry request headers.
 */

const BUCKET = "macro-submissions";

/** Server-only. Absent in the browser, and absent from every client bundle. */
const SECRET_KEY = process.env.SUPABASE_SECRET_KEY ?? "";

/**
 * Whether uploads can work at all.
 *
 * Submissions are one feature of an otherwise static catalog, so a missing key
 * must degrade to "submissions are unavailable" rather than taking the site
 * down. Callers check this before doing anything.
 */
export const isStorageAdminConfigured = Boolean(SUPABASE_URL && SECRET_KEY);

/**
 * Not exported. Built per call rather than held in a module-level singleton so
 * that a missing key cannot throw at import time and break an unrelated route.
 */
function adminClient() {
  if (!isStorageAdminConfigured) {
    throw new Error("Storage admin is not configured");
  }
  return createClient(SUPABASE_URL, SECRET_KEY, {
    auth: {
      // This client must never pick up, persist or refresh a user session. It
      // is a machine identity and nothing else.
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The one path shape allowed in this bucket, matching the generated
 * `storage_path` column on public.submissions:
 *
 *   {user_id}/{submission_id}.gdr2
 *
 * Built here from ids rather than accepted as a string, so no caller can pass a
 * traversal or point at another user's folder.
 */
function objectPath(userId: string, submissionId: string): string {
  if (!UUID.test(userId) || !UUID.test(submissionId)) {
    throw new Error("Invalid storage path components");
  }
  return `${userId}/${submissionId}.gdr2`;
}

/**
 * Writes the uploaded file.
 *
 * `upsert: false` so a submission id can never overwrite an existing object;
 * the id is generated server side per submission, so a collision means
 * something is wrong and should fail loudly.
 */
export async function putSubmissionObject(
  userId: string,
  submissionId: string,
  body: ArrayBuffer | Uint8Array,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { error } = await adminClient()
      .storage.from(BUCKET)
      .upload(objectPath(userId, submissionId), body, {
        upsert: false,
        contentType: "application/octet-stream",
      });
    // Only the message, never the whole error object, which can carry headers.
    return error ? { ok: false, error: error.message } : { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "upload failed" };
  }
}

/**
 * Removes an object.
 *
 * Used to clean up after a failed row creation, and after a withdrawal once the
 * row is already gone. A failure here leaves an orphaned private object, which
 * is invisible to everyone and cheap to sweep, so callers treat it as
 * non-fatal.
 */
export async function deleteSubmissionObject(
  userId: string,
  submissionId: string,
): Promise<{ ok: boolean }> {
  try {
    const { error } = await adminClient()
      .storage.from(BUCKET)
      .remove([objectPath(userId, submissionId)]);
    return { ok: !error };
  } catch {
    return { ok: false };
  }
}

/**
 * A short-lived signed URL, for an admin reviewing a submission.
 *
 * The bucket is never public and cannot be listed, so this is the only way to
 * read an object. The caller is responsible for checking that the requester is
 * an admin BEFORE calling this: this module deliberately knows nothing about
 * who is asking.
 */
export async function createSubmissionSignedUrl(
  userId: string,
  submissionId: string,
  expiresInSeconds = 60,
): Promise<{ url: string } | { error: string }> {
  try {
    const { data, error } = await adminClient()
      .storage.from(BUCKET)
      .createSignedUrl(objectPath(userId, submissionId), expiresInSeconds);
    if (error || !data?.signedUrl) return { error: error?.message ?? "could not sign" };
    return { url: data.signedUrl };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "could not sign" };
  }
}
