/**
 * Pure helpers for support@gdmacros.com forwarding.
 *
 * Everything in this file is deterministic and dependency-free: no network, no
 * secrets, no Resend import. That is deliberate. The decisions that actually
 * matter for safety -- "is this addressed to support@", "would forwarding this
 * create a loop", "what exactly do we send" -- are the ones worth testing
 * exhaustively, and they can only be tested exhaustively if they are separable
 * from the API calls around them.
 *
 * Determinism is also a correctness requirement, not just a testing
 * convenience. The forward is sent under an idempotency key derived from the
 * inbound email id, so a retry MUST rebuild a byte-identical payload. Nothing
 * here may read the clock or a random source.
 */

import { escapeHtml } from "../escapeHtml";

/** The one address this feature forwards. Anything else is ignored. */
export const SUPPORT_ADDRESS = "support@gdmacros.com";

/**
 * The envelope From on the forward.
 *
 * The original sender deliberately does NOT go here. gdmacros.com publishes SPF
 * and DKIM and is under DMARC; sending as, say, `angry-user@outlook.com` from
 * our infrastructure fails all three and gets the forward junked or rejected
 * outright. The sender is preserved in Reply-To instead, which is unauthenticated
 * metadata and so is not subject to any of that -- and which is what "hit reply"
 * actually reads.
 */
export const FORWARD_FROM = `GDMacros Support <${SUPPORT_ADDRESS}>`;

/** Where support mail lands. Never disclosed to the original sender. */
export const FORWARD_TO = "gdmacros.com@gmail.com";

/**
 * Stamped on every forward we send, and checked on every inbound message.
 *
 * This is the backstop for the one loop the address rules below cannot see: if
 * the destination mailbox ever grows an auto-forward rule pointing back at
 * support@, our own forward returns to us wearing the sender's Reply-To and
 * looks like fresh mail. The marker survives that round trip and stops it.
 */
export const FORWARD_MARKER_HEADER = "X-GDMacros-Forwarded";
export const FORWARD_MARKER_VALUE = "support-inbound";

/** Used when the original carries no subject at all. */
export const NO_SUBJECT = "(No subject)";

/* ------------------------------------------------------------------ *
 * Address parsing
 * ------------------------------------------------------------------ */

/**
 * A conservative address shape. Not RFC 5322 -- that grammar admits quoted
 * local parts and comments that no real support email uses, and a permissive
 * regex here would be a way to smuggle something past the recipient check.
 * Anything this rejects is simply not treated as an address, which fails
 * closed.
 */
const ADDRESS = /^[^\s@<>(),;:"\\[\]]+@[^\s@<>(),;:"\\[\]]+\.[^\s@<>(),;:"\\[\]]+$/;

/**
 * Extracts the actual mailbox from one address item and lowercases it.
 *
 * The important case is that a DISPLAY NAME IS NOT AN ADDRESS. A message can
 * arrive addressed to
 *
 *     "support@gdmacros.com" <mallory@example.com>
 *
 * and any substring test for "support@gdmacros.com" says yes. The real
 * recipient is mallory@example.com. So when angle brackets are present the
 * bracketed value wins outright and the display name is discarded, never
 * consulted as a fallback.
 *
 * The LAST `<` is used as the opening bracket because a display name may itself
 * contain one; the real address is always the final bracketed group.
 */
export function parseAddress(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const raw = input.trim();
  if (!raw) return null;

  let candidate = raw;
  const open = raw.lastIndexOf("<");
  if (open !== -1) {
    const close = raw.indexOf(">", open);
    if (close === -1) return null;
    candidate = raw.slice(open + 1, close).trim();
  }

  // A bare `<>` is the null reverse-path of a bounce, not an address.
  if (!candidate) return null;
  if (!ADDRESS.test(candidate)) return null;
  return candidate.toLowerCase();
}

/**
 * Splits a header value that may hold several comma-separated addresses.
 *
 * Written as a small state machine rather than `split(",")` because a display
 * name is allowed to contain a comma -- `"Doe, John" <j@d.com>` is one address,
 * not two, and naive splitting turns it into two unparseable fragments and
 * loses the recipient.
 */
export function splitAddressList(value: unknown): string[] {
  if (typeof value !== "string") return [];
  const out: string[] = [];
  let buf = "";
  let inQuotes = false;
  let inAngles = false;

  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (ch === "\\" && inQuotes) {
      buf += ch + (value[i + 1] ?? "");
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = !inQuotes;
      buf += ch;
      continue;
    }
    if (!inQuotes && ch === "<") inAngles = true;
    if (!inQuotes && ch === ">") inAngles = false;
    if (ch === "," && !inQuotes && !inAngles) {
      out.push(buf);
      buf = "";
      continue;
    }
    buf += ch;
  }
  out.push(buf);
  return out.map((s) => s.trim()).filter(Boolean);
}

