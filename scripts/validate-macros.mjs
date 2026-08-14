/**
 * Checks data/macros.json before you commit. Run: npm run validate
 */
import fs from "node:fs";
import path from "node:path";

const file = path.join(process.cwd(), "data", "macros.json");
const errors = [];
const warnings = [];

if (!fs.existsSync(file)) {
  console.error("data/macros.json not found.");
  process.exit(1);
}

let data;
try {
  data = JSON.parse(fs.readFileSync(file, "utf8"));
} catch (err) {
  console.error(`data/macros.json is not valid JSON: ${err.message}`);
  process.exit(1);
}

if (!Array.isArray(data)) {
  console.error("data/macros.json must contain an array of levels.");
  process.exit(1);
}

const slugify = (s) =>
  String(s).toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/** Keep in sync with RECORDERS in src/lib/types.ts. */
const RECORDERS = ["Mega Hack", "xdBot"];
const LEVEL_REQUIRED = ["name", "creator", "levelId"];
const MACRO_REQUIRED = ["author", "recorder", "downloadType", "downloadLink"];

const blank = (v) => v === undefined || v === null || String(v).trim() === "";
const slugs = new Map();

/** Accepts the current `macros` array or the older flat single-macro shape. */
function readMacros(entry) {
  if (Array.isArray(entry.macros) && entry.macros.length > 0) return entry.macros;
  const legacy = [entry.macroAuthor, entry.recorder, entry.downloadType, entry.downloadLink];
  if (legacy.some((v) => !blank(v))) {
    return [{
      author: entry.macroAuthor,
      recorder: entry.recorder,
      downloadType: entry.downloadType,
      downloadLink: entry.downloadLink,
    }];
  }
  return [];
}

let blankCount = 0;
let macroTotal = 0;

data.forEach((entry, i) => {
  const label = entry?.name ? `"${entry.name}"` : `entry #${i + 1}`;
  const at = (msg) => errors.push(`${label}: ${msg}`);

  if (typeof entry !== "object" || entry === null) {
    errors.push(`entry #${i + 1} is not an object`);
    return;
  }

  const macros = readMacros(entry);
  const levelBlank = LEVEL_REQUIRED.every((f) => blank(entry[f]));
  const macrosBlank = macros.every((m) => MACRO_REQUIRED.every((f) => blank(m[f])));

  // Empty slots waiting to be filled in are fine; they're skipped at build time.
  if (levelBlank && macrosBlank) {
    blankCount++;
    return;
  }

  for (const field of LEVEL_REQUIRED) {
    if (blank(entry[field])) at(`missing required field "${field}"`);
  }

  if (entry.levelId !== undefined && !blank(entry.levelId) && !/^\d+$/.test(String(entry.levelId))) {
    at(`levelId must be a number (got ${JSON.stringify(entry.levelId)})`);
  }

  if (macros.length === 0) {
    at('has no macros. Add at least one entry to "macros"');
  }

  macros.forEach((m, j) => {
    const where = `${label} macro ${j + 1}`;
    macroTotal++;

    for (const field of MACRO_REQUIRED) {
      if (blank(m[field])) errors.push(`${where}: missing required field "${field}"`);
    }
    if (!blank(m.recorder) && !RECORDERS.includes(m.recorder)) {
      errors.push(`${where}: recorder must be one of: ${RECORDERS.join(", ")} (got ${JSON.stringify(m.recorder)})`);
    }
    if (m.downloadLink && !/^https?:\/\//i.test(m.downloadLink)) {
      warnings.push(`${where}: downloadLink is not a URL, the download button will show as unavailable`);
    }
  });

  // Two macros by the same person on one level is almost always a copy/paste slip.
  const authors = macros.map((m) => String(m.author || "").trim().toLowerCase()).filter(Boolean);
  const dupeAuthor = authors.find((a, k) => authors.indexOf(a) !== k);
  if (dupeAuthor) {
    warnings.push(`${label}: has two macros credited to the same author ("${dupeAuthor}")`);
  }

  if (entry.video && !/(youtube\.com|youtu\.be)/i.test(entry.video)) {
    warnings.push(`${label}: video is not a YouTube URL, no embed or auto-thumbnail will be generated`);
  }

  if (entry.thumbnail && !/^https?:\/\//i.test(entry.thumbnail)) {
    const local = path.join(process.cwd(), "public", entry.thumbnail.replace(/^\//, ""));
    if (!fs.existsSync(local)) at(`thumbnail "${entry.thumbnail}" not found in public/`);
  }

  if (blank(entry.video) && blank(entry.thumbnail)) {
    warnings.push(`${label}: no video and no thumbnail, a generated placeholder tile will be shown`);
  }

  if (!blank(entry.name)) {
    const slug = entry.slug || slugify(entry.name);
    if (slugs.has(slug)) {
      at(`produces the same URL "${slug}" as ${slugs.get(slug)}. Add a unique "slug" to one of them`);
    } else {
      slugs.set(slug, label);
    }
  }
});

for (const w of warnings) console.warn(`warn  ${w}`);
for (const e of errors) console.error(`error ${e}`);

const levels = data.length - blankCount;

console.log(
  `\n${levels} level${levels === 1 ? "" : "s"} / ${macroTotal} macro${macroTotal === 1 ? "" : "s"} checked` +
    (blankCount > 0 ? ` (+${blankCount} blank template row${blankCount === 1 ? "" : "s"})` : "") +
    `. ${errors.length} error(s), ${warnings.length} warning(s)`,
);

process.exit(errors.length > 0 ? 1 : 0);
