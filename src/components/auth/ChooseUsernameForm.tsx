"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { isInvalidAuthSessionError } from "@/lib/supabase/sessionRecovery";
import { USERNAME_HINT, usernameErrorMessage, usernameProblem } from "@/lib/username";
import { AuthField, FormError, SubmitButton } from "./fields";

/**
 * First-time username choice, shown at /welcome after email verification.
 *
 * Deliberately separate from signup: the account already exists and is verified
 * by the time anyone sees this, so a failure here costs nothing and can be
 * retried without touching the auth flow.
 */
export default function ChooseUsernameForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);

    // A local check first, so the obvious mistakes never leave the browser.
    // The database enforces all of this again regardless.
    const problem = usernameProblem(username);
    if (problem) {
      setFieldError(problem);
      return;
    }
    setFieldError(null);

    const supabase = createClient();
    if (!supabase) {
      setFormError("Accounts are not available right now.");
      return;
    }

    setBusy(true);
    const { error } = await supabase.rpc("set_username", { p_username: username.trim() });
    setBusy(false);

    if (error) {
      // Covers the small race where an administrator deletes the Auth account
      // after this page rendered but before the username request arrived.
      if (isInvalidAuthSessionError(error)) {
        await supabase.auth.signOut({ scope: "local" });
        window.location.replace("/signup");
        return;
      }

      const message = usernameErrorMessage(error);
      // A taken or malformed name belongs on the field, anything else is a
      // problem with the request rather than with what was typed.
      if (/taken|not available|characters|letter or number|underscore/i.test(message)) {
        setFieldError(message);
      } else {
        setFormError(message);
      }
      return;
    }

    // refresh() so the server components pick up the new profile before we move.
    router.refresh();
    router.replace("/account");
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3.5">
      <FormError>{formError}</FormError>

      <AuthField
        label="Username"
        autoComplete="username"
        autoFocus
        value={username}
        onChange={(e) => {
          setUsername(e.target.value);
          if (fieldError) setFieldError(null);
        }}
        error={fieldError}
        hint={USERNAME_HINT}
        placeholder="Chessz0"
        maxLength={20}
      />

      <SubmitButton busy={busy}>Choose username</SubmitButton>
    </form>
  );
}
