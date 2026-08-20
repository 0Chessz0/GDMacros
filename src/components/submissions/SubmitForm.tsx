"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { AuthField, FormError, SubmitButton } from "@/components/auth/fields";
import { RECORDERS } from "@/lib/types";
import {
  isClean,
  validateFile,
  validateSubmission,
  type FieldErrors,
  type SubmissionFields,
} from "@/lib/submissions";

const EMPTY: SubmissionFields = {
  levelName: "",
  levelId: "",
  levelCreator: "",
  videoUrl: "",
  recorder: "",
  macroAuthor: "",
  notes: "",
};

/**
 * The submission form.
 *
 * Everything it checks is checked again on the server, which is the copy that
 * counts. These checks exist so a mistake is caught in the field rather than
 * after a 2 MB upload.
 */
export default function SubmitForm({ username }: { username: string }) {
  const [fields, setFields] = useState<SubmissionFields>(EMPTY);
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [doneId, setDoneId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const set = (key: keyof SubmissionFields) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setFields((f) => ({ ...f, [key]: e.target.value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    const next = validateSubmission(fields);
    const fileProblem = validateFile(file);
    if (fileProblem) next.file = fileProblem;
    setErrors(next);
    if (!isClean(next)) return;

    setBusy(true);
    try {
      const body = new FormData();
      for (const [k, v] of Object.entries(fields)) body.append(k, v);
      if (file) body.append("file", file);

      const res = await fetch("/api/submissions", { method: "POST", body });
      const json = (await res.json().catch(() => ({}))) as {
        id?: string;
        error?: string;
        fields?: FieldErrors;
      };

      if (!res.ok) {
        if (json.fields) setErrors(json.fields);
        setFormError(json.error ?? "Something went wrong. Please try again.");
        return;
      }

      setDoneId(json.id ?? "");
      setFields(EMPTY);
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
    } catch {
      setFormError("The upload could not be sent. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (doneId !== null) {
    return (
      <div className="card mt-6 flex flex-col items-start gap-3 p-5">
        <p className="text-[15px] font-bold text-text">Submission received</p>
        <p className="text-[13px] leading-relaxed text-muted">
          It is now waiting for review. You can see its status, and withdraw it while it is still
          pending, on your submissions page.
        </p>
        <div className="flex flex-wrap gap-2.5">
          <Link
            href="/submissions"
            className="rounded-xl bg-accent px-4 py-2.5 text-[13.5px] font-semibold text-white transition-[background-color,transform] duration-200 ease-out hover:bg-accent-hover active:scale-95 active:duration-75"
          >
            Your submissions
          </Link>
          <button
            type="button"
            onClick={() => setDoneId(null)}
            className="rounded-xl border border-border bg-surface px-4 py-2.5 text-[13.5px] font-semibold text-text-dim transition-[background-color,border-color,transform,color] duration-200 ease-out hover:-translate-y-0.5 hover:border-accent/40 hover:text-text active:translate-y-0 active:scale-95 active:duration-75"
          >
            Send another
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="card mt-6 flex flex-col gap-4 p-5" noValidate>
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border-soft pb-3">
        <span className="text-[12.5px] text-muted">Submitting as</span>
        <span translate="no" className="notranslate selectable text-[13.5px] font-semibold text-text">
          {username}
        </span>
      </div>

      <AuthField
        label="Level name"
        value={fields.levelName}
        onChange={set("levelName")}
        error={errors.levelName}
        autoComplete="off"
        placeholder="Acheron"
      />
      <AuthField
        label="Level ID"
        value={fields.levelId}
        onChange={set("levelId")}
        error={errors.levelId}
        inputMode="numeric"
        autoComplete="off"
        placeholder="73667628"
        hint="The number shown in game, digits only."
      />
      <AuthField
        label="Level creator"
        value={fields.levelCreator}
        onChange={set("levelCreator")}
        error={errors.levelCreator}
        autoComplete="off"
        placeholder="Ryamu"
        hint="Optional. Who built the level."
      />
      <AuthField
        label="Video link"
        value={fields.videoUrl}
        onChange={set("videoUrl")}
        error={errors.videoUrl}
        autoComplete="off"
        placeholder="https://youtu.be/..."
        hint="Optional. A YouTube link to the completion."
      />

      <div>
        <label
          htmlFor="recorder"
          className="block text-[12.5px] font-semibold text-text-dim"
        >
          Recorded with
        </label>
        <select
          id="recorder"
          value={fields.recorder}
          onChange={set("recorder")}
          aria-invalid={errors.recorder ? true : undefined}
          className={`mt-1.5 h-10 w-full rounded-xl border bg-surface px-3.5 text-[13.5px] text-text outline-none transition-colors ${
            errors.recorder ? "border-rose/60 focus:border-rose" : "border-border focus:border-accent"
          }`}
        >
          <option value="">Choose one</option>
          {RECORDERS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        {errors.recorder && <p className="mt-1.5 text-[12px] text-rose">{errors.recorder}</p>}
      </div>

      <AuthField
        label="Macro author"
        value={fields.macroAuthor}
        onChange={set("macroAuthor")}
        error={errors.macroAuthor}
        autoComplete="off"
        placeholder="Who recorded it"
        hint="Who recorded the macro. This is often not you, and it is shown on the site."
      />

      <div>
        <label htmlFor="notes" className="block text-[12.5px] font-semibold text-text-dim">
          Notes
        </label>
        <textarea
          id="notes"
          value={fields.notes}
          onChange={set("notes")}
          rows={3}
          aria-invalid={errors.notes ? true : undefined}
          placeholder="Anything worth knowing about this macro"
          className={`mt-1.5 w-full rounded-xl border bg-surface px-3.5 py-2.5 text-[13.5px] text-text outline-none transition-colors placeholder:text-muted ${
            errors.notes ? "border-rose/60 focus:border-rose" : "border-border focus:border-accent"
          }`}
        />
        {errors.notes ? (
          <p className="mt-1.5 text-[12px] text-rose">{errors.notes}</p>
        ) : (
          <p className="mt-1.5 text-[12px] text-muted">Optional.</p>
        )}
      </div>

      <div>
        <label htmlFor="file" className="block text-[12.5px] font-semibold text-text-dim">
          Macro file
        </label>
        <input
          id="file"
          ref={fileRef}
          type="file"
          accept=".gdr2"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setErrors((prev) => ({ ...prev, file: undefined }));
          }}
          aria-invalid={errors.file ? true : undefined}
          className={`mt-1.5 w-full rounded-xl border bg-surface px-3.5 py-2.5 text-[13px] text-text-dim outline-none transition-colors file:mr-3 file:rounded-lg file:border-0 file:bg-surface-2 file:px-3 file:py-1.5 file:text-[12.5px] file:font-semibold file:text-text-dim ${
            errors.file ? "border-rose/60" : "border-border"
          }`}
        />
        {errors.file ? (
          <p className="mt-1.5 text-[12px] text-rose">{errors.file}</p>
        ) : (
          <p className="mt-1.5 text-[12px] text-muted">A .gdr2 file, up to 2 MB.</p>
        )}
      </div>

      <FormError>{formError}</FormError>

      <SubmitButton busy={busy}>Send for review</SubmitButton>
    </form>
  );
}
