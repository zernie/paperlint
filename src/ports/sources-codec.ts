/**
 * How a `sources.json` becomes a value: its text parsed once, where it enters, against the schema of
 * `SourcesRecord` (`src/domain/sources-record.ts`). The one implementation is
 * `src/adapters/sources-record/` (zod); `src/cli.ts` wires it.
 */
import type { ParsedRecord } from "../domain/sources-record.ts";

export interface SourcesCodec {
  /** A `sources.json`'s text: the record, or the one reason it is not one of this schema. */
  readonly parse: (text: string) => ParsedRecord;
}
