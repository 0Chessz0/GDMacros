import type { MetadataRoute } from "next";
import { getAllMacros } from "@/lib/macros";
import { site } from "@/lib/site";

// Required by `output: 'export'` (the GitHub Pages path); a no-op on Vercel.
export const dynamic = "force-static";

/** Generated at build time from the catalog. Served at /sitemap.xml */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = site.url.replace(/\/$/, "");

  const staticPages = ["", "/guidelines", "/about"].map((path) => ({
    url: `${base}${path}`,
    changeFrequency: "weekly" as const,
    priority: path === "" ? 1 : 0.5,
  }));

  const macroPages = getAllMacros().map((m) => ({
    url: `${base}/macro/${m.slug}`,
    changeFrequency: "monthly" as const,
    priority: 0.8,
  }));

  return [...staticPages, ...macroPages];
}
