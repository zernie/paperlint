/**
 * A venue's SCOPE: what its call for papers says the venue is for, verbatim, with the page it was
 * read from and the day (`scope` in a venue preset, `presets/venue-profile.schema.json`).
 *
 * It is data for a reader. No rule judges a paper against it: whether a paper fits a call is a
 * judgement, and a judgement made by a rule would be a default finding a careful author could
 * dispute.
 */

/** A preset's `scope` after the schema accepted it. */
export interface VenueScopeJson {
  readonly url: string;
  readonly read: string;
  readonly sentences: readonly string[];
  readonly topics?: readonly string[];
}

/** A venue's scope, as the call states it. */
export interface VenueScope {
  /** The page the sentences were read from. */
  readonly url: string;
  /** The day they were read, `YYYY-MM-DD`. */
  readonly read: string;
  /** The call's scope sentences, verbatim; at least one. */
  readonly sentences: readonly string[];
  /** The call's topic list, verbatim; empty when the call gives none. */
  readonly topics: readonly string[];
}

/** A preset's `scope`, or null when the file records none. Pure. */
export const scopeOf = (j: VenueScopeJson | undefined): VenueScope | null =>
  j === undefined
    ? null
    : {
        url: j.url,
        read: j.read,
        sentences: j.sentences,
        topics: j.topics ?? [],
      };
