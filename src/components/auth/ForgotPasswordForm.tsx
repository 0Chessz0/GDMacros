"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { authRedirectBase } from "@/lib/supabase/config";
import { AuthField, FormError, SubmitButton } from "./fields";

export default function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);

    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setFormError("Enter the email address you signed up with.");
      return;
    }

    const supabase = createClient();
    if (!supabase) {
      setFormError("Accounts are not available right now.");
      return;
    }

    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      // Only the origin. The email template appends
      // /auth/confirm?token_hash=...&type=recovery&next=/reset-password
      redirectTo: authRedirectBase(),
    });
    setBusy(false);

    if (error) {
      setFormError(error.message);
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <div className="text-[13.5px] leading-relaxed text-text-dim">
        <p className="font-semibold text-text">Check your email</p>
        <p className="mt-2 text-muted">
          If an account exists for that address, a reset link is on its way. The link expires, so
          use it soon.
        </p>
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
        placeholder="you@example.com"
      />
      <SubmitButton busy={busy}>Send reset link</SubmitButton>
    </form>
  );
}
