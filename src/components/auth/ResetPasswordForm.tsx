"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { PASSWORD_HINT, passwordProblem } from "@/lib/passwordPolicy";
import { AuthField, FormError, SubmitButton } from "./fields";

/**
 * Chooses a new password. Reached only through a recovery link, which leaves a
 * short-lived session in place; updateUser then rewrites the password on that
 * session. There is no separate token to handle here, and inventing one would
 * be strictly worse than what Supabase already does.
 */
export default function ResetPasswordForm() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [allowed, setAllowed] = useState<boolean | null>(null);

  // Without a recovery session there is nothing to update, and saying so up
  // front beats letting someone type a new password and then fail.
  useEffect(() => {
    const supabase = createClient();
    if (!supabase) {
      setAllowed(false);
      return;
    }
    supabase.auth.getUser().then(({ data }) => setAllowed(Boolean(data.user)));
  }, []);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);

    const next: typeof errors = {};
    const pw = passwordProblem(password);
    if (pw) next.password = pw;
    if (confirm !== password) next.confirm = "The two passwords do not match.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    const supabase = createClient();
    if (!supabase) {
      setFormError("Accounts are not available right now.");
      return;
    }

    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);

    if (error) {
      setFormError(error.message);
      return;
    }
    setDone(true);
  }

  if (allowed === false) {
    return (
      <div className="text-[13.5px] leading-relaxed text-text-dim">
        <p className="font-semibold text-amber">This reset link is not valid</p>
        <p className="mt-2 text-muted">
          It may have expired, or already been used. Reset links are single use and short lived.
        </p>
        <Link
          href="/forgot-password"
          className="mt-4 inline-block rounded-lg bg-accent px-3.5 py-2 text-[13px] font-medium text-white transition-[background-color,transform] duration-200 ease-out hover:bg-accent-hover active:scale-95 active:duration-75"
        >
          Send a new link
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="text-[13.5px] leading-relaxed text-text-dim">
        <p className="font-semibold text-green">Password changed</p>
        <p className="mt-2 text-muted">You are signed in with the new password.</p>
        <Link
          href="/account"
          className="mt-4 inline-block rounded-lg bg-accent px-3.5 py-2 text-[13px] font-medium text-white transition-[background-color,transform] duration-200 ease-out hover:bg-accent-hover active:scale-95 active:duration-75"
        >
          Go to your account
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3.5">
      <FormError>{formError}</FormError>
      <AuthField
        label="New password"
        type="password"
        autoComplete="new-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={errors.password}
        hint={PASSWORD_HINT}
      />
      <AuthField
        label="Confirm new password"
        type="password"
        autoComplete="new-password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        error={errors.confirm}
      />
      <SubmitButton busy={busy} disabled={allowed === null}>
        Change password
      </SubmitButton>
    </form>
  );
}
