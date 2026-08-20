import { createClient, getUser } from "@/lib/supabase/server";

/** A row of public.profiles. The table holds no email and no personal data. */
export interface Profile {
  id: string;
  username: string;
  created_at: string;
  updated_at: string;
}

/**
 * The signed-in user's profile, or null.
 *
 * Null covers two different situations on purpose, and callers only ever need
 * to tell them apart via getUser(): not signed in, or signed in without having
 * chosen a username yet. Absence of the row IS the "not chosen" signal, which
 * is why no half-built profile is ever written.
 */
export async function getProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  if (!supabase) return null;

  const user = await getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("id, username, created_at, updated_at")
    .eq("id", user.id)
    .maybeSingle();

  return (data as Profile) ?? null;
}

/** Both at once, so a page does not make the same round trip twice. */
export async function getUserAndProfile() {
  const user = await getUser();
  if (!user) return { user: null, profile: null };

  const supabase = await createClient();
  if (!supabase) return { user, profile: null };

  const { data } = await supabase
    .from("profiles")
    .select("id, username, created_at, updated_at")
    .eq("id", user.id)
    .maybeSingle();

  return { user, profile: (data as Profile) ?? null };
}
