/**
 * The support@gdmacros.com inbound pipeline.
 *
 * This module owns the ORDER of operations and the HTTP semantics. It has no
 * Resend import and no secrets: everything that touches the network arrives as
 * a `SupportTransport`, which is what lets the whole flow -- including every
 * failure path -- be tested without a network or a key.
 *
 * The order below is load-bearing:
 *
 *   1. verify the signature against the RAW body, before parsing it;
 *   2. only then look at what the event says;
 *   3. retrieve the AUTHORITATIVE email from the API;
 *   4. decide, from that record, whether it is ours and whether it loops;
 *   5. gather attachments completely;
 *   6. send exactly once, under an idempotency key.
 *
 * Nothing is retrieved, and no key is used, before step 1 succeeds. An
 * unsigned request must cost us nothing and must not be able to make us fetch
 * anything.
 */

import {
  buildHtml,
  buildText,
  FORWARD_FROM,
  FORWARD_MARKER_HEADER,
  FORWARD_MARKER_VALUE,
  FORWARD_TO,
  forwardSubject,
  idempotencyKeyFor,
  isForSupport,
  loopCheck,
  planAttachments,
  type AttachmentPlan,
} from "./support";

/* ------------------------------------------------------------------ *
 * The transport contract
 * ------------------------------------------------------------------ */

export interface SignatureHeaders {
  id: string;
  timestamp: string;
  signature: string;
}

/**
 * Whether a failure is worth retrying.
 *
 * This distinction decides the status code, and the status code decides whether
 * Resend delivers the message again. Getting it wrong either loses a support
 * email permanently or wedges a broken request in a retry loop for hours.
 */
export type TransportResult<T> =
  | { ok: true; value: T }
  | { ok: false; retryable: boolean; category: string };

export interface InboundEmail {
  id: string;
  from: string;
  to?: unknown;
  cc?: unknown;
  bcc?: unknown;
  received_for?: unknown;
  subject?: unknown;
  created_at?: unknown;
  message_id?: unknown;
  headers?: unknown;
  html?: string | null;
  text?: string | null;
  attachments?: { id: string; filename?: string | null; size: number; content_type?: string }[];
}

export interface AttachmentRef {
  id: string;
  filename?: string | null;
  size: number;
  content_type?: string;
  content_disposition?: string;
  content_id?: string | null;
  /** A signed URL. Server-side only: never rendered, logged or returned. */
  download_url: string;
}

export interface OutgoingAttachment {
  /** Base64. The Resend client JSON-stringifies the payload, so a Buffer here
   *  would serialise as `{"type":"Buffer",...}` and arrive corrupt. */
  content: string;
  filename: string;
  contentType?: string;
  contentId?: string;
}

export interface ForwardPayload {
  from: string;
  to: string;
  replyTo: string;
  subject: string;
  html: string;
  text: string;
  headers: Record<string, string>;
  attachments?: OutgoingAttachment[];
}

export interface SupportTransport {
  /** Returns the verified event, or null. Never throws, never explains why. */
  verify(rawBody: string, headers: SignatureHeaders): unknown | null;
  getEmail(id: string): Promise<TransportResult<InboundEmail>>;
  listAttachments(id: string): Promise<TransportResult<AttachmentRef[]>>;
  /** Resolves to the attachment's bytes, base64-encoded. */
  download(ref: AttachmentRef): Promise<TransportResult<string>>;
  send(payload: ForwardPayload, idempotencyKey: string): Promise<TransportResult<{ id: string }>>;
}

/* ------------------------------------------------------------------ *
 * Outcome
 * ------------------------------------------------------------------ */

export interface InboundOutcome {
  status: number;
  body: Record<string, unknown>;
  /** Safe to print. Ids and categories only -- never content, never a key. */
  log: Record<string, unknown>;
}

const ok = (body: Record<string, unknown>, log: Record<string, unknown>): InboundOutcome => ({
  status: 200,
  body,
  log,
});

/**
 * Maps a transport failure onto a status code.
 *
 * Retryable failures MUST surface as 5xx. Resend redelivers on 5xx and gives up
 * on 4xx, so a transient Resend outage answered with a 4xx silently discards a
 * customer's email.
 */
function fromFailure(
  stage: string,
  emailId: string,
  f: { retryable: boolean; category: string },
): InboundOutcome {
  const log = { emailId, stage, error: f.category, retryable: f.retryable };
  return f.retryable
    ? { status: 503, body: { error: "temporary_failure" }, log }
    : { status: 200, body: { ignored: f.category }, log };
}

/* ------------------------------------------------------------------ *
 * The pipeline
 * ------------------------------------------------------------------ */

