/**
 * A conference portal holding a paper's submission — the port `paperlint submission` talks through.
 * Shaped by what the command needs (read one submission, send one change, create one), not by any
 * portal's API;
 * one adapter per portal kind (`src/adapters/hotcrp/`).
 */
import type { Result } from "../domain/result.ts";
import type {
  CreateOutcome,
  NewSubmission,
  PortalFailure,
  SubmissionChange,
  SubmissionView,
  UpdateOutcome,
} from "../domain/submission.ts";

export interface SubmissionPortal {
  /** The submission as the portal holds it now. */
  show(id: number): Promise<Result<SubmissionView, PortalFailure>>;
  /**
   * Send a change. Without `save` the portal only checks it (a dry run) and keeps nothing; an
   * answer the portal gave — valid or not — is an outcome, not a failure.
   */
  update(
    id: number,
    change: SubmissionChange,
    o: { readonly save: boolean },
  ): Promise<Result<UpdateOutcome, PortalFailure>>;
  /**
   * Create a submission. Without `save` the portal only checks it (a dry run), keeps nothing and
   * chooses no id; with it, the outcome carries the id the portal chose.
   */
  create(
    paper: NewSubmission,
    o: { readonly save: boolean },
  ): Promise<Result<CreateOutcome, PortalFailure>>;
}

/** How an author makes a token for a portal site, in the words the command prints. */
export interface CredentialHelp {
  /** The site's page where tokens are made. */
  readonly page: string;
  /** Where that page is in the site's menus. */
  readonly where: string;
  /** The permissions to give the token, per subcommand. */
  readonly scopes: string;
}

/**
 * A portal site before any token — what the command needs to find one, to say how to make one, and
 * to say what is left to do on the site — and the portal itself once there is a token. One adapter
 * per portal kind supplies it; the app prints what it returns.
 */
export interface PortalSite {
  /** The environment variable this site's token is read from. */
  readonly tokenVariable: string;
  /** The site-less variable no longer read: named when still set, never used. */
  readonly siteLessVariable: string;
  /** The shape of a site's variable, for a message about another site's. */
  readonly variablePattern: string;
  readonly credentials: CredentialHelp;
  /** What `submission new` does not send: done on the site by the author. */
  readonly siteOnly: readonly string[];
  /** A submission's page on the site; null: the one just created, before it has a number. */
  readonly submissionPage: (id: number | null) => string;
  /** The portal, read and changed with `token`. */
  readonly connect: (token: string) => SubmissionPortal;
}
