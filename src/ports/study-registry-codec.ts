/**
 * How a `repro/studies.json` becomes a value: its text parsed once, where it enters, against the schema
 * of `StudyRegistry` (`src/domain/study-registry.ts`). The one implementation is
 * `src/adapters/study-registry/` (zod); `src/cli.ts` wires it.
 */
import type { ParsedRegistry } from "../domain/study-registry.ts";

export interface StudyRegistryCodec {
  /** A `studies.json`'s text: the registry, or the one reason it is not one of this schema. */
  readonly parse: (text: string) => ParsedRegistry;
}
