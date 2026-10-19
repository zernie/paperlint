/**
 * WHICH ENVIRONMENT VARIABLE HOLDS A HOTCRP SITE'S API TOKEN — HotCRP's fact, so HotCRP's adapter.
 * Pure.
 *
 * A HotCRP token works on the site it was made on and nowhere else (measured 2026-10-19: a token
 * made on one HotCRP site gets `401 Unauthorized` from `msr2027.hotcrp.com`'s `/api/whoami`). So the
 * variable is named after the site — `HOTCRP_TOKEN_<first label of the host>`, or of the last path
 * segment for a site served under a path — and an author with live submissions at two venues sets
 * two variables (#236). The site-less `HOTCRP_TOKEN` is no longer read; the policy that refuses it
 * by name is the domain's (`src/domain/portal-token.ts`).
 */
import { hostOf } from "../../domain/portal-token.ts";

/** The site-less variable, read until #236: named when it is still set, never used. */
export const SITE_LESS_VARIABLE = "HOTCRP_TOKEN";

/** The shape of a site's variable, as a message names it. */
export const VARIABLE_PATTERN = `${SITE_LESS_VARIABLE}_<LABEL>`;

/**
 * What names a site: the last segment of its URL's path when it has one — one HotCRP install can
 * serve several conferences under paths of one host (`https://hotcrp.example.edu/conf2027`) — else
 * the first label of its host.
 */
function siteLabel(url: string): string {
  const path = URL.canParse(url) ? new URL(url).pathname : "";
  const segment = path
    .split("/")
    .filter((s) => s !== "")
    .at(-1);
  return segment ?? hostOf(url).split(".", 1).join("");
}

/**
 * The variable a HotCRP site's token is read from: `HOTCRP_TOKEN_` and the site's label upper-cased,
 * every character but a letter or digit made `_`. `https://msr2027.hotcrp.com` →
 * `HOTCRP_TOKEN_MSR2027`; `https://aidc.submit.acsac.org` → `HOTCRP_TOKEN_AIDC`;
 * `https://hotcrp.example.edu/conf2027` → `HOTCRP_TOKEN_CONF2027`.
 */
export function tokenVariable(url: string): string {
  const label = siteLabel(url);
  return `${SITE_LESS_VARIABLE}_${label.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`;
}
