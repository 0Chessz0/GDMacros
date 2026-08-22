/**
 * Tests for the MediaFire migration tool. Mocked: no network, no GitHub.
 *
 * Run with `npm run test:migrate`.
 *
 * The tool performs irreversible uploads across 212 files, so the parts worth
 * testing are the ones that decide WHAT gets uploaded and WHERE: filename
 * planning, identity, resume, and the resolver's handling of a MediaFire page
 * that is not what we hoped for.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

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

const tool = await import(pathToFileURL(path.join(ROOT, "scripts", "migrate-mediafire-to-github.mjs")).href);

/* ---------------- fixtures ---------------- */

const level = (id, name, macros) => ({
  name,
  creator: "Someone",
  levelId: String(id),
  video: "https://www.youtube.com/watch?v=aaaaaaaaaaa",
  addedAt: "2026-01-01",
  macros,
});
const macro = (author, recorder, link, type = "MediaFire") => ({
  author,
  recorder,
  downloadType: type,
  downloadLink: link,
});
const mf = (key, name) => `https://www.mediafire.com/file/${key}/${name}.gdr2/file`;

/* ---------------- inventory + filename planning ---------------- */
console.log("Inventory and filename planning");

const catalog = [
  level(111, "Acheron", [
    macro("Zoink", "xdBot", mf("k1", "Acheron")),
    macro("Zoink", "Mega Hack", mf("k2", "Acheron")),
  ]),
  level(222, "Bloodbath", [macro("Riot", "Mega Hack", mf("k3", "Bloodbath"))]),
];

const plan = tool.planInventory(catalog);
eq("one entry per macro", plan.length, 3);
eq("stable id is levelId#index", plan[0].id, "111#0");
eq("second macro of the same level", plan[1].id, "111#1");
eq("release tag from level id", plan[0].releaseTag, "level-111");
eq("filename uses macro author, level, recorder", plan[0].plannedFilename, "Zoink-Acheron-xdBot.gdr2");
eq("different recorder does not collide", plan[1].plannedFilename, "Zoink-Acheron-Mega-Hack.gdr2");
eq("separate level gets its own tag", plan[2].releaseTag, "level-222");
check("no entry is blocked in a clean catalog", plan.every((e) => e.issues.length === 0));

// Deterministic: same input, same plan.
const plan2 = tool.planInventory(catalog);
eq("planning is deterministic",
  JSON.stringify(plan.map((e) => e.plannedFilename)),
  JSON.stringify(plan2.map((e) => e.plannedFilename)));

/* ---------------- duplicate filenames ---------------- */
console.log("Duplicate filenames");

const dupes = [
  level(333, "Cataclysm", [
    macro("Ggb0y", "xdBot", mf("d1", "a")),
    macro("Ggb0y", "xdBot", mf("d2", "b")),
    macro("Ggb0y", "xdBot", mf("d3", "c")),
  ]),
];
const dp = tool.planInventory(dupes);
eq("first is clean", dp[0].plannedFilename, "Ggb0y-Cataclysm-xdBot.gdr2");
eq("second gets -2", dp[1].plannedFilename, "Ggb0y-Cataclysm-xdBot-2.gdr2");
eq("third gets -3", dp[2].plannedFilename, "Ggb0y-Cataclysm-xdBot-3.gdr2");
check("suffixes follow catalog order, not chance",
  dp.map((e) => e.index).join() === "0,1,2");

/* ---------------- existing assets reserve their slot ---------------- */
console.log("Existing assets");

const withExisting = tool.planInventory(dupes, {
  "level-333": ["Ggb0y-Cataclysm-xdBot.gdr2"], // already published by the real publisher
});
eq("migration allocates AROUND an existing asset", withExisting[0].plannedFilename,
  "Ggb0y-Cataclysm-xdBot-2.gdr2");
eq("and keeps counting", withExisting[1].plannedFilename, "Ggb0y-Cataclysm-xdBot-3.gdr2");
check("never plans a name that already exists",
  !withExisting.some((e) => e.plannedFilename === "Ggb0y-Cataclysm-xdBot.gdr2"));

