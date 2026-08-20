import { NextResponse, type NextRequest } from "next/server";
import { createClient, getUser } from "@/lib/supabase/server";
import {
  deleteSubmissionObject,
  isStorageAdminConfigured,
  putSubmissionObject,
} from "@/lib/supabase/storage-admin";
import { checkGdr2 } from "@/lib/gdr2";
import { lookupLevel } from "@/lib/gdbrowser";
import { canonicalUrl, verifyVideo, videoIdFromUrl } from "@/lib/youtube";
import {
  MAX_FILE_BYTES,
  isClean,
  normaliseSubmission,
  submissionErrorMessage,
  validateFile,
  validateSubmission,
  type FieldErrors,
} from "@/lib/submissions";

/**
 * The only way a macro file gets into Storage.
 *
 * The browser never talks to Supabase Storage: the bucket has no policies for
 * `anon` or `authenticated`, so a direct upload is refused even under your own
 * user id. That is what makes this route the single choke point where the magic
 * bytes, the size and the field limits are actually enforced.
 *
 * Order of operations, and why:
 *
 *   1. authenticate with getUser(), which validates the token rather than
 *      trusting a cookie;
 *   2. require a profile, because a submission is attributed publicly;
 *   3. validate every field and the file itself, server side, because a browser
 *      check is advice rather than enforcement;
 *   3b. RE-FETCH the level from GDBrowser and the video from YouTube, and store
 *      what THEY say. The search UI is not a security boundary: a modified
 *      request could otherwise pair a real level id with any name and creator
 *      it liked. Only the id is taken from the request; the name and creator
 *      are whatever GDBrowser returns for it;
 *   4. generate the submission id here, so the caller cannot choose it;
 *   5. upload the object FIRST;
 *   6. create the row second, as the user, so RLS and the RPC's own checks
 *      apply;
 *   7. if the row fails, delete the object.
 *
 * Upload before insert is deliberate. A failed insert leaves an unreferenced
 * private object: invisible to everyone and cheap to sweep. The reverse order
 * would leave a visible broken submission an admin cannot download. The worse
 * orphan is the row, so the order avoids it.
 */

export const runtime = "nodejs";

function bad(status: number, error: string, fields?: FieldErrors) {
  return NextResponse.json({ error, fields }, { status });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  if (!supabase) return bad(503, "Submissions are unavailable right now.");

  const user = await getUser();
  if (!user) return bad(401, "Sign in to submit a macro.");

  // A submission is shown publicly under a username, so one is required. The
  // absence of the row is the signal, exactly as on /account.
  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile) return bad(403, "You need to choose a username before submitting.");

  if (!isStorageAdminConfigured) {
    // Missing server configuration. Say nothing about which variable.
    console.error("[submissions] storage admin is not configured");
    return bad(503, "Submissions are unavailable right now.");
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return bad(400, "That upload was not readable. Try again.");
  }

  const fields = {
    levelName: String(form.get("levelName") ?? ""),
    levelId: String(form.get("levelId") ?? ""),
    levelCreator: String(form.get("levelCreator") ?? ""),
    videoUrl: String(form.get("videoUrl") ?? ""),
    recorder: String(form.get("recorder") ?? ""),
    macroAuthor: String(form.get("macroAuthor") ?? ""),
    notes: String(form.get("notes") ?? ""),
  };

  const errors = validateSubmission(fields);

  const file = form.get("file");
  const asFile = file instanceof File ? file : null;
  const fileError = validateFile(asFile);
  if (fileError) errors.file = fileError;

  if (!isClean(errors)) return bad(400, "Some fields need fixing.", errors);
  if (!asFile) return bad(400, "Choose the .gdr2 macro file.");

  // Read the bytes only after the cheap checks have passed.
  const bytes = new Uint8Array(await asFile.arrayBuffer());

  // The reported size and the actual bytes can disagree, so the real length is
  // what gets checked and what gets stored.
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_FILE_BYTES) {
    return bad(400, "Some fields need fixing.", {
      file: "The file is too large. The limit is 2 MB.",
    });
  }

  const gdr = checkGdr2(bytes);
  if (!gdr.ok) {
    return bad(400, "Some fields need fixing.", { file: gdr.error });
  }

  /*
   * Re-verify the level. What the browser sent for name and creator is
   * discarded entirely: only the id survives, and GDBrowser decides the rest.
   * Failing closed here is deliberate. A submission whose level cannot be
   * confirmed is worth rejecting, because an admin would have to check it by
   * hand anyway.
   */
  const level = await lookupLevel(fields.levelId.trim());
  if (!level.ok) {
    const message =
      level.reason === "not-found"
        ? "That level ID is invalid."
        : "We couldn't verify that Geometry Dash level right now. Please try again.";
    return bad(level.reason === "not-found" ? 400 : 502, "Some fields need fixing.", {
      levelId: message,
    });
  }

  /*
   * Re-verify the video, when one was given. oEmbed is official and keyless,
   * and it answers 400 for anything that is not a real public video. Only a
   * canonical watch URL is ever stored, built from the id rather than from the
   * string the browser sent.
   */
  let videoUrl: string | null = null;
  const rawVideo = fields.videoUrl.trim();
  if (rawVideo) {
    const videoId = videoIdFromUrl(rawVideo);
    if (!videoId) {
      return bad(400, "Some fields need fixing.", {
        videoUrl: "That does not look like a YouTube link.",
      });
    }
    const verified = await verifyVideo(videoId);
    if (!verified.ok) {
      return bad(verified.reason === "not-found" ? 400 : 502, "Some fields need fixing.", {
        videoUrl:
          verified.reason === "not-found"
            ? "That video could not be found on YouTube. Check the link."
            : "We couldn't check that video right now. Please try again.",
      });
    }
    videoUrl = canonicalUrl(videoId);
  }

  // Generated here. The caller never supplies it, so it cannot be aimed at
  // another user's folder or at an existing object.
  const submissionId = crypto.randomUUID();

  const put = await putSubmissionObject(user.id, submissionId, bytes);
  if (!put.ok) {
    console.error("[submissions] upload failed", { submissionId, reason: put.error });
    return bad(502, "The upload did not finish. Please try again.");
  }

  const values = normaliseSubmission(fields);
  const { error: rpcError } = await supabase.rpc("create_submission", {
    p_id: submissionId,
    // From GDBrowser, not from the request.
    p_level_name: level.data.name,
    p_level_id: level.data.levelId,
    p_level_creator: level.data.creator,
    // Canonical, rebuilt from the verified id.
    p_video_url: videoUrl,
    p_recorder: values.recorder,
    p_macro_author: values.macroAuthor,
    p_notes: values.notes,
    p_file_size: bytes.byteLength,
  });

  if (rpcError) {
    // Never leave an object with no row pointing at it if it can be helped.
    const cleaned = await deleteSubmissionObject(user.id, submissionId);
    if (!cleaned.ok) {
      // An orphaned private object is invisible and sweepable, so this is
      // logged rather than surfaced. No key, no client, no raw error object.
      console.error("[submissions] orphaned object left behind", { submissionId });
    }
    console.error("[submissions] create_submission failed", { submissionId });
    return bad(400, submissionErrorMessage(rpcError));
  }

  return NextResponse.json({ id: submissionId }, { status: 201 });
}
