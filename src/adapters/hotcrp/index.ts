/**
 * HotCRP, as the `PortalSite` and `SubmissionPortal` ports: its token variables and token page, its
 * REST API read and written over `fetch`, its answers parsed here. Everything that changes if HotCRP's API does lives in this folder.
 *
 * HotCRP is open source (PHP, https://github.com/kohler/hotcrp). When its behaviour is unclear, its
 * source is the first place to look — before guessing, and before testing against a live site with
 * real credentials. Worked example (#547): whether one token serves two conferences on hotcrp.com
 * is answered by `src/init.php` (a bearer token starting `hcT_` is looked up in the installation's
 * shared contact database, one starting `hct_` in the one conference's own) and by
 * `src/userinfo/u_developer.php` (a new token's "Site availability" defaults to "All sites"). So one
 * shared token for all of hotcrp.com is the normal case; a separate token is the exception — a
 * self-hosted server, or a token made as "This site only". Details in `token.ts`.
 * This is the page a contributor to this adapter reads first; `docs/submission.md` is for its users.
 */
export {
  CONTENT_FIELD,
  changeObject,
  createObject,
  hotcrpPortal,
  type HotcrpOptions,
} from "./portal.io.ts";
export {
  parseCreate,
  parseOptions,
  parseShow,
  parseUpdate,
  sha256OfHash,
} from "./response.ts";
export { hotcrpDeadlines } from "./deadlines.io.ts";
export { hotcrpSite } from "./site.ts";
export {
  SITE_LESS_VARIABLE,
  VARIABLE_PATTERN,
  isSiteOnlyToken,
  sharedVariable,
  tokenVariable,
} from "./token.ts";
export { parseDeadlinesPage, whatOf } from "./deadlines.ts";
