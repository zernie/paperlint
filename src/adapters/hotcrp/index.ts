/**
 * HotCRP, as the `PortalSite` and `SubmissionPortal` ports: its token variables and token page, its
 * REST API read and written over `fetch`, its answers parsed here. Everything that changes if HotCRP's API does lives in this folder.
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
  parseShow,
  parseUpdate,
  sha256OfHash,
} from "./response.ts";
export { hotcrpDeadlines } from "./deadlines.io.ts";
export { hotcrpSite } from "./site.ts";
export {
  SITE_LESS_VARIABLE,
  VARIABLE_PATTERN,
  tokenVariable,
} from "./token.ts";
export { parseDeadlinesPage, whatOf } from "./deadlines.ts";
