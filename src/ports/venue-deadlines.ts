/**
 * A venue's deadlines as its portal publishes them — the port `paperlint cycle open` and `cycle check`
 * read through. Shaped by what the commands need (the portal's deadlines, once), not by any portal's
 * page; one adapter per portal kind (`src/adapters/hotcrp/`).
 */
import type { Result } from "../domain/result.ts";
import type { PortalDeadlines } from "../domain/cycle.ts";
import type { PortalFailure } from "../domain/submission.ts";

export interface VenueDeadlines {
  /** The deadlines the portal publishes now. Needs no account: the page is public. */
  read(): Promise<Result<PortalDeadlines, PortalFailure>>;
}
