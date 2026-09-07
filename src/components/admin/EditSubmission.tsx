"use client";

import { useState } from "react";
import { updateSubmission } from "@/lib/actions/submissionEdit";
import { SUBMISSION_RECORDERS } from "@/lib/types";

/**
 * Correcting a submission's details before it is published.
 *
 * The case this was built for: a good macro arrives without a showcase video.
 * The form does not require one, which is fine for the submitter, but the
 * catalog wants one. Rejecting a working macro over a missing link is the wrong
 * answer, and so is publishing it without.
 *
 * Only fields the reviewer actually changed are sent. Everything else is left
 * alone rather than rewritten with the same value, so two admins editing
 * different fields cannot clobber one another.
 *
 * The submitter's NOTES are shown but not editable. They are that person's own
 * words to the reviewer, and rewriting them would misrepresent what they said.
 */

export interface EditableRow {
  id: string;
  level_name: string;
  level_id: string;
  level_creator: string | null;
  video_url: string | null;
  recorder: string;
  macro_author: string;
}

const field =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-[13px] text-text outline-none transition-colors focus:border-accent/50";

export default function EditSubmission({
  row,
  onSaved,
  onCancel,
}: {
  row: EditableRow;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [levelId, setLevelId] = useState(row.level_id);
  const [levelName, setLevelName] = useState(row.level_name);
  const [levelCreator, setLevelCreator] = useState(row.level_creator ?? "");
  const [videoUrl, setVideoUrl] = useState(row.video_url ?? "");
  const [recorder, setRecorder] = useState(row.recorder);
  const [macroAuthor, setMacroAuthor] = useState(row.macro_author);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const idChanged = levelId.trim() !== row.level_id;

  async function save() {
    setBusy(true);
    setError(null);
    setNote(null);

    // Only what actually changed. `undefined` means "leave alone"; an empty
    // string on a nullable field means "clear it".
    const res = await updateSubmission(row.id, {
      levelId: idChanged ? levelId.trim() : undefined,
      levelName: !idChanged && levelName.trim() !== row.level_name ? levelName.trim() : undefined,
      levelCreator:
        !idChanged && levelCreator.trim() !== (row.level_creator ?? "") ? levelCreator.trim() : undefined,
      videoUrl: videoUrl.trim() !== (row.video_url ?? "") ? videoUrl.trim() : undefined,
      recorder: recorder !== row.recorder ? recorder : undefined,
      macroAuthor: macroAuthor.trim() !== row.macro_author ? macroAuthor.trim() : undefined,
    });

    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setNote(res.note ?? "Saved.");
    onSaved();
  }

  return (
    <div className="mt-3.5 rounded-xl border border-accent/30 bg-surface-2/40 p-4">
      <p className="text-[12.5px] font-semibold text-text">Edit details</p>
      <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
        Changing the level ID re-reads the name and creator from GDBrowser. A video link is checked
        with YouTube before it is saved. Leave the video empty to remove it.
      </p>

      <div className="mt-3.5 grid gap-3 sm:grid-cols-2">
        <label className="text-[11.5px] text-muted">
          Level ID
          <input
            value={levelId}
            onChange={(e) => setLevelId(e.target.value)}
            inputMode="numeric"
            className={`${field} mt-1 tabular-nums`}
          />
        </label>

        <label className="text-[11.5px] text-muted">
          Level name
          <input
            value={levelName}
            onChange={(e) => setLevelName(e.target.value)}
            disabled={idChanged}
            className={`${field} mt-1 disabled:opacity-50`}
          />
          {idChanged && (
            <span className="mt-1 block text-[11px] text-amber-400">
              Taken from GDBrowser for the new ID.
            </span>
          )}
        </label>

        <label className="text-[11.5px] text-muted">
          Level creator
          <input
            value={levelCreator}
            onChange={(e) => setLevelCreator(e.target.value)}
            disabled={idChanged}
            className={`${field} mt-1 disabled:opacity-50`}
          />
        </label>

        <label className="text-[11.5px] text-muted">
          Macro author
          <input
            value={macroAuthor}
            onChange={(e) => setMacroAuthor(e.target.value)}
            className={`${field} mt-1`}
          />
        </label>

        <label className="text-[11.5px] text-muted">
          Recorder
          <select
            value={recorder}
            onChange={(e) => setRecorder(e.target.value)}
            className={`${field} mt-1`}
          >
            {SUBMISSION_RECORDERS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>

        <label className="text-[11.5px] text-muted sm:col-span-2">
          Showcase video
          <input
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=..."
            className={`${field} mt-1`}
          />
        </label>
      </div>

      {error && (
        <p role="alert" className="mt-3 text-[12px] text-rose">
          {error}
        </p>
      )}
      {note && <p className="mt-3 text-[12px] text-green">{note}</p>}

      <div className="mt-3.5 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="rounded-lg bg-accent px-3.5 py-2 text-[12.5px] font-semibold text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
        >
          {busy ? "Checking..." : "Save details"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="rounded-lg border border-border px-3.5 py-2 text-[12.5px] font-semibold text-text-dim transition-colors hover:border-muted/50 hover:text-text disabled:opacity-60"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
