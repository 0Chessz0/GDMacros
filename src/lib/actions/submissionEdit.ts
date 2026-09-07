"use server";

import { revalidatePath } from "next/cache";
import { createClient, getUser } from "@/lib/supabase/server";
import { isCurrentUserAdmin } from "@/lib/admin";
import { canonicalUrl, verifyVideo, videoIdFromUrl } from "@/lib/youtube";
import { lookupLevel } from "@/lib/gdbrowser";
import { SUBMISSION_RECORDERS } from "@/lib/types";
import { safeDetail } from "@/lib/health";

/**
 * Correcting a submission before it is published.
 *
 * The case this exists for: somebody submits a perfectly good macro without a
 * showcase video. That is fine for them, the form does not require one, but the
 * catalog wants a video. Before this the only options were publishing it
 * without one or rejecting a good macro over a missing link.
 *
 * As everywhere else, this server action is NOT the security boundary. The
 * `admin_update_submission` RPC checks `private.is_admin()` for itself and
 * refuses once publishing has started, so an attacker who skipped the checks
 * here would still achieve nothing. These checks fail fast and give a usable
 * message.
 */

export interface EditFields {
  levelName?: string;
  levelId?: string;
  levelCreator?: string;
  videoUrl?: string;
  recorder?: string;
  macroAuthor?: string;
}

export type EditResult =
  | { ok: true; fields: Record<string, string | null>; note?: string }
  | { ok: false; error: string };

/**
 * Re-fetches the level and the video rather than trusting what was typed.
 *
 * This mirrors what the submit route already does. The reviewer is trusted, but
 * "trusted" is not the same as "cannot make a typo", and a level name that
 * disagrees with the level ID produces a catalog entry and an asset filename
 * that are both wrong. Whatever GDBrowser says for the ID is what gets stored.
 */
export async function updateSubmission(id: string, fields: EditFields): Promise<EditResult> {
  const user = await getUser();
  if (!user) return { ok: false, error: "Not signed in." };
  if (!(await isCurrentUserAdmin())) return { ok: false, error: "Not authorised." };

  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Database unavailable." };

  const payload: Record<string, string | null> = {
    p_id: id,
    p_level_name: null,
    p_level_id: null,
    p_level_creator: null,
    p_video_url: null,
    p_recorder: null,
    p_macro_author: null,
  };
  const notes: string[] = [];

  /* ---- level id, and the name and creator that follow from it ---- */
  const levelId = fields.levelId?.trim();
  if (levelId) {
    if (!/^[0-9]{1,12}$/.test(levelId)) return { ok: false, error: "Level ID must be digits only." };

    const level = await lookupLevel(levelId);
    if (!level.ok) {
      return {
        ok: false,
        error:
          level.reason === "not-found"
            ? "No level with that ID on GDBrowser."
            : "Could not reach GDBrowser to confirm that level.",
      };
    }
    payload.p_level_id = levelId;
    // Taken from GDBrowser, not from the form, for the same reason the submit
    // route does it: the name and creator should describe the ID being stored.
    payload.p_level_name = level.data.name;
    payload.p_level_creator = level.data.creator ?? "";
    notes.push(`Level resolved to "${level.data.name}"`);
  } else {
    // Name and creator can still be corrected on their own, when the ID is
    // right but the stored text is not.
    if (fields.levelName?.trim()) payload.p_level_name = fields.levelName.trim();
    if (fields.levelCreator !== undefined) payload.p_level_creator = fields.levelCreator.trim();
  }

  /* ---- video ---- */
  if (fields.videoUrl !== undefined) {
    const raw = fields.videoUrl.trim();
    if (!raw) {
      // Explicit empty string means remove it, which the RPC distinguishes from
      // null meaning leave alone.
      payload.p_video_url = "";
    } else {
      const videoId = videoIdFromUrl(raw);
      if (!videoId) return { ok: false, error: "That does not look like a YouTube link." };

      const check = await verifyVideo(videoId);
      if (!check.ok) {
        return {
          ok: false,
          error:
            check.reason === "not-found"
              ? "YouTube does not recognise that video, or it is private."
              : "Could not reach YouTube to confirm that video.",
        };
      }
      // Stored canonical, so the catalog never carries a tracking parameter
      // somebody pasted from a share sheet.
      payload.p_video_url = canonicalUrl(videoId);
      notes.push(`Video verified: "${check.data.title}"`);
    }
  }

  /* ---- recorder and macro author ---- */
  if (fields.recorder?.trim()) {
    const recorder = fields.recorder.trim();
    if (!(SUBMISSION_RECORDERS as readonly string[]).includes(recorder)) {
      return { ok: false, error: "Recorder must be one of the two supported tools." };
    }
    payload.p_recorder = recorder;
  }
  if (fields.macroAuthor?.trim()) payload.p_macro_author = fields.macroAuthor.trim();

  const changed = Object.entries(payload).filter(([k, v]) => k !== "p_id" && v !== null);
  if (changed.length === 0) return { ok: false, error: "Nothing to change." };

  const { data, error } = await supabase.rpc("admin_update_submission", payload);
  if (error) {
    /*
     * The real message, not a generic one.
     *
     * This started as "The submission could not be updated." for everything,
     * and it cost an hour: the freeze trigger from 0003 was rejecting every
     * edit with 'submission content is immutable', and the UI reported nothing
     * that pointed at a trigger. A reviewer looking at a refusal they cannot
     * act on is worse than no button at all.
     *
     * Safe to surface here. This page is admin only, and what Postgres puts in
     * these messages is its own constraint and trigger text, never a
     * credential. `safeDetail` caps the length and refuses anything that looks
     * like a token regardless.
     */
    const raw = error.message ?? "";
    if (/publishing has already started/i.test(raw)) {
      return { ok: false, error: "Publishing has already started, so the details are fixed." };
    }
    if (/can no longer be edited/i.test(raw)) {
      return { ok: false, error: "This submission is no longer pending, so it cannot be edited." };
    }
    if (/not authorised/i.test(raw)) return { ok: false, error: "Not authorised." };
    if (/submission content is immutable/i.test(raw)) {
      return {
        ok: false,
        error:
          "The database is still refusing content edits. Migration 0009 has not been applied yet.",
      };
    }
    if (/could not find the function|PGRST202/i.test(raw)) {
      return { ok: false, error: "The edit function is missing. Migration 0008 has not been applied." };
    }
    return { ok: false, error: `Could not update: ${safeDetail(raw, "unknown database error")}` };
  }

  const row = (data as Record<string, string | null>[])?.[0];
  if (!row) return { ok: false, error: "The submission could not be updated." };

  revalidatePath("/admin/submissions");
  return { ok: true, fields: row, note: notes.join(". ") || undefined };
}
