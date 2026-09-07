/** Offline wiring checks for the deliberately small AdSense surface. */
import { createJiti } from "jiti";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const jiti = createJiti(import.meta.url, { interopDefault: true, moduleCache: false });

let passed = 0;
let failed = 0;
const failures = [];
function check(name, condition) {
  if (condition) passed++;
  else {
    failed++;
    failures.push(name);
  }
}

const config = await jiti.import(path.join(ROOT, "src/lib/adsense.ts"));
const layout = read("src/app/layout.tsx");
const slot = read("src/components/ads/AdSlot.tsx");
const notice = read("src/components/ads/AdBlockNotice.tsx");
const home = read("src/app/page.tsx");
const macro = read("src/app/macro/[slug]/page.tsx");
const privacy = read("src/app/privacy/page.tsx");
const terms = read("src/app/terms/page.tsx");
const adsTxt = read("public/ads.txt").trim();

check("publisher id is exact", config.ADSENSE_CLIENT === "ca-pub-8811219626379689");
check("home is eligible for ads", config.isAdSupportedPath("/"));
check("macro pages are eligible for ads", config.isAdSupportedPath("/macro/bloodbath"));
for (const privatePath of ["/account", "/admin", "/login", "/notifications", "/settings", "/submissions", "/support/tickets/1"]) {
  check(`${privatePath} is excluded from the ad-block notice`, !config.isAdSupportedPath(privatePath));
}

check("the AdSense loader is global", /pagead2\.googlesyndication\.com\/pagead\/js\/adsbygoogle\.js/.test(layout));
check("the loader carries the publisher id", /ca-pub-8811219626379689/.test(layout));
check("ads.txt authorizes only this publisher", adsTxt === "google.com, pub-8811219626379689, DIRECT, f08c47fec0942fa0");
check("ad units have a compact mobile size", /max-width: 320px/.test(slot) && /height: 100px/.test(slot));
check("ad units have tablet and desktop sizes", /width: 468px/.test(slot) && /width: 728px/.test(slot));
check("ad units are disabled by default", /!ADSENSE_ENABLED \|\| !slot/.test(slot));
check("home uses only its named slot", /slot=\{ADSENSE_HOME_SLOT\}/.test(home));
check("macro pages use only their named slot", /slot=\{ADSENSE_MACRO_SLOT\}/.test(macro));
check("the notice is dismissible", /Not now/.test(notice) && /setVisible\(false\)/.test(notice));
check("the notice never claims access is blocked", /keep using the entire site either way/i.test(notice));
check("the notice remembers only the current tab", /sessionStorage/.test(notice) && !/localStorage/.test(notice));
check("privacy discloses advertising", /Google AdSense/.test(privacy) && /Advertising and consent/.test(privacy));
check("terms cover advertising", /title="Advertising"/.test(terms) && /artificial advertisement views or clicks/i.test(terms));

console.log(`\nAdSense checks: ${passed} passed, ${failed} failed`);
if (failed) {
  for (const failure of failures) console.error(`  FAIL: ${failure}`);
  process.exit(1);
}
