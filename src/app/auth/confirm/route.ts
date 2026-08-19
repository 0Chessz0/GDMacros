import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Handles emailed links that carry a `token_hash` instead of a `code`.
 *
 * This is the shape you get after pointing an email template at
 * `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`. Both
 * this and /auth/callback exist so the flow works whether or not the templates
 * have been customised, rather than silently breaking if they are changed later.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  const rawNext = searchParams.get("next") ?? "/account";
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/account";

  if (!tokenHash || !type) {
    return NextResponse.redirect(`${origin}/auth/error?reason=missing`);
  }

  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.redirect(`${origin}/auth/error?reason=unconfigured`);
  }

  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error) {
    return NextResponse.redirect(`${origin}/auth/error?reason=invalid`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
