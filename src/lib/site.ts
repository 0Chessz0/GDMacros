/**
 * Single place to edit branding and outbound links.
 * Anything left as an empty string is hidden from the UI rather than rendered dead.
 */
export const site = {
  name: "GDMacros",
  tagline: "A community catalog of Geometry Dash macros",
  description:
    "Browse and download community-recorded Geometry Dash macros. Search by level, creator, macro author or level ID.",

  /**
   * Used for absolute URLs in metadata, sitemap.xml and robots.txt.
   * Vercel will assign this automatically from the project name, so check the real
   * domain after the first deploy and correct it here if it differs.
   */
  url: "https://gdmacros.vercel.app",

  /** Where "Submit a macro" and the GitHub button point. */
  repo: "https://github.com/0Chessz0/GDMacros",
} as const;

/** Level pages on GD Browser, e.g. https://gdbrowser.com/128 */
export const GD_BROWSER = "https://gdbrowser.com";

/** Opens the prefilled submission form in .github/ISSUE_TEMPLATE. */
export const SUBMIT_URL = `${site.repo}/issues/new?template=macro-submission.yml`;

/**
 * Offered in the navbar language menu. Codes must be ones Google Translate
 * accepts. Add or remove freely.
 */
export const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "pt", label: "Português" },
  { code: "fr", label: "Français" },
  { code: "de", label: "Deutsch" },
  { code: "nl", label: "Nederlands" },
  { code: "pl", label: "Polski" },
  { code: "ru", label: "Русский" },
  { code: "ja", label: "日本語" },
  { code: "zh-CN", label: "中文" },
] as const;
