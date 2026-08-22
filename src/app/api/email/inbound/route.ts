import { NextResponse, type NextRequest } from "next/server";
import { processInbound, type SignatureHeaders } from "@/lib/email/inbound";
import { isSupportForwardingConfigured, resendTransport } from "@/lib/email/transport";

/**
 * Resend inbound webhook for support@gdmacros.com.
 *
 * Mail to support@ is delivered to Resend, which POSTs an `email.received`
 * event here. This route verifies the signature, retrieves the real message and
 * forwards it to the operator's mailbox. Nothing is stored: there is no table,
 * no migration and no Supabase involvement anywhere in this path.
 *
 * All of the decision-making lives in `@/lib/email/inbound`, which takes its
 * network access as a parameter so the whole flow is testable. This file exists
 * to do the two things that can only be done here: read the body as raw text,
 * and turn an outcome into a response.
 */

// Signature verification is a MAC over the exact bytes Resend sent. Any caching
// or static optimisation of this route would be meaningless at best; both are
// switched off so every request is handled on its own terms.
export const dynamic = "force-dynamic";
export const revalidate = 0;

// Buffer, crypto and a plain fetch of a signed URL. Not an edge route.
export const runtime = "nodejs";

/**
 * Resend signs with Standard Webhooks and sends the Svix-flavoured header names.
 * The `webhook-*` spellings are accepted as well, because the same signature
 * scheme is published under both and the payload is identical either way.
 */
function signatureHeaders(request: NextRequest): SignatureHeaders | null {
  const get = (svix: string, standard: string) =>
    request.headers.get(svix) ?? request.headers.get(standard) ?? "";
  const id = get("svix-id", "webhook-id");
  const timestamp = get("svix-timestamp", "webhook-timestamp");
  const signature = get("svix-signature", "webhook-signature");
  return id && timestamp && signature ? { id, timestamp, signature } : null;
}

export async function POST(request: NextRequest) {
  // 401 rather than 503 when unconfigured: an unauthenticated caller learns
  // nothing about whether this deployment has the secret, and Resend is not
  // encouraged to retry against a deployment that can never verify anything.
  if (!isSupportForwardingConfigured) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // THE RAW BODY, read exactly once, before anything looks at its contents.
  //
  // `request.json()` here would be a real vulnerability, not a style problem:
  // the signature covers the literal bytes, so parsing and re-serialising to
  // verify would compare a normalised copy -- different key order, different
  // escaping, different number formatting -- and either fail on valid requests
  // or, worse, be worked around by verifying the re-serialised form and acting
  // on something that was never signed.
  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const outcome = await processInbound(raw, signatureHeaders(request), resendTransport());

  // One line, ids and categories only. Never a body, never an address, never an
  // attachment name, never a signed URL, never a key.
  console.log(`[support-email] ${JSON.stringify(outcome.log)}`);

  return NextResponse.json(outcome.body, {
    status: outcome.status,
    headers: { "Cache-Control": "no-store" },
  });
}

/**
 * A webhook endpoint should not answer a browser. Returning 405 rather than
 * something friendlier also keeps this off the list of URLs worth probing.
 */
export function GET() {
  return NextResponse.json({ error: "method_not_allowed" }, { status: 405 });
}
