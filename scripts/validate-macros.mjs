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
  console.error("data/macros.json must contain an array of macros.");
  process.exit(1);
}

const slugify = (s) =>
  String(s).toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

const REQUIRED = [
  "name",
  "creator",
  "macroAuthor",
  "levelId",
  "recorder",
  "downloadType",
  "downloadLink",
];
/** Keep in sync with RECORDERS in src/lib/types.ts. */
const RECORDERS = ["Mega Hack", "xdBot"];
const slugs = new Map();

/** An untouched template row, with every required field still blank. */
const isBlank = (m) =>
  REQUIRED.every((f) => m[f] === undefined || m[f] === null || String(m[f]).trim() === "");

let blankCount = 0;

data.forEach((m, i) => {
  const label = m?.name ? `"${m.name}"` : `entry #${i + 1}`;
  const at = (msg) => errors.push(`${label}: ${msg}`);

  if (typeof m !== "object" || m === null) {
    errors.push(`entry #${i + 1} is not an object`);
    return;
  }

  // Empty slots waiting to be filled in are fine; they're skipped at build time.
  if (isBlank(m)) {
    blankCount++;
    return;
  }

  for (const field of REQUIRED) {
    if (m[field] === undefined || m[field] === "") at(`missing required field "${field}"`);
  }

  if (m.levelId !== undefined && !/^\d+$/.test(String(m.levelId))) {
    at(`levelId must be a number (got ${JSON.stringify(m.levelId)})`);
  }

  if (m.recorder !== undefined && !RECORDERS.includes(m.recorder)) {
    at(`recorder must be one of: ${RECORDERS.join(", ")} (got ${JSON.stringify(m.recorder)})`);
  }

  if (m.downloadLink && !/^https?:\/\//i.test(m.downloadLink)) {
    warnings.push(`${label}: downloadLink is not a URL, the download button will show as unavailable`);
  }

  if (m.video && !/(youtube\.com|youtu\.be)/i.test(m.video)) {
    warnings.push(`${label}: video is not a YouTube URL, no embed or auto-thumbnail will be generated`);
  }

  if (m.thumbnail && !/^https?:\/\//i.test(m.thumbnail)) {
    const local = path.join(process.cwd(), "public", m.thumbnail.replace(/^\//, ""));
    if (!fs.existsSync(local)) at(`thumbnail "${m.thumbnail}" not found in public/`);
  }

  if (!m.video && !m.thumbnail) {
    warnings.push(`${label}: no video and no thumbnail, a generated placeholder tile will be shown`);
  }

  if (m.name && m.macroAuthor) {
    const slug = m.slug || `${slugify(m.name)}-${slugify(m.macroAuthor)}`;
    if (slugs.has(slug)) {
      at(`produces the same URL "${slug}" as ${slugs.get(slug)}. Add a unique "slug" to one of them`);
    } else {
      slugs.set(slug, label);
    }
  }
});

for (const w of warnings) console.warn(`warn  ${w}`);
for (const e of errors) console.error(`error ${e}`);

const filled = data.length - blankCount;

console.log(
  `\n${filled} macro${filled === 1 ? "" : "s"} checked` +
    (blankCount > 0 ? ` (+${blankCount} blank template row${blankCount === 1 ? "" : "s"})` : "") +
    `. ${errors.length} error(s), ${warnings.length} warning(s)`,
);

process.exit(errors.length > 0 ? 1 : 0);
