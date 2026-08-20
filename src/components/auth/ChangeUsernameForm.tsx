"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  USERNAME_HINT,
  isCaseOnlyChange,
  usernameErrorMessage,
  usernameProblem,
} from "@/lib/username";
import { AuthField, FormError, SubmitButton } from "./fields";

/**
 * Changing a username, with the current one retyped as confirmation.
 *
 * The confirmation is checked again inside the `change_username` RPC, so it is
 * a real gate rather than a UI gesture: `profiles` has no update policy, which
 * makes that function the only way to rename an account at all.
 */
export default function ChangeUsernameForm({ current }: { current: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [next, setNext] = useState("");
  const [errors, setErrors] = useState<{ confirm?: string; next?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  function reset() {
    setConfirm("");
    setNext("");
    setErrors({});
    setFormError(null);
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);

    const found: typeof errors = {};

    // Case-insensitive, matching the RPC. Retyping is a memory check.
    if (confirm.trim().toLowerCase() !== current.toLowerCase()) {
      found.confirm = "That does not match your current username.";
    }

    const problem = usernameProblem(next);
    if (problem) found.next = problem;
    else if (next.trim() === current) found.next = "That is already your username.";

    setErrors(found);
    if (Object.keys(found).length > 0) return;

    const supabase = createClient();
    if (!supabase) {
      setFormError("Accounts are not available right now.");
      return;
    }

    setBusy(true);
    const { error } = await supabase.rpc("change_username", {
      p_current: confirm.trim(),
      p_new: next.trim(),
    });
    setBusy(false);

    if (error) {
      const message = usernameErrorMessage(error);
      if (/match your current/i.test(message)) setErrors({ confirm: message });
      else if (/taken|not available|characters|letter or number|underscore/i.test(message)) {
        setErrors({ next: message });
      } else setFormError(message);
      return;
    }

    setDone(next.trim());
    reset();
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <div className="mt-3">
        {done && (
          <p className="animate-pop mb-3 rounded-xl border border-green/40 bg-green/10 px-3.5 py-2.5 text-[12.5px] text-green">
            You are now <span className="font-semibold">{done}</span>.
          </p>
        )}
        <button
          type="button"
          onClick={() => {
            setDone(null);
            setOpen(true);
          }}
          className="rounded-xl border border-border bg-surface px-4 py-2.5 text-[13.5px] font-semibold text-text-dim transition-[background-color,border-color,transform,color] duration-200 ease-out hover:-translate-y-0.5 hover:border-accent/40 hover:text-text active:translate-y-0 active:scale-95 active:duration-75"
        >
          Change username
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="mt-3 flex flex-col gap-3.5">
      <FormError>{formError}</FormError>

      <div>
        <p className="text-[12.5px] font-semibold text-text-dim">Current username</p>
        <p className="selectable mt-1.5 flex h-10 items-center rounded-xl border border-border-soft bg-surface-2 px-3.5 text-[13.5px] font-semibold text-text">
          {current}
        </p>
      </div>

      <AuthField
        label="Confirm current username"
        autoComplete="off"
        value={confirm}
        onChange={(e) => {
          setConfirm(e.target.value);
          if (errors.confirm) setErrors((p) => ({ ...p, confirm: undefined }));
        }}
        error={errors.confirm}
        hint="Type it exactly as shown above."
        placeholder={current}
        maxLength={20}
      />

      <AuthField
        label="New username"
        autoComplete="off"
        value={next}
        onChange={(e) => {
          setNext(e.target.value);
          if (errors.next) setErrors((p) => ({ ...p, next: undefined }));
        }}
        error={errors.next}
        hint={
          isCaseOnlyChange(current, next)
            ? "Changing only capitalisation. That is allowed."
            : USERNAME_HINT
        }
        maxLength={20}
      />

      <div className="flex flex-wrap items-center gap-2.5">
        <div className="min-w-[160px] flex-1">
          <SubmitButton busy={busy}>Save username</SubmitButton>
        </div>
        <button
          type="button"
          onClick={() => {
            reset();
            setOpen(false);
          }}
          className="h-10 rounded-xl border border-border px-4 text-[13px] font-medium text-muted transition-colors hover:border-muted/50 hover:text-text-dim"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
