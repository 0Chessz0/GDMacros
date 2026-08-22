/**
 * Tests for the language switcher.
 *
 * Run with `npm run test:translate`. No browser, no network, no Google.
 *
 * THE BUG THIS EXISTS FOR
 * -----------------------
 * Switching back to English reloaded the page and changed nothing. A cookie can
 * only be deleted by writing an expired one with the SAME domain, and Google
 * sets `googtrans` on the registrable domain: on `www.gdmacros.com` that is
 * `.gdmacros.com`. The old code only tried the full host and a dotted full
 * host, so it deleted nothing, the widget read the surviving cookie after the
 * reload and translated the page again.
 *
 * The scope list is therefore the whole fix, and it is pure, so it is tested
 * directly rather than through a browser.
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

const STUB = path.join(ROOT, "node_modules", ".gdm-test-stubs");
fs.mkdirSync(STUB, { recursive: true });
fs.writeFileSync(path.join(STUB, "server-only.mjs"), "export {};\n");

const jiti = createJiti(path.join(ROOT, "scripts", "test-translate.mjs"), {
  alias: { "server-only": path.join(STUB, "server-only.mjs"), "@": path.join(ROOT, "src") },
  interopDefault: true,
  moduleCache: false,
});

// The pure logic lives in lib so it can be loaded without a JSX parser; the
// component is read as text for the wiring assertions at the end.
const gt = await jiti.import(path.join(ROOT, "src/lib/translate.ts"));
const source = fs.readFileSync(path.join(ROOT, "src/components/GoogleTranslate.tsx"), "utf8");
const lib = fs.readFileSync(path.join(ROOT, "src/lib/translate.ts"), "utf8");

/* ------------------------------------------------------------------ *
 * 1. Domain scopes
 * ------------------------------------------------------------------ */
console.log("Cookie domain scopes");

const www = gt.cookieDomainScopes("www.gdmacros.com");

check("the host-only scope is included", www.includes(""));
check(
  "THE REGISTRABLE DOMAIN IS INCLUDED",
  www.includes(".gdmacros.com"),
  "this is the scope Google actually uses, and the one the bug missed",
);
check("the bare registrable domain is included", www.includes("gdmacros.com"));
check("the full host is still included", www.includes("www.gdmacros.com"));
check("the dotted full host is still included", www.includes(".www.gdmacros.com"));
check("the public suffix is never targeted", !www.includes(".com") && !www.includes("com"));
check("no duplicates", www.length === new Set(www).size, www.join(","));

const apex = gt.cookieDomainScopes("gdmacros.com");
check("apex covers itself", apex.includes("gdmacros.com") && apex.includes(".gdmacros.com"));
check("apex covers host-only", apex.includes(""));
check("apex does not target the suffix", !apex.includes(".com"));

const deep = gt.cookieDomainScopes("a.b.gdmacros.com");
check("a deep subdomain still reaches the registrable domain", deep.includes(".gdmacros.com"));
check("a deep subdomain covers every intermediate level", deep.includes(".b.gdmacros.com"));

// Hosts where a domain attribute is meaningless or rejected.
eq("localhost has only the host-only scope", gt.cookieDomainScopes("localhost").length, 1);
eq("an ipv4 host has only the host-only scope", gt.cookieDomainScopes("127.0.0.1").length, 1);
eq("an ipv6 host has only the host-only scope", gt.cookieDomainScopes("[::1]").length, 1);
eq("an empty host has only the host-only scope", gt.cookieDomainScopes("").length, 1);
eq("a missing host does not throw", gt.cookieDomainScopes(undefined).length, 1);

// A Vercel preview host, which is where this would be tested before shipping.
const preview = gt.cookieDomainScopes("gdmacros-git-fix-translate-english-0chessz0s-projects.vercel.app");
check("a preview host reaches its registrable domain", preview.includes(".vercel.app"));

/* ------------------------------------------------------------------ *
 * 2. Reading the current language
 * ------------------------------------------------------------------ */
console.log("Reading the current language");

