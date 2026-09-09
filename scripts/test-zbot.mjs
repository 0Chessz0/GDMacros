import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createJiti } from "jiti";

const catalog = JSON.parse(fs.readFileSync("data/macros.json", "utf8"));
const types = fs.readFileSync("src/lib/types.ts", "utf8");
const submissions = fs.readFileSync("src/lib/submissions.ts", "utf8");
const submitForm = fs.readFileSync("src/components/submissions/SubmitForm.tsx", "utf8");
const install = fs.readFileSync("src/app/install/page.tsx", "utf8");
const publisher = fs.readFileSync("src/lib/publish/publisher.ts", "utf8");
const migration = fs.readFileSync("supabase/migrations/0017_zbot_submissions.sql", "utf8");

const jiti = createJiti(path.join(process.cwd(), "scripts", "test-zbot.mjs"), {
  alias: { "@": path.join(process.cwd(), "src") },
  interopDefault: true,
  moduleCache: false,
});
const gdr = await jiti.import(path.join(process.cwd(), "src/lib/gdr.ts"));
const names = await jiti.import(path.join(process.cwd(), "src/lib/publish/assetName.ts"));
const submissionRules = await jiti.import(path.join(process.cwd(), "src/lib/submissions.ts"));

const all = catalog.flatMap((level) =>
  (level.macros ?? []).map((macro) => ({ ...macro, levelName: level.name, levelId: String(level.levelId) })),
);
const xdBot = all.filter((macro) => macro.recorder === "xdBot");
const zBot = all.filter((macro) => macro.recorder === "zBot");

assert.match(types, /RECORDERS = \["Mega Hack", "xdBot", "zBot"\]/);
assert.match(types, /SUBMISSION_RECORDERS = RECORDERS/);
assert.match(submissions, /SUBMISSION_RECORDERS/);
assert.match(submitForm, /SUBMISSION_RECORDERS/);
assert.match(submitForm, /\.gdr,\.gdr2/);
assert.match(publisher, /sub\.recorder === "zBot" \? checkGdr\(file\.bytes\) : checkGdr2\(file\.bytes\)/);
assert.match(migration, /recorder in \('xdBot', 'Mega Hack', 'zBot'\)/);

assert.equal(
  names.assetFileName({ macroAuthor: "Zoink", levelName: "Acheron", recorder: "zBot" }),
  "Zoink-Acheron-zBot.gdr",
);
assert.equal(
  names.assetCandidate({ macroAuthor: "Zoink", levelName: "Acheron", recorder: "zBot" }, 2),
  "Zoink-Acheron-zBot-2.gdr",
);
assert.equal(submissionRules.validateFile({ name: "macro.gdr", size: 100 }, "zBot"), null);
assert.match(submissionRules.validateFile({ name: "macro.gdr2", size: 100 }, "zBot"), /\.gdr files/);
assert.equal(submissionRules.validateFile({ name: "macro.gdr2", size: 100 }, "xdBot"), null);

const bytes = [];
const str = (value) => {
  const encoded = Buffer.from(value, "utf8");
  assert.ok(encoded.length < 32);
  bytes.push(0xa0 | encoded.length, ...encoded);
};
const f32 = (value) => {
  const encoded = Buffer.alloc(5);
  encoded[0] = 0xca;
  encoded.writeFloatBE(value, 1);
  bytes.push(...encoded);
};

bytes.push(0x87);
str("version"); f32(1);
str("bot"); bytes.push(0x82); str("name"); str("zBot"); str("version"); str("3.0.0");
str("level"); bytes.push(0x82); str("id"); bytes.push(0xce, 0x04, 0x64, 0x2a, 0x4c); str("name"); str("Acheron");
str("inputs"); bytes.push(0x91, 0x84); str("2p"); bytes.push(0xc2); str("btn"); bytes.push(0x01); str("down"); bytes.push(0xc3); str("frame"); bytes.push(0x00);
str("duration"); f32(1);
str("framerate"); f32(240);
str("author"); str("Zoink");

const validGdr = new Uint8Array(bytes);
const checked = gdr.checkGdr(validGdr);
assert.equal(checked.ok, true, "a structurally valid ZBot MessagePack replay must pass");
assert.equal(checked.info.botName, "zBot");
assert.equal(gdr.checkGdr(new Uint8Array(Buffer.from("not a replay"))).ok, false);

assert.equal(xdBot.length, 128, "the source XD Bot catalog changed; review the ZBot migration");
assert.equal(zBot.length, 125, "the reviewed ZBot catalog changed unexpectedly");
assert.equal(new Set(zBot.map((macro) => macro.downloadLink)).size, zBot.length, "ZBot URLs must be unique");

for (const macro of zBot) {
  assert.match(
    macro.downloadLink,
    new RegExp(`^https://github\\.com/GDMacros-com/GDMacros-downloads/releases/download/level-${macro.levelId}/.+-zBot\\.gdr$`),
    `${macro.levelName} must use its managed ZBot release asset`,
  );
  const source = xdBot.find(
    (candidate) => candidate.levelId === macro.levelId && candidate.author === macro.author,
  );
  assert.ok(source, `${macro.levelName} must retain an XD Bot source with the same author credit`);
}

assert.equal(
  zBot.some((macro) => macro.levelName === "Relief"),
  false,
  "Relief is a mixed-player source and must remain unconverted",
);
assert.equal(
  zBot.some((macro) => macro.levelName === "Final Destination"),
  false,
  "Final Destination was intentionally removed from the ZBot catalog",
);
assert.equal(
  zBot.some((macro) => macro.levelName === "Unnerfed sakupen circles" && macro.author === "yqyqyqyyqya"),
  false,
  "the newly submitted XD Bot recording has no reviewed ZBot conversion",
);
assert.equal(
  zBot.some((macro) => macro.levelName === "Backrooms"),
  false,
  "Backrooms has no XD Bot source and must remain unconverted",
);

assert.match(install, /initial zBot collection was converted from compatible xdBot recordings/i);
assert.match(install, /Native zBot recordings can also be submitted/i);
assert.match(install, /Open zBot on Geode/);
assert.match(install, /zBot entries use \.gdr/i);

console.log(`ZBot catalog verified: ${zBot.length} converted downloads from ${xdBot.length} XD Bot sources.`);
