"use client";

import { createBrowserClient } from "@supabase/ssr";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, isSupabaseConfigured } from "./config";

/**
 * Supabase client for the browser. Session state lives in cookies rather than
 * localStorage, which is what lets the server read it too.
 *
 * Returns null when Supabase is not configured, so a missing environment
 * variable shows the auth pages a clear message instead of throwing during
 * render and taking the page down.
 */
export function createClient() {
  if (!isSupabaseConfigured) return null;
  return createBrowserClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
}
