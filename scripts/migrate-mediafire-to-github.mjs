/**
 * Migrates the catalog's existing MediaFire macro files to GitHub Releases in
 * GDMacros-com/GDMacros-downloads, using the exact conventions the live Phase 3A
 * publisher uses.
 *
 *   node scripts/migrate-mediafire-to-github.mjs --inventory
 *   node scripts/migrate-mediafire-to-github.mjs --upload [--concurrency 3] [--limit N]
 *   node scripts/migrate-mediafire-to-github.mjs --verify
 *   node scripts/migrate-mediafire-to-github.mjs --status
 *   node scripts/migrate-mediafire-to-github.mjs --prepare-catalog
 *
 * WHAT THIS DOES NOT DO
 * ---------------------
 * It never touches `data/macros.json`, never commits, never deploys and never
 * deletes anything on MediaFire. Uploading a copy to GitHub is additive: the
 * site keeps serving the MediaFire URLs until a separate, reviewed cutover pass
 * switches them. That is what makes this migration safe to run at any time.
 *
 * WHY IT REUSES THE PUBLISHER'S MODULES
 * ------------------------------------
 * Release tags, titles and asset filenames come from `src/lib/publish/assetName`
 * and `src/lib/github/releases`, the same code the automatic publisher runs. A
 * second implementation of the naming convention would drift, and the whole
 * point is that a migrated file is indistinguishable from a published one.
 *
 * RESUMABILITY
 * ------------
 * 212 files is far too many to redo. Every entry's progress is persisted in
 * `.migration/mediafire-to-github.json`, written atomically, and each stage
 * checks that state before acting. Killing this at any moment and re-running it
 * continues rather than restarts, and never uploads a second copy.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const STATE_DIR = path.join(ROOT, ".migration");
const STATE_FILE = path.join(STATE_DIR, "mediafire-to-github.json");
const MAPPING_FILE = path.join(STATE_DIR, "url-mapping.json");
const REPORT_FILE = path.join(STATE_DIR, "report.txt");

/** Sanity ceiling. GitHub allows far more; this only catches something absurd. */
const MAX_BYTES = 25 * 1024 * 1024;
/** The current submission limit. Exceeding it is a NOTE, not a failure: these
 *  files were published by hand before that limit existed. */
const SUBMISSION_LIMIT = 2 * 1024 * 1024;

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

/* ------------------------------------------------------------------ */
/* Loading the real production modules                                 */
/* ------------------------------------------------------------------ */

const STUB_DIR = path.join(ROOT, "node_modules", ".gdm-test-stubs");
fs.mkdirSync(STUB_DIR, { recursive: true });
fs.writeFileSync(path.join(STUB_DIR, "server-only.mjs"), "export {};\n");

const { createJiti } = await import(
  pathToFileURL(path.join(ROOT, "node_modules", "jiti", "lib", "jiti.mjs")).href
);
const jiti = createJiti(path.join(ROOT, "scripts", "migrate.mjs"), {
  alias: {
    "server-only": path.join(STUB_DIR, "server-only.mjs"),
    "@": path.join(ROOT, "src"),
  },
  interopDefault: true,
});
const load = (rel) => jiti.import(path.join(ROOT, rel));

export const modules = {
  assetName: await load("src/lib/publish/assetName.ts"),
  releases: await load("src/lib/github/releases.ts"),
  client: await load("src/lib/github/client.ts"),
  config: await load("src/lib/github/config.ts"),
  gdr2: await load("src/lib/gdr2.ts"),
};

/* ------------------------------------------------------------------ */
/* State, written atomically                                           */
/* ------------------------------------------------------------------ */

/**
 * Temp file then rename, so a crash mid-write can never leave a truncated JSON
 * behind. The same discipline the desktop app uses for the catalog itself.
 */
let saveCounter = 0;

/** Sleeps synchronously. The write path is sync on purpose; see saveState. */
function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

