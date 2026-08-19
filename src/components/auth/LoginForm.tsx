"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { AuthField, FormError, SubmitButton } from "./fields";

export default function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Middleware puts the intended path here when it turns someone away. Only a
  // path is accepted, so a crafted ?next= cannot redirect off-site.
  const raw = params.get("next") ?? "/account";
  const next = raw.startsWith("/") && !raw.startsWith("//") ? raw : "/account";

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);

    if (!email.trim() || !password) {
      setFormError("Enter your email and password.");
      return;
    }

    const supabase = createClient();
    if (!supabase) {
      setFormError("Accounts are not available right now.");
      return;
    }

    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setBusy(false);

    if (error) {
      // Deliberately not distinguishing "no such account" from "wrong
      // password": that difference tells a stranger which addresses are
      // registered here.
      setFormError(
        error.message === "Invalid login credentials"
          ? "That email and password do not match an account. If you just signed up, open the confirmation link first."
          : error.message,
      );
      return;
    }

    // refresh() so server components pick up the new cookie before navigating.
    router.refresh();
    router.replace(next);
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
      <AuthField
        label="Password"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />

      <SubmitButton busy={busy}>Log in</SubmitButton>
    </form>
  );
}
