/**
 * AdSense identifiers are public configuration, not secrets. Keeping the
 * placement ids separate means each location can be measured or disabled
 * without changing the component that renders it.
 */
export const ADSENSE_CLIENT = "ca-pub-8811219626379689";
export const ADSENSE_ENABLED = process.env.NEXT_PUBLIC_ADSENSE_ENABLED === "true";
export const ADSENSE_HOME_SLOT = process.env.NEXT_PUBLIC_ADSENSE_HOME_SLOT?.trim() ?? "";
export const ADSENSE_MACRO_SLOT = process.env.NEXT_PUBLIC_ADSENSE_MACRO_SLOT?.trim() ?? "";

/** Only pages that actually contain an ad may show the ad-block reminder. */
export function isAdSupportedPath(pathname: string): boolean {
  return pathname === "/" || pathname.startsWith("/macro/");
}

export function hasConfiguredAdSlot(): boolean {
  return Boolean(ADSENSE_HOME_SLOT || ADSENSE_MACRO_SLOT);
}