export function saveState(state) {
  fs.mkdirSync(STATE_DIR, { recursive: true });

  // A unique temp name per call. Sharing one name across concurrent workers is
  // how the first run of this tool died: same pid, same temp path, two writers.
  const tmp = `${STATE_FILE}.tmp-${process.pid}-${saveCounter++}`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2) + "\n");

  /*
   * Windows can transiently refuse a rename over an existing file with EPERM,
   * typically because a virus scanner still holds the destination open from the
   * save a moment earlier. It clears in milliseconds, so retry briefly rather
   * than losing progress that is expensive to recompute.
   */
  for (let attempt = 1; ; attempt++) {
    try {
      fs.renameSync(tmp, STATE_FILE);
      return;
    } catch (e) {
      if (attempt >= 12 || (e.code !== "EPERM" && e.code !== "EBUSY" && e.code !== "EACCES")) {
        fs.rmSync(tmp, { force: true });
        throw e;
      }
      sleepSync(25 * attempt);
    }
  }
}

export function loadState() {
  if (!fs.existsSync(STATE_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Inventory and deterministic filename planning                       */
/* ------------------------------------------------------------------ */

/**
 * A stable identity for one catalog macro.
 *
 * Level id plus the macro's index within that level. Both come from the file and
 * neither moves unless somebody edits the catalog, which is exactly when we DO
 * want the identity to change. The MediaFire URL is carried alongside as a
 * checksum, so a reordered catalog is detected rather than silently mismatched.
 *
 * Content hash is deliberately NOT part of the identity: two legitimate macros
 * can be byte-identical, and conflating them is the bug Phase 3A already paid
 * for once.
 */
export function migrationId(levelId, index) {
  return `${levelId}#${index}`;
}

/**
 * Plans every filename up front, in catalog order.
 *
 * Deterministic by construction: the same catalog always produces the same
 * plan, so a resumed run reserves the same names and a `-2` never moves to a
 * different macro. `existingByTag` lets names already present in a release (from
 * real publisher use) reserve their slot first, so the migration allocates
 * around them instead of colliding.
 */
export function planInventory(catalog, existingByTag = {}) {
  const entries = [];
  const used = new Map(); // tag -> Set(taken filenames)

  const takenFor = (tag) => {
    if (!used.has(tag)) used.set(tag, new Set(existingByTag[tag] ?? []));
    return used.get(tag);
  };

  catalog.forEach((level, levelIndex) => {
    const levelId = String(level.levelId ?? "");
    const macros = Array.isArray(level.macros) ? level.macros : [];

    macros.forEach((macro, index) => {
      const issues = [];
      if (!levelId || !/^[0-9]{1,12}$/.test(levelId)) issues.push("level id is not numeric");
      if (!level.name) issues.push("level has no name");
      if (!macro.author) issues.push("macro has no author");
      if (!macro.recorder) issues.push("macro has no recorder");

      const link = String(macro.downloadLink ?? "");
      if (!link) issues.push("empty downloadLink");
      else if (!/^https?:\/\//i.test(link)) issues.push("downloadLink is not a URL");

      const host = (() => {
        try {
          return new URL(link).hostname.replace(/^www\./, "");
        } catch {
          return null;
        }
      })();

      let tag = null;
      let filename = null;
      if (issues.length === 0) {
        tag = modules.assetName.releaseTagFor(levelId);
        const base = modules.assetName.assetBaseName({
          macroAuthor: macro.author,
          levelName: level.name,
          recorder: macro.recorder,
        });
        const taken = takenFor(tag);
        for (let n = 1; n <= 200; n++) {
          const candidate = n === 1 ? `${base}.gdr2` : `${base}-${n}.gdr2`;
          if (!taken.has(candidate)) {
            filename = candidate;
            taken.add(candidate);
            break;
          }
        }
        if (!filename) issues.push("could not allocate a filename");
      }

      entries.push({
        id: migrationId(levelId, index),
        levelIndex,
        index,
        levelId,
        levelName: level.name ?? null,
        levelCreator: level.creator ?? null,
        video: level.video ?? null,
        macroAuthor: macro.author ?? null,
        recorder: macro.recorder ?? null,
        downloadType: macro.downloadType ?? null,
        sourceUrl: link || null,
        sourceHost: host,
        releaseTag: tag,
        plannedFilename: filename,
        issues,
        /* progress */
        status: issues.length ? "blocked" : "pending",
        size: null,
        sha256: null,
        releaseId: null,
        assetId: null,
        assetName: null,
        browserDownloadUrl: null,
        remoteDigest: null,
        verified: false,
        gdr2: null,
        note: null,
        error: null,
        attempts: 0,
      });
    });
  });

  return entries;
}

/* ------------------------------------------------------------------ */
/* MediaFire                                                           */
/* ------------------------------------------------------------------ */

async function fetchWithUa(url, { accept = "*/*", timeoutMs = 90_000 } = {}) {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: accept },
    redirect: "follow",
    signal: AbortSignal.timeout(timeoutMs),
  });
  return res;
}

/**
 * Turns a public MediaFire landing page into the direct file URL.
 *
 * MediaFire serves an ordinary page containing an anchor to a
 * `download####.mediafire.com` host. Nothing is scrambled, no account is needed
 * and no access control is involved, so plain HTML parsing is enough and
 * browser automation would be pure overhead. Verified against the real pages
 * before this was written.
 */
export function extractDirectUrl(html) {
  const direct = html.match(/href="(https:\/\/download[^"]+)"/);
  if (direct) return direct[1];
  // Older pages occasionally carry the same URL base64-encoded instead.
  const scrambled = html.match(/data-scrambled-url="([^"]+)"/);
  if (scrambled) {
    try {
      const decoded = Buffer.from(scrambled[1], "base64").toString("utf8");
      if (/^https:\/\/download/.test(decoded)) return decoded;
    } catch {
      /* fall through */
    }
  }
  return null;
}

