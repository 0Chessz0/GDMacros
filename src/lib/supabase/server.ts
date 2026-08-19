import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, isSupabaseConfigured } from "./config";

/**
 * Supabase client for server components, route handlers and server actions.
 *
 * Reads and writes the auth cookies through Next's cookie store. The setAll
 * try/catch is required: a server *component* cannot set cookies, and calling
 * this from one would otherwise throw. Middleware refreshes the session, so
 * losing the write here is harmless.
 */
export async function createClient() {
  if (!isSupabaseConfigured) return null;

  const cookieStore = await cookies();

  return createServerClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a server component. Middleware handles the refresh.
        }
      },
    },
  });
}

/**
 * The signed-in user, or null.
 *
 * Always goes through getUser(), never getSession(). getSession() only decodes
 * whatever cookie the browser sent, which a visitor can edit; getUser() asks
 * the Supabase auth server to validate the token. Anything that gates access
 * has to use this.
 */
export async function getUser() {
  const supabase = await createClient();
  if (!supabase) return null;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
