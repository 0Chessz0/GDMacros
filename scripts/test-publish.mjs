/**
 * Tests for the automated publisher, against MOCKED GitHub and Supabase.
 *
 * Run with `npm run test:publish`.
 *
 * There are no live credentials here and none are needed. Every GitHub call is
 * intercepted by a fake `fetch` that serves fixtures and can be told to fail in
 * specific ways, and the database is a small in-memory stand-in that enforces
 * the same state transitions migration 0006 does.
 *
 * That is deliberate: the failure paths that matter most are the ones that are
 * hardest to produce on purpose against the real service. "GitHub accepted the
 * upload and then our database write failed" is a one-line fixture here and
 * almost impossible to arrange live.
 *
 * The modules under test are the REAL ones, loaded straight from src, not
 * reimplementations. `server-only` is aliased to an empty stub, exactly as the
 * Phase 2C storage tests did, because that guard is proven separately by the
 * build failing when a client component imports it.
 */
import { createJiti } from "jiti";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

let passed = 0;
let failed = 0;
const failures = [];

function check(name, cond, detail = "") {
  if (cond) {
    passed++;
  } else {
    failed++;
    failures.push(`${name}${detail ? ` -- ${detail}` : ""}`);
  }
}

function eq(name, actual, expected) {
  check(name, Object.is(actual, expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

/* ------------------------------------------------------------------ */
/* Bundling the real source                                            */
/* ------------------------------------------------------------------ */

/*
 * The real modules are loaded straight from src by jiti, which Next already
 * ships, so this needs no extra dependency and no build step.
 *
 * Two modules are aliased to stubs:
 *   server-only  throws by design outside a server component; the guard it
 *                provides is proven separately by the build failing when a
 *                client component imports it.
 *   storage-admin needs a privileged Supabase key. The publisher only asks it
 *                for bytes, so the stub hands back a fixture.
 */
const STUB_DIR = path.join(ROOT, "node_modules", ".gdm-test-stubs");
fs.mkdirSync(STUB_DIR, { recursive: true });
fs.writeFileSync(path.join(STUB_DIR, "server-only.mjs"), "export {};\n");
fs.writeFileSync(
  path.join(STUB_DIR, "storage-admin.mjs"),
  `export const isStorageAdminConfigured = true;
export async function downloadSubmissionObject() {
  return { ok: true, bytes: globalThis.__FAKE_BYTES__ };
}
export async function deleteSubmissionObjectByPath() { return { ok: true }; }
export async function deleteSubmissionObject() { return { ok: true }; }
`,
);

const jiti = createJiti(path.join(ROOT, "scripts", "test-publish.mjs"), {
  alias: {
    "server-only": path.join(STUB_DIR, "server-only.mjs"),
    "@/lib/supabase/storage-admin": path.join(STUB_DIR, "storage-admin.mjs"),
    "@": path.join(ROOT, "src"),
  },
  interopDefault: true,
  moduleCache: false,
});

const load = (rel) => jiti.import(path.join(ROOT, rel));

/* ------------------------------------------------------------------ */
/* Fake GitHub                                                         */
/* ------------------------------------------------------------------ */

/**
 * A tiny GitHub stand-in: releases, assets and one file, plus a scripted
 * failure queue so a specific call can be made to fail once.
 */
function makeGitHub() {
  const gh = {
    releases: [], // { id, tag_name, name, upload_url }
    assets: new Map(), // releaseId -> [{ id, name, size, browser_download_url, digest }]
    catalog: { text: "[]\n", sha: "sha-0" },
    commits: [],
    nextId: 1000,
    // queue of { match(url, method), status, body } consumed in order
    failures: [],
    calls: [],
    /** Fires when an upload is accepted, for the "DB fails after upload" case. */
    onUpload: null,
  };

  gh.failOnce = (match, status, body = {}) => gh.failures.push({ match, status, body });

  gh.fetch = async (url, init = {}) => {
    const method = (init.method ?? "GET").toUpperCase();
    gh.calls.push(`${method} ${url}`);

    const idx = gh.failures.findIndex((f) => f.match(url, method));
    if (idx !== -1) {
      const f = gh.failures.splice(idx, 1)[0];
      return new Response(JSON.stringify(f.body), {
        status: f.status,
        headers: { "content-type": "application/json" },
      });
    }

    // Installation token
    if (/\/app\/installations\/\d+\/access_tokens$/.test(url)) {
      return json({ token: "ghs_faketoken", expires_at: new Date(Date.now() + 3600e3).toISOString() });
    }
    if (/\/repos\/[^/]+\/[^/]+\/installation$/.test(url)) {
      return json({ id: 42 });
    }

    // Release by tag
    let m = url.match(/\/releases\/tags\/([^/?]+)$/);
    if (m) {
      const tag = decodeURIComponent(m[1]);
      const rel = gh.releases.find((r) => r.tag_name === tag);
      return rel ? json(rel) : json({ message: "Not Found" }, 404);
    }

    // Create release
    if (method === "POST" && /\/releases$/.test(url)) {
      const body = JSON.parse(init.body);
      if (gh.releases.some((r) => r.tag_name === body.tag_name)) {
        return json({ message: "Validation Failed", errors: [{ message: "already_exists" }] }, 422);
      }
      const rel = { id: gh.nextId++, tag_name: body.tag_name, name: body.name, upload_url: "" };
      gh.releases.push(rel);
      gh.assets.set(rel.id, []);
      return json(rel, 201);
    }

    // List assets
    m = url.match(/\/releases\/(\d+)\/assets\?/);
    if (m && method === "GET") {
      return json(gh.assets.get(Number(m[1])) ?? []);
    }

    // Upload asset
    m = url.match(/\/releases\/(\d+)\/assets\?name=([^&]+)/);
    if (m && method === "POST") {
      const relId = Number(m[1]);
      const name = decodeURIComponent(m[2]);
      const list = gh.assets.get(relId) ?? [];
      if (list.some((a) => a.name === name)) {
        return json({ message: "Validation Failed", errors: [{ message: "already_exists" }] }, 422);
      }
      const bytes = init.body;
      const { createHash } = await import("node:crypto");
      const digest = createHash("sha256").update(bytes).digest("hex");
      const asset = {
        id: gh.nextId++,
        name,
        size: bytes.length,
        browser_download_url: `https://github.com/GDMacros-com/GDMacros-downloads/releases/download/tag/${name}`,
        digest: `sha256:${digest}`,
      };
      list.push(asset);
      gh.assets.set(relId, list);
      if (gh.onUpload) gh.onUpload(asset);
      return json(asset, 201);
    }

    // Read catalog
    if (/\/contents\/data\/macros\.json\?ref=/.test(url) && method === "GET") {
      return json({
        content: Buffer.from(gh.catalog.text, "utf8").toString("base64"),
        encoding: "base64",
        sha: gh.catalog.sha,
      });
    }

    // Commit catalog
    if (/\/contents\/data\/macros\.json$/.test(url) && method === "PUT") {
      const body = JSON.parse(init.body);
      if (body.sha !== gh.catalog.sha) {
        return json({ message: "does not match" }, 409);
      }
      const sha = "c".repeat(39) + String(gh.commits.length + 1);
      gh.catalog = {
        text: Buffer.from(body.content, "base64").toString("utf8"),
        sha: `sha-${gh.commits.length + 1}`,
      };
      gh.commits.push({ sha, message: body.message });
      return json({ commit: { sha } });
    }

    // Latest commit touching the catalog
    if (/\/commits\?path=/.test(url)) {
      const last = gh.commits[gh.commits.length - 1];
      return json(last ? [{ sha: last.sha }] : []);
    }

    // Production version endpoint
    if (url.includes("/api/version")) {
      return json({ commit: gh.productionCommit ?? null });
    }

    return json({ message: `unmocked: ${method} ${url}` }, 500);
  };

  return gh;
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/* ------------------------------------------------------------------ */
/* Fake Supabase                                                       */
/* ------------------------------------------------------------------ */

/**
 * Enforces the same forward-only state machine as migration 0006, so a bug that
 * would be caught by the database check constraints is caught here too.
 */
function makeSupabase(submission) {
  const db = {
    submission: { ...submission },
    state: null,
    finished: false,
    notifications: [],
    isAdmin: true,
    failNext: null, // name of an rpc to fail once
  };

  const ORDER = { not_started: 0, asset_uploaded: 1, catalog_committed: 2, live_verified: 3 };

  /*
   * Minimal PostgREST-style builder, enough for the one read the publisher
   * makes directly: `.from("submissions").select("id").eq("id", x).maybeSingle()`,
   * which is how an ambiguous finish is resolved.
   *
   * `failSelect` makes that read itself fail, so the test can prove that
   * "I could not tell" is never reported as "it is finished".
   */
  db.client = {
    from: (table) => ({
      select: () => ({
        eq: (_col, value) => ({
          maybeSingle: async () => {
            if (db.failSelect) return { data: null, error: { message: "select failed" } };
            if (table !== "submissions") return { data: null, error: null };
            // The row exists until finish_processing consumes it.
            const present = !db.finished && db.submission.submission_id === value;
            return { data: present ? { id: value } : null, error: null };
          },
        }),
      }),
    }),
    rpc: async (name, args) => {
      if (db.failNext === name) {
        db.failNext = null;
        return { data: null, error: { message: "simulated database failure" } };
      }
      if (!db.isAdmin) return { data: null, error: { message: "not authorised" } };

      switch (name) {
        case "begin_publish": {
          if (db.finished || db.submission.status !== "processing") {
            return { data: null, error: { message: "not found or not being processed" } };
          }
          if (!db.state) db.state = { state: "not_started", attempts: 0 };
          else db.state.attempts++;
          return { data: [{ ...db.submission, ...db.state }], error: null };
        }
        case "record_publish_intent": {
          if (db.state.state !== "not_started") {
            return { data: null, error: { message: "already progressed" } };
          }
          Object.assign(db.state, {
            release_id: args.p_release_id,
            release_tag: args.p_release_tag,
            asset_name: args.p_asset_name,
            asset_sha256: args.p_asset_sha256,
          });
          return { data: null, error: null };
        }
        case "record_publish_asset": {
          Object.assign(db.state, {
            release_id: args.p_release_id,
            release_tag: args.p_release_tag,
            asset_id: args.p_asset_id,
            asset_name: args.p_asset_name,
            asset_url: args.p_asset_url,
            asset_sha256: args.p_asset_sha256,
          });
          if (ORDER[db.state.state] < ORDER.asset_uploaded) db.state.state = "asset_uploaded";
          return { data: null, error: null };
        }
        case "record_publish_commit": {
          if (!/^[0-9a-f]{40}$/.test(String(args.p_commit_sha ?? ""))) {
            return { data: null, error: { message: "violates check constraint" } };
          }
          db.state.catalog_commit_sha = args.p_commit_sha;
          if (ORDER[db.state.state] < ORDER.catalog_committed) db.state.state = "catalog_committed";
          return { data: null, error: null };
        }
        case "record_publish_live": {
          if (db.state.state !== "catalog_committed") {
            return { data: null, error: { message: "not ready to be marked live" } };
          }
          db.state.state = "live_verified";
          return { data: null, error: null };
        }
        case "record_publish_error":
          db.state && (db.state.last_error = args.p_error);
          return { data: null, error: null };
        case "get_publish_state":
          return { data: db.state ? [db.state] : [], error: null };
        case "finish_processing": {
          if (db.state?.state !== "live_verified") {
            return { data: null, error: { message: "not published yet" } };
          }
          // The real function deletes the row and writes the notification in
          // ONE transaction, so a second call finds nothing and cannot create a
          // second notification.
          if (db.finished) return { data: null, error: { message: "not found or not being processed" } };

          db.finished = true;
          db.state = null; // cascades away with the submission
          db.notifications.push({ outcome: "accepted", level_name: db.submission.level_name });

          if (db.loseFinishResponse) {
            // THE AMBIGUOUS CASE: PostgreSQL committed, the caller never hears.
            db.loseFinishResponse = false;
            return { data: null, error: { message: "fetch failed" } };
          }
          return { data: db.submission.storage_path, error: null };
        }
        default:
          return { data: null, error: { message: `unmocked rpc ${name}` } };
      }
    },
  };

  return db;
}

/* ------------------------------------------------------------------ */

const UUID_A = "11111111-1111-4111-8111-111111111111";
const UUID_B = "22222222-2222-4222-8222-222222222222";

function baseSubmission(over = {}) {
  return {
    submission_id: UUID_B,
    level_name: "Acheron",
    level_id: "73667628",
    level_creator: "ryamu",
    video_url: "https://www.youtube.com/watch?v=5DYQQKsUzFA",
    recorder: "Mega Hack",
    macro_author: "Zoink",
    storage_path: `${UUID_A}/${UUID_B}.gdr2`,
    submitted_by: UUID_A,
    status: "processing",
    ...over,
  };
}

/** A minimal but genuinely valid GDR2 header, so checkGdr2 accepts it. */
function fakeGdr2() {
  const parts = [];
  const varint = (n) => {
    const out = [];
    do {
      let b = n & 0x7f;
      n >>>= 7;
      if (n) b |= 0x80;
      out.push(b);
    } while (n);
    return Buffer.from(out);
  };
  const str = (s) => Buffer.concat([varint(s.length), Buffer.from(s, "latin1")]);

  parts.push(Buffer.from("GDR", "latin1"));
  parts.push(varint(2)); // version
  parts.push(str("")); // inputTag
  parts.push(str("Zoink")); // author
  parts.push(str("")); // description
  parts.push(Buffer.alloc(4)); // duration f32
  parts.push(varint(22)); // gameVersion
  parts.push(Buffer.alloc(8)); // framerate f64
  parts.push(varint(0)); // seed
  parts.push(varint(0)); // coins
  parts.push(Buffer.from([0])); // ldm
  parts.push(Buffer.from([0])); // platformer
  parts.push(str("MEGA")); // botName
  parts.push(varint(1)); // botVersion
  parts.push(varint(73667628)); // levelId
  parts.push(str("Acheron")); // levelName
  parts.push(varint(0)); // extensionSize
  parts.push(varint(0)); // deathCount
  parts.push(varint(0)); // totalInputs
  parts.push(varint(0)); // player1Count
  return new Uint8Array(Buffer.concat(parts));
}

/* ------------------------------------------------------------------ */
/* Run                                                                 */
/* ------------------------------------------------------------------ */

async function main() {
  console.log("Bundling the real modules from src ...\n");

  const names = await load("src/lib/publish/assetName.ts");
  const catalog = await load("src/lib/publish/catalog.ts");

  /* ---------------- 1. filename sanitiser ---------------- */
  console.log("Asset filenames");

  eq(
    "clean name",
    names.assetFileName({ macroAuthor: "Zoink", levelName: "Acheron", recorder: "Mega Hack" }),
    "Zoink-Acheron-Mega-Hack.gdr2",
  );
  eq(
    "xdBot casing preserved",
    names.assetFileName({ macroAuthor: "SomePlayer", levelName: "Bloodbath", recorder: "xdBot" }),
    "SomePlayer-Bloodbath-xdBot.gdr2",
  );
  eq(
    "spaces and punctuation collapse",
    names.assetFileName({ macroAuthor: "a  b!!c", levelName: "The   Nightmare", recorder: "xdBot" }),
    "a-b-c-The-Nightmare-xdBot.gdr2",
  );
  eq(
    "accents are folded, not dropped",
    names.assetFileName({ macroAuthor: "Krémal", levelName: "Café", recorder: "xdBot" }),
    "Kremal-Cafe-xdBot.gdr2",
  );
  eq(
    "path separators cannot survive",
    names.assetFileName({ macroAuthor: "../../etc", levelName: "a/b", recorder: "xdBot" }),
    "etc-a-b-xdBot.gdr2",
  );
  eq(
    "an entirely unusable segment falls back",
    names.assetFileName({ macroAuthor: "!!!", levelName: "???", recorder: "xdBot" }),
    "macro-level-xdBot.gdr2",
  );
  check(
    "very long input is capped",
    names.assetFileName({ macroAuthor: "x".repeat(400), levelName: "y".repeat(400), recorder: "xdBot" })
      .length <= 130,
  );
  eq(
    "deterministic",
    names.assetFileName({ macroAuthor: "Zoink", levelName: "Acheron", recorder: "Mega Hack" }),
    names.assetFileName({ macroAuthor: "Zoink", levelName: "Acheron", recorder: "Mega Hack" }),
  );
  eq("no control characters or spaces", /^[A-Za-z0-9._-]+$/.test(
    names.assetFileName({ macroAuthor: "a b\tc\n", levelName: "d e", recorder: "xdBot" }),
  ), true);

  eq("candidate 1 is clean", names.assetCandidate({ macroAuthor: "Z", levelName: "A", recorder: "xdBot" }, 1), "Z-A-xdBot.gdr2");
  eq("candidate 2 suffixes", names.assetCandidate({ macroAuthor: "Z", levelName: "A", recorder: "xdBot" }, 2), "Z-A-xdBot-2.gdr2");
  eq("candidate 3 suffixes", names.assetCandidate({ macroAuthor: "Z", levelName: "A", recorder: "xdBot" }, 3), "Z-A-xdBot-3.gdr2");

  eq("release tag uses the level id", names.releaseTagFor("73667628"), "level-73667628");
  check(
    "release tag refuses a non-numeric id",
    (() => {
      try {
        names.releaseTagFor("73667628; drop table");
        return false;
      } catch {
        return true;
      }
    })(),
  );

  /* ---------------- 2. catalog transformation ---------------- */
  console.log("Catalog");

  /*
   * Normalise line endings. Git stores this file with LF and GitHub serves LF,
   * which is what the publisher writes, but `.gitattributes` `text=auto` checks
   * it out as CRLF on Windows. Comparing against the raw checkout would test the
   * developer's platform rather than the serialiser.
   */
  const real = fs
    .readFileSync(path.join(ROOT, "data", "macros.json"), "utf8")
    .split("\r\n")
    .join("\n");
  const counts = catalog.catalogCounts(real);
  //
  // Derived, not hardcoded. The publisher adds to this file in production, so
  // any literal here is only true until the next macro is accepted -- these
  // assertions were written when the catalog held 106/212 and started failing
  // the moment Phase 3A published for real. What is actually being tested is
  // relative: one publication adds one macro, and a new level adds one level.
  //
  check("the catalog is non-empty", counts.levels > 0 && counts.macros >= counts.levels,
    `${counts.levels} levels / ${counts.macros} macros`);

  eq("serialiser reproduces the real file byte for byte", catalog.serialiseCatalog(JSON.parse(real)), real);

  const pubExisting = {
    levelId: "73667628",
    levelName: "Acheron",
    levelCreator: "ryamu",
    videoUrl: "https://www.youtube.com/watch?v=5DYQQKsUzFA",
    macroAuthor: "Zoink",
    recorder: "Mega Hack",
    downloadLink: "https://github.com/GDMacros-com/GDMacros-downloads/releases/download/level-73667628/Zoink-Acheron-Mega-Hack.gdr2",
    addedAt: "2026-08-21",
  };

  const r1 = catalog.applyPublication(real, pubExisting);
  check("existing level: applies", r1.ok && r1.changed && r1.mode === "existing-level");
  const after1 = catalog.catalogCounts(r1.json);
  eq("existing level: level count unchanged", after1.levels, counts.levels);
  eq("existing level: one macro added", after1.macros, counts.macros + 1);
  const acheron = JSON.parse(r1.json).find((l) => l.levelId === "73667628");
  eq("existing level: appended at the end", acheron.macros[acheron.macros.length - 1].downloadLink, pubExisting.downloadLink);
  eq("existing level: downloadType is GitHub", acheron.macros[acheron.macros.length - 1].downloadType, "GitHub");
  eq("existing level: name untouched", acheron.name, "Acheron");
  eq("existing level: description preserved", typeof acheron.description, "string");

  const r2 = catalog.applyPublication(r1.json, pubExisting);
  check("duplicate publication is a no-op", r2.ok && r2.changed === false && r2.mode === "already-present");
  eq("duplicate leaves the file unchanged", r2.json, r1.json);

  const pubNew = { ...pubExisting, levelId: "999888777", levelName: "Brand New", levelCreator: "Someone", downloadLink: pubExisting.downloadLink.replace("Zoink", "Someone") };
  const r3 = catalog.applyPublication(real, pubNew);
  check("new level: applies", r3.ok && r3.changed && r3.mode === "new-level");
  const created = JSON.parse(r3.json).find((l) => l.levelId === "999888777");
  eq("new level: key order matches the catalog convention", JSON.stringify(Object.keys(created)), JSON.stringify(["name", "creator", "levelId", "video", "addedAt", "macros"]));
  eq("new level: creator from trusted data", created.creator, "Someone");
  eq("new level: exactly one macro", created.macros.length, 1);
  eq("new level count", catalog.catalogCounts(r3.json).levels, counts.levels + 1);

  const r4 = catalog.applyPublication(real, { ...pubNew, videoUrl: null });
  const noVideo = JSON.parse(r4.json).find((l) => l.levelId === "999888777");
  eq("new level without a video omits the key", "video" in noVideo, false);

  check("refuses a non-https download link", catalog.applyPublication(real, { ...pubExisting, downloadLink: "http://x/y.gdr2" }).ok === false);
  check("refuses an unknown recorder", catalog.applyPublication(real, { ...pubExisting, recorder: "zBot" }).ok === false);
  check("refuses a non-numeric level id", catalog.applyPublication(real, { ...pubExisting, levelId: "abc" }).ok === false);
  check("refuses invalid json", catalog.applyPublication("{not json", pubExisting).ok === false);

  // The output must still satisfy the real validator's rules.
  const parsedNew = JSON.parse(r3.json);
  const bad = parsedNew.filter((l) => !l.name || !l.creator || !l.levelId || !(l.macros || []).length);
  eq("every level still has the required fields", bad.length, 0);

  /* ---------------- 3. the publisher, end to end ---------------- */
  console.log("Publisher");

  process.env.GITHUB_PUBLISHER_APP_ID = "12345";
  process.env.GITHUB_PUBLISHER_INSTALLATION_ID = "42";
  // A throwaway key generated here, used only to satisfy the JWT signer. It is
  // never a credential for anything: no GitHub App has ever seen it.
  const { generateKeyPairSync } = await import("node:crypto");
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  process.env.GITHUB_PUBLISHER_PRIVATE_KEY_BASE64 = Buffer.from(
    privateKey.export({ type: "pkcs1", format: "pem" }),
  ).toString("base64");
  process.env.NEXT_PUBLIC_SITE_URL = "https://www.gdmacros.com";

  const bytes = fakeGdr2();

  globalThis.__FAKE_BYTES__ = bytes;
  const pub = await load("src/lib/publish/publisher.ts");

  const realFetch = globalThis.fetch;

  async function scenario(fn) {
    const gh = makeGitHub();
    gh.catalog = { text: real, sha: "sha-0" };
    globalThis.fetch = gh.fetch;
    try {
      return await fn(gh);
    } finally {
      globalThis.fetch = realFetch;
    }
  }

  // -- happy path, brand new level release --
  await scenario(async (gh) => {
    const db = makeSupabase(baseSubmission());
    let r = await pub.runPublish(db.client, UUID_B);
    check("happy: waits for production", r.ok && r.stage === "waiting-for-production", JSON.stringify(r));
    eq("happy: release created", gh.releases.length, 1);
    eq("happy: release tag", gh.releases[0].tag_name, "level-73667628");
    eq("happy: release title is the level name", gh.releases[0].name, "Acheron");
    eq("happy: one asset", gh.assets.get(gh.releases[0].id).length, 1);
    eq("happy: asset filename", gh.assets.get(gh.releases[0].id)[0].name, "Zoink-Acheron-Mega-Hack.gdr2");
    eq("happy: one commit", gh.commits.length, 1);
    eq("happy: commit message", gh.commits[0].message, "Add Acheron macro by Zoink");
    eq("happy: state recorded", db.state.state, "catalog_committed");
    check("happy: not finalised while production is behind", db.finished === false);

    // production catches up
    gh.productionCommit = db.state.catalog_commit_sha;
    r = await pub.runPublish(db.client, UUID_B);
    check("happy: finalises once production matches", r.ok && r.finished === true, JSON.stringify(r));
    eq("happy: submission consumed", db.finished, true);
    eq("happy: exactly one accepted notification", db.notifications.length, 1);
    eq("happy: notification outcome", db.notifications[0].outcome, "accepted");
    eq("happy: still only one asset", gh.assets.get(gh.releases[0].id).length, 1);
    eq("happy: still only one commit", gh.commits.length, 1);
  });

  // -- production reports a DIFFERENT commit --
  await scenario(async (gh) => {
    const db = makeSupabase(baseSubmission());
    await pub.runPublish(db.client, UUID_B);
    gh.productionCommit = "f".repeat(40);
    const r = await pub.runPublish(db.client, UUID_B);
    check("wrong sha: keeps waiting", r.ok && r.stage === "waiting-for-production");
    eq("wrong sha: not finalised", db.finished, false);
    eq("wrong sha: no notification", db.notifications.length, 0);
  });

  // -- existing release is reused, filename collision gets a suffix --
  await scenario(async (gh) => {
    const db1 = makeSupabase(baseSubmission());
    await pub.runPublish(db1.client, UUID_B);
    const relId = gh.releases[0].id;

    // A second, genuinely different submission that sanitises to the same name.
    const db2 = makeSupabase(baseSubmission({ submission_id: "33333333-3333-4333-8333-333333333333" }));
    await pub.runPublish(db2.client, "33333333-3333-4333-8333-333333333333");

    eq("reuse: still one release", gh.releases.length, 1);
    const assetNames = gh.assets.get(relId).map((a) => a.name);
    eq("reuse: two assets on the same release", assetNames.length, 2);
    check("reuse: second asset got the -2 suffix", assetNames.includes("Zoink-Acheron-Mega-Hack-2.gdr2"), assetNames.join(","));
  });

  // -- release creation race: another publisher created the tag first --
  await scenario(async (gh) => {
    const db = makeSupabase(baseSubmission());
    // Fail the create with 422 already_exists, and have the tag appear.
    gh.failOnce(
      (url, m) => m === "POST" && /\/releases$/.test(url),
      422,
      { message: "Validation Failed", errors: [{ message: "already_exists" }] },
    );
    gh.releases.push({ id: 777, tag_name: "level-73667628", name: "Acheron", upload_url: "" });
    gh.assets.set(777, []);

    const r = await pub.runPublish(db.client, UUID_B);
    check("release race: recovers and continues", r.ok, JSON.stringify(r));
    eq("release race: no duplicate release", gh.releases.length, 1);
    eq("release race: asset landed on the existing release", gh.assets.get(777).length, 1);
  });

  // -- filename race: another publication takes the name between our listing
  //    and our upload, so GitHub answers 422 and the asset really is there --
  await scenario(async (gh) => {
    const db = makeSupabase(baseSubmission());
    const inner = gh.fetch;
    let raced = false;
    gh.fetch = async (url, init = {}) => {
      const method = (init.method ?? "GET").toUpperCase();
      if (!raced && method === "POST" && url.includes("name=Zoink-Acheron-Mega-Hack.gdr2")) {
        raced = true;
        // Somebody else's macro lands on that exact name, with DIFFERENT bytes.
        const relId = Number(url.match(/\/releases\/(\d+)\/assets/)[1]);
        const list = gh.assets.get(relId) ?? [];
        list.push({
          id: 9999,
          name: "Zoink-Acheron-Mega-Hack.gdr2",
          size: 12345,
          browser_download_url: "https://example.invalid/theirs.gdr2",
          digest: "sha256:" + "a".repeat(64),
        });
        gh.assets.set(relId, list);
        return json({ message: "Validation Failed", errors: [{ message: "already_exists" }] }, 422);
      }
      return inner(url, init);
    };
    globalThis.fetch = gh.fetch;

    const r = await pub.runPublish(db.client, UUID_B);
    check("filename race: recovers", r.ok, JSON.stringify(r));
    const assetNames = gh.assets.get(gh.releases[0].id).map((a) => a.name);
    check(
      "filename race: took the next free name",
      assetNames.includes("Zoink-Acheron-Mega-Hack-2.gdr2"),
      assetNames.join(","),
    );
    check(
      "filename race: did not overwrite the other macro",
      gh.assets.get(gh.releases[0].id).find((a) => a.id === 9999)?.browser_download_url ===
        "https://example.invalid/theirs.gdr2",
    );
  });

  // -- upload failures, by status --
  for (const [status, label] of [[401, "auth"], [403, "forbidden"], [429, "rate limited"], [500, "server error"]]) {
    await scenario(async (gh) => {
      const db = makeSupabase(baseSubmission());
      gh.failOnce((url, m) => m === "POST" && url.includes("/assets?name="), status, { message: "nope" });
      const r = await pub.runPublish(db.client, UUID_B);
      check(`upload ${status} (${label}): reports failure`, r.ok === false, JSON.stringify(r));
      eq(`upload ${status}: nothing committed`, gh.commits.length, 0);
      eq(`upload ${status}: not finalised`, db.finished, false);
      eq(`upload ${status}: no notification`, db.notifications.length, 0);
      check(`upload ${status}: state did not advance`, db.state.state === "not_started");
    });
  }

  // -- THE NASTY ONE: GitHub accepted the upload, the database write failed --
  await scenario(async (gh) => {
    const db = makeSupabase(baseSubmission());
    db.failNext = "record_publish_asset";
    const r1 = await pub.runPublish(db.client, UUID_B);
    check("upload-then-db-fail: reports failure", r1.ok === false);
    eq("upload-then-db-fail: the asset really is on GitHub", gh.assets.get(gh.releases[0].id).length, 1);
    eq("upload-then-db-fail: state still not_started", db.state.state, "not_started");

    // Retry. It must ADOPT the existing asset, not create a -2.
    const r2 = await pub.runPublish(db.client, UUID_B);
    check("upload-then-db-fail: retry succeeds", r2.ok, JSON.stringify(r2));
    const assetNames = gh.assets.get(gh.releases[0].id).map((a) => a.name);
    eq("upload-then-db-fail: still exactly one asset", assetNames.length, 1);
    eq("upload-then-db-fail: reused the original name", assetNames[0], "Zoink-Acheron-Mega-Hack.gdr2");
    eq("upload-then-db-fail: no -2 duplicate", assetNames.includes("Zoink-Acheron-Mega-Hack-2.gdr2"), false);
  });

  // -- catalog SHA conflict: someone else commits first --
  await scenario(async (gh) => {
    const db = makeSupabase(baseSubmission());
    let bumped = false;
    const inner = gh.fetch;
    gh.fetch = async (url, init = {}) => {
      // Just before our PUT, let a competing commit land.
      if (!bumped && (init.method ?? "GET") === "PUT" && url.includes("macros.json")) {
        bumped = true;
        gh.catalog = { text: gh.catalog.text, sha: "sha-99" };
      }
      return inner(url, init);
    };
    globalThis.fetch = gh.fetch;

    const r = await pub.runPublish(db.client, UUID_B);
    check("sha conflict: retried and succeeded", r.ok, JSON.stringify(r));
    eq("sha conflict: exactly one commit landed", gh.commits.length, 1);
    eq("sha conflict: one asset only", gh.assets.get(gh.releases[0].id).length, 1);
  });

  // -- retry after the catalog commit must not duplicate the entry --
  await scenario(async (gh) => {
    const db = makeSupabase(baseSubmission());
    await pub.runPublish(db.client, UUID_B);
    const commitsAfterFirst = gh.commits.length;
    await pub.runPublish(db.client, UUID_B);
    await pub.runPublish(db.client, UUID_B);
    eq("post-commit retry: no extra commits", gh.commits.length, commitsAfterFirst);
    eq("post-commit retry: no extra assets", gh.assets.get(gh.releases[0].id).length, 1);
    const parsed = JSON.parse(gh.catalog.text);
    const lvl = parsed.find((l) => l.levelId === "73667628");
    // Count THIS publication, not every GitHub-hosted macro: since the
    // MediaFire migration the catalog legitimately contains 212 of those.
    const hits = lvl.macros.filter((m) => m.author === "Zoink").length;
    eq("post-commit retry: macro appears exactly once", hits, 1);
  });

  // -- commit recorded but db write failed, then recovery --
  await scenario(async (gh) => {
    const db = makeSupabase(baseSubmission());
    db.failNext = "record_publish_commit";
    const r1 = await pub.runPublish(db.client, UUID_B);
    check("commit-then-db-fail: reports failure", r1.ok === false);
    eq("commit-then-db-fail: the commit really landed", gh.commits.length, 1);

    const r2 = await pub.runPublish(db.client, UUID_B);
    check("commit-then-db-fail: retry recovers", r2.ok, JSON.stringify(r2));
    eq("commit-then-db-fail: no second commit", gh.commits.length, 1);
    eq("commit-then-db-fail: state advanced", db.state.state, "catalog_committed");
    check("commit-then-db-fail: recovered a real sha", /^[0-9a-f]{40}$/.test(db.state.catalog_commit_sha));
  });

  // -- two admins publishing different macros for the same NEW level --
  await scenario(async (gh) => {
    const dbA = makeSupabase(baseSubmission());
    const dbB = makeSupabase(baseSubmission({
      submission_id: "44444444-4444-4444-8444-444444444444",
      macro_author: "OtherPlayer",
      recorder: "xdBot",
    }));
    const [ra, rb] = await Promise.all([
      pub.runPublish(dbA.client, UUID_B),
      pub.runPublish(dbB.client, "44444444-4444-4444-8444-444444444444"),
    ]);
    check("concurrent: both succeeded", ra.ok && rb.ok, JSON.stringify([ra, rb]));
    eq("concurrent: exactly one release for the level", gh.releases.length, 1);
    const list = gh.assets.get(gh.releases[0].id);
    eq("concurrent: two distinct assets", list.length, 2);
    eq("concurrent: distinct filenames", new Set(list.map((a) => a.name)).size, 2);
    const lvl = JSON.parse(gh.catalog.text).find((l) => l.levelId === "73667628");
    const gitHubMacros = lvl.macros.filter((m) => ["Zoink", "OtherPlayer"].includes(m.author));
    eq("concurrent: both macros in the catalog", gitHubMacros.length, 2);
    eq("concurrent: neither overwrote the other", gh.commits.length, 2);
  });

  /* ---------------- resuming a partially published submission ------------ */
  //
  // The UI half of resuming (the modal reading persisted state on mount and
  // rendering the right step) needs DOM test infrastructure this project does
  // not have, and is exercised manually during the controlled live test.
  //
  // The half that actually carries risk is the server: a resume must do ONLY
  // the remaining work and must never redo an irreversible step. That is
  // testable here, precisely, by counting the GitHub calls a resume makes.

  const uploadCalls = (gh) => gh.calls.filter((c) => /^POST .*\/assets\?name=/.test(c)).length;
  const commitCalls = (gh) => gh.calls.filter((c) => /^PUT .*macros\.json$/.test(c)).length;
  const releaseCreates = (gh) => gh.calls.filter((c) => /^POST .*\/releases$/.test(c)).length;

  // Resume from asset_uploaded: must commit, must NOT upload again.
  await scenario(async (gh) => {
    const db = makeSupabase(baseSubmission());
    db.failNext = "record_publish_commit";
    await pub.runPublish(db.client, UUID_B); // uploads, commits, fails to record
    const uploadsAfterFirst = uploadCalls(gh);
    const commitsAfterFirst = commitCalls(gh);
    gh.calls.length = 0;

    const r = await pub.runPublish(db.client, UUID_B);
    check("resume from asset_uploaded: succeeds", r.ok, JSON.stringify(r));
    eq("resume from asset_uploaded: ZERO new uploads", uploadCalls(gh), 0);
    eq("resume from asset_uploaded: ZERO new releases created", releaseCreates(gh), 0);
    eq("resume: total uploads across both attempts is still 1", uploadsAfterFirst, 1);
    eq("resume: total commits across both attempts is still 1", commitsAfterFirst, 1);
    eq("resume: one asset on the release", gh.assets.get(gh.releases[0].id).length, 1);
  });

  // Resume from catalog_committed: must only poll production.
  await scenario(async (gh) => {
    const db = makeSupabase(baseSubmission());
    await pub.runPublish(db.client, UUID_B);
    gh.calls.length = 0;

    const r = await pub.runPublish(db.client, UUID_B); // production still behind
    check("resume from catalog_committed: still waiting", r.ok && r.stage === "waiting-for-production");
    eq("resume from catalog_committed: ZERO uploads", uploadCalls(gh), 0);
    eq("resume from catalog_committed: ZERO commits", commitCalls(gh), 0);
    eq("resume from catalog_committed: ZERO releases created", releaseCreates(gh), 0);
    check("resume from catalog_committed: only checked /api/version",
      gh.calls.every((c) => /api\/version|installations|access_tokens/.test(c)), gh.calls.join(" | "));

    // And the reported state is enough for the UI to resume at the right step.
    eq("resume reports the persisted stage", r.stage, "waiting-for-production");
    eq("resume reports the asset name", r.assetName, "Zoink-Acheron-Mega-Hack.gdr2");
    check("resume reports the commit sha", /^[0-9a-f]{40}$/.test(r.commitSha ?? ""), r.commitSha);
  });

  // A second admin resuming sees the same state and does not redo work.
  await scenario(async (gh) => {
    const dbA = makeSupabase(baseSubmission());
    await pub.runPublish(dbA.client, UUID_B);
    gh.calls.length = 0;

    // A different admin session, same trusted database state.
    const dbB = makeSupabase(baseSubmission());
    dbB.state = dbA.state;
    dbB.finished = dbA.finished;
    dbB.notifications = dbA.notifications;
    gh.productionCommit = dbA.state.catalog_commit_sha;

    const r = await pub.runPublish(dbB.client, UUID_B);
    check("another admin can finish it", r.ok && r.finished === true, JSON.stringify(r));
    eq("another admin: ZERO new uploads", uploadCalls(gh), 0);
    eq("another admin: ZERO new commits", commitCalls(gh), 0);
    eq("another admin: exactly one notification", dbB.notifications.length, 1);
  });

  /* ---------------- checkpoint E: finish_processing fails ---------------- */
  //
  // The macro is published and live. Only closing the submission fails. This is
  // the last stage, so getting it wrong would either abandon a real submission
  // or double-publish one.

  // E1. GENUINE failure: the row is still there and nothing was finalised.
  await scenario(async (gh) => {
    const db = makeSupabase(baseSubmission());
    await pub.runPublish(db.client, UUID_B);
    gh.productionCommit = db.state.catalog_commit_sha;

    const assetsBefore = gh.assets.get(gh.releases[0].id).length;
    const commitsBefore = gh.commits.length;

    db.failNext = "finish_processing";
    const r = await pub.runPublish(db.client, UUID_B);

    check("E1 genuine finish failure: reported as retryable", r.ok === false, JSON.stringify(r));
    eq("E1: stage is finalising", r.stage, "finalising");
    check("E1: message says nothing was lost", /nothing was lost/i.test(r.error ?? ""), r.error);
    eq("E1: submission NOT consumed", db.finished, false);
    eq("E1: NO notification created", db.notifications.length, 0);
    eq("E1: no duplicate asset", gh.assets.get(gh.releases[0].id).length, assetsBefore);
    eq("E1: no duplicate commit", gh.commits.length, commitsBefore);
    eq("E1: state still live_verified", db.state.state, "live_verified");

    // Retry continues safely from live_verified.
    const r2 = await pub.runPublish(db.client, UUID_B);
    check("E1 retry: finishes", r2.ok && r2.finished === true, JSON.stringify(r2));
    eq("E1 retry: submission consumed", db.finished, true);
    eq("E1 retry: exactly one notification", db.notifications.length, 1);
    eq("E1 retry: still one asset", gh.assets.get(gh.releases[0].id).length, assetsBefore);
    eq("E1 retry: still one commit", gh.commits.length, commitsBefore);
    const lvl = JSON.parse(gh.catalog.text).find((l) => l.levelId === "73667628");
    eq("E1 retry: macro appears exactly once in the catalog",
      lvl.macros.filter((m) => m.author === "Zoink").length, 1);
  });

  // E2. AMBIGUOUS: the transaction committed, the response was lost.
  await scenario(async (gh) => {
    const db = makeSupabase(baseSubmission());
    await pub.runPublish(db.client, UUID_B);
    gh.productionCommit = db.state.catalog_commit_sha;

    db.loseFinishResponse = true;
    const r = await pub.runPublish(db.client, UUID_B);

    check("E2 lost response: reported as COMPLETED, not as a failure", r.ok === true, JSON.stringify(r));
    eq("E2: finished is true", r.finished, true);
    eq("E2: state is finished", r.state, "finished");
    check("E2: note explains the confirmation was lost", /lost in transit/i.test(r.note ?? ""), r.note);
    check("E2: no error is presented", !r.error, r.error);
    eq("E2: the work really did happen", db.finished, true);
    eq("E2: exactly ONE notification, not two", db.notifications.length, 1);
    eq("E2: no duplicate asset", gh.assets.get(gh.releases[0].id).length, 1);
    eq("E2: no duplicate commit", gh.commits.length, 1);
  });

  // E3. The inference must not fire when the row is still present.
  await scenario(async () => {
    const db = makeSupabase(baseSubmission());
    await pub.runPublish(db.client, UUID_B);
    db.state.catalog_commit_sha && (db.state.state = "live_verified");
    db.failNext = "finish_processing";
    const r = await pub.runPublish(db.client, UUID_B);
    check("E3: a present row is never reported as finished", r.finished !== true, JSON.stringify(r));
  });

  // E4. "I could not tell" must never become "it is finished".
  await scenario(async (gh) => {
    const db = makeSupabase(baseSubmission());
    await pub.runPublish(db.client, UUID_B);
    gh.productionCommit = db.state.catalog_commit_sha; // reach live_verified
    db.failNext = "finish_processing";
    db.failSelect = true; // and the existence check itself fails
    const r = await pub.runPublish(db.client, UUID_B);
    check("E4: unreadable state is treated as NOT finished", r.ok === false && r.finished !== true,
      JSON.stringify(r));
    eq("E4: no notification", db.notifications.length, 0);
  });

  // E5. A later attempt, after the browser was closed, has no trusted memory.
  //     It must not claim success, but must stop saying something misleading.
  await scenario(async (gh) => {
    const db = makeSupabase(baseSubmission());
    await pub.runPublish(db.client, UUID_B);
    gh.productionCommit = db.state.catalog_commit_sha;
    await pub.runPublish(db.client, UUID_B);
    eq("E5 setup: submission consumed", db.finished, true);

    const r = await pub.runPublish(db.client, UUID_B);
    check("E5: refused", r.ok === false, JSON.stringify(r));
    check("E5: does NOT claim it was published", r.finished !== true);
    check("E5: says the row is gone and to refresh",
      /no longer in the review queue/i.test(r.error ?? ""), r.error);
    eq("E5: still exactly one notification", db.notifications.length, 1);
    eq("E5: no extra asset", gh.assets.get(gh.releases[0].id).length, 1);
    eq("E5: no extra commit", gh.commits.length, 1);
  });

  // -- authorisation --
  await scenario(async () => {
    const db = makeSupabase(baseSubmission());
    db.isAdmin = false;
    const r = await pub.runPublish(db.client, UUID_B);
    check("non-admin: refused", r.ok === false, JSON.stringify(r));
    check("non-admin: told nothing useful", /permission|not being processed/i.test(r.error ?? ""));
  });

  await scenario(async (gh) => {
    const db = makeSupabase(baseSubmission({ status: "pending" }));
    const r = await pub.runPublish(db.client, UUID_B);
    check("pending submission: refused", r.ok === false);
    eq("pending submission: nothing uploaded", gh.releases.length, 0);
  });

  // -- a finished submission cannot be published again --
  await scenario(async (gh) => {
    const db = makeSupabase(baseSubmission());
    await pub.runPublish(db.client, UUID_B);
    gh.productionCommit = db.state.catalog_commit_sha;
    await pub.runPublish(db.client, UUID_B);
    eq("finished: consumed", db.finished, true);
    const r = await pub.runPublish(db.client, UUID_B);
    check("finished: a further publish is refused", r.ok === false);
    eq("finished: exactly one notification ever", db.notifications.length, 1);
  });

  // -- the file no longer validates --
  await scenario(async (gh) => {
    const db = makeSupabase(baseSubmission());
    globalThis.__FAKE_BYTES__ = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const r = await pub.runPublish(db.client, UUID_B);
    globalThis.__FAKE_BYTES__ = bytes;
    check("bad file: refused", r.ok === false);
    eq("bad file: nothing uploaded", gh.releases.length, 0);
    eq("bad file: nothing committed", gh.commits.length, 0);
    eq("bad file: not finalised", db.finished, false);
  });

  /* ---------------- results ---------------- */
  console.log("");
  for (const f of failures) console.error("FAIL  " + f);
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
