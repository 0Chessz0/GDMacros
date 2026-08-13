/** @type {import('next').NextConfig} */
const nextConfig = {
  // Thumbnails are mostly remote YouTube stills, and the site is fully static,
  // so skip the optimizer entirely. This also keeps `output: 'export'` viable.
  images: { unoptimized: true },
  eslint: { ignoreDuringBuilds: true },

  // Hides the Next.js dev-tools badge in the corner during `next dev`.
  // It never shipped in production builds, so this is a local-comfort setting only.
  devIndicators: false,

  // Vercel wants the default build; GitHub Pages needs a static export into out/.
  // The Pages workflow sets these two env vars, so neither host needs a config edit.
  output: process.env.NEXT_OUTPUT === "export" ? "export" : undefined,
  basePath: process.env.NEXT_BASE_PATH || undefined,
};

export default nextConfig;
