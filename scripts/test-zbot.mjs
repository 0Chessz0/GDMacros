import assert from "node:assert/strict";
import fs from "node:fs";

const catalog = JSON.parse(fs.readFileSync("data/macros.json", "utf8"));
const types = fs.readFileSync("src/lib/types.ts", "utf8");
const submissions = fs.readFileSync("src/lib/submissions.ts", "utf8");
const submitForm = fs.readFileSync("src/components/submissions/SubmitForm.tsx", "utf8");
const install = fs.readFileSync("src/app/install/page.tsx", "utf8");

const all = catalog.flatMap((level) =>
  (level.macros ?? []).map((macro) => ({ ...macro, levelName: level.name, levelId: String(level.levelId) })),
);
const xdBot = all.filter((macro) => macro.recorder === "xdBot");
const zBot = all.filter((macro) => macro.recorder === "zBot");

assert.match(types, /RECORDERS = \["Mega Hack", "xdBot", "zBot"\]/);
assert.match(types, /SUBMISSION_RECORDERS = \["Mega Hack", "xdBot"\]/);
assert.match(submissions, /SUBMISSION_RECORDERS/);
assert.match(submitForm, /SUBMISSION_RECORDERS/);
assert.doesNotMatch(submissions, /import \{ RECORDERS/);

assert.equal(xdBot.length, 127, "the source XD Bot catalog changed; review the ZBot migration");
assert.equal(zBot.length, 126, "every safely convertible XD Bot entry should have one ZBot entry");
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
  zBot.some((macro) => macro.levelName === "Backrooms"),
  false,
  "Backrooms has no XD Bot source and must remain unconverted",
);

assert.match(install, /zBot downloads in this catalog are converted from compatible xdBot recordings/i);
assert.match(install, /Open zBot on Geode/);
assert.match(install, /zBot entries use \.gdr/i);

console.log(`ZBot catalog verified: ${zBot.length} converted downloads from ${xdBot.length} XD Bot sources.`);
