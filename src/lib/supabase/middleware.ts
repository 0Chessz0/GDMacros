import { clearAuthCookiesAtScopes, createServerClient, type CookieMethodsServer } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, isSupabaseConfigured } from "./config";
import { authStorageKey, isInvalidAuthSessionError } from "./sessionRecovery";

/** Requires a signed-in user. */
const PROTECTED = ["/account", "/settings", "/support", "/notifications", "/submit", "/submissions", "/admin"];
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

  type CookieWrite = Parameters<NonNullable<CookieMethodsServer["setAll"]>>[0][number];
  const cookieWrites = new Map<string, CookieWrite>();
  const authHeaders = new Map<string, string>();

  function includeAuthState(target: NextResponse) {
    for (const { name, value, options } of cookieWrites.values()) {
      target.cookies.set(name, value, options);
    }
    for (const [name, value] of authHeaders) target.headers.set(name, value);
    return target;
  }

  const cookieMethods: CookieMethodsServer = {
    getAll() {
      return request.cookies.getAll();
    },
    setAll(cookiesToSet, headers) {
      for (const cookie of cookiesToSet) {
        cookieWrites.set(cookie.name, cookie);
        request.cookies.set(cookie.name, cookie.value);
      }
      for (const [name, value] of Object.entries(headers)) authHeaders.set(name, value);
      response = includeAuthState(NextResponse.next({ request }));
    },
  };

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: cookieMethods,
  });

  // getUser, not getSession: this validates the token with Supabase rather
  // than trusting a cookie the visitor could have edited.
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  // Force-deleting an Auth user does not remove the cookie already stored in
  // that person's browser. If Supabase definitively rejects that login, remove
  // only this project's session chunks. Preferences and every other cookie are
  // left alone, and transient network/provider errors do not sign anyone out.
  if (isInvalidAuthSessionError(userError)) {
    const storageKey = authStorageKey(SUPABASE_URL);
    if (storageKey) {
      await clearAuthCookiesAtScopes({
        getAll: cookieMethods.getAll,
        setAll: cookieMethods.setAll!,
        storageKey,
        scopes: [{ path: "/" }],
      });
    }
  }

  const { pathname } = request.nextUrl;

  if (!user && PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    // So the login page can return them to where they were headed. Only the
    // path is carried, never a full URL, so this cannot become an open redirect.
    url.searchParams.set("next", pathname);
    return includeAuthState(NextResponse.redirect(url));
  }

  if (user && AUTH_ONLY.some((p) => pathname === p)) {
    const url = request.nextUrl.clone();
    url.pathname = "/account";
    url.search = "";
    return includeAuthState(NextResponse.redirect(url));
  }

  return response;
}
