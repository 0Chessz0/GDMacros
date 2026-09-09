/**
 * Returns the cookie storage key Supabase derives from a project URL.
 * Keeping this derivation in one place lets middleware remove only this
 * project's broken session without touching preferences or third-party
 * cookies.
 */
export function authStorageKey(supabaseUrl: string): string | null {
  try {
    const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
    return projectRef ? `sb-${projectRef}-auth-token` : null;
  } catch {
    return null;
  }
}

/** Errors that prove the saved login can no longer identify a real user. */
export function isInvalidAuthSessionError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const candidate = error as { code?: unknown; status?: unknown; message?: unknown };
  const code = typeof candidate.code === "string" ? candidate.code.toLowerCase() : "";
  const status = typeof candidate.status === "number" ? candidate.status : null;
  const message = typeof candidate.message === "string" ? candidate.message : "";

  if (
    [
      "bad_jwt",
      "session_not_found",
      "user_not_found",
      "refresh_token_not_found",
      "refresh_token_already_used",
      "pgrst301",
    ].includes(code)
  ) return true;

  if (status === 401) return true;

  // Do not discard a healthy login for an unrelated 403. Supabase uses 403
  // for a deleted JWT subject, so require the accompanying session wording.
  return status === 403 && /(?:user|session).*(?:not found|does not exist)|invalid.*jwt|jwt.*invalid/i.test(message);
}
