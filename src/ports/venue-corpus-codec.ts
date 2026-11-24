/**
 * How a venue corpus's `papers.json` becomes a value: its text parsed once, where it enters, against
 * the schema of `VenueCorpus` (`src/domain/venue-corpus.ts`). The one implementation is
 * `src/adapters/venue-corpus/` (zod).
 */
import type { ParsedCorpus } from "../domain/venue-corpus.ts";

export interface VenueCorpusCodec {
  /** A `papers.json`'s text: the record, or every reason it is not one, each with its path. */
  readonly parse: (text: string) => ParsedCorpus;
}
