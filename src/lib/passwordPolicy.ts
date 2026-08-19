/**
 * Mirrors the password rules the Supabase project actually enforces.
 *
 * Checked live against the auth API: a password shorter than 8, or missing a
 * lowercase letter, an uppercase letter or a digit, is rejected server side with
 * a long combined message. Repeating the rules here means someone finds out
 * while typing rather than after pressing the button, and never sees the raw
 * message with its alphabet listings.
 *
 * The server remains the authority. This is only a nicer first pass.
 */
export const PASSWORD_MIN = 8;

export function passwordProblem(password: string): string | null {
  if (password.length < PASSWORD_MIN) return `At least ${PASSWORD_MIN} characters.`;
  if (!/[a-z]/.test(password)) return "Needs at least one lowercase letter.";
  if (!/[A-Z]/.test(password)) return "Needs at least one uppercase letter.";
  if (!/[0-9]/.test(password)) return "Needs at least one number.";
  return null;
}

/** Shown under the field before anything is typed. */
export const PASSWORD_HINT = "At least 8 characters, with a capital, a lowercase and a number.";
