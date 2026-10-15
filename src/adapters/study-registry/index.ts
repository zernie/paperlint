/**
 * The schema of `repro/studies.json` — the one place its shape is checked (docs/design/study-registry.md).
 * The text is parsed once, here, into the domain's `StudyRegistry`; whatever reads a registry after it
 * never re-validates.
 *
 * A row is a loose object: a paper merges its own measurement metadata into its rows (`role`, `frame`,
 * `rules_under_test`, `outcome` …), and those fields are kept as they are. The top level is strict, so
 * a misspelt key is an error rather than a key nobody reads. A measurement keeps its extra fields as a
 * row does; a requirement and an approval are exactly their fields.
 *
 * A study's plan (`plan.json`) is parsed here too: its named fields are checked, every other key is
 * the paper's and kept. Its texts may be empty — the template is — and the rule says when they must
 * not be.
 */
import { z } from "zod";
import {
  IN_PAPER,
  MEASUREMENT_ROLES,
  PREFIX_PATTERN,
  STUDY_KINDS,
  STUDY_STATUSES,
  type ParsedPlan,
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
  measurement: z.string().optional(),
  plan: z.string().optional(),
});

const words = z.string().min(1);

const requirement = z.strictObject({
  id: words,
  text: words,
  date: z.iso.date(),
  source: words,
});

const approval = z.strictObject({
  by: words,
  date: z.iso.date(),
  quote: words,
  source: words.optional(),
});

const measurement = z.looseObject({
  id: words,
  title: words,
  rq: z.string().optional(),
  role: z.enum(MEASUREMENT_ROLES),
  approval: approval.optional(),
  requirements: z.array(z.string()).optional(),
});

const registry = z.strictObject({
  prefix: z
    .string()
    .regex(PREFIX_PATTERN, "a capital letter, then capitals or digits (P1)"),
  author: words.optional(),
  requirements: z.array(requirement).optional(),
  measurements: z.array(measurement).optional(),
  studies: z.array(study),
});

const plan = z.looseObject({
  question: z.string(),
  population: z.looseObject({
    source: z.string(),
    size: z.number().int().positive().nullable().optional(),
    draw: z.looseObject({
      method: z.string(),
      seed: z.union([z.string(), z.number()]).nullable().optional(),
    }),
  }),
  arms: z.array(z.looseObject({ name: words })),
  primary_outcome: z.string(),
  author_check: approval.omit({ source: true }).nullable().optional(),
});

/** The JSON `text` holds, or undefined when it is not JSON. */
function jsonOf(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** Every reason zod gave, each with the path it is about. */
const reasons = (
  issues: readonly {
    readonly path: readonly PropertyKey[];
    readonly message: string;
  }[],
): string =>
  issues
    .map(
      (i) =>
        `${i.path.length === 0 ? "(top)" : i.path.join(".")}: ${i.message}`,
    )
    .join("; ");

/** A `studies.json`'s text, parsed once at the boundary: the registry, or every reason it is not one. */
export function parseStudyRegistry(text: string): ParsedRegistry {
  const json = jsonOf(text);
  if (json === undefined) return { ok: false, why: "not JSON" };
  const parsed = registry.safeParse(json);
  return parsed.success
    ? { ok: true, registry: parsed.data }
    : { ok: false, why: reasons(parsed.error.issues) };
}

/** A study plan's text, parsed once at the boundary: the plan, or every reason it is not one. */
export function parseStudyPlan(text: string): ParsedPlan {
  const json = jsonOf(text);
  if (json === undefined) return { ok: false, why: "not JSON" };
  const parsed = plan.safeParse(json);
  return parsed.success
    ? { ok: true, plan: parsed.data }
    : { ok: false, why: reasons(parsed.error.issues) };
}

export const studyRegistryCodec: StudyRegistryCodec = {
  parse: parseStudyRegistry,
  parsePlan: parseStudyPlan,
};
