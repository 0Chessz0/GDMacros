import { NextResponse } from "next/server";

/**
 * Which commit this deployment was built from.
 *
 * WHY THIS EXISTS
 * ---------------
 * A successful GitHub commit does not mean the macro is live. The chain is
 * commit -> Vercel build -> production domain, and only the last step means a
 * visitor can actually download the file. The publisher needs to observe that
 * last step before it tells a submitter their macro was accepted.
 *
 * The deployment check could query Vercel's API, but that would unnecessarily
 * couple publishing to the availability and permissions of an access token.
 * This endpoint answers the question with no secret at all: the publisher
 * knows the commit sha it just created, and polls
 * https://www.gdmacros.com/api/version until production reports that sha. When
 * it matches, the deployment serving the real domain is definitively built
 * from that commit. The separate analytics panel may use a Vercel token, but
 * publishing deliberately does not depend on it.
 *
 * A git commit sha is public information. It is in the repository, which is
 * public, and it leaks nothing about the build, the environment or any secret.
 *
 * `VERCEL_GIT_COMMIT_SHA` is injected by Vercel at build time. Locally it is
 * simply absent, which the publisher treats as "cannot verify here" rather than
 * as a failure.
 */

// Never prerendered and never cached: a cached answer would report the commit
// of whichever build filled the cache, which is the one thing this must not do.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export function GET() {
  return NextResponse.json(
    {
      commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
      ref: process.env.VERCEL_GIT_COMMIT_REF ?? null,
      env: process.env.VERCEL_ENV ?? "development",
    },
    {
      headers: {
        // Belt and braces against any CDN in front of this.
        "Cache-Control": "no-store, max-age=0, must-revalidate",
      },
    },
  );
}
