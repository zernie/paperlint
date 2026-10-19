/**
 * WHICH TOKEN A PORTAL COMMAND USES — the policy, in one place. Pure.
 *
 * The site's own variable, and nothing else: there is NO fallback to a site-less variable. With one,
 * which token a command used is not visible, and a token from another site reads as "the portal
 * refused". A site-less variable that is set while the site's own is not is refused by name. The
 * names themselves are the portal's (`src/adapters/hotcrp/token.ts`).
 */
import { err, ok, type Result } from "./result.ts";

/** The site's host as written in its URL; the URL itself when it does not parse. */
export const hostOf = (url: string): string =>
  URL.canParse(url) ? new URL(url).hostname : url;

/** The variables a lookup reads: the site's own, and the site-less one it refuses. */
export interface TokenNames {
  readonly variable: string;
  readonly siteLess: string;
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
  { variable, siteLess }: TokenNames,
  read: (name: string) => string | undefined,
): Result<FoundToken, TokenProblem> {
  const token = value(read, variable);
  if (token !== null) return ok({ variable, token });
  return value(read, siteLess) === null
    ? err({ kind: "missing", variable })
    : err({ kind: "site-less", variable, siteLess });
}