export async function downloadFromMediaFire(url) {
  const page = await fetchWithUa(url, { accept: "text/html" });
  if (!page.ok) throw new Error(`landing page HTTP ${page.status}`);
  const html = await page.text();

  if (/file (has been )?(removed|deleted)|no longer available|Invalid or Deleted File/i.test(html)) {
    throw new Error("MediaFire reports the file is deleted or unavailable");
  }

  const direct = extractDirectUrl(html);
  if (!direct) throw new Error("no direct download link on the landing page");

  const res = await fetchWithUa(direct);
  if (!res.ok) throw new Error(`direct download HTTP ${res.status}`);

  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared && declared > MAX_BYTES) throw new Error(`file is ${declared} bytes, over the cap`);

  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength === 0) throw new Error("downloaded zero bytes");
  if (bytes.byteLength > MAX_BYTES) throw new Error(`file is ${bytes.byteLength} bytes, over the cap`);

  // An HTML body here means we followed a page, not a file.
  const head = Buffer.from(bytes.subarray(0, 64)).toString("latin1").toLowerCase();
  if (head.includes("<!doctype") || head.includes("<html")) {
    throw new Error("received HTML instead of a file");
  }

  return { bytes, directHost: new URL(direct).hostname };
}

export const sha256 = (bytes) =>
  crypto.createHash("sha256").update(Buffer.from(bytes)).digest("hex");

/* ------------------------------------------------------------------ */
/* Retry                                                               */
/* ------------------------------------------------------------------ */

const PERMANENT = /deleted|unavailable|no direct download|HTML instead|not a valid|too small|damaged|over the cap|zero bytes|HTTP 40[34]/i;

export function isPermanent(message) {
  return PERMANENT.test(String(message ?? ""));
}

async function withRetry(label, fn, { attempts = 4 } = {}) {
  let lastErr;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const msg = e instanceof Error ? e.message : String(e);
      if (isPermanent(msg) || i === attempts) throw e;
      // Bounded exponential backoff for 429 / 5xx / network wobble.
      const wait = Math.min(30_000, 1000 * 2 ** i) + Math.floor(Math.random() * 500);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastErr;
}

/* ------------------------------------------------------------------ */
/* Pool                                                                */
/* ------------------------------------------------------------------ */

async function pool(items, size, worker) {
  let cursor = 0;
  const runners = Array.from({ length: Math.max(1, size) }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      await worker(items[i], i);
    }
  });
  await Promise.all(runners);
}

/* ------------------------------------------------------------------ */
/* Commands                                                            */
/* ------------------------------------------------------------------ */

function readCatalog() {
  return JSON.parse(fs.readFileSync(path.join(ROOT, "data", "macros.json"), "utf8"));
}

/**
 * Every release in the downloads repo, across ALL pages.
 *
 * The catalog has 106 levels and therefore 106 releases, so a single
 * `per_page=100` request silently drops six of them. A truncated list here
 * would make the planner think a filename is free when it is not.
 */
