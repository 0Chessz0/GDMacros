"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { authRedirectBase } from "@/lib/supabase/config";
import { PASSWORD_HINT, passwordProblem } from "@/lib/passwordPolicy";
import { AuthField, FormError, SubmitButton } from "./fields";

export default function SignupForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<{ email?: string; password?: string; confirm?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string | null>(null);

  function validate() {
    const next: typeof errors = {};
    if (!email.trim()) next.email = "Enter your email address.";
    else if (!/^\S+@\S+\.\S+$/.test(email.trim())) next.email = "That does not look like an email address.";

    const pw = passwordProblem(password);
    if (pw) next.password = pw;
    if (confirm !== password) next.confirm = "The two passwords do not match.";

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    if (!validate()) return;

    const supabase = createClient();
    if (!supabase) {
      setFormError("Accounts are not available right now.");
      return;
    }

    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: authRedirectBase() },
    });
    setBusy(false);

    if (error) {
      setFormError(error.message);
      return;
    }

    // Nothing is promised until Supabase actually confirms. With email
    // confirmation on, a session is deliberately NOT returned here, so the only
    // honest thing to say is "check your email".
    if (data.user && !data.session) {
      setSent(email.trim());
      return;
    }
    if (data.session) {
      window.location.assign("/account");
      return;
    }
    setSent(email.trim());
  }

  if (sent) {
    return (
      <div className="text-[13.5px] leading-relaxed text-text-dim">
        <p className="font-semibold text-text">Check your email</p>
        <p className="mt-2 text-muted">
          If <span className="font-medium text-text-dim">{sent}</span> can receive mail, a
          confirmation link is on its way. Your account is not active until you open that link.
        </p>
        <p className="mt-2 text-muted">
          Nothing arriving? Check the spam folder, and make sure the address was typed correctly.
        </p>
        <div className="mt-4 flex flex-wrap gap-2.5">
          <Link
            href="/login"
            className="rounded-lg bg-accent px-3.5 py-2 text-[13px] font-medium text-white transition-[background-color,transform] duration-200 ease-out hover:bg-accent-hover active:scale-95 active:duration-75"
          >
            Go to login
          </Link>
          <button
            type="button"
            onClick={() => {
              setSent(null);
              setPassword("");
              setConfirm("");
            }}
            className="rounded-lg border border-border px-3.5 py-2 text-[13px] font-medium text-text-dim transition-colors hover:border-accent/40 hover:text-text"
          >
            Use a different email
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3.5">
      <FormError>{formError}</FormError>

      <AuthField
        label="Email"
        type="email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={errors.email}
        placeholder="you@example.com"
      />
      <AuthField
        label="Password"
        type="password"
        autoComplete="new-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={errors.password}
        hint={PASSWORD_HINT}
      />
      <AuthField
        label="Confirm password"
        type="password"
        autoComplete="new-password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        error={errors.confirm}
      />

      <SubmitButton busy={busy}>Create account</SubmitButton>

      {/*
        Small, but never hidden. `text-muted` on the surrounding card keeps this
        readable rather than faint-on-faint, and both documents are real links
        so nobody has to agree to something they cannot open. The version in
        force is recorded server side when the account is created; the browser
        never says which version it accepted.
      */}
      <p className="text-[12px] leading-relaxed text-muted">
        By creating an account, you agree to the{" "}
        <Link href="/terms" className="font-medium text-accent-soft hover:underline">
          Terms of Service
        </Link>{" "}
        and acknowledge the{" "}
        <Link href="/privacy" className="font-medium text-accent-soft hover:underline">
          Privacy Policy
        </Link>
        .
      </p>
    </form>
  );
}