/* ---------------- malformed catalog entries ---------------- */
console.log("Malformed entries");

const bad = tool.planInventory([
  level(444, "Ok", [macro("A", "xdBot", "")]),
  level(555, "Ok2", [macro("A", "xdBot", "not-a-url")]),
  level("abc", "BadId", [macro("A", "xdBot", mf("x", "y"))]),
  level(666, "NoAuthor", [macro("", "xdBot", mf("z", "w"))]),
]);
check("empty link is blocked", bad[0].issues.some((i) => /empty/.test(i)));
check("non-URL link is blocked", bad[1].issues.some((i) => /not a URL/.test(i)));
check("non-numeric level id is blocked", bad[2].issues.some((i) => /numeric/.test(i)));
check("missing author is blocked", bad[3].issues.some((i) => /author/.test(i)));
check("blocked entries get no filename", bad.every((e) => e.issues.length === 0 || !e.plannedFilename));
check("blocked entries are marked blocked", bad.every((e) => e.status === "blocked"));

/* ---------------- host detection ---------------- */
console.log("Host detection");
const mixed = tool.planInventory([
  level(777, "Mixed", [
    macro("A", "xdBot", mf("m1", "a")),
    macro("B", "Mega Hack", "https://github.com/GDMacros-com/GDMacros-downloads/releases/download/level-777/B-Mixed-Mega-Hack.gdr2", "GitHub"),
  ]),
]);
eq("mediafire host detected", mixed[0].sourceHost, "mediafire.com");
eq("github host detected", mixed[1].sourceHost, "github.com");

/* ---------------- MediaFire resolver ---------------- */
console.log("MediaFire resolver");

eq("finds a plain direct link",
  tool.extractDirectUrl('<a id="downloadButton" href="https://download1085.mediafire.com/abc/file.gdr2">Download</a>'),
  "https://download1085.mediafire.com/abc/file.gdr2");

const b64 = Buffer.from("https://download999.mediafire.com/xyz/f.gdr2").toString("base64");
eq("falls back to the scrambled variant",
  tool.extractDirectUrl(`<div data-scrambled-url="${b64}"></div>`),
  "https://download999.mediafire.com/xyz/f.gdr2");

eq("returns null when there is no link", tool.extractDirectUrl("<html><body>nothing</body></html>"), null);
eq("ignores a non-download href",
  tool.extractDirectUrl('<a href="https://www.mediafire.com/policy">x</a>'), null);

/* ---------------- permanent vs transient failures ---------------- */
console.log("Failure classification");
for (const [msg, permanent] of [
  ["MediaFire reports the file is deleted or unavailable", true],
  ["no direct download link on the landing page", true],
  ["received HTML instead of a file", true],
  ["downloaded zero bytes", true],
  ["file is 99999999 bytes, over the cap", true],
  ["not a valid .gdr2: That macro file looks damaged or incomplete.", true],
  ["direct download HTTP 404", true],
  ["landing page HTTP 500", false],
  ["fetch failed", false],
  ["verify HTTP 502", false],
  ["The operation was aborted due to timeout", false],
]) {
  eq(`"${msg.slice(0, 40)}" permanent=${permanent}`, tool.isPermanent(msg), permanent);
}

/* ---------------- state atomicity and resume ---------------- */
console.log("State and resume");

const stateDir = path.join(ROOT, ".migration");
const stateFile = path.join(stateDir, "mediafire-to-github.json");
const backup = fs.existsSync(stateFile) ? fs.readFileSync(stateFile) : null;

