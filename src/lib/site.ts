/**
 * Single place to edit branding and outbound links.
 * Anything left as an empty string is hidden from the UI rather than rendered dead.
 */
export const site = {
  name: "GDMacros",
  tagline: "Free Geometry Dash macros",

  /**
   * The one-line pitch. This is also the meta description Google shows under
   * the result, so it leads with what people actually search for and stays
   * under ~160 characters.
   */
  description:
    "Download free Geometry Dash macros. Browse macros for extreme demons and every other level, recorded with Mega Hack and xdBot.",

  /**
   * Canonical origin, used for absolute URLs in metadata, sitemap.xml and
   * robots.txt. Must match the domain you actually serve on, with no trailing
   * slash, or Google will index the wrong URLs.
   */
  url: "https://gdmacros.com",

  /** Where "Submit a macro" and the GitHub button point. */
  repo: "https://github.com/0Chessz0/GDMacros",
} as const;

/**
 * Search terms the site should be findable by. Modern Google ignores the
 * keywords meta tag, so these exist to keep the real copy honest: every phrase
 * here should also appear naturally in visible text somewhere on the site.
 */
export const KEYWORDS = [
  "geometry dash macros",
  "gd macros",
  "geometry dash macro download",
  "geometry dash macro",
  "free geometry dash macros",
  "xdBot macros",
  "Mega Hack macros",
  "geometry dash extreme demon macros",
  "gd macro list",
];

/** Level pages on GD Browser, e.g. https://gdbrowser.com/128 */
export const GD_BROWSER = "https://gdbrowser.com";

/** Google Form that macro submissions go through. */
export const SUBMIT_URL = "https://forms.gle/WLJwL9Y82KZNnaQp8";

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
