/**
 * WHICH ENVIRONMENT VARIABLE HOLDS A HOTCRP SITE'S API TOKEN — HotCRP's fact, so HotCRP's adapter.
 * Pure.
 *
 * What HotCRP's source says (github.com/kohler/hotcrp, read 2026-11-19; #547). A token is one of two
 * kinds, and its prefix tells which: `hcT_` is kept in the installation's shared contact database and
 * works on every conference of that installation — all of hotcrp.com; `hct_` is kept in one
 * conference's own database and works there only (`src/init.php`, where a bearer token is looked up
 * by its prefix; `test/t_authorize.php`: "Bearer tokens start with hct_ (local) or hcT_ (cdb)").
 * An installation with a shared contact database offers "Site availability: All sites / This site
 * only" when a token is made, "All sites" preselected (`src/userinfo/u_developer.php`), so on
 * hotcrp.com a token is shared unless the author picks otherwise. A self-hosted install is a separate
 * installation with its own databases and cannot know a hotcrp.com token — what was measured on
 * 2026-10-19: a token made on a self-hosted install got `401 Unauthorized` from
 * `msr2027.hotcrp.com`'s `/api/whoami`. That crossed two installations; it says nothing about two
 * hosted sites.
 *
 * So a `*.hotcrp.com` site reads `HOTCRP_TOKEN_<subdomain>` first, as an override, then the one
 * variable of the whole service, `HOTCRP_TOKEN_HOTCRP_COM` — refused when it holds a site-only
 * token. A self-hosted install reads `HOTCRP_TOKEN_<host and path>` only, never the service's. The
 * site-less `HOTCRP_TOKEN` is no longer read; the policy that refuses it by name is the domain's
 * (`src/domain/portal-token.ts`).
 */
import { hostOf } from "../../domain/portal-token.ts";

/** The site-less variable, read until #236: named when it is still set, never used. */
export const SITE_LESS_VARIABLE = "HOTCRP_TOKEN";

/** The shape of a site's variable, as a message names it. */
export const VARIABLE_PATTERN = `${SITE_LESS_VARIABLE}_<LABEL>`;

/** The hosted service, where each conference is a subdomain of its own. */
const HOSTED = ".hotcrp.com";

/** The one variable of the hosted service: its sites share an account system, so one token. */
const SHARED_VARIABLE = `${SITE_LESS_VARIABLE}_HOTCRP_COM`;

/**
 * Whether a token works on one site only: HotCRP's lowercase `hct_` prefix (an all-sites token starts
 * `hcT_`).
 */
export const isSiteOnlyToken = (token: string): boolean =>
  token.startsWith("hct_");

/** Whether `url` is a site of the hosted service. */
const isHosted = (url: string): boolean => hostOf(url).endsWith(HOSTED);

/**
 * The variable shared by every site of the hosted service, for a site on it; null for a self-hosted
 * install, whose token the hosted service does not accept (measured 2026-10-19: 401) and which never
 * reads this one.
 */
export const sharedVariable = (url: string): string | null =>
  isHosted(url) ? SHARED_VARIABLE : null;

/**
 * What names a site, and no other: on the hosted service the subdomain alone
 * (`msr2027.hotcrp.com` → `msr2027`); anywhere else the whole host, with a port other than the
 * scheme's default, and path (`hotcrp.example.edu/conf2027`, `review.example.org:8443/conf`),
 * because one install may serve several conferences under paths or ports, and two hosts may share a
 * first label.
 */
function siteLabel(url: string): string {
  const host = hostOf(url);
  if (isHosted(url)) return host.slice(0, -HOSTED.length);
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
