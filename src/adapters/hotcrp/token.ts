/**
 * WHICH ENVIRONMENT VARIABLE HOLDS A HOTCRP SITE'S API TOKEN — HotCRP's fact, so HotCRP's adapter.
 * Pure.
 *
 * A HotCRP token works on the site it was made on and nowhere else (measured 2026-10-19: a token
 * made on one HotCRP site gets `401 Unauthorized` from `msr2027.hotcrp.com`'s `/api/whoami`). So the
 * variable is named after the site, and no two sites share one — `HOTCRP_TOKEN_<subdomain>` on the
 * hosted service, `HOTCRP_TOKEN_<host and path>` anywhere else — and an author with live submissions
 * at two venues sets two variables (#236). The site-less `HOTCRP_TOKEN` is no longer read; the policy that refuses it
 * by name is the domain's (`src/domain/portal-token.ts`).
 */
import { hostOf } from "../../domain/portal-token.ts";

/** The site-less variable, read until #236: named when it is still set, never used. */
export const SITE_LESS_VARIABLE = "HOTCRP_TOKEN";

/** The shape of a site's variable, as a message names it. */
export const VARIABLE_PATTERN = `${SITE_LESS_VARIABLE}_<LABEL>`;

/** The hosted service, where each conference is a subdomain of its own. */
const HOSTED = ".hotcrp.com";

/**
 * What names a site, and no other: on the hosted service the subdomain alone
 * (`msr2027.hotcrp.com` → `msr2027`); anywhere else the whole host, with a port other than the
 * scheme's default, and path (`hotcrp.example.edu/conf2027`, `review.example.org:8443/conf`),
 * because one install may serve several conferences under paths or ports, and two hosts may share a
 * first label.
 */
function siteLabel(url: string): string {
  const host = hostOf(url);
  if (host.endsWith(HOSTED)) return host.slice(0, -HOSTED.length);
  const path = URL.canParse(url) ? new URL(url).pathname : "";
  return `${host}${path}`;
}

/**
 * The variable a HotCRP site's token is read from: `HOTCRP_TOKEN_` and the site's label upper-cased,
 * every run of characters but letters and digits made one `_`, none at either end.
 * `https://msr2027.hotcrp.com` → `HOTCRP_TOKEN_MSR2027`; `https://aidc.submit.acsac.org` →
 * `HOTCRP_TOKEN_AIDC_SUBMIT_ACSAC_ORG`; `https://hotcrp.example.edu/conf2027` →
 * `HOTCRP_TOKEN_HOTCRP_EXAMPLE_EDU_CONF2027`.
 */
export function tokenVariable(url: string): string {
  const label = siteLabel(url);
  const name = label
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `${SITE_LESS_VARIABLE}_${name}`;
}
