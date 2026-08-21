import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { checkGdr2 } from "@/lib/gdr2";
import { lookupLevel } from "@/lib/gdbrowser";
import { downloadSubmissionObject } from "@/lib/supabase/storage-admin";
import {
  commitCatalog,
  getCatalogFile,
  getLatestCatalogCommitSha,
  isBranchProtectionRefusal,
  isConcurrencyConflict,
} from "@/lib/github/contents";
import {
  createLevelRelease,
  firstFreeName,
  getReleaseByTag,
  listReleaseAssets,
  sha256Hex,
  uploadMacroAsset,
} from "@/lib/github/releases";
import { githubErrorMessage } from "@/lib/github/client";
import { isPublisherConfigured } from "@/lib/github/config";
import { site } from "@/lib/site";
import { applyPublication, todayIso } from "./catalog";
import { assetCandidates, releaseTagFor } from "./assetName";

/**
 * The automated publisher.
 *
 * ORDER OF IRREVERSIBLE WORK
 * --------------------------
 *   not_started      -> upload the .gdr2 to a GitHub Release   (irreversible)
 *   asset_uploaded   -> commit data/macros.json to main        (irreversible)
 *   catalog_committed-> observe production serving that commit (observation)
 *   live_verified    -> finalise: delete submission, notify    (irreversible)
 *
 * Each transition is recorded in `private.submission_publish_state` immediately
 * after the side effect that earns it. The whole function is therefore
 * restartable at any point: it looks at the recorded state and skips whatever
 * has already happened.
 *
 * NOTHING IS FINALISED EARLY. Every failure before `live_verified` leaves the
 * submission in Processing with its file intact and the submitter told nothing.
 * A macro is only ever "accepted" once a visitor could actually download it.
 *
 * WHAT THE BROWSER IS TRUSTED WITH
 * --------------------------------
 * A submission id. That is all. Level identity, macro author, recorder, the
 * asset filename, the repository, the release tag and the catalog payload are
 * all derived here from the database row and from GDBrowser.
 */

export type PublishState = "not_started" | "asset_uploaded" | "catalog_committed" | "live_verified";

export type PublishStage =
  | "validating"
  | "uploading"
  | "committing"
  | "waiting-for-production"
  | "finalising"
  | "published";

export interface PublishProgress {
  ok: boolean;
  state: PublishState | "finished";
  stage: PublishStage;
  /** Admin-facing. Never shown to a submitter. */
  error?: string;
  assetUrl?: string | null;
  assetName?: string | null;
  commitSha?: string | null;
  /** True once the submission row is gone and the notification is written. */
  finished?: boolean;
  /** Extra context for an admin. Never an error, never shown to a submitter. */
  note?: string;
}

interface TrustedSubmission {
  submission_id: string;
  level_name: string;
  level_id: string;
  level_creator: string | null;
  video_url: string | null;
  recorder: string;
  macro_author: string;
  storage_path: string;
  submitted_by: string;
  state: PublishState;
  release_id: number | null;
  release_tag: string | null;
  asset_id: number | null;
  asset_name: string | null;
  asset_url: string | null;
  asset_sha256: string | null;
  catalog_commit_sha: string | null;
  attempts: number;
}

/** Bounded, so a wedged retry loop cannot hammer GitHub. */
const MAX_CATALOG_ATTEMPTS = 4;

/**
 * Whether the submission row has disappeared.
 *
 * Used to resolve an ambiguous finish. `true` means the row is definitely not
 * there; a query error returns `false`, because "I could not tell" must never
 * be reported as "it is finished".
 *
 * This reads through the ADMIN'S OWN session, so the select policy on
 * `submissions` is what permits it: that policy returns other people's rows
 * only when `private.is_admin()` is true. No privileged key is involved and no
 * authorisation is bypassed.
 */
async function submissionIsGone(supabase: SupabaseClient, id: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("submissions")
    .select("id")
    .eq("id", id)
    .maybeSingle();

  if (error) return false;
  return data === null;
}