/** Every parseable mailbox in a list of address items, lowercased, deduped. */
export function addressSet(items: unknown): Set<string> {
  const list = Array.isArray(items) ? items : [items];
  const out = new Set<string>();
  for (const item of list) {
    for (const piece of splitAddressList(item)) {
      const addr = parseAddress(piece);
      if (addr) out.add(addr);
    }
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Recipient filter
 * ------------------------------------------------------------------ */

/** The recipient fields of an inbound email, as Resend reports them. */
export interface RecipientFields {
  /** Envelope recipients Resend accepted the message for. Authoritative. */
  received_for?: unknown;
  to?: unknown;
  cc?: unknown;
  bcc?: unknown;
}

/**
 * Whether this message was actually addressed to support@gdmacros.com.
 *
 * `received_for` is the envelope recipient -- what the sending server asked us
 * to accept the message FOR -- and is the only field that is true by
 * construction. The header fields are included as a fallback because
 * `received_for` can be absent on older payloads, but they are advisory: a
 * header To: can say anything.
 *
 * The domain is not special-cased. Mail to any other @gdmacros.com address
 * reaches this function and is answered `false`, which the caller turns into a
 * plain acknowledgement. Adding a second forwarded address is a change here and
 * nowhere else.
 */
export function isForSupport(fields: RecipientFields): boolean {
  const recipients = new Set<string>([
    ...addressSet(fields.received_for),
    ...addressSet(fields.to),
    ...addressSet(fields.cc),
    ...addressSet(fields.bcc),
  ]);
  return recipients.has(SUPPORT_ADDRESS);
}

/* ------------------------------------------------------------------ *
 * Loop protection
 * ------------------------------------------------------------------ */

export type LoopVerdict = { forward: true } | { forward: false; reason: string };

/** Case-insensitive header lookup. Inbound header casing is not guaranteed. */
export function header(headers: unknown, name: string): string | null {
  if (!headers || typeof headers !== "object") return null;
  const wanted = name.toLowerCase();
  for (const [k, v] of Object.entries(headers as Record<string, unknown>)) {
    if (k.toLowerCase() === wanted) return typeof v === "string" ? v : null;
  }
  return null;
}

const BULK_PRECEDENCE = new Set(["bulk", "list", "junk", "auto_reply", "auto-reply"]);

/**
 * Whether forwarding this message could feed itself.
 *
 * THE RULE, and why it is drawn here
 * ----------------------------------
 * A loop needs a cycle: something we send has to come back to support@ and be
 * forwarded again. Only two things can close that cycle, so only two things are
 * blocked outright:
 *
 *   1. The message claims to come FROM support@gdmacros.com. Our own forward is
 *      sent as support@, so a message from support@ arriving at support@ is
 *      either our own output returning or something spoofing us. Either way,
 *      forwarding it starts an unbounded cycle.
 *
 *   2. The message already carries our forwarding marker. That means it IS one
 *      of our forwards, come back around -- the shape a stray auto-forward rule
 *      on the destination mailbox would produce.
 *
 * Beyond those, RFC 3834 automated mail is dropped: vacation responders,
 * bounces and bulk mail are the things that reply to whatever wrote to them,
 * which is what turns a single stray message into a storm. A bounce in
 * particular has a null reverse-path and must never be answered.
 *
 * WHAT IS DELIBERATELY NOT BLOCKED
 * --------------------------------
 * Mail from the destination mailbox itself. The obvious rule -- "never forward
 * anything from gdmacros.com@gmail.com" -- would break the single most likely
 * real use of this address: the operator emailing support@ from their own Gmail
 * to check that it works. And it buys nothing, because that path terminates.
 * Gmail -> support@ -> Gmail is delivery, not a cycle; nothing re-injects it.
 * The genuine risk in that direction is an auto-forward rule on the destination,
 * and rule 2 catches that precisely, without blocking a human being.
 *
 * The objective is preventing automated loops, not preventing testing.
 */
export function loopCheck(input: { from: unknown; headers?: unknown }): LoopVerdict {
  const from = parseAddress(input.from);

  // No usable sender means no usable Reply-To, and a null reverse-path is a
  // bounce. Forwarding it would produce a dead-end message at best.
  if (!from) return { forward: false, reason: "no_sender" };

  if (from === SUPPORT_ADDRESS) return { forward: false, reason: "self_addressed" };

  if (header(input.headers, FORWARD_MARKER_HEADER)) {
    return { forward: false, reason: "already_forwarded" };
  }

  const autoSubmitted = header(input.headers, "auto-submitted");
  if (autoSubmitted && autoSubmitted.trim().toLowerCase() !== "no") {
    return { forward: false, reason: "auto_submitted" };
  }

  const precedence = header(input.headers, "precedence");
  if (precedence && BULK_PRECEDENCE.has(precedence.trim().toLowerCase())) {
    return { forward: false, reason: "bulk_precedence" };
  }

  for (const h of ["x-autoreply", "x-autorespond", "x-auto-response-suppress"]) {
    if (header(input.headers, h)) return { forward: false, reason: "auto_reply" };
  }

  const returnPath = header(input.headers, "return-path");
  if (returnPath && returnPath.trim() === "<>") {
    return { forward: false, reason: "bounce" };
  }

  return { forward: true };
}

/* ------------------------------------------------------------------ *
 * Attachment planning
 * ------------------------------------------------------------------ */

/**
 * Conservative limits. Resend accepts roughly 40 MB per message, and base64
 * inflates bytes by about a third, so 20 MB of raw attachment is about 27 MB on
 * the wire -- comfortably inside the ceiling with room for the body.
 */
export const MAX_ATTACHMENTS = 20;
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_TOTAL_ATTACHMENT_BYTES = 20 * 1024 * 1024;

export interface AttachmentMeta {
  id: string;
  filename?: string | null;
  size: number;
  content_type?: string;
}

export interface AttachmentPlan {
  include: AttachmentMeta[];
  skipped: { filename: string; reason: "too_large" | "too_many" | "quota" }[];
}

/** A filename safe to show in the wrapper when the original has none. */
export function attachmentLabel(a: AttachmentMeta): string {
  const name = typeof a.filename === "string" ? a.filename.trim() : "";
  return name || "(unnamed attachment)";
}

/**
 * Decides which attachments travel.
 *
 * ORDER IS PART OF THE CONTRACT, not a detail. The budget is filled greedily,
 * so the order decides which files get skipped, and the resulting payload is
 * sent under a fixed idempotency key. If a retry saw the same attachments in a
 * different order it would build a different message, and the key would pin
 * whichever one happened to arrive first -- silently, with the other version
 * discarded.
 *
 * Relying on the API to list them consistently would be assuming something it
 * does not promise, so the order is imposed here instead: sorted by id, which
 * is stable, unique and independent of anything upstream.
 *
 * Oversized attachments are skipped rather than failing the whole forward. A
 * support message whose 30 MB video did not make it is still worth reading; a
 * support message silently dropped is not.
 */
export function planAttachments(list: AttachmentMeta[]): AttachmentPlan {
  const include: AttachmentMeta[] = [];
  const skipped: AttachmentPlan["skipped"] = [];
  let total = 0;

  const ordered = [...list].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  for (const a of ordered) {
    const label = attachmentLabel(a);
    if (include.length >= MAX_ATTACHMENTS) {
      skipped.push({ filename: label, reason: "too_many" });
      continue;
    }
    if (a.size > MAX_ATTACHMENT_BYTES) {
      skipped.push({ filename: label, reason: "too_large" });
      continue;
    }
    if (total + a.size > MAX_TOTAL_ATTACHMENT_BYTES) {
      skipped.push({ filename: label, reason: "quota" });
      continue;
    }
    include.push(a);
    total += a.size;
  }

  return { include, skipped };
}

/* ------------------------------------------------------------------ *
 * Message construction
 * ------------------------------------------------------------------ */

/**
 * HTML-escapes a string for insertion into the wrapper.
 *
 * Every piece of metadata in the wrapper -- sender, subject, recipient list,
 * message id, attachment names -- is attacker-controlled. Unescaped, a subject
 * of `<script>...` or a filename containing `"><img onerror=` would be injected
 * into the mail we send ourselves. The ORIGINAL html body is a different case
 * and is passed through untouched: it is the message being read, mail clients
 * already sanitise it, and mangling it would defeat the point of forwarding.
 *
 * The implementation lives in `lib/escapeHtml` and is re-exported here. It is
 * deliberately NOT defined in this file: this module holds the private
 * forwarding address, and anything importing the escaper would otherwise pull
 * that address along with it.
 */
export { escapeHtml };

/**
 * The subject to send.
 *
 * Preserved exactly, with no `[FWD]` prefix. The destination mailbox threads on
 * subject, and a prefix would split a conversation in two and break replies
 * that quote it.
 */
export function forwardSubject(subject: unknown): string {
  const s = typeof subject === "string" ? subject.trim() : "";
  return s || NO_SUBJECT;
}

/**
 * The idempotency key for one inbound email.
 *
 * Resend retries a webhook that failed or timed out, so the same email can
 * arrive several times. Keying the send on the inbound email id makes every
 * retry collapse onto the first send instead of filling the mailbox with
 * duplicates.
 */
export function idempotencyKeyFor(emailId: string): string {
  return `support-forward/${emailId}`;
}

export interface ForwardSource {
  id: string;
  from: string;
  to?: unknown;
  cc?: unknown;
  subject?: unknown;
  created_at?: unknown;
  message_id?: unknown;
  html?: string | null;
  text?: string | null;
}

/** A row in the wrapper. Both halves are escaped at render time. */
function rows(source: ForwardSource, skipped: AttachmentPlan["skipped"]): [string, string][] {
  const out: [string, string][] = [["From", String(source.from ?? "")]];

  const to = [...addressSet(source.to)];
  if (to.length) out.push(["To", to.join(", ")]);

  const cc = [...addressSet(source.cc)];
  if (cc.length) out.push(["Cc", cc.join(", ")]);

  out.push(["Subject", forwardSubject(source.subject)]);

  if (typeof source.created_at === "string" && source.created_at) {
    out.push(["Received", source.created_at]);
  }
  if (typeof source.message_id === "string" && source.message_id) {
    out.push(["Message-ID", source.message_id]);
  }
  if (skipped.length) {
    out.push([
      "Not forwarded",
      `${skipped.length} attachment${skipped.length === 1 ? "" : "s"} exceeded the forwarding limit: ${skipped
        .map((s) => s.filename)
        .join(", ")}`,
    ]);
  }
  return out;
}

/**
 * The HTML body: an escaped metadata header, a rule, then the original.
 *
 * When the original is text-only its text is escaped into a `<pre>` rather than
 * dropped, so an HTML-preferring client still shows the message.
 */
export function buildHtml(source: ForwardSource, skipped: AttachmentPlan["skipped"]): string {
  const meta = rows(source, skipped)
    .map(
      ([k, v]) =>
        `<tr><td style="padding:2px 12px 2px 0;color:#6b7280;white-space:nowrap;vertical-align:top">${escapeHtml(
          k,
        )}</td><td style="padding:2px 0;color:#111827">${escapeHtml(v)}</td></tr>`,
    )
    .join("");

  const original =
    typeof source.html === "string" && source.html.trim()
      ? source.html
      : `<pre style="white-space:pre-wrap;font-family:ui-monospace,Menlo,Consolas,monospace">${escapeHtml(
          source.text ?? "",
        )}</pre>`;

  return [
    `<div style="font:13px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;margin-bottom:16px">`,
    `<table style="border-collapse:collapse">${meta}</table>`,
    `</div>`,
    `<hr style="border:0;border-top:1px solid #e5e7eb;margin:0 0 16px">`,
    original,
  ].join("");
}

/** The plain-text alternative, same metadata, no markup. */
export function buildText(source: ForwardSource, skipped: AttachmentPlan["skipped"]): string {
  const meta = rows(source, skipped)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
  const body =
    typeof source.text === "string" && source.text.trim()
      ? source.text
      : "(This message had no plain-text part. See the HTML version.)";
  return `${meta}\n${"-".repeat(48)}\n\n${body}`;
}
