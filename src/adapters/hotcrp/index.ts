/**
 * HotCRP, as the `SubmissionPortal` port: its REST API read and written over `fetch`, its answers
 * parsed here. Everything that changes if HotCRP's API does lives in this folder.
 */
export {
  CONTENT_FIELD,
  changeObject,
  hotcrpPortal,
  type HotcrpOptions,
} from "./portal.io.ts";
export { parseShow, parseUpdate, sha256OfHash } from "./response.ts";
