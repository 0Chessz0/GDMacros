import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Handles the link Supabase emails out, in its default shape.
 *
 * Supabase's own /auth/v1/verify endpoint validates the token and then bounces
 * the browser here with a one-time `code`, which is exchanged for a session.
 * This is the PKCE flow and it is what the stock email templates produce, so it
 * works without anyone having to edit a template first.
 *
 * The sibling /auth/confirm handles the other shape, for templates that send a
 * token_hash directly.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  // Only ever a path, never a full URL, so a crafted link cannot bounce someone
  // off to another site carrying a fresh session.
  const rawNext = searchParams.get("next") ?? "/account";
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/account";

  if (!code) {
    return NextResponse.redirect(`${origin}/auth/error?reason=missing`);
  }

  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.redirect(`${origin}/auth/error?reason=unconfigured`);
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${origin}/auth/error?reason=invalid`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
