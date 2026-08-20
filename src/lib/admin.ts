import { createClient } from "./supabase/server";
import { getUser } from "./supabase/server";

/**
 * Whether the signed-in visitor is an administrator.
 *
 * The answer comes from the database, using the visitor's OWN session, so the
 * row level security policy on `public.user_roles` is what decides: that policy
 * only ever returns your own rows, so a non-admin reads nothing back no matter
 * what they ask for. This is the same fact `private.is_admin()` reads, and that
 * function remains the authority inside the review RPCs.
 *
 * Deliberately NOT how this works:
 *   * no username or email is compared against anything;
 *   * no list of admins exists in the application at all;
 *   * the privileged Storage key is never used to answer it.
 *
 * This gate is for deciding what to render and what to refuse early. It is not
 * the last line of defence: approve_submission and reject_submission each call
 * private.is_admin() themselves, so an attacker who somehow got past this still
 * achieves nothing.
 */
export async function isCurrentUserAdmin(): Promise<boolean> {
  const supabase = await createClient();
  if (!supabase) return false;

  // getUser, never getSession: this validates the token with Supabase rather
  // than trusting a cookie the visitor could have edited.
  const user = await getUser();
  if (!user) return false;

  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("role", "admin")
    .limit(1);

  if (error) return false;
  return (data?.length ?? 0) > 0;
}
