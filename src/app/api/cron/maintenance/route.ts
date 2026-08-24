import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { drainResultEmailQueue } from "@/lib/email/resultQueue";

/**
 * The nightly maintenance job.
 *
 * WHY THIS EXISTS
 * ---------------
 * Submission-result email had no scheduled worker. A queued message was only
 * ever retried when its own owner next loaded their account page, so somebody
 * who never came back never got their email, and the frozen copy of their
 * address sat in the queue waiting for a visit that might never happen. This is
 * the thing that makes the queue drain on its own.
 *
 * ONCE A DAY, BECAUSE THAT IS THE LIMIT
 * -------------------------------------
 * Vercel's Hobby plan permits a cron expression no more frequent than daily,
 * and a tighter expression FAILS THE DEPLOYMENT rather than being quietly
 * slowed down. So this is nightly, and on Hobby it fires at some point inside
 * the stated hour rather than on the minute.
 *
 * That cadence is fine for what this does. Ordinary delivery still happens
 * immediately when an admin accepts or rejects; this is the safety net for the
 * ones that did not go out, and a mail arriving hours later beats one that
 * never arrives.
 *
 * SAFE TO RUN TWICE
 * -----------------
 * Vercel documents cron delivery as best effort: a run can be missed, and a run
 * can be delivered more than once. Both are fine here. Work is claimed under a
 * lease and sent under an idempotency key derived from the notification, so a
 * duplicate invocation finds nothing to claim or presents the same key to
 * Resend. A missed night is picked up the following one.
 */

// Reads a secret and talks to Supabase and Resend. Not an edge route.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Compares two secrets without leaking their contents through timing.
 *
 * `===` on strings returns as soon as it finds a differing byte, so how long a
 * rejection takes depends on how much of the prefix was right. That is a slow
 * and noisy oracle over the internet, but it is free to remove and this
 * comparison guards a mail queue.
 *
 * Lengths are compared first because `timingSafeEqual` throws on a mismatch,
 * and are hashed to a fixed width so the comparison itself is over equal-length
 * buffers. Leaking only the LENGTH of the secret is not worth defending.
 */
function secretMatches(provided: string | null, expected: string): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function GET(request: NextRequest) {
  /*
   * Vercel sends `Authorization: Bearer <CRON_SECRET>` when that variable is
   * set on the project. Without the variable this endpoint refuses everything,
   * which is the right way round: an unprotected job that empties a mail queue
   * is worse than one that never runs. It is never inferred from a header
   * alone, because any caller can send a header.
   *
   * The header is trimmed before comparison. HTTP strips leading and trailing
   * whitespace from a field value and intermediaries are only loosely obliged
   * to preserve it inside one, so a secret containing spaces can arrive subtly
   * different from the one that was configured. Trimming makes the common case
   * of a stray edge space work; a secret with a space in the MIDDLE is still a
   * bad idea and no amount of parsing here can make it reliable.
   */
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization")?.trim() ?? null;

  if (!secret || !secretMatches(header, `Bearer ${secret.trim()}`)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const emails = await drainResultEmailQueue();

  // Counts only. No recipient, no notification id, no message.
  const summary = {
    resultEmails: {
      configured: emails.ok,
      attempted: emails.attempted,
      sent: emails.sent,
      failed: emails.failed,
      drained: emails.drained,
    },
  };

  console.log(`[cron:maintenance] ${JSON.stringify(summary)}`);

  return NextResponse.json(summary, {
    headers: { "Cache-Control": "no-store" },
  });
}