export async function processInbound(
  rawBody: string,
  headers: SignatureHeaders | null,
  transport: SupportTransport,
): Promise<InboundOutcome> {
  /* 1. Signature, against the raw body, before anything is parsed. ------- */

  // A missing header and a bad signature give the same answer on purpose. The
  // response must not tell an unauthenticated caller how close they got, or
  // whether the endpoint is configured at all.
  if (!headers || !headers.id || !headers.timestamp || !headers.signature) {
    return { status: 401, body: { error: "unauthorized" }, log: { stage: "verify", error: "missing_headers" } };
  }

  const event = transport.verify(rawBody, headers);
  if (!event || typeof event !== "object") {
    return { status: 401, body: { error: "unauthorized" }, log: { stage: "verify", error: "invalid_signature" } };
  }

  /* 2. The event is now trusted enough to read. -------------------------- */

  const type = (event as { type?: unknown }).type;
  if (type !== "email.received") {
    return ok({ ignored: "event_type" }, { stage: "filter", error: "event_type" });
  }

  const emailId = (event as { data?: { email_id?: unknown } }).data?.email_id;
  if (typeof emailId !== "string" || !emailId) {
    // Signed, so it really came from Resend, but unusable. Retrying cannot fix
    // a payload that is already final: refuse it permanently.
    return { status: 400, body: { error: "bad_request" }, log: { stage: "parse", error: "missing_email_id" } };
  }

  /* 3. The authoritative record. ---------------------------------------- */

  const got = await transport.getEmail(emailId);
  if (!got.ok) return fromFailure("retrieve", emailId, got);
  const email = got.value;

  /* 4. Is it ours, and is it safe to forward? --------------------------- */

  if (!isForSupport(email)) {
    // Another @gdmacros.com address, or a bcc we are not the target of.
    // Acknowledged so Resend stops retrying; deliberately not forwarded.
    return ok({ ignored: "recipient" }, { emailId, stage: "filter", error: "recipient" });
  }

  const loop = loopCheck({ from: email.from, headers: email.headers });
  if (!loop.forward) {
    return ok({ ignored: loop.reason }, { emailId, stage: "filter", error: loop.reason });
  }

  /* 5. Attachments, completely, before anything is sent. ---------------- */

  let plan: AttachmentPlan = { include: [], skipped: [] };
  let refs: AttachmentRef[] = [];

  if (email.attachments && email.attachments.length > 0) {
    const listed = await transport.listAttachments(emailId);
    if (!listed.ok) return fromFailure("attachments", emailId, listed);
    refs = listed.value;
    plan = planAttachments(refs);
  }

  const outgoing: OutgoingAttachment[] = [];
  for (const meta of plan.include) {
    const ref = refs.find((r) => r.id === meta.id);
    if (!ref) continue;

    const bytes = await transport.download(ref);
    if (!bytes.ok) {
      // Deliberately fatal, and deliberately BEFORE the send.
      //
      // A download that fails now may well succeed on retry -- but the send is
      // keyed on the email id, so if we forwarded a degraded copy first, the
      // retry's complete copy would collapse onto that key and never arrive.
      // The attachment would be lost with no trace. Sending nothing yet keeps
      // the retry able to produce the correct message.
      return fromFailure("download", emailId, bytes);
    }
    outgoing.push({
      content: bytes.value,
      filename: typeof ref.filename === "string" && ref.filename ? ref.filename : `attachment-${ref.id}`,
      contentType: ref.content_type,
      // Preserved so inline images still resolve against the original html,
      // which is fetched with cid references intact.
      ...(ref.content_disposition === "inline" && ref.content_id
        ? { contentId: ref.content_id.replace(/^<|>$/g, "") }
        : {}),
    });
  }

  /* 6. One send, under a key derived from the inbound id. --------------- */

  const payload: ForwardPayload = {
    from: FORWARD_FROM,
    to: FORWARD_TO,
    // The sender goes here, never in From. Hitting reply answers the customer.
    replyTo: email.from,
    subject: forwardSubject(email.subject),
    html: buildHtml(email, plan.skipped),
    text: buildText(email, plan.skipped),
    headers: { [FORWARD_MARKER_HEADER]: FORWARD_MARKER_VALUE },
    ...(outgoing.length ? { attachments: outgoing } : {}),
  };

  const sent = await transport.send(payload, idempotencyKeyFor(emailId));
  if (!sent.ok) return fromFailure("send", emailId, sent);

  return ok(
    { forwarded: true },
    {
      emailId,
      stage: "sent",
      attachments: outgoing.length,
      skipped: plan.skipped.length,
    },
  );
}
