/**
 * A HotCRP site before any token, as the `PortalSite` port: the variable its token is read from,
 * where on the site an author makes one and with which scopes, what `submission new` leaves to the
 * site, a submission's page — and the API, once there is a token. Every word here is HotCRP's.
 */
import type { PortalSite } from "../../ports/submission-portal.ts";
import { hotcrpPortal } from "./portal.io.ts";
import {
  SITE_LESS_VARIABLE,
  VARIABLE_PATTERN,
  tokenVariable,
} from "./token.ts";

/** The HotCRP site at `url` (no trailing slash). */
export const hotcrpSite = (url: string): PortalSite => ({
  tokenVariable: tokenVariable(url),
  siteLessVariable: SITE_LESS_VARIABLE,
  variablePattern: VARIABLE_PATTERN,
  credentials: {
    // HotCRP's own link to it: `hotlink("Profile > Developer", "profile", ["t" => "developer"])`
    // (src/help/h_developer.php in kohler/hotcrp).
    page: `${url}/profile?t=developer`,
    where: "Account settings → Developer → API tokens",
    scopes:
      "submeta:read and document:read (show), submeta:write and document:write (update, new) — tick all four to use every subcommand",
  },
  siteOnly: [
    "PC conflicts (HotCRP's API takes them as pc_conflicts; paperlint does not send them)",
    "topics, and every field the venue adds (paper type, artifact, consent boxes …)",
  ],
  submissionPage: (id) =>
    `${url}/paper/${id === null ? "<its number>" : String(id)}`,
  connect: (token) => hotcrpPortal({ url, token }),
});