async function noteError(
  supabase: SupabaseClient,
  id: string,
  stage: string,
  error: string,
): Promise<void> {
  // Best effort. If recording the error fails there is nothing sensible to do
  // about it, and it must never mask the original failure.
  await supabase.rpc("record_publish_error", { p_id: id, p_stage: stage, p_error: error });
}

/**
 * Is production serving this exact commit?
 *
 * Asks the live domain rather than a Vercel API, so this needs no token and no
 * new secret. A commit sha is public information.
 */
export async function productionIsServing(commitSha: string): Promise<boolean> {
  try {
    const res = await fetch(`${site.url}/api/version`, {
      cache: "no-store",
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return false;
    const body = (await res.json()) as { commit?: string | null };
    return typeof body?.commit === "string" && body.commit === commitSha;
  } catch {
    // A network blip is "not yet", never "failed". The caller keeps waiting.
    return false;
  }
}

/**
 * Runs the publication as far as it can get, then reports where it stopped.
 *
 * Safe to call repeatedly. That is the entire point: the button, a retry after
 * an error, and a second admin resuming the job all call exactly this.
 */
export async function runPublish(
  supabase: SupabaseClient,
  submissionId: string,
): Promise<PublishProgress> {
  if (!isPublisherConfigured) {
    return {
      ok: false,
      state: "not_started",
      stage: "validating",
      error: "GitHub publishing is not configured on this deployment.",
    };
  }

  /* ---------------- claim, and read trusted state ---------------- */

  const { data, error } = await supabase.rpc("begin_publish", { p_id: submissionId });
  if (error) {
    const msg = String(error.message ?? "");
    if (msg.includes("not authorised")) {
      return { ok: false, state: "not_started", stage: "validating", error: "You do not have permission to do that." };
    }

    /*
     * begin_publish refuses for two reasons that look identical from here: the
     * submission is not in `processing`, or it does not exist at all.
     *
     * The second is what a lost response looks like on a LATER attempt, after
     * the browser was closed and this process holds no trusted memory of the
     * earlier state. There is no invariant available now that proves it was
     * published rather than rejected or withdrawn while pending, so this
     * deliberately does NOT claim success. It says the row is gone and asks the
     * admin to look, which is both true and actionable.
     */
    if (await submissionIsGone(supabase, submissionId)) {
      return {
        ok: false,
        state: "not_started",
        stage: "validating",
        error:
          "That submission is no longer in the review queue. It may already have been published and closed. Refresh the queue to check before doing anything else.",
      };
    }

    return {
      ok: false,
      state: "not_started",
      stage: "validating",
      error: "That submission is not being processed.",
    };
  }

  const sub = (Array.isArray(data) ? data[0] : data) as TrustedSubmission | undefined;
  if (!sub) {
    return {
      ok: false,
      state: "not_started",
      stage: "validating",
      error: "That submission could not be found.",
    };
  }

  let state: PublishState = sub.state;
  let assetUrl = sub.asset_url;
  let assetName = sub.asset_name;
  let commitSha = sub.catalog_commit_sha;

  /* ---------------- canonical level identity ---------------- */

  /*
   * Resolved ONCE, before any step, because both the release title and the
   * catalog entry need it and a resumed publication skips step 1 entirely.
   * Doing it inside the upload block would mean a resume wrote the stored copy
   * into the catalog while the release carried the canonical name.
   */
  let levelName = sub.level_name;
  let levelCreator = sub.level_creator;

  if (state === "not_started" || state === "asset_uploaded") {
    const looked = await lookupLevel(sub.level_id);
    if (looked.ok) {
      levelName = looked.data.name;
      levelCreator = looked.data.creator;
    } else if (looked.reason === "not-found") {
      await noteError(supabase, submissionId, "validating", "level not found upstream");
      return {
        ok: false,
        state,
        stage: "validating",
        error: "GDBrowser no longer has that level id. Nothing was published.",
      };
    }
    // "unavailable" or "timeout" falls through and uses the stored values,
    // which were themselves verified server side when the submission was
    // created. A third party being down should not block a review.
  }

  /* ---------------- 1. upload the macro ---------------- */

  if (state === "not_started") {
    try {
      const file = await downloadSubmissionObject(sub.submitted_by, sub.submission_id);
      if (!file.ok) {
        await noteError(supabase, submissionId, "uploading", "storage read failed");
        return {
          ok: false,
          state,
          stage: "uploading",
          error: "The submitted file could not be read from storage. Nothing was published.",
        };
      }

      // Revalidate the bytes themselves. They passed this at submission time,
      // but this is the last moment before they become permanently public.
      const check = checkGdr2(file.bytes);
      if (!check.ok) {
        await noteError(supabase, submissionId, "validating", "gdr2 revalidation failed");
        return {
          ok: false,
          state,
          stage: "validating",
          error: `That file no longer validates as a macro: ${check.error} Nothing was published.`,
        };
      }

      const tag = releaseTagFor(sub.level_id);

      // Reuse the release recorded earlier if there is one; otherwise find or
      // create it. createLevelRelease absorbs the two-admins-same-new-level
      // race by re-reading the tag.
      let releaseId = sub.release_id;
      if (!releaseId) {
        const existing = await getReleaseByTag(tag);
        const release = existing ?? (await createLevelRelease(tag, levelName, sub.level_id));
        releaseId = release.id;
      }

      const digest = sha256Hex(file.bytes);
      const candidates = assetCandidates({
        macroAuthor: sub.macro_author,
        levelName,
        recorder: sub.recorder,
      });

      /*
       * RESERVE, THEN UPLOAD.
       *
       * The name is written to the database BEFORE the upload, so a crash
       * between the two is recoverable: the retry arrives holding the same
       * reserved name and adopts the asset rather than creating a second one.
       *
       * Recovering by content alone would be wrong. Two different submissions
       * can hold byte-identical files, and the second adopting the first one's
       * asset would make it skip its own catalog entry and finalise having
       * published nothing.
       *
       * The loop exists for the case where the reservation goes stale because
       * another publication took that name in between.
       */
      let uploadedAsset = null as Awaited<ReturnType<typeof uploadMacroAsset>> | null;
      let reserved = sub.asset_name ?? null;

      for (let attempt = 0; attempt < 6; attempt++) {
        if (!reserved) {
          const existing = await listReleaseAssets(releaseId);
          reserved = firstFreeName(candidates, existing);
          if (!reserved) {
            throw new Error("Could not find a free filename for this macro");
          }
        }

        const { error: intentErr } = await supabase.rpc("record_publish_intent", {
          p_id: submissionId,
          p_release_id: releaseId,
          p_release_tag: tag,
          p_asset_name: reserved,
          p_asset_sha256: digest,
        });
        if (intentErr) {
          return {
            ok: false,
            state,
            stage: "uploading",
            error: "The publication could not be prepared. Nothing was published. Retry is safe.",
          };
        }

        const result = await uploadMacroAsset(releaseId, reserved, file.bytes);
        if ("taken" in result) {
          // Somebody else claimed that exact name. Choose the next free one.
          reserved = null;
          continue;
        }
        uploadedAsset = result;
        break;
      }

      if (!uploadedAsset || "taken" in uploadedAsset) {
        return {
          ok: false,
          state,
          stage: "uploading",
          error: "Could not reserve a filename for this macro. Retry is safe.",
        };
      }

      // Record IMMEDIATELY. Everything above this line is now public and
      // irreversible; a crash before this write is exactly what the reserved
      // name above makes recoverable.
      const { error: recErr } = await supabase.rpc("record_publish_asset", {
        p_id: submissionId,
        p_release_id: releaseId,
        p_release_tag: tag,
        p_asset_id: uploadedAsset.asset.id,
        p_asset_name: uploadedAsset.asset.name,
        p_asset_url: uploadedAsset.asset.browser_download_url,
        p_asset_sha256: digest,
      });
      if (recErr) {
        return {
          ok: false,
          state,
          stage: "uploading",
          error:
            "The file was uploaded to GitHub but recording it failed. Retry: the publisher will find and reuse the existing upload rather than creating a duplicate.",
        };
      }

      state = "asset_uploaded";
      assetUrl = uploadedAsset.asset.browser_download_url;
      assetName = uploadedAsset.asset.name;
    } catch (e) {
      const msg = githubErrorMessage(e);
      await noteError(supabase, submissionId, "uploading", msg);
      return { ok: false, state, stage: "uploading", error: `${msg} Nothing was finalised.` };
    }
  }

  /* ---------------- 2. commit the catalog ---------------- */

  if (state === "asset_uploaded") {
    if (!assetUrl) {
      return {
        ok: false,
        state,
        stage: "committing",
        error: "The upload is recorded without a download URL. This needs manual attention.",
      };
    }

    const input = {
      levelId: sub.level_id,
      levelName,
      levelCreator,
      videoUrl: sub.video_url,
      macroAuthor: sub.macro_author,
      recorder: sub.recorder,
      downloadLink: assetUrl,
      addedAt: todayIso(),
    };

    let lastError = "";
    for (let attempt = 1; attempt <= MAX_CATALOG_ATTEMPTS; attempt++) {
      try {
        // Always the CURRENT file from main, never the copy baked into this
        // running deployment, which is a snapshot from build time.
        const current = await getCatalogFile();
        const applied = applyPublication(current.text, input);

        if (!applied.ok) {
          await noteError(supabase, submissionId, "committing", applied.error);
          return { ok: false, state, stage: "committing", error: applied.error };
        }

        if (!applied.changed) {
          // A previous attempt already committed this exact download link. The
          // work is done; only our record of it is behind. Recover the sha to
          // wait on rather than inventing one.
          const recovered = sub.catalog_commit_sha ?? (await getLatestCatalogCommitSha());
          if (!recovered) {
            return {
              ok: false,
              state,
              stage: "committing",
              error:
                "The macro is already in the catalog but the commit could not be identified. Retry, or check the repository.",
            };
          }
          const { error: e2 } = await supabase.rpc("record_publish_commit", {
            p_id: submissionId,
            p_commit_sha: recovered,
          });
          if (e2) {
            return {
              ok: false,
              state,
              stage: "committing",
              error: "The macro is already in the catalog but the commit could not be recorded.",
            };
          }
          state = "catalog_committed";
          commitSha = recovered;
          break;
        }

        const message = `Add ${levelName} macro by ${sub.macro_author}`;
        const { commitSha: sha } = await commitCatalog(applied.json, current.sha, message);

        const { error: e3 } = await supabase.rpc("record_publish_commit", {
          p_id: submissionId,
          p_commit_sha: sha,
        });
        if (e3) {
          return {
            ok: false,
            state,
            stage: "committing",
            error:
              "The catalog was committed but recording it failed. Retry is safe: the macro will not be added twice.",
          };
        }

        state = "catalog_committed";
        commitSha = sha;
        break;
      } catch (e) {
        if (isBranchProtectionRefusal(e)) {
          const msg =
            "GitHub refused the catalog commit, which usually means a branch rule is blocking the publisher on main. This needs a repository setting change, not a retry.";
          await noteError(supabase, submissionId, "committing", msg);
          return { ok: false, state, stage: "committing", error: msg };
        }
        if (isConcurrencyConflict(e) && attempt < MAX_CATALOG_ATTEMPTS) {
          // Someone else committed between our read and our write. Re-read and
          // re-apply. Never force: their publication must survive.
          lastError = "Catalog update conflicted with another publication. Retrying safely.";
          continue;
        }
        lastError = githubErrorMessage(e);
        await noteError(supabase, submissionId, "committing", lastError);
        return {
          ok: false,
          state,
          stage: "committing",
          error: `${lastError} The macro file is already published; retrying will not duplicate it.`,
        };
      }
    }

    if (state !== "catalog_committed") {
      return {
        ok: false,
        state,
        stage: "committing",
        error: lastError || "The catalog could not be updated. Retrying is safe.",
      };
    }
  }

  /* ---------------- 3. wait for production ---------------- */

  if (state === "catalog_committed") {
    const expected = commitSha ?? sub.catalog_commit_sha;
    if (!expected) {
      return {
        ok: false,
        state,
        stage: "waiting-for-production",
        error: "No commit was recorded for this publication. This needs manual attention.",
      };
    }

    // ONE check. Vercel takes a couple of minutes, and a serverless request
    // must not sit and sleep through it. The admin UI polls this again.
    const live = await productionIsServing(expected);
    if (!live) {
      return {
        ok: true,
        state,
        stage: "waiting-for-production",
        assetUrl,
        assetName,
        commitSha: expected,
      };
    }

    const { error: e4 } = await supabase.rpc("record_publish_live", { p_id: submissionId });
    if (e4) {
      return {
        ok: false,
        state,
        stage: "waiting-for-production",
        error: "Production is serving the catalog but the state could not be recorded. Retry.",
        commitSha: expected,
      };
    }
    state = "live_verified";
  }

  /* ---------------- 4. finalise ---------------- */

  if (state === "live_verified") {
    const { data: path, error: finErr } = await supabase.rpc("finish_processing", {
      p_id: submissionId,
    });

    if (finErr) {
      /*
       * AMBIGUOUS FAILURE.
       *
       * finish_processing deletes the submission and writes the notification in
       * one transaction. An error here means one of two very different things:
       *
       *   a) it genuinely did not run, so the row is still there; or
       *   b) it committed and the RESPONSE was lost, so the row is gone.
       *
       * Guessing is not acceptable in either direction. Reporting (b) as a
       * failure sends an admin looking for a problem that does not exist, and
       * reporting (a) as success would abandon a real submission.
       *
       * So: ask. Re-reading the row costs one query and answers it exactly.
       *
       * The inference is sound only because of what THIS invocation already
       * established from the database, not from the browser: begin_publish
       * returned this submission as status = 'processing' with publish state
       * live_verified, moments ago. For a row in that state the lifecycle
       * leaves exactly one way to disappear:
       *
       *   - reject_submission and withdraw_submission both match on
       *     status = 'pending', so neither can touch a processing row;
       *   - release_processing now refuses once publishing has started;
       *   - submissions has no client delete policy at all;
       *   - finish_processing is the only remaining path, and it requires
       *     live_verified, which is exactly the state we read.
       *
       * The one other way a row can vanish is the account being deleted, which
       * cascades. That is vanishingly unlikely mid-publish, and even then the
       * macro really is published: the asset and the catalog commit are already
       * live, which is what "finished" means to the person reading this screen.
       */
      const gone = await submissionIsGone(supabase, submissionId);

      if (!gone) {
        // (a) The row is still there, so nothing was finalised. Safe to retry,
        // and the retry will skip straight back to this step.
        await noteError(supabase, submissionId, "finalising", "finish_processing failed");
        return {
          ok: false,
          state,
          stage: "finalising",
          error:
            "The macro is published and live, but closing the submission failed. Nothing was lost. Press Retry to finish it.",
          assetUrl,
          assetName,
          commitSha,
        };
      }

      // (b) The row is gone, so the transaction did commit and only the
      // response was lost. The submitter already has their notification. There
      // is nothing left to do and nothing to retry.
      return {
        ok: true,
        state: "finished",
        stage: "published",
        assetUrl,
        assetName,
        commitSha,
        finished: true,
        // The private object may not have been swept, because the code that
        // does that never ran. It is an invisible orphan in an unlistable
        // bucket, which is this project's accepted trade.
        note: "Already completed. The confirmation was lost in transit, not the work.",
      };
    }

    // Row and notification are already committed. Deleting the private object
    // is best effort: a failure leaves an invisible orphan in an unlistable
    // bucket, which is the trade this project has always preferred over a
    // visible row pointing at a missing file.
    if (typeof path === "string") {
      const { deleteSubmissionObjectByPath } = await import("@/lib/supabase/storage-admin");
      const cleaned = await deleteSubmissionObjectByPath(path);
      if (!cleaned.ok) console.error("[publish] orphaned object after publishing", { id: submissionId });
    }

    return {
      ok: true,
      state: "finished",
      stage: "published",
      assetUrl,
      assetName,
      commitSha,
      finished: true,
    };
  }

  return { ok: true, state, stage: "waiting-for-production", assetUrl, assetName, commitSha };
}