export async function listAllReleases() {
  const { ghFetch } = modules.client;
  const { GITHUB_API, GITHUB_ORG, DOWNLOADS_REPO } = modules.config;
  const all = [];
  for (let page = 1; page <= 20; page++) {
    const res = await ghFetch({
      url: `${GITHUB_API}/repos/${GITHUB_ORG}/${DOWNLOADS_REPO}/releases?per_page=100&page=${page}`,
    });
    const batch = res.data ?? [];
    all.push(...batch);
    if (batch.length < 100) break;
  }
  return all;
}

/** Every asset already present in the downloads repo, grouped by release tag. */
async function existingAssetsByTag() {
  const out = {};
  const releases = {};
  for (const r of await listAllReleases()) {
    const assets = await modules.releases.listReleaseAssets(r.id);
    out[r.tag_name] = assets.map((a) => a.name);
    releases[r.tag_name] = { id: r.id, name: r.name, assets };
  }
  return { names: out, releases };
}

/**
 * How many catalog macros still point at MediaFire.
 *
 * This is the whole safety question after the cutover. The migration finished
 * on 2026-08-21 and the catalog now holds 212 GitHub URLs, so the honest answer
 * for the foreseeable future is zero, and "zero" must mean "there is nothing to
 * do" rather than "start again".
 */
export function mediafireCount(catalog) {
  return catalog.reduce(
    (n, l) => n + (l.macros ?? []).filter((m) => m.downloadType === "MediaFire").length, 0);
}

async function cmdInventory() {
  const catalog = readCatalog();

  /*
   * Refuse to rewrite state when there is nothing to migrate.
   *
   * Rebuilding the inventory against today's catalog would replace every entry
   * with a GitHub-sourced one, and because progress only carries forward when
   * the source URL still matches, that would silently DISCARD the record of the
   * completed migration: the hashes, asset ids and verified mapping. That record
   * is the reason this tool is being kept.
   */
  if (mediafireCount(catalog) === 0) {
    console.log("Nothing to migrate: the catalog contains 0 MediaFire entries.");
    console.log("The MediaFire migration is already complete.");
    console.log("");
    console.log("Refusing to rebuild the inventory, because doing so would overwrite the");
    console.log("completed migration state in .migration/ and lose the verified mapping.");
    console.log("Use --status to read it, or --verify to re-check the uploaded assets.");
    return;
  }

  console.log("Catalog");
  const macroCount = catalog.reduce((n, l) => n + (l.macros?.length ?? 0), 0);
  console.log("  levels :", catalog.length);
  console.log("  macros :", macroCount);

  const byHost = {};
  for (const l of catalog) for (const m of l.macros ?? []) {
    byHost[m.downloadType] = (byHost[m.downloadType] ?? 0) + 1;
  }
  console.log("  hosts  :", JSON.stringify(byHost));

  console.log("\nReading what already exists on GitHub ...");
  const existing = await existingAssetsByTag();
  const existingCount = Object.values(existing.names).reduce((n, a) => n + a.length, 0);
  console.log("  releases:", Object.keys(existing.names).length, "| assets:", existingCount);

  const entries = planInventory(catalog, existing.names);
  const mediafire = entries.filter((e) => e.sourceHost === "mediafire.com");
  const github = entries.filter((e) => e.sourceHost === "github.com");
  const blocked = entries.filter((e) => e.issues.length);

  console.log("\nInventory");
  console.log("  entries        :", entries.length);
  console.log("  on MediaFire   :", mediafire.length);
  console.log("  already GitHub :", github.length);
  console.log("  blocked        :", blocked.length);
  for (const b of blocked) console.log("    -", b.id, b.levelName, "|", b.issues.join("; "));

  const urls = entries.map((e) => e.sourceUrl).filter(Boolean);
  const dupeUrls = urls.filter((u, i) => urls.indexOf(u) !== i);
  console.log("  duplicate source URLs:", new Set(dupeUrls).size);
  for (const u of new Set(dupeUrls)) console.log("    -", u);

  const planned = entries.filter((e) => e.plannedFilename).map((e) => `${e.releaseTag}/${e.plannedFilename}`);
  const dupePlan = planned.filter((p, i) => planned.indexOf(p) !== i);
  console.log("  duplicate planned paths:", new Set(dupePlan).size);
  for (const p of new Set(dupePlan)) console.log("    -", p);

  const suffixed = entries.filter((e) => /-\d+\.gdr2$/.test(e.plannedFilename ?? ""));
  console.log("  names needing a -N suffix:", suffixed.length);
  for (const s of suffixed) console.log(`    - ${s.releaseTag}/${s.plannedFilename}  (${s.levelName} / ${s.macroAuthor} / ${s.recorder})`);

  const tags = new Set(entries.map((e) => e.releaseTag).filter(Boolean));
  console.log("  distinct releases needed:", tags.size);

  const prev = loadState();
  const state = {
    createdAt: prev?.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    catalogLevels: catalog.length,
    catalogMacros: macroCount,
    entries: entries.map((e) => {
      // Carry forward progress for an entry whose identity AND source URL match.
      const old = prev?.entries?.find((o) => o.id === e.id && o.sourceUrl === e.sourceUrl);
      return old ? { ...e, ...pickProgress(old) } : e;
    }),
  };
  saveState(state);
  console.log("\nstate written:", path.relative(ROOT, STATE_FILE));
  return { entries, blocked, dupePlan, dupeUrls };
}

