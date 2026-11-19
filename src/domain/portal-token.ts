/**
 * WHICH TOKEN A PORTAL COMMAND USES — the policy, in one place. Pure.
 *
 * The site's own variable, then the one its portal's sites share (when it has one), and nothing else:
 * there is NO fallback to a site-less variable. With one, which token a command used is not visible,
 * and a token from another site reads as "the portal refused". A site-less variable that is set while
 * neither of those is, is refused by name. The names themselves are the portal's
 * (`src/adapters/hotcrp/token.ts`).
 */
import { err, ok, type Result } from "./result.ts";

/**
 * The site's host as written in its URL, with its port when it is not the scheme's default
 * (`review.example.org:8443`): two sites on one host differ by port. The URL itself when it does
 * not parse.
 */
export const hostOf = (url: string): string =>
  URL.canParse(url) ? new URL(url).host : url;

/**
 * The variables a lookup reads: the site's own, the one shared by the portal's sites (null: none),
 * and the site-less one it refuses.
 */
export interface TokenNames {
  readonly variable: string;
  readonly shared: string | null;
  /** Whether a token is valid on one site only, so cannot stand in for the shared variable. */
  readonly siteOnly: (token: string) => boolean;
  readonly siteLess: string;
}

/** A token found, and the variable it came from. */
export interface FoundToken {
  readonly variable: string;
  readonly token: string;
}

/** Why there is no token to use. */
export type TokenProblem =
  /** The site's variable is not set (or blank), nor the shared one, nor the site-less one. */
  | {
      readonly kind: "missing";
      readonly variable: string;
      readonly shared: string | null;
    }
  /** The shared variable holds a token that works on one site only. */
  | {
      readonly kind: "site-only";
      readonly variable: string;
      readonly shared: string;
    }
  /** Neither the site's variable nor the shared one is set, but the site-less one, no longer read, is. */
  | {
      readonly kind: "site-less";
      readonly variable: string;
      readonly shared: string | null;
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
 * The token for a portal, read through `read` (the root reads the environment): the site's variable,
 * else the shared one (unless that holds a token for one site only). A set site-less variable never stands in for either — it is named as the
 * problem instead.
 */
export function lookUpToken(
  { variable, shared, siteOnly, siteLess }: TokenNames,
  read: (name: string) => string | undefined,
): Result<FoundToken, TokenProblem> {
  const own = value(read, variable);
  if (own !== null) return ok({ variable, token: own });
  const common = shared === null ? null : value(read, shared);
  if (shared !== null && common !== null)
    return siteOnly(common)
      ? err({ kind: "site-only", variable, shared })
      : ok({ variable: shared, token: common });
  return value(read, siteLess) === null
    ? err({ kind: "missing", variable, shared })
    : err({ kind: "site-less", variable, shared, siteLess });
}
