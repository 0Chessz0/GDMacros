import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, isSupabaseConfigured } from "./config";

/** Requires a signed-in user. */
const PROTECTED = ["/account"];
/** Pointless once signed in, so they bounce to the account page. */
const AUTH_ONLY = ["/login", "/signup", "/forgot-password"];

/**
 * Refreshes the auth session on every matched request and enforces the two
 * redirects that must not be left to React.
 *
 * The response object has to be the one the Supabase client wrote cookies onto.
 * Building a fresh NextResponse afterwards would drop the refreshed tokens and
 * silently sign people out after an hour, which is the classic mistake with
 * this integration.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  // Accounts are optional. With Supabase unconfigured the site still works, so
  // the middleware gets out of the way rather than failing every request.
  if (!isSupabaseConfigured) return response;

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // getUser, not getSession: this validates the token with Supabase rather
  // than trusting a cookie the visitor could have edited.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user && PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    // So the login page can return them to where they were headed. Only the
    // path is carried, never a full URL, so this cannot become an open redirect.
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (user && AUTH_ONLY.some((p) => pathname === p)) {
    const url = request.nextUrl.clone();
    url.pathname = "/account";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}