function pickProgress(o) {
  const keys = ["status", "size", "sha256", "releaseId", "assetId", "assetName",
    "browserDownloadUrl", "remoteDigest", "verified", "gdr2", "note", "error", "attempts"];
  const out = {};
  for (const k of keys) if (o[k] !== undefined) out[k] = o[k];
  return out;
}

async function cmdUpload({ concurrency = 3, limit = 0 } = {}) {
  /*
   * POST-CUTOVER GUARD. The catalog is the authority on whether there is work,
   * not the state file. With zero MediaFire entries this exits without touching
   * GitHub at all.
   *
   * There is deliberately no override flag. If a MediaFire entry ever appears in
   * the catalog again the guard simply stops applying, so an override would only
   * exist to defeat a check that already gets out of the way on its own.
   */
  const catalog = readCatalog();
  const remaining = mediafireCount(catalog);
  if (remaining === 0) {
    console.log("Nothing to migrate: the catalog contains 0 MediaFire entries.");
    console.log("The MediaFire migration is already complete and production serves GitHub Releases.");
    console.log("No release was created and no asset was uploaded.");
    return;
  }
  console.log(`${remaining} MediaFire entr${remaining === 1 ? "y" : "ies"} in the catalog\n`);

  const state = loadState();
  if (!state) throw new Error("no state; run --inventory first");

  const todo = state.entries.filter(
    (e) =>
      // Only MediaFire-sourced entries are migration work. A GitHub URL in the
      // catalog is a FINISHED migration, and must never be mistaken for a new
      // one just because a state rebuild left it looking pending.
      e.sourceHost === "mediafire.com" &&
      e.status !== "blocked" &&
      !(e.status === "uploaded" && e.verified) &&
      e.status !== "failed-permanent",
  );
  const work = limit ? todo.slice(0, limit) : todo;
  console.log(`uploading ${work.length} of ${state.entries.length} entries, concurrency ${concurrency}\n`);

  let done = 0;
  const flush = () => {
    state.updatedAt = new Date().toISOString();
    saveState(state);
  };

  // Releases are created serially per tag to avoid two workers racing to make
  // the same one. createLevelRelease also absorbs the race, but not racing at
  // all is cheaper and keeps the log readable.
  const releaseCache = new Map();
  const releaseLocks = new Map();
  async function getRelease(tag, levelName, levelId) {
    if (releaseCache.has(tag)) return releaseCache.get(tag);
    if (releaseLocks.has(tag)) return releaseLocks.get(tag);
    const p = (async () => {
      const existing = await modules.releases.getReleaseByTag(tag);
      const rel = existing ?? (await modules.releases.createLevelRelease(tag, levelName, levelId));
      releaseCache.set(tag, rel);
      return rel;
    })();
    releaseLocks.set(tag, p);
    return p;
  }

  await pool(work, concurrency, async (entry) => {
    const label = `${entry.levelName} / ${entry.macroAuthor} / ${entry.recorder}`;
    entry.attempts = (entry.attempts ?? 0) + 1;
    /*
     * The file bytes live HERE, in a local, and are never attached to `entry`.
     * They were once, and the first long run died on
     * `RangeError: Invalid string length` when saveState tried to JSON-encode a
     * 450 KB byte array that a flush caught mid-upload. State is metadata only.
     */
    let fileBytes = null;

    try {
      /* 1. bytes */
      if (!entry.sha256) {
        const { bytes } = await withRetry("download", () => downloadFromMediaFire(entry.sourceUrl));
        const check = modules.gdr2.checkGdr2(bytes);
        if (!check.ok) throw new Error(`not a valid .gdr2: ${check.error}`);
        entry.size = bytes.byteLength;
        entry.sha256 = sha256(bytes);
        entry.gdr2 = { version: check.info.version, botName: check.info.botName, levelId: check.info.levelId };
        const notes = [];
        if (bytes.byteLength > SUBMISSION_LIMIT) {
          notes.push(`larger than the current ${SUBMISSION_LIMIT}-byte submission limit`);
        }
        /*
         * The header names the tool that WROTE the file, which is not always the
         * tool the catalog credits: a macro converted from xdBot to Mega Hack
         * keeps `xdBot` in its header. Surfaced, never acted on. This migration
         * copies files; it does not get to rewrite catalog metadata.
         */
        const headerSaysMega = /^MEGA/i.test(check.info.botName ?? "");
        if (headerSaysMega !== (entry.recorder === "Mega Hack")) {
          notes.push(`catalog says "${entry.recorder}" but the file header says "${check.info.botName}"`);
        }
        if (check.info.levelId && String(check.info.levelId) !== entry.levelId) {
          notes.push(`file header level id ${check.info.levelId} differs from catalog ${entry.levelId}`);
        }
        entry.note = notes.length ? notes.join("; ") : null;
        fileBytes = bytes;
      }

      /* 2. release */
      const rel = await getRelease(entry.releaseTag, entry.levelName, entry.levelId);
      entry.releaseId = rel.id;

      /* 3. upload, or adopt our own reserved name */
      if (!entry.assetId) {
        const bytes = fileBytes ?? (await withRetry("re-download", () => downloadFromMediaFire(entry.sourceUrl))).bytes;
        if (sha256(bytes) !== entry.sha256) throw new Error("source changed between download and upload");

        flush(); // the reserved name is already persisted by --inventory
        const result = await withRetry("upload", () =>
          modules.releases.uploadMacroAsset(rel.id, entry.plannedFilename, bytes),
        );
        if ("taken" in result) {
          throw new Error(`planned filename ${entry.plannedFilename} is taken by a different file`);
        }
        entry.assetId = result.asset.id;
        entry.assetName = result.asset.name;
        entry.browserDownloadUrl = result.asset.browser_download_url;
        entry.remoteDigest = result.asset.digest ?? null;
        entry.status = "uploaded";
      }

      /* 4. download-back verification */
      const res = await withRetry("verify", async () => {
        const r = await fetchWithUa(entry.browserDownloadUrl);
        if (!r.ok) throw new Error(`verify HTTP ${r.status}`);
        return new Uint8Array(await r.arrayBuffer());
      });
      if (res.byteLength !== entry.size) throw new Error(`verify size ${res.byteLength} != ${entry.size}`);
      if (sha256(res) !== entry.sha256) throw new Error("verify sha256 mismatch");
      const back = modules.gdr2.checkGdr2(res);
      if (!back.ok) throw new Error(`verify .gdr2 invalid: ${back.error}`);
      entry.verified = true;
      entry.error = null;
      entry.status = "uploaded";
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      entry.error = msg;
      entry.status = isPermanent(msg) ? "failed-permanent" : "failed";
      entry.verified = false;
    } finally {
      fileBytes = null; // release the buffer promptly
      done++;
      const mark = entry.verified ? "verified OK" : `FAILED: ${entry.error}`;
      console.log(`[${done}/${work.length}] ${label}`);
      console.log(`    ${entry.releaseTag}/${entry.plannedFilename}  ${entry.size ?? "?"}B  ${mark}`);
      flush();
    }
  });

  flush();
  summarise(state);
}

