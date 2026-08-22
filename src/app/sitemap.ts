import fs from "node:fs";
import path from "node:path";
import type { MetadataRoute } from "next";
import { getAllLevels } from "@/lib/macros";
import { site } from "@/lib/site";

// Required by `output: 'export'` (the GitHub Pages path); a no-op on Vercel.
export const dynamic = "force-static";

/**
 * When the catalog last changed. Using the data file's own mtime means the date
 * moves when macros are actually added, rather than on every unrelated deploy,
 * which is what makes lastModified worth anything to a crawler.
 */
function catalogModified(): Date {
  try {
    return fs.statSync(path.join(process.cwd(), "data", "macros.json")).mtime;
  } catch {
    return new Date();
  }
}

/** Generated at build time from the catalog. Served at /sitemap.xml */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = site.url.replace(/\/$/, "");
  const lastModified = catalogModified();

  const staticPages = ["", "/install", "/faq", "/guidelines", "/about", "/privacy", "/terms"].map((page) => ({
    url: `${base}${page}`,
    lastModified,
    changeFrequency: "weekly" as const,
    priority: page === "" ? 1 : 0.5,
  }));

  const macroPages = getAllLevels().map((level) => ({
    url: `${base}/macro/${level.slug}`,
    lastModified,
    changeFrequency: "monthly" as const,
    priority: 0.8,
  }));

  return [...staticPages, ...macroPages];
}
