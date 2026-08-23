import "server-only";

import { Resend } from "resend";
import { MAX_ATTACHMENT_BYTES } from "./support";
import type {
  AttachmentRef,
  ForwardPayload,
  InboundEmail,
  SignatureHeaders,
  SupportTransport,
  TransportResult,
} from "./inbound";

/**
 * The server-only Resend transport for inbound support mail.
 *
 * Two separate secrets, doing two different jobs:
 *
 *   RESEND_INBOUND_WEBHOOK_SECRET  proves an inbound POST really came from
 *                                  Resend. Read-only in effect: it can verify,
 *                                  it cannot send.
 *   RESEND_SUPPORT_API_KEY         retrieves the received email and sends the
 *                                  forward.
 *
 * Neither has a NEXT_PUBLIC_ prefix, so Next will not inline either into a
 * browser bundle, and `import "server-only"` on the first line turns any client
 * import into a BUILD failure rather than a runtime leak. Neither value is
 * logged, returned, or included in an error message anywhere below.
 *
 * This is additive. Supabase already sends auth mail through Resend over SMTP
 * as noreply@gdmacros.com; that path uses different credentials, a different
 * address and none of this code, and is untouched.
 */

const WEBHOOK_SECRET = process.env.RESEND_INBOUND_WEBHOOK_SECRET ?? "";
const API_KEY = process.env.RESEND_SUPPORT_API_KEY ?? "";

/**
 * Whether forwarding can work at all.
 *
 * Support mail is one small feature of an otherwise static catalog. A missing
 * secret must degrade to "this endpoint is not available" rather than throwing
 * at import time and taking a route down with it.
 */
export const isSupportForwardingConfigured = Boolean(WEBHOOK_SECRET && API_KEY);

/**
 * Built per call, never held in a module singleton, and always given the key
 * explicitly -- the constructor falls back to `RESEND_API_KEY` when passed
 * nothing, and silently borrowing some other key would be worse than failing.
 */
function client(): Resend {
  if (!API_KEY) throw new Error("Support forwarding is not configured");
  return new Resend(API_KEY);
}

/* ------------------------------------------------------------------ *
 * Failure classification
 * ------------------------------------------------------------------ */

/**
 * Whether a Resend error is worth another attempt.
 *
 * 429 and 5xx are transient by definition. 404 is treated as transient too,
 * because the webhook can plausibly arrive marginally before the email is
 * readable back from the API; retrying a genuinely absent id costs a handful of
 * redeliveries, whereas giving up on a real one loses a customer's message.
 * Everything else -- 401, 403, 422 -- means the request itself is wrong, and
 * repeating it unchanged will keep being wrong.
 */
function retryableStatus(status: number | undefined): boolean {
  if (status === undefined) return true; // no status at all: network-level
  return status === 429 || status === 404 || status >= 500;
}

/** Never carries a message body, a URL or a header -- only a coarse label. */
function fail<T>(category: string, status?: number): TransportResult<T> {
  return { ok: false, retryable: retryableStatus(status), category };
}

type ResendError = { statusCode?: number; name?: string } | null;

function failFrom<T>(stage: string, error: ResendError): TransportResult<T> {
  const status = error?.statusCode;
  return fail<T>(`${stage}_${status ?? "network"}`, status);
}

/* ------------------------------------------------------------------ *
 * The real transport
 * ------------------------------------------------------------------ */

export function resendTransport(): SupportTransport {
  return {
    /**
     * Verifies the Standard Webhooks signature over the RAW request body.
     *
     * The SDK helper wraps the same `standardwebhooks` implementation Resend
     * signs with, so this checks the real MAC and the timestamp window rather
     * than a hand-rolled comparison. It throws on any failure; every failure is
     * flattened to `null` here so no caller can accidentally surface which part
     * was wrong.
     */
    verify(rawBody: string, headers: SignatureHeaders): unknown | null {
      if (!WEBHOOK_SECRET) return null;
      try {
        return client().webhooks.verify({
          payload: rawBody,
          headers: { id: headers.id, timestamp: headers.timestamp, signature: headers.signature },
          webhookSecret: WEBHOOK_SECRET,
        });
      } catch {
        return null;
      }
    },

    async getEmail(id: string): Promise<TransportResult<InboundEmail>> {
      try {
        // `cid` keeps inline images as <img src="cid:..."> instead of expanding
        // them into data: URIs. The originals travel as real attachments with
        // matching content ids, which is what mail clients actually render --
        // Gmail in particular strips data: image sources.
        const { data, error } = await client().emails.receiving.get(id, { html_format: "cid" });
        if (error || !data) return failFrom("retrieve", error as ResendError);
        return { ok: true, value: data as unknown as InboundEmail };
      } catch {
        return fail("retrieve_exception");
      }
    },

    async listAttachments(id: string): Promise<TransportResult<AttachmentRef[]>> {
      try {
        const { data, error } = await client().emails.receiving.attachments.list({
          emailId: id,
          limit: 100,
        });
        if (error || !data) return failFrom("attachments", error as ResendError);
        return { ok: true, value: (data.data ?? []) as unknown as AttachmentRef[] };
      } catch {
        return fail("attachments_exception");
      }
    },

    /**
     * Pulls one attachment's bytes over the signed URL, server side.
     *
     * The URL never leaves this function: it is not logged, not put in an
     * error, and not rendered into the forwarded message. Handing a browser a
     * signed link to a customer's attachment would turn a private support
     * mailbox into a shareable file host.
     */
    async download(ref: AttachmentRef): Promise<TransportResult<string>> {
      try {
        const res = await fetch(ref.download_url);
        if (!res.ok) return fail("download", res.status);

        // Trust the bytes, not the metadata. A content-length disagreeing with
        // the planned size would otherwise let an oversized body through the
        // limit that was applied to the plan.
        const declared = Number(res.headers.get("content-length") ?? "0");
        if (declared > MAX_ATTACHMENT_BYTES) return fail("download_too_large", 413);

        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.byteLength > MAX_ATTACHMENT_BYTES) return fail("download_too_large", 413);

        // Base64 STRING, not a Buffer: the client JSON-stringifies the payload,
        // and a Buffer would serialise as {"type":"Buffer","data":[...]}.
        return { ok: true, value: buf.toString("base64") };
      } catch {
        return fail("download_exception");
      }
    },

    async send(
      payload: ForwardPayload,
      idempotencyKey: string,
    ): Promise<TransportResult<{ id: string }>> {
      try {
        const { data, error } = await client().emails.send(
          {
            from: payload.from,
            to: payload.to,
            replyTo: payload.replyTo,
            subject: payload.subject,
            html: payload.html,
            text: payload.text,
            headers: payload.headers,
            ...(payload.attachments?.length ? { attachments: payload.attachments } : {}),
          },
          { idempotencyKey },
        );
        if (error || !data) return failFrom("send", error as ResendError);
        return { ok: true, value: { id: data.id } };
      } catch {
        return fail("send_exception");
      }
    },
  };
}
