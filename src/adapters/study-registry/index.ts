/**
 * The schema of `repro/studies.json` — the one place its shape is checked (docs/design/study-registry.md).
 * The text is parsed once, here, into the domain's `StudyRegistry`; whatever reads a registry after it
 * never re-validates.
 *
 * A row is a loose object: a paper merges its own measurement metadata into its rows (`role`, `frame`,
 * `rules_under_test`, `outcome` …), and those fields are kept as they are. The top level is strict, so
 * a misspelt key is an error rather than a key nobody reads.
 */
import { z } from "zod";
import {
  IN_PAPER,
  PREFIX_PATTERN,
  STUDY_KINDS,
  STUDY_STATUSES,
  type ParsedRegistry,
} from "../../domain/study-registry.ts";
import type { StudyRegistryCodec } from "../../ports/study-registry-codec.ts";

const study = z.looseObject({
  id: z.string(),
  folder: z.string(),
  title: z.string().min(1),
  question: z.string(),
  kind: z.enum(STUDY_KINDS),
  status: z.enum(STUDY_STATUSES),
  date: z.iso.date(),
  result: z.string().optional(),
  result_file: z.string().optional(),
  superseded_by: z.string().optional(),
  in_paper: z.enum(IN_PAPER),
});

const registry = z.strictObject({
  prefix: z
    .string()
    .regex(PREFIX_PATTERN, "a capital letter, then capitals or digits (P1)"),
  studies: z.array(study),
});

/** The JSON `text` holds, or undefined when it is not JSON. */
function jsonOf(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** A `studies.json`'s text, parsed once at the boundary: the registry, or every reason it is not one. */
export function parseStudyRegistry(text: string): ParsedRegistry {
  const json = jsonOf(text);
  if (json === undefined) return { ok: false, why: "not JSON" };
  const parsed = registry.safeParse(json);
  return parsed.success
    ? { ok: true, registry: parsed.data }
    : {
        ok: false,
        why: parsed.error.issues
          .map(
            (i) =>
              `${i.path.length === 0 ? "(top)" : i.path.join(".")}: ${i.message}`,
          )
          .join("; "),
      };
}

export const studyRegistryCodec: StudyRegistryCodec = {
  parse: parseStudyRegistry,
};
