"use client";

import { useState, useTransition } from "react";
import { saveSubmissionEmailPreferences } from "@/lib/actions/accountSettings";

function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description: string;
  disabled: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-5 border-b border-border-soft py-4 last:border-b-0">
      <span className="min-w-0">
        <span className="block text-[13.5px] font-semibold text-text">{label}</span>
        <span className="mt-1 block text-[12.5px] leading-relaxed text-muted">{description}</span>
      </span>
      <span className="relative mt-0.5 shrink-0">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          disabled={disabled}
          className="peer sr-only"
        />
        <span className="block h-6 w-11 rounded-full border border-border bg-surface-2 transition-colors peer-checked:border-accent peer-checked:bg-accent peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent peer-disabled:opacity-60" />
        <span className="absolute top-1 left-1 h-4 w-4 rounded-full bg-muted transition-transform peer-checked:translate-x-5 peer-checked:bg-white" />
      </span>
    </label>
  );
}

export default function SubmissionEmailSettings({
  accepted: initialAccepted,
  rejected: initialRejected,
}: {
  accepted: boolean;
  rejected: boolean;
}) {
  const [accepted, setAccepted] = useState(initialAccepted);
  const [rejected, setRejected] = useState(initialRejected);
  const [saved, setSaved] = useState({ accepted: initialAccepted, rejected: initialRejected });
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const changed = accepted !== saved.accepted || rejected !== saved.rejected;

  function save() {
    setMessage(null);
    startTransition(async () => {
      const result = await saveSubmissionEmailPreferences({ accepted, rejected });
      if (result.ok) setSaved({ accepted, rejected });
      setMessage(
        result.ok
          ? { tone: "ok", text: "Email preferences saved." }
          : { tone: "error", text: result.error },
      );
    });
  }

  return (
    <fieldset disabled={pending}>
      <legend className="sr-only">Submission result emails</legend>
      <Toggle
        checked={accepted}
        onChange={setAccepted}
        label="Accepted submissions"
        description="Email me after a macro has been confirmed live on the website."
        disabled={pending}
      />
      <Toggle
        checked={rejected}
        onChange={setRejected}
        label="Rejected submissions"
        description="Email me the result and the reviewer's reason."
        disabled={pending}
      />

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={pending || !changed}
          className="rounded-xl bg-accent px-4 py-2.5 text-[13px] font-semibold text-white transition-[background-color,transform] hover:bg-accent-hover active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "Saving..." : "Save email preferences"}
        </button>
        {message && (
          <p
            role={message.tone === "error" ? "alert" : "status"}
            className={`text-[12.5px] ${message.tone === "error" ? "text-rose" : "text-green"}`}
          >
            {message.text}
          </p>
        )}
      </div>
    </fieldset>
  );
}
