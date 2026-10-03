/**
 * A conference portal holding a paper's submission — the port `paperlint submission` talks through.
 * Shaped by what the command needs (read one submission, send one change), not by any portal's API;
 * one adapter per portal kind (`src/adapters/hotcrp/`).
 */
import type { Result } from "../domain/result.ts";
import type {
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
}
