import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Signing out is a POST, not a link. A GET would let any page on the internet
 * sign a visitor out with an <img src>, and browsers would happily prefetch it.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  // signOut revokes the refresh token server side, so the session is genuinely
  // gone rather than just forgotten locally.
  if (supabase) await supabase.auth.signOut();

  return NextResponse.redirect(new URL("/", request.url), {
    // 303 so the browser follows with GET rather than repeating the POST.
    status: 303,
  });
}
