import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  /**
   * Deliberately narrow. The catalog is the bulk of this site and it is static,
   * public and account-free, so running an auth round trip on every macro page
   * would add latency for no reason. Only the routes that actually care about a
   * session are matched.
   */
  matcher: [
    "/account/:path*",
    "/settings/:path*",
    "/notifications/:path*",
    "/submit",
    "/submissions",
    "/admin/:path*",
    "/welcome",
    "/login",
    "/signup",
    "/forgot-password",
    "/reset-password",
  ],
};
