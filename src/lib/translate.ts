/**
 * Cookie logic for the Google Translate widget.
 *
 * Pure, and deliberately separate from the component: this is the part that was
 * wrong, and it can only be tested properly if it does not need a browser or a
 * JSX parser.
 */

/**
 * Every domain scope the `googtrans` cookie could have been set on.
 *
 * A cookie can only be deleted by writing an expired one with the SAME domain
 * and path, and `document.cookie` never reveals which scope an existing cookie
 * used. So the only reliable way to remove it is to try all of them.
 *
 * The scope that matters, and the one the original code missed, is the
 * REGISTRABLE DOMAIN. Google sets `googtrans` on `.gdmacros.com`, not on the
 * host being browsed, so on `www.gdmacros.com` clearing `www.gdmacros.com` and
 * `.www.gdmacros.com` deleted nothing at all. The cookie survived the reload,
 * the widget read it again, and the page came back in the same language, which
 * made switching to English look like a plain refresh.
 *
 * Walking up the labels stops before the last one, because a browser refuses to
 * set a cookie on a public suffix such as `.com` anyway.
 */
export function cookieDomainScopes(hostname: string | undefined): string[] {
  // "" means no domain attribute at all, which is the host-only cookie.
  const scopes = [""];
  const host = (hostname ?? "").trim();

  // An IP address or a single-label host (localhost) has only the host-only
  // scope; a browser would reject any domain attribute on those.
  if (!host || host.startsWith("[") || /^[\d.]+$/.test(host)) return scopes;

  const labels = host.split(".");
  for (let i = 0; i <= labels.length - 2; i++) {
    const domain = labels.slice(i).join(".");
    scopes.push(domain, `.${domain}`);
  }
  return scopes;
}

/**
 * The language Google has actually applied, parsed out of a cookie string.
 *
 * There can legitimately be MORE THAN ONE `googtrans` cookie at a time, on
 * different domain scopes, and `document.cookie` lists them all with no way to
 * tell them apart. Taking the first match would report whichever the browser
 * happened to list first, so any translated value wins here: if some scope
 * still says Spanish then the page is in Spanish, and the menu should say so.
 */
export function parseTranslateLang(cookieString: string): string {
  const values = [...(cookieString ?? "").matchAll(/(?:^|;\s*)googtrans=([^;]*)/g)];
  for (const match of values) {
    // The cookie looks like "/en/es", where the third segment is the target.
    const target = decodeURIComponent(match[1]).split("/")[2];
    if (target && target !== "en") return target;
  }
  return "en";
}

/**
 * The cookie writes that delete `googtrans` from every possible scope.
 *
 * Returned as strings rather than assigned here so the exact set can be
 * asserted in a test. Both `expires` and `max-age` are written because some
 * browsers honour one and not the other, and both the rooted and the pathless
 * variants are cleared: a cookie set without a path defaults to the directory
 * it was set from, which is a different cookie as far as deletion is concerned.
 */
export function clearCookieWrites(hostname: string | undefined): string[] {
  const expiry = "expires=Thu, 01 Jan 1970 00:00:00 GMT; max-age=0";
  const writes: string[] = [];

  for (const domain of cookieDomainScopes(hostname)) {
    for (const path of ["/", ""]) {
      const parts = ["googtrans=", expiry];
      if (path) parts.push(`path=${path}`);
      if (domain) parts.push(`domain=${domain}`);
      writes.push(parts.join("; "));
    }
  }
  return writes;
}

/**
 * The last-resort writes, used only when the cookie could not be deleted.
 *
 * `/en/en` means "translate English into English", which the widget treats as
 * untranslated. Without this an undeletable cookie would make the English
 * option reload the page forever without ever changing it, which is precisely
 * the failure being fixed.
 */
export function neutralCookieWrites(hostname: string | undefined): string[] {
  return cookieDomainScopes(hostname).map((domain) => {
    const parts = ["googtrans=/en/en", "path=/"];
    if (domain) parts.push(`domain=${domain}`);
    return parts.join("; ");
  });
}
