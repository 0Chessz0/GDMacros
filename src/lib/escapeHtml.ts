/**
 * HTML escaping, on its own so that nothing has to import a module it does not
 * need in order to get it.
 *
 * That sounds pedantic and is not. This function is wanted in two places:
 * `email/support.ts`, which forwards support mail and therefore holds the
 * private forwarding address, and `legalNotice.ts`, which is reachable from a
 * CLIENT component. Importing one from the other creates an edge from the
 * browser bundle to a module containing a private address, and the only thing
 * keeping the address out is the bundler choosing to tree-shake an unused
 * constant. That is a silent dependency on an optimisation, and it fails the
 * moment somebody imports a second thing from that file.
 *
 * Splitting it removes the edge instead of relying on it not mattering.
 */
export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
