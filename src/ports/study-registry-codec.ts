/**
 * How a `repro/studies.json`, and a study's `plan.json`, become values: its text parsed once, where it enters, against the schema
 * of `StudyRegistry` (`src/domain/study-registry.ts`). The one implementation is
 * `src/adapters/study-registry/` (zod); `src/cli.ts` wires it.
 */
import type {
  ParsedPlan,
  ParsedRegistry,
  StudyKind,
} from "../domain/study-registry.ts";

export interface StudyRegistryCodec {
  /** A `studies.json`'s text: the registry, or the one reason it is not one of this schema. */
  readonly parse: (text: string) => ParsedRegistry;
  /**
   * A study's `plan.json` text, strict: ready, a draft naming its empty texts, or why it is no plan. A
   * study of a `kind` that must declare its mode (a measurement) is ready only with one.
   */
  readonly parsePlan: (text: string, kind: StudyKind) => ParsedPlan;
  /** A plan still named `prereg.json`, loose: the same three outcomes. */
  readonly parseLegacyPlan: (text: string) => ParsedPlan;
}
