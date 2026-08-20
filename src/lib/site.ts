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
  // Must match the domain Vercel serves as primary, including whether it has
  // "www". If Vercel lists gdmacros.com without www as the primary domain,
  // change this line, because every canonical tag and sitemap URL derives from it.
  url: "https://www.gdmacros.com",

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

/**
 * Every language the Google Translate widget accepts.
 *
 * `label` is the language's own name, so a Russian speaker scanning the list
 * sees "Русский". `english` exists so the menu's filter box also matches the
 * English name, which is what most people will type.
 *
 * A few codes are the widget's legacy ones rather than the modern ISO values:
 * Hebrew is `iw` (not `he`) and Javanese is `jw` (not `jv`). Changing those to
 * the modern codes silently breaks those two languages, because the hidden
 * <select> the widget renders has no matching option.
 *
 * English is first because it is the source language; the rest are sorted by
 * their English name.
 */
export const LANGUAGES = [
  { code: "en", label: "English", english: "English" },
  { code: "af", label: "Afrikaans", english: "Afrikaans" },
  { code: "sq", label: "Shqip", english: "Albanian" },
  { code: "am", label: "አማርኛ", english: "Amharic" },
  { code: "ar", label: "العربية", english: "Arabic" },
  { code: "hy", label: "Հայերեն", english: "Armenian" },
  { code: "az", label: "Azərbaycan", english: "Azerbaijani" },
  { code: "eu", label: "Euskara", english: "Basque" },
  { code: "be", label: "Беларуская", english: "Belarusian" },
  { code: "bn", label: "বাংলা", english: "Bengali" },
  { code: "bs", label: "Bosanski", english: "Bosnian" },
  { code: "bg", label: "Български", english: "Bulgarian" },
  { code: "ca", label: "Català", english: "Catalan" },
  { code: "ceb", label: "Cebuano", english: "Cebuano" },
  { code: "ny", label: "Chichewa", english: "Chichewa" },
  { code: "zh-CN", label: "简体中文", english: "Chinese (Simplified)" },
  { code: "zh-TW", label: "繁體中文", english: "Chinese (Traditional)" },
  { code: "co", label: "Corsu", english: "Corsican" },
  { code: "hr", label: "Hrvatski", english: "Croatian" },
  { code: "cs", label: "Čeština", english: "Czech" },
  { code: "da", label: "Dansk", english: "Danish" },
  { code: "nl", label: "Nederlands", english: "Dutch" },
  { code: "eo", label: "Esperanto", english: "Esperanto" },
  { code: "et", label: "Eesti", english: "Estonian" },
  { code: "tl", label: "Filipino", english: "Filipino" },
  { code: "fi", label: "Suomi", english: "Finnish" },
  { code: "fr", label: "Français", english: "French" },
  { code: "fy", label: "Frysk", english: "Frisian" },
  { code: "gl", label: "Galego", english: "Galician" },
  { code: "ka", label: "ქართული", english: "Georgian" },
  { code: "de", label: "Deutsch", english: "German" },
  { code: "el", label: "Ελληνικά", english: "Greek" },
  { code: "gu", label: "ગુજરાતી", english: "Gujarati" },
  { code: "ht", label: "Kreyòl Ayisyen", english: "Haitian Creole" },
  { code: "ha", label: "Hausa", english: "Hausa" },
  { code: "haw", label: "ʻŌlelo Hawaiʻi", english: "Hawaiian" },
  { code: "iw", label: "עברית", english: "Hebrew" },
  { code: "hi", label: "हिन्दी", english: "Hindi" },
  { code: "hmn", label: "Hmoob", english: "Hmong" },
  { code: "hu", label: "Magyar", english: "Hungarian" },
  { code: "is", label: "Íslenska", english: "Icelandic" },
  { code: "ig", label: "Igbo", english: "Igbo" },
  { code: "id", label: "Bahasa Indonesia", english: "Indonesian" },
  { code: "ga", label: "Gaeilge", english: "Irish" },
  { code: "it", label: "Italiano", english: "Italian" },
  { code: "ja", label: "日本語", english: "Japanese" },
  { code: "jw", label: "Basa Jawa", english: "Javanese" },
  { code: "kn", label: "ಕನ್ನಡ", english: "Kannada" },
  { code: "kk", label: "Қазақ", english: "Kazakh" },
  { code: "km", label: "ខ្មែរ", english: "Khmer" },
  { code: "ko", label: "한국어", english: "Korean" },
  { code: "ku", label: "Kurdî", english: "Kurdish (Kurmanji)" },
  { code: "ky", label: "Кыргызча", english: "Kyrgyz" },
  { code: "lo", label: "ລາວ", english: "Lao" },
  { code: "la", label: "Latina", english: "Latin" },
  { code: "lv", label: "Latviešu", english: "Latvian" },
  { code: "lt", label: "Lietuvių", english: "Lithuanian" },
  { code: "lb", label: "Lëtzebuergesch", english: "Luxembourgish" },
  { code: "mk", label: "Македонски", english: "Macedonian" },
  { code: "mg", label: "Malagasy", english: "Malagasy" },
  { code: "ms", label: "Bahasa Melayu", english: "Malay" },
  { code: "ml", label: "മലയാളം", english: "Malayalam" },
  { code: "mt", label: "Malti", english: "Maltese" },
  { code: "mi", label: "Māori", english: "Maori" },
  { code: "mr", label: "मराठी", english: "Marathi" },
  { code: "mn", label: "Монгол", english: "Mongolian" },
  { code: "my", label: "မြန်မာ", english: "Myanmar (Burmese)" },
  { code: "ne", label: "नेपाली", english: "Nepali" },
  { code: "no", label: "Norsk", english: "Norwegian" },
  { code: "ps", label: "پښتو", english: "Pashto" },
  { code: "fa", label: "فارسی", english: "Persian" },
  { code: "pl", label: "Polski", english: "Polish" },
  { code: "pt", label: "Português", english: "Portuguese" },
  { code: "pa", label: "ਪੰਜਾਬੀ", english: "Punjabi" },
  { code: "ro", label: "Română", english: "Romanian" },
  { code: "ru", label: "Русский", english: "Russian" },
  { code: "sm", label: "Gagana Samoa", english: "Samoan" },
  { code: "gd", label: "Gàidhlig", english: "Scots Gaelic" },
  { code: "sr", label: "Српски", english: "Serbian" },
  { code: "st", label: "Sesotho", english: "Sesotho" },
  { code: "sn", label: "Shona", english: "Shona" },
  { code: "sd", label: "سنڌي", english: "Sindhi" },
  { code: "si", label: "සිංහල", english: "Sinhala" },
  { code: "sk", label: "Slovenčina", english: "Slovak" },
  { code: "sl", label: "Slovenščina", english: "Slovenian" },
  { code: "so", label: "Soomaali", english: "Somali" },
  { code: "es", label: "Español", english: "Spanish" },
  { code: "su", label: "Basa Sunda", english: "Sundanese" },
  { code: "sw", label: "Kiswahili", english: "Swahili" },
  { code: "sv", label: "Svenska", english: "Swedish" },
  { code: "tg", label: "Тоҷикӣ", english: "Tajik" },
  { code: "ta", label: "தமிழ்", english: "Tamil" },
  { code: "te", label: "తెలుగు", english: "Telugu" },
  { code: "th", label: "ไทย", english: "Thai" },
  { code: "tr", label: "Türkçe", english: "Turkish" },
  { code: "uk", label: "Українська", english: "Ukrainian" },
  { code: "ur", label: "اردو", english: "Urdu" },
  { code: "uz", label: "Oʻzbek", english: "Uzbek" },
  { code: "vi", label: "Tiếng Việt", english: "Vietnamese" },
  { code: "cy", label: "Cymraeg", english: "Welsh" },
  { code: "xh", label: "isiXhosa", english: "Xhosa" },
  { code: "yi", label: "ייִדיש", english: "Yiddish" },
  { code: "yo", label: "Yorùbá", english: "Yoruba" },
  { code: "zu", label: "isiZulu", english: "Zulu" },
] as const;