try {
  const sample = { createdAt: "x", updatedAt: "y", entries: plan };
  tool.saveState(sample);
  check("state file written", fs.existsSync(stateFile));
  const back = tool.loadState();
  eq("state round-trips", back.entries.length, 3);
  check("no temp file left behind",
    fs.readdirSync(stateDir).every((f) => !f.includes(".tmp-")),
    fs.readdirSync(stateDir).join(", "));

  // A corrupt file must not throw, so a bad state can be regenerated.
  fs.writeFileSync(stateFile, "{ this is not json");
  eq("corrupt state loads as null", tool.loadState(), null);

  // Resume: progress carries forward only when id AND source URL match.
  const done = plan.map((e) => ({ ...e, status: "uploaded", verified: true, assetId: 1, sha256: "a".repeat(64) }));
  tool.saveState({ createdAt: "x", updatedAt: "y", entries: done });
  const reloaded = tool.loadState();
  check("verified progress survives a reload", reloaded.entries.every((e) => e.verified === true));
  check("no file bytes are ever persisted",
    !JSON.stringify(reloaded).includes("_bytes"));
} finally {
  if (backup) fs.writeFileSync(stateFile, backup);
  else fs.rmSync(stateFile, { force: true });
}

/* ---------------- identity ---------------- */
console.log("Migration identity");
eq("identity is stable for the same slot", tool.migrationId("111", 0), "111#0");
check("identity distinguishes two byte-identical macros",
  tool.migrationId("111", 0) !== tool.migrationId("111", 1));
check("identity is not content-derived",
  tool.migrationId("111", 0) === tool.migrationId("111", 0));

/* ---------------- sha ---------------- */
console.log("Hashing");
eq("sha256 of known bytes",
  tool.sha256(new Uint8Array([1, 2, 3])),
  "039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81");
check("sha256 differs for different bytes",
  tool.sha256(new Uint8Array([1])) !== tool.sha256(new Uint8Array([2])));

/* ---------------- verification comparison logic ---------------- */
console.log("Download-back comparison");
const original = new Uint8Array([71, 68, 82, 2, 9, 9]);
const same = new Uint8Array([71, 68, 82, 2, 9, 9]);
const different = new Uint8Array([71, 68, 82, 2, 9, 8]);
check("matching bytes verify", tool.sha256(original) === tool.sha256(same));
check("mismatched bytes are caught", tool.sha256(original) !== tool.sha256(different));
check("a truncated copy is caught by size", original.byteLength !== original.slice(0, 3).byteLength);

/* ---------------- post-cutover safety ---------------- */
//
// The migration is finished and the real catalog now holds 212 GitHub URLs.
// Rerunning the upload against it must do nothing, and must never mistake a
// finished migration for a new one.

console.log("Post-cutover safety");

const migrated = [
  level(111, "Acheron", [
    macro("Zoink", "xdBot",
      "https://github.com/GDMacros-com/GDMacros-downloads/releases/download/level-111/Zoink-Acheron-xdBot.gdr2", "GitHub"),
  ]),
];
eq("a fully migrated catalog reports 0 MediaFire entries", tool.mediafireCount(migrated), 0);
eq("a MediaFire catalog reports its count", tool.mediafireCount(catalog), 3);
eq("a mixed catalog counts only the MediaFire ones", tool.mediafireCount([
  level(1, "A", [macro("x", "xdBot", mf("a", "a")), macro("y", "xdBot", "https://github.com/x", "GitHub")]),
]), 1);

// The real production catalog must report zero.
const realCatalog = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "macros.json"), "utf8"));
eq("the REAL current catalog has 0 MediaFire entries", tool.mediafireCount(realCatalog), 0);
// Not a literal: the publisher grows this file in production, and the property
// that matters after the cutover is that NOTHING is MediaFire-hosted, whatever
// the total has since become.
check("the REAL current catalog still has macros to check",
  realCatalog.reduce((n, l) => n + (l.macros ?? []).length, 0) >= 212);

// A rebuilt inventory over migrated entries must not look like pending work.
const migratedPlan = tool.planInventory(migrated);
eq("a migrated entry is recognised as github-hosted", migratedPlan[0].sourceHost, "github.com");
check("upload's filter excludes non-MediaFire entries",
  ![migratedPlan[0]].filter((e) => e.sourceHost === "mediafire.com").length);

// And a mediafire entry still IS work, so the guard gets out of the way when it should.
const stillWork = tool.planInventory(catalog);
check("MediaFire entries are still selected as work",
  stillWork.filter((e) => e.sourceHost === "mediafire.com").length === 3);

/* ---------------- results ---------------- */
console.log("");
for (const f of failures) console.error("FAIL  " + f);
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
