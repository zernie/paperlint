/**
 * WHICH ENVIRONMENT VARIABLE HOLDS A PORTAL'S API TOKEN — one policy, in one place. Pure.
 *
 * A HotCRP token works on the site it was made on and nowhere else (measured 2026-10-19: a token
 * made on one HotCRP site gets `401 Unauthorized` from `msr2027.hotcrp.com`'s `/api/whoami`). So
 * the variable is named after the site — `HOTCRP_TOKEN_<first label of the host>`, or of the last path
 * segment for a site served under a path — and an author
 * with live submissions at two venues sets two variables (#236).
 *
 * There is NO fallback to a site-less `HOTCRP_TOKEN`: with one, which token a command used is not
 * visible, and a token from another site reads as "the portal refused". A `HOTCRP_TOKEN` that is
 * set while the site's own variable is not is refused by name, with the variable to rename it to.
 */
import { err, ok, type Result } from "./result.ts";
import type { PortalKind, SupportedPortal } from "./submission.ts";

/** The prefix of each portal kind's token variables, and the site-less name it no longer reads. */
export const TOKEN_PREFIX: Readonly<Record<PortalKind, string>> = {
  hotcrp: "HOTCRP_TOKEN",
};

/** The site's host as written in its URL; the URL itself when it does not parse. */
export const hostOf = (url: string): string =>
  URL.canParse(url) ? new URL(url).hostname : url;

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
 * The variable a portal's token is read from: the kind's prefix, `_`, and the site's label
 * upper-cased, every character but a letter or digit made `_`. `https://msr2027.hotcrp.com` →
 * `HOTCRP_TOKEN_MSR2027`; `https://aidc.submit.acsac.org` → `HOTCRP_TOKEN_AIDC`;
 * `https://hotcrp.example.edu/conf2027` → `HOTCRP_TOKEN_CONF2027`.
 */
export function tokenVariable(p: SupportedPortal): string {
  const label = siteLabel(p.url);
  return `${TOKEN_PREFIX[p.kind]}_${label.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`;
}

/** A token found, and the variable it came from. */
export interface FoundToken {
  readonly variable: string;
  readonly token: string;
}

/** Why there is no token to use. */
export type TokenProblem =
  /** The site's variable is not set (or blank), and neither is the site-less one. */
  | { readonly kind: "missing"; readonly variable: string }
  /** The site's variable is not set, but the site-less one, no longer read, is. */
  | {
      readonly kind: "site-less";
      readonly variable: string;
      readonly siteLess: string;
    };

const value = (
  read: (name: string) => string | undefined,
  name: string,
): string | null => {
  const v = read(name)?.trim();
  return v === undefined || v === "" ? null : v;
};

/**
 * The token for a portal, read through `read` (the root reads the environment): the site's variable
 * only. A set site-less variable never stands in for it — it is named as the problem instead.
 */
export function lookUpToken(
  p: SupportedPortal,
  read: (name: string) => string | undefined,
): Result<FoundToken, TokenProblem> {
  const variable = tokenVariable(p);
  const token = value(read, variable);
  if (token !== null) return ok({ variable, token });
  const siteLess = TOKEN_PREFIX[p.kind];
  return value(read, siteLess) === null
    ? err({ kind: "missing", variable })
    : err({ kind: "site-less", variable, siteLess });
}