async function cmdVerify() {
  const state = loadState();
  if (!state) throw new Error("no state; run --inventory first");
  const uploaded = state.entries.filter((e) => e.browserDownloadUrl);
  console.log(`re-verifying ${uploaded.length} uploaded assets\n`);
  let okCount = 0;
  await pool(uploaded, 4, async (entry) => {
    try {
      const r = await fetchWithUa(entry.browserDownloadUrl);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const bytes = new Uint8Array(await r.arrayBuffer());
      if (bytes.byteLength !== entry.size) throw new Error("size mismatch");
      if (sha256(bytes) !== entry.sha256) throw new Error("sha mismatch");
      if (!modules.gdr2.checkGdr2(bytes).ok) throw new Error("gdr2 invalid");
      entry.verified = true;
      okCount++;
    } catch (e) {
      entry.verified = false;
      entry.error = `verify: ${e instanceof Error ? e.message : e}`;
    }
  });
  saveState(state);
  console.log(`\n${okCount}/${uploaded.length} verified`);
  summarise(state);
}

function summarise(state) {
  const e = state.entries;
  const verified = e.filter((x) => x.verified);
  // Pending is NOT failure. An entry only counts as failed once it has actually
  // been attempted, otherwise a --limit run reports every untouched entry as a
  // phantom failure.
  const failed = e.filter((x) => !x.verified && x.status !== "blocked" && (x.attempts ?? 0) > 0);
  const pending = e.filter((x) => !x.verified && x.status !== "blocked" && !(x.attempts ?? 0));
  const blocked = e.filter((x) => x.status === "blocked");
  const noted = e.filter((x) => x.note);
  console.log("\n--- summary ---");
  console.log("  entries  :", e.length);
  console.log("  verified :", verified.length);
  console.log("  failed   :", failed.length);
  console.log("  pending  :", pending.length);
  console.log("  blocked  :", blocked.length);
  if (noted.length) {
    console.log("  notes    :", noted.length, "(surfaced, never acted on)");
    for (const n of noted.slice(0, 25)) {
      console.log(`   - ${n.levelName} / ${n.macroAuthor} / ${n.recorder}: ${n.note}`);
    }
    if (noted.length > 25) console.log(`   ... and ${noted.length - 25} more, see the state file`);
  }
  console.log("  releases :", new Set(verified.map((x) => x.releaseTag)).size);
  if (failed.length) {
    console.log("\n  failures:");
    for (const f of failed) {
      console.log(`   - ${f.levelName} / ${f.macroAuthor} / ${f.recorder}`);
      console.log(`     ${f.sourceUrl}`);
      console.log(`     stage=${f.status} attempts=${f.attempts} error=${f.error}`);
      console.log(`     retry sensible: ${f.status === "failed" ? "yes" : "no, permanent"}`);
    }
  }
  writeMapping(state);
}

