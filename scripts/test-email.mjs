/**
 * Tests for support@gdmacros.com forwarding. Mocked: no network, no Resend, no key.
 *
 * Run with `npm run test:email`.
 *
 * The real modules are loaded straight from src by jiti, the same way the
 * publisher tests do it, so these exercise the shipped code rather than a copy.
 * `server-only` is stubbed because `transport.ts` imports it; the transport
 * itself is never loaded here -- the whole point of `processInbound` taking its
 * network access as a parameter is that this file can supply a fake one.
 *
 * What is worth testing here is not "does it send an email". It is the set of
 * decisions that are dangerous to get wrong: who counts as a recipient, what
 * counts as a loop, what happens on a partial failure, and whether a retry can
 * duplicate or damage a message.
 */
import { createJiti } from "jiti";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

let passed = 0;
let failed = 0;
const failures = [];
const check = (name, cond, detail = "") => {
  if (cond) passed++;
  else {
    failed++;
    failures.push(`${name}${detail ? ` -- ${detail}` : ""}`);
  }
};
const eq = (name, a, b) =>
  check(name, Object.is(a, b), `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);

const STUB_DIR = path.join(ROOT, "node_modules", ".gdm-test-stubs");
fs.mkdirSync(STUB_DIR, { recursive: true });
fs.writeFileSync(path.join(STUB_DIR, "server-only.mjs"), "export {};\n");

const jiti = createJiti(path.join(ROOT, "scripts", "test-email.mjs"), {
  alias: {
    "server-only": path.join(STUB_DIR, "server-only.mjs"),
    "@": path.join(ROOT, "src"),
  },
  interopDefault: true,
  moduleCache: false,
});

const S = await jiti.import(path.join(ROOT, "src/lib/email/support.ts"));
const { processInbound } = await jiti.import(path.join(ROOT, "src/lib/email/inbound.ts"));

/* ------------------------------------------------------------------ *
 * Harness
 * ------------------------------------------------------------------ */

const SIG = { id: "msg_1", timestamp: "1700000000", signature: "v1,deadbeef" };

/** An inbound email as the Receiving API reports it. */
const email = (over = {}) => ({
  id: "em_123",
  from: "Angry Player <player@example.com>",
  to: ["support@gdmacros.com"],
  cc: [],
  bcc: [],
  received_for: ["support@gdmacros.com"],
  subject: "My macro will not download",
  created_at: "2026-01-15T09:30:00.000Z",
  message_id: "<abc@example.com>",
  headers: {},
  html: "<p>Hello <b>there</b></p>",
  text: "Hello there",
  attachments: [],
  ...over,
});

/**
 * A fake transport that records what it was asked to do.
 *
 * `valid: false` simulates a signature that does not verify, which is the only
 * way to prove the ordering guarantee that matters: nothing is retrieved and no
 * key is used until verification passes.
 */
function mock(over = {}) {
  const calls = { verify: 0, getEmail: 0, listAttachments: 0, download: 0, send: 0 };
  const sends = [];
  const t = {
    calls,
    sends,
    valid: over.valid !== false,
    event: over.event ?? { type: "email.received", data: { email_id: "em_123" } },
    email: over.email ?? email(),
    attachments: over.attachments ?? [],
    getEmailResult: over.getEmailResult,
    listResult: over.listResult,
    downloadResult: over.downloadResult,
    sendResult: over.sendResult,

    verify() {
      calls.verify++;
      return t.valid ? t.event : null;
    },
    async getEmail() {
      calls.getEmail++;
      return t.getEmailResult ?? { ok: true, value: t.email };
    },
    async listAttachments() {
      calls.listAttachments++;
      return t.listResult ?? { ok: true, value: t.attachments };
    },
    async download(ref) {
      calls.download++;
      return t.downloadResult ?? { ok: true, value: Buffer.from(`bytes:${ref.id}`).toString("base64") };
    },
    async send(payload, key) {
      calls.send++;
      sends.push({ payload, key });
      return t.sendResult ?? { ok: true, value: { id: "sent_1" } };
    },
  };
  return t;
}

const run = (t, raw = "{}", sig = SIG) => processInbound(raw, sig, t);

const att = (over = {}) => ({
  id: "at_1",
  filename: "log.txt",
  size: 1024,
  content_type: "text/plain",
  content_disposition: "attachment",
  content_id: null,
  download_url: "https://signed.example/secret-token",
  ...over,
});

/* ------------------------------------------------------------------ *
 * 1. Signature verification
 * ------------------------------------------------------------------ */
console.log("Signature verification");

{
  const t = mock({ valid: false });
  const r = await run(t);
  eq("invalid signature is 401", r.status, 401);
  eq("invalid signature retrieves nothing", t.calls.getEmail, 0);
  eq("invalid signature sends nothing", t.calls.send, 0);
  check(
    "invalid signature does not explain itself",
    JSON.stringify(r.body) === JSON.stringify({ error: "unauthorized" }),
    JSON.stringify(r.body),
  );
}

{
  const t = mock();
  const r = await processInbound("{}", null, t);
  eq("missing signature headers is 401", r.status, 401);
  eq("missing headers never calls verify", t.calls.verify, 0);
  eq("missing headers retrieves nothing", t.calls.getEmail, 0);
}

{
  const t = mock();
  const r = await processInbound("{}", { id: "a", timestamp: "b", signature: "" }, t);
  eq("a blank signature header is 401", r.status, 401);
  check(
    "blank and invalid signatures give the same body",
    JSON.stringify(r.body) === JSON.stringify({ error: "unauthorized" }),
  );
}

{
  const t = mock();
  const raw = '{"type":"email.received","data":{"email_id":"em_123"}}';
  await run(t, raw);
  eq("verify receives the raw body unparsed", t.calls.verify, 1);
}

/* ------------------------------------------------------------------ *
 * 2. Event filtering
 * ------------------------------------------------------------------ */
console.log("Event filtering");

{
  const t = mock({ event: { type: "email.delivered", data: { email_id: "em_123" } } });
  const r = await run(t);
  eq("a non-received event is 200", r.status, 200);
  eq("a non-received event sends nothing", t.calls.send, 0);
  eq("a non-received event retrieves nothing", t.calls.getEmail, 0);
}

{
  const t = mock({ event: { type: "email.received", data: {} } });
  const r = await run(t);
  eq("a signed event with no email id is 400", r.status, 400);
  eq("no email id sends nothing", t.calls.send, 0);
}

/* ------------------------------------------------------------------ *
 * 3. Recipient filtering
 * ------------------------------------------------------------------ */
console.log("Recipient filtering");

{
  const t = mock();
  const r = await run(t);
  eq("a plain support email forwards", r.status, 200);
  eq("it sends exactly once", t.calls.send, 1);
  eq("body reports the forward", r.body.forwarded, true);
}

{
  const t = mock({
    email: email({ to: ["hello@gdmacros.com"], received_for: ["hello@gdmacros.com"] }),
  });
  const r = await run(t);
  eq("another gdmacros.com address is acknowledged", r.status, 200);
  eq("another gdmacros.com address is not forwarded", t.calls.send, 0);
  eq("and it says why", r.body.ignored, "recipient");
}

{
  // The one that a substring test gets wrong. The display name is not an
  // address; the real recipient is mallory@.
  const t = mock({
    email: email({
      to: ['"support@gdmacros.com" <mallory@example.com>'],
      received_for: ['"support@gdmacros.com" <mallory@example.com>'],
    }),
  });
  const r = await run(t);
  eq("a display name spoofing support@ is not a recipient", t.calls.send, 0);
  eq("and it is acknowledged, not errored", r.status, 200);
}

{
  const t = mock({
    email: email({ to: ["notsupport@gdmacros.com"], received_for: ["notsupport@gdmacros.com"] }),
  });
  eq("notsupport@ does not match support@", (await run(t), t.calls.send), 0);
}

{
  const t = mock({
    email: email({
      to: ["support@gdmacros.com.evil.example"],
      received_for: ["support@gdmacros.com.evil.example"],
    }),
  });
  eq("a lookalike subdomain does not match", (await run(t), t.calls.send), 0);
}

{
  const t = mock({
    email: email({ to: ["SUPPORT@GDMACROS.COM"], received_for: ["SUPPORT@GDMACROS.COM"] }),
  });
  eq("matching is case-insensitive", (await run(t), t.calls.send), 1);
}

{
  const t = mock({
    email: email({
      to: ["GDMacros Support <support@gdmacros.com>"],
      received_for: ["GDMacros Support <support@gdmacros.com>"],
    }),
  });
  eq("a display-name form still matches", (await run(t), t.calls.send), 1);
}

{
  const t = mock({
    email: email({ to: ["someone@example.com"], cc: ["support@gdmacros.com"], received_for: [] }),
  });
  eq("support@ on cc counts as a recipient", (await run(t), t.calls.send), 1);
}

{
  const t = mock({
    email: email({
      to: ['"Doe, John" <john@example.com>, support@gdmacros.com'],
      received_for: [],
    }),
  });
  eq("a comma inside a display name does not break parsing", (await run(t), t.calls.send), 1);
}

/* ------------------------------------------------------------------ *
 * 4. Loop protection
 * ------------------------------------------------------------------ */
console.log("Loop protection");

{
  const t = mock({ email: email({ from: "GDMacros Support <support@gdmacros.com>" }) });
  const r = await run(t);
  eq("support@ to itself is not forwarded", t.calls.send, 0);
  eq("and the reason is recorded", r.body.ignored, "self_addressed");
}

{
  const t = mock({ email: email({ headers: { "x-gdmacros-forwarded": "support-inbound" } }) });
  const r = await run(t);
  eq("our own marker stops a round trip", t.calls.send, 0);
  eq("marker reason", r.body.ignored, "already_forwarded");
}

{
  // The requirement that matters: the operator must be able to test support@
  // from the destination mailbox. This is delivery, not a cycle.
  const t = mock({ email: email({ from: "gdmacros.com@gmail.com" }) });
  eq("mail FROM the destination is still forwarded", (await run(t), t.calls.send), 1);
}

{
  const t = mock({ email: email({ headers: { "Auto-Submitted": "auto-replied" } }) });
  const r = await run(t);
  eq("an auto-reply is not forwarded", t.calls.send, 0);
  eq("auto-submitted reason", r.body.ignored, "auto_submitted");
}

{
  const t = mock({ email: email({ headers: { "Auto-Submitted": "no" } }) });
  eq("Auto-Submitted: no is a normal message", (await run(t), t.calls.send), 1);
}

{
  const t = mock({ email: email({ headers: { Precedence: "bulk" } }) });
  eq("bulk mail is not forwarded", (await run(t), t.calls.send), 0);
}

{
  const t = mock({ email: email({ headers: { "Return-Path": "<>" } }) });
  const r = await run(t);
  eq("a bounce is not forwarded", t.calls.send, 0);
  eq("bounce reason", r.body.ignored, "bounce");
}

{
  const t = mock({ email: email({ from: "not an address" }) });
  eq("an unparseable sender is not forwarded", (await run(t), t.calls.send), 0);
}

/* ------------------------------------------------------------------ *
 * 5. The forwarded message
 * ------------------------------------------------------------------ */
console.log("Message construction");

{
  const t = mock();
  await run(t);
  const p = t.sends[0].payload;
  eq("from is the support address", p.from, "GDMacros Support <support@gdmacros.com>");
  eq("to is the destination mailbox", p.to, "gdmacros.com@gmail.com");
  eq("reply-to is the ORIGINAL sender", p.replyTo, "Angry Player <player@example.com>");
  check(
    "the original sender is never put in From",
    !p.from.includes("player@example.com"),
    p.from,
  );
  eq("the subject is preserved exactly", p.subject, "My macro will not download");
  check("no FWD prefix is added", !/^\s*\[?fwd/i.test(p.subject), p.subject);
}

{
  const t = mock({ email: email({ subject: "" }) });
  await run(t);
  eq("an empty subject falls back", t.sends[0].payload.subject, "(No subject)");
}

{
  const t = mock({ email: email({ subject: undefined }) });
  await run(t);
  eq("a missing subject falls back", t.sends[0].payload.subject, "(No subject)");
}

{
  const t = mock({
    email: email({
      subject: '<script>alert(1)</script>',
      from: '"<img onerror=x>" <evil@example.com>',
      html: "<p>original <b>markup</b> survives</p>",
    }),
  });
  await run(t);
  const { html } = t.sends[0].payload;
  check("the subject is escaped in the wrapper", html.includes("&lt;script&gt;"), "not escaped");
  check("no live script tag reaches the wrapper", !html.includes("<script>"), "script leaked");
  check("the sender is escaped in the wrapper", html.includes("&lt;img onerror=x&gt;"), "not escaped");
  check(
    "the ORIGINAL html is passed through untouched",
    html.includes("<p>original <b>markup</b> survives</p>"),
    "original was mangled",
  );
}

{
  const t = mock();
  await run(t);
  const { html, text } = t.sends[0].payload;
  check(
    "the destination address is never disclosed in the html",
    !html.includes("gdmacros.com@gmail.com"),
    "destination leaked into html",
  );
  check(
    "the destination address is never disclosed in the text",
    !text.includes("gdmacros.com@gmail.com"),
    "destination leaked into text",
  );
}

{
  const t = mock({ email: email({ html: null, text: "plain only" }) });
  await run(t);
  const p = t.sends[0].payload;
  check("a text-only email still gets an html part", p.html.includes("plain only"), p.html);
  check("and the text part carries the body", p.text.includes("plain only"), p.text);
}

{
  const t = mock({ email: email({ html: "<p>rich</p>", text: null }) });
  await run(t);
  check(
    "an html-only email still gets a text part",
    t.sends[0].payload.text.includes("no plain-text part"),
    t.sends[0].payload.text,
  );
}

{
  const t = mock();
  await run(t);
  eq(
    "the forward is stamped so a round trip is detectable",
    t.sends[0].payload.headers["X-GDMacros-Forwarded"],
    "support-inbound",
  );
}

/* ------------------------------------------------------------------ *
 * 6. Attachments
 * ------------------------------------------------------------------ */
console.log("Attachments");

{
  const t = mock({
    email: email({ attachments: [{ id: "at_1", filename: "log.txt", size: 1024 }] }),
    attachments: [att()],
  });
  await run(t);
  const a = t.sends[0].payload.attachments;
  eq("one attachment is forwarded", a.length, 1);
  eq("the filename is preserved", a[0].filename, "log.txt");
  check(
    "content is a base64 STRING, not a Buffer",
    typeof a[0].content === "string",
    typeof a[0].content,
  );
  eq("the bytes round-trip", Buffer.from(a[0].content, "base64").toString(), "bytes:at_1");
  check(
    "a Buffer would not survive JSON, so this must",
    JSON.parse(JSON.stringify(a[0])).content === a[0].content,
  );
}

{
  const t = mock({
    email: email({ attachments: [{ id: "at_1", size: 1 }] }),
    attachments: [att({ filename: null })],
  });
  await run(t);
  eq(
    "an unnamed attachment still gets a filename",
    t.sends[0].payload.attachments[0].filename,
    "attachment-at_1",
  );
}

{
  const t = mock({
    email: email({ attachments: [{ id: "at_1", size: 5 }] }),
    attachments: [att({ content_disposition: "inline", content_id: "<img001>" })],
  });
  await run(t);
  eq(
    "an inline image keeps its content id so cid: still resolves",
    t.sends[0].payload.attachments[0].contentId,
    "img001",
  );
}

{
  const huge = 40 * 1024 * 1024;
  const t = mock({
    email: email({ attachments: [{ id: "at_1", size: huge }] }),
    attachments: [att({ id: "at_1", filename: "huge.mp4", size: huge })],
  });
  const r = await run(t);
  eq("an oversized attachment does not block the forward", t.calls.send, 1);
  eq("it is not downloaded", t.calls.download, 0);
  check(
    "the wrapper says an attachment did not travel",
    t.sends[0].payload.html.includes("huge.mp4"),
    "not mentioned",
  );
  check(
    "the text part says so too",
    t.sends[0].payload.text.includes("huge.mp4"),
    "not mentioned",
  );
  eq("and the send still reports success", r.status, 200);
}

{
  const many = Array.from({ length: 25 }, (_, i) => att({ id: `at_${i}`, filename: `f${i}.txt`, size: 10 }));
  const t = mock({
    email: email({ attachments: many.map((a) => ({ id: a.id, size: a.size })) }),
    attachments: many,
  });
  await run(t);
  eq("the attachment count is capped", t.sends[0].payload.attachments.length, S.MAX_ATTACHMENTS);
  // Deliberately not asserting WHICH five were dropped: the plan orders by id,
  // so that is lexicographic and of no interest. What matters is that five were
  // dropped and the reader is told.
  check(
    "the overflow is reported to the reader",
    t.sends[0].payload.html.includes("5 attachments exceeded"),
    t.sends[0].payload.html.slice(0, 400),
  );
}

{
  // Nine 3 MB files: under the per-file cap, over the 20 MB total.
  const mb3 = 3 * 1024 * 1024;
  const list = Array.from({ length: 9 }, (_, i) => att({ id: `at_${i}`, filename: `f${i}.bin`, size: mb3 }));
  const t = mock({
    email: email({ attachments: list.map((a) => ({ id: a.id, size: a.size })) }),
    attachments: list,
  });
  await run(t);
  const total = list.slice(0, t.sends[0].payload.attachments.length).reduce((n, a) => n + a.size, 0);
  check(
    "the total attachment budget is respected",
    total <= S.MAX_TOTAL_ATTACHMENT_BYTES,
    `${total} bytes`,
  );
  check("something was dropped", t.sends[0].payload.attachments.length < 9);
}

{
  // The same attachments in a different order must produce the same message.
  // Order decides which files fall outside the budget, and the idempotency key
  // would pin whichever version arrived first.
  const mb8 = 8 * 1024 * 1024;
  const list = [
    att({ id: "at_a", filename: "a.bin", size: mb8 }),
    att({ id: "at_b", filename: "b.bin", size: mb8 }),
    att({ id: "at_c", filename: "c.bin", size: mb8 }),
  ];
  const metas = list.map((a) => ({ id: a.id, size: a.size }));

  const fwd = mock({ email: email({ attachments: metas }), attachments: list });
  const rev = mock({ email: email({ attachments: metas }), attachments: [...list].reverse() });
  await run(fwd);
  await run(rev);

  check(
    "attachment order does not change which files travel",
    JSON.stringify(fwd.sends[0].payload.attachments.map((a) => a.filename)) ===
      JSON.stringify(rev.sends[0].payload.attachments.map((a) => a.filename)),
    `${JSON.stringify(fwd.sends[0].payload.attachments.map((a) => a.filename))} vs ${JSON.stringify(rev.sends[0].payload.attachments.map((a) => a.filename))}`,
  );
  check(
    "and a reordered list yields a byte-identical payload",
    JSON.stringify(fwd.sends[0].payload) === JSON.stringify(rev.sends[0].payload),
    "payload depends on upstream ordering",
  );
  check("the budget really did drop one", fwd.sends[0].payload.attachments.length === 2);
}

{
  const t = mock();
  await run(t);
  eq("no attachments means no listing call", t.calls.listAttachments, 0);
  check("and no attachments field is sent", t.sends[0].payload.attachments === undefined);
}

/* ------------------------------------------------------------------ *
 * 7. Failure semantics
 * ------------------------------------------------------------------ */
console.log("Failure semantics");

{
  const t = mock({ getEmailResult: { ok: false, retryable: true, category: "retrieve_503" } });
  const r = await run(t);
  check("a transient retrieval failure asks for a retry", r.status >= 500, String(r.status));
  eq("and sends nothing", t.calls.send, 0);
}

{
  const t = mock({ getEmailResult: { ok: false, retryable: false, category: "retrieve_422" } });
  const r = await run(t);
  eq("a permanent retrieval failure stops the retries", r.status, 200);
  eq("and sends nothing", t.calls.send, 0);
}

{
  const t = mock({
    email: email({ attachments: [{ id: "at_1", size: 10 }] }),
    attachments: [att()],
    downloadResult: { ok: false, retryable: true, category: "download_500" },
  });
  const r = await run(t);
  check("a failed download asks for a retry", r.status >= 500, String(r.status));
  eq(
    "and CRITICALLY sends nothing, so the retry is not swallowed by the idempotency key",
    t.calls.send,
    0,
  );
}

{
  const t = mock({ sendResult: { ok: false, retryable: true, category: "send_503" } });
  const r = await run(t);
  check("a transient send failure asks for a retry", r.status >= 500, String(r.status));
}

{
  const t = mock({ sendResult: { ok: false, retryable: false, category: "send_422" } });
  const r = await run(t);
  eq("a permanent send failure is not retried forever", r.status, 200);
}

/* ------------------------------------------------------------------ *
 * 8. Idempotency
 * ------------------------------------------------------------------ */
console.log("Idempotency");

{
  const t = mock();
  await run(t);
  eq("the key is derived from the email id", t.sends[0].key, "support-forward/em_123");
}

{
  // The property that makes retrying safe: the same inbound email must rebuild
  // the same payload, or the idempotency key would pin whichever version won
  // the race and quietly discard the other.
  const a = mock({
    email: email({ attachments: [{ id: "at_1", size: 10 }] }),
    attachments: [att()],
  });
  const b = mock({
    email: email({ attachments: [{ id: "at_1", size: 10 }] }),
    attachments: [att()],
  });
  await run(a);
  await new Promise((r) => setTimeout(r, 5));
  await run(b);
  eq("the same email yields the same key", a.sends[0].key, b.sends[0].key);
  check(
    "the same email yields a byte-identical payload",
    JSON.stringify(a.sends[0].payload) === JSON.stringify(b.sends[0].payload),
    "payload differs between attempts",
  );
  // The fixture is dated in January on purpose: if today's date appears in the
  // payload at all, something built it from the clock rather than the email.
  const today = new Date().toISOString().slice(0, 10);
  check(
    "nothing in the payload reads the clock",
    !JSON.stringify(a.sends[0].payload).includes(today),
    `a live timestamp (${today}) leaked into the payload`,
  );
  check(
    "the email's OWN timestamp is what gets shown",
    a.sends[0].payload.text.includes("2026-01-15T09:30:00.000Z"),
    "the original received time was lost",
  );
}

{
  const t = mock({ email: email({ id: "em_other" }), event: { type: "email.received", data: { email_id: "em_other" } } });
  await run(t);
  eq("a different email gets a different key", t.sends[0].key, "support-forward/em_other");
}

/* ------------------------------------------------------------------ *
 * 9. Logging hygiene
 * ------------------------------------------------------------------ */
console.log("Logging hygiene");

{
  const t = mock({
    email: email({
      subject: "SECRET SUBJECT",
      text: "SECRET BODY",
      html: "<p>SECRET BODY</p>",
      attachments: [{ id: "at_1", size: 10 }],
    }),
    attachments: [att({ filename: "SECRET.txt" })],
  });
  const r = await run(t);
  const line = JSON.stringify(r.log);
  check("the log carries no subject", !line.includes("SECRET SUBJECT"), line);
  check("the log carries no body", !line.includes("SECRET BODY"), line);
  check("the log carries no attachment name", !line.includes("SECRET.txt"), line);
  check("the log carries no signed url", !line.includes("signed.example"), line);
  check("the log carries no sender address", !line.includes("player@example.com"), line);
  check("but it does identify the email", line.includes("em_123"), line);
  check("and it records the attachment count", r.log.attachments === 1, line);
}

/* ------------------------------------------------------------------ *
 * 10. Pure helpers, directly
 * ------------------------------------------------------------------ */
console.log("Address parsing");

eq("bare address", S.parseAddress("a@b.com"), "a@b.com");
eq("display name form", S.parseAddress("Name <a@b.com>"), "a@b.com");
eq("angle brackets only", S.parseAddress("<a@b.com>"), "a@b.com");
eq("lowercased", S.parseAddress("A@B.COM"), "a@b.com");
eq("quoted display name wins nothing", S.parseAddress('"x@y.com" <a@b.com>'), "a@b.com");
eq("null reverse path is not an address", S.parseAddress("<>"), null);
eq("garbage is not an address", S.parseAddress("not an address"), null);
eq("no domain dot is rejected", S.parseAddress("a@b"), null);
eq("unterminated bracket is rejected", S.parseAddress("Name <a@b.com"), null);
eq("non-string is rejected", S.parseAddress(null), null);
eq("splitting respects quoted commas", S.splitAddressList('"Doe, John" <j@d.com>, b@c.com').length, 2);
eq("splitting respects angle brackets", S.splitAddressList("<a@b.com>, <c@d.com>").length, 2);
eq("escaped html", S.escapeHtml('<a href="x">&'), "&lt;a href=&quot;x&quot;&gt;&amp;");
eq("subject fallback", S.forwardSubject("   "), "(No subject)");
eq("subject preserved", S.forwardSubject(" hello "), "hello");
eq("header lookup is case-insensitive", S.header({ "AUTO-Submitted": "auto-replied" }, "auto-submitted"), "auto-replied");
eq("header lookup on nothing", S.header(null, "x"), null);

/* ------------------------------------------------------------------ */

console.log(`\n${passed} passed, ${failed} failed`);
if (failures.length) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  - ${f}`);
}
process.exit(failed ? 1 : 0);