eq("no cookie means English", gt.parseTranslateLang(""), "en");
eq("an unrelated cookie means English", gt.parseTranslateLang("gdm-theme=dark"), "en");
eq("a translated cookie reports its target", gt.parseTranslateLang("googtrans=/en/es"), "es");
eq(
  "the cookie is found among others",
  gt.parseTranslateLang("gdm-theme=dark; googtrans=/en/de; other=1"),
  "de",
);
eq("an url-encoded value is decoded", gt.parseTranslateLang("googtrans=%2Fen%2Ffr"), "fr");
eq("the neutral value reads as English", gt.parseTranslateLang("googtrans=/en/en"), "en");
eq("an empty value reads as English", gt.parseTranslateLang("googtrans="), "en");
eq("a malformed value reads as English", gt.parseTranslateLang("googtrans=nonsense"), "en");

// Two scopes at once is the situation that made this ambiguous in the first
// place: the page is rendered in whichever one is NOT English.
eq(
  "a translated scope wins over a neutral one",
  gt.parseTranslateLang("googtrans=/en/en; googtrans=/en/ja"),
  "ja",
);
eq(
  "order does not matter",
  gt.parseTranslateLang("googtrans=/en/ja; googtrans=/en/en"),
  "ja",
);
eq(
  "all-English scopes read as English",
  gt.parseTranslateLang("googtrans=/en/en; googtrans=/en/en"),
  "en",
);

/* ------------------------------------------------------------------ *
 * 3. The clearing path, by inspection
 * ------------------------------------------------------------------ */
console.log("Clearing behaviour");

// The exact cookie strings that will be assigned, asserted directly.
const writes = gt.clearCookieWrites("www.gdmacros.com");
check(
  "a delete is written for the registrable domain",
  writes.some((w) => /domain=\.gdmacros\.com/.test(w) && /path=\//.test(w)),
  "nothing would delete the cookie Google actually set",
);
check("every delete expires in the past", writes.every((w) => w.includes("expires=Thu, 01 Jan 1970")));
check("every delete also sets max-age", writes.every((w) => w.includes("max-age=0")));
check("every delete blanks the value", writes.every((w) => w.startsWith("googtrans=;")));
check("both rooted and pathless variants are written", writes.some((w) => w.includes("path=/")) && writes.some((w) => !w.includes("path=")));
check("one write per scope and path", writes.length === gt.cookieDomainScopes("www.gdmacros.com").length * 2, String(writes.length));
check("localhost still gets a delete", gt.clearCookieWrites("localhost").length === 2);

const neutral = gt.neutralCookieWrites("www.gdmacros.com");
check("the fallback covers the registrable domain", neutral.some((w) => /domain=\.gdmacros\.com/.test(w)));
check("the fallback writes the neutral value", neutral.every((w) => w.startsWith("googtrans=/en/en")));
check("the fallback reads back as English", gt.parseTranslateLang(neutral[0].split(";")[0]) === "en");

check("the component no longer hardcodes host variants", !/`;domain=\$\{host\}`/.test(source));
check("the component uses the derived deletes", /clearCookieWrites\(window\.location\.hostname\)/.test(source));
check("English still forces a reload", /window\.location\.reload\(\)/.test(source));
check(
  "the fallback only runs when the cookie survived",
  /if \(translateCookieRemains\(\)\)/.test(source),
  "the neutral cookie would be written unconditionally",
);
check("the fallback uses the derived writes", /neutralCookieWrites\(window\.location\.hostname\)/.test(source));
// Comments stripped first: the doc comments legitimately talk ABOUT
// `document.cookie` while the code itself must never touch it.
const libCode = lib.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
check(
  "the pure logic carries no DOM access",
  !/document\.|window\./.test(libCode),
  "lib/translate touches the DOM, so it is not testable without a browser",
);
check(
  "switching between two languages still drives the widget's own select",
  /select\.goog-te-combo/.test(source) && /dispatchEvent\(new Event\("change"\)\)/.test(source),
);

/* ------------------------------------------------------------------ */

console.log(`\n${passed} passed, ${failed} failed`);
if (failures.length) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  - ${f}`);
}
process.exit(failed ? 1 : 0);
