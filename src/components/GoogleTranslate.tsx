"use client";

import { useEffect } from "react";
import { LANGUAGES } from "@/lib/site";
import { clearCookieWrites, neutralCookieWrites, parseTranslateLang } from "@/lib/translate";

/**
 * Google's free website-translate widget. It needs no API key and no billing
 * account, which is why it's used here instead of the Cloud Translation API.
 * A static site has nowhere to hide a key.
 *
 * The widget's own UI (top banner, tooltip bubble) is hidden in globals.css and
 * driven entirely from the navbar's language menu via `setTranslateLang`.
 */

declare global {
  interface Window {
    googleTranslateElementInit?: () => void;
    google?: {
      translate: {
        TranslateElement: new (options: Record<string, unknown>, container: string) => unknown;
      };
    };
  }
}

const SCRIPT_ID = "google-translate-script";

/** Reads the language Google has currently applied, from its own cookie. */
export function currentTranslateLang(): string {
  if (typeof document === "undefined") return "en";
  return parseTranslateLang(document.cookie);
}

/** Whether a googtrans cookie is still readable after an attempt to clear it. */
function translateCookieRemains(): boolean {
  return /(?:^|;\s*)googtrans=[^;]/.test(document.cookie);
}

/**
 * Removes the cookie from every scope it could have been written to.
 *
 * See `lib/translate` for why this has to try more than the current host: the
 * scope that actually matters is the registrable domain, and missing it is what
 * made switching back to English do nothing.
 */
function clearTranslateCookie() {
  for (const write of clearCookieWrites(window.location.hostname)) {
    document.cookie = write;
  }
}

/** Switch the page language. Pass "en" to restore the original text. */
export function setTranslateLang(code: string) {
  if (code === "en") {
    // Clearing the cookie and reloading is the only reliable way back to the
    // untranslated DOM, because the widget has no "reset" entry point.
    clearTranslateCookie();

    // If something we cannot delete is still holding a value, neutralise it
    // instead. `/en/en` means "translate English into English", which the
    // widget treats as untranslated. Without this fallback an undeletable
    // cookie would make the English option reload the page forever and never
    // change anything, which is the exact failure this is here to prevent.
    if (translateCookieRemains()) {
      for (const write of neutralCookieWrites(window.location.hostname)) {
        document.cookie = write;
      }
    }

    window.location.reload();
    return;
  }

  // Drive Google's own hidden <select>; it appears a moment after the script loads.
  let attempts = 0;
  const apply = () => {
    const select = document.querySelector<HTMLSelectElement>("select.goog-te-combo");
    if (select) {
      select.value = code;
      select.dispatchEvent(new Event("change"));
    } else if (attempts++ < 50) {
      setTimeout(apply, 100);
    }
  };
  apply();
}

export default function GoogleTranslate() {
  useEffect(() => {
    if (document.getElementById(SCRIPT_ID)) return;

    window.googleTranslateElementInit = () => {
      if (!window.google?.translate) return;
      new window.google.translate.TranslateElement(
        {
          pageLanguage: "en",
          includedLanguages: LANGUAGES.filter((l) => l.code !== "en")
            .map((l) => l.code)
            .join(","),
          autoDisplay: false,
        },
        "google_translate_element",
      );
    };

    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = "https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit";
    script.async = true;
    document.body.appendChild(script);
  }, []);

  // Google requires a real mount point; it stays visually hidden.
  return <div id="google_translate_element" aria-hidden="true" className="sr-only" />;
}
