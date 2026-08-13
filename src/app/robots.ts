import type { MetadataRoute } from "next";
import { site } from "@/lib/site";

// Required by `output: 'export'` (the GitHub Pages path); a no-op on Vercel.
export const dynamic = "force-static";

/** Served at /robots.txt */
export default function robots(): MetadataRoute.Robots {
  const base = site.url.replace(/\/$/, "");

  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${base}/sitemap.xml`,
  };
}
