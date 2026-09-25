/**
 * curl, as the `Download` port. Its own adapter because curl is its own program: what changes if
 * curl does (its flags, its exit codes, its proxy handling) changes here and nowhere else.
 */
export { curlDownload, curlFailure } from "./download.io.ts";