function writeMapping(state) {
  const verified = state.entries.filter((x) => x.verified && x.browserDownloadUrl);
  const mapping = verified.map((x) => ({
    id: x.id,
    levelId: x.levelId,
    levelName: x.levelName,
    macroAuthor: x.macroAuthor,
    recorder: x.recorder,
    from: x.sourceUrl,
    to: x.browserDownloadUrl,
    releaseTag: x.releaseTag,
    assetId: x.assetId,
    assetName: x.assetName,
    size: x.size,
    sha256: x.sha256,
  }));
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const tmp = `${MAPPING_FILE}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(mapping, null, 2) + "\n");
  fs.renameSync(tmp, MAPPING_FILE);

  const lines = [
    "MediaFire -> GitHub Releases migration",
    `generated ${new Date().toISOString()}`,
    `verified ${mapping.length} of ${state.entries.length}`,
    "",
    ...mapping.map((m) => `${m.levelName} / ${m.macroAuthor} / ${m.recorder}\n  from ${m.from}\n  to   ${m.to}\n  sha256 ${m.sha256}`),
    "",
  ];
  fs.writeFileSync(REPORT_FILE, lines.join("\n"));
  console.log("  mapping  :", path.relative(ROOT, MAPPING_FILE));
}

function cmdStatus() {
  const state = loadState();
  if (!state) {
    console.log("no migration state yet");
    return;
  }
  console.log("state from", state.updatedAt);
  summarise(state);
}

/* ------------------------------------------------------------------ */

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f, d) => {
  const i = argv.indexOf(f);
  return i === -1 ? d : Number(argv[i + 1]);
};

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (has("--inventory")) await cmdInventory();
  else if (has("--upload")) await cmdUpload({ concurrency: val("--concurrency", 3), limit: val("--limit", 0) });
  else if (has("--verify")) await cmdVerify();
  else if (has("--status")) cmdStatus();
  else {
    console.log("usage: --inventory | --upload [--concurrency N] [--limit N] | --verify | --status");
  }
}
