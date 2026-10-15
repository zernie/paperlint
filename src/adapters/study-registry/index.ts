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
 * A study's plan (`plan.json`) is parsed here too, strictly: a key of the paper's own goes in `extra`.
 * Its texts may be empty — the template's are — and the parser says which: a plan comes out ready or
 * a draft naming its empty texts, so nothing downstream looks at a text again. A plan still named
 * `prereg.json` has a loose schema of its own.
 */
import { z } from "zod";
import {
  IN_PAPER,
  MEASUREMENT_ROLES,
  PLAN_TEXT_FIELDS,
  PREFIX_PATTERN,
  STUDY_KINDS,
  STUDY_STATUSES,
  type Approval,
  type AuthorCheck,
  type Measurement,
  type ParsedPlan,
  type ParsedRegistry,
  type Requirement,
  type Study,
  type StudyPlan,
  type StudyRegistry,
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

const authorCheck = approval.omit({ source: true });

/** A plan: closed at every level; the paper's own keys go in `extra`. Null is the one "none". */
const plan = z.strictObject({
  question: z.string(),
  population: z.strictObject({
    source: z.string(),
    size: z.number().int().positive().nullable(),
    draw: z.strictObject({
      method: z.string(),
      seed: z.union([z.string(), z.number()]).nullable(),
    }),
  }),
  arms: z.array(z.strictObject({ name: words })),
  primary_outcome: z.string(),
  author_check: authorCheck.nullable(),
  extra: z.record(z.string(), z.unknown()).optional(),
});

/**
 * A plan under its old name, `prereg.json`, written by hand before the plan had a schema: open at
 * every level, an absent size, seed or check read as null, its own top-level keys kept in `extra`.
 * Keys of its own deeper down are not read; the file is never rewritten.
 */
const legacyPlan = z
  .looseObject({
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
    author_check: authorCheck.nullable().optional(),
  })
  .transform((p): StudyPlan => {
    const {
      question,
      population,
      arms,
      primary_outcome,
      author_check,
      ...rest
    } = p;
    return {
      question,
      population: {
        source: population.source,
        size: population.size ?? null,
        draw: {
          method: population.draw.method,
          seed: population.draw.seed ?? null,
        },
      },
      arms: arms.map((a) => ({ name: a.name })),
      primary_outcome,
      author_check: author_check ?? null,
      extra: rest,
    };
  });

/** A text that says something: more than white space. */
const filled = z.string().regex(/\S/u);

/** The texts a plan fills before its study runs; what fails here is what is still empty. */
const readyTexts = z.object({
  question: filled,
  population: z.object({
    source: filled,
    draw: z.object({ method: filled }),
  }),
  primary_outcome: filled,
});

/** A parsed plan, ready when every required text is filled, else a draft naming the empty ones. */
const readiness = (p: StudyPlan): ParsedPlan => {
  const checked = readyTexts.safeParse(p);
  if (checked.success) return { kind: "ready", plan: p };
  const paths = checked.error.issues.map((i) => i.path.join("."));
  return {
    kind: "draft",
    plan: p,
    empty: PLAN_TEXT_FIELDS.filter((f) => paths.includes(f)),
  };
};

// ── the schemas ARE the domain's types ─────────────────────────────────────────
// Each schema's output and its hand-written domain type are the same type, both ways, once both are
// made readonly all the way down: a field added to one and not the other stops the build.

/** `T`, readonly all the way down: zod's outputs are mutable, the domain's are not. */
type Frozen<T> = T extends readonly (infer U)[]
  ? readonly Frozen<U>[]
  : T extends object
    ? { readonly [K in keyof T]: Frozen<T[K]> }
    : T;

/**
 * True when `A` and `B`, both made readonly all the way down, are one type, optional modifiers
 * included: two generic signatures whose returns are deferred conditionals are related only when
 * the conditionals are identical. Written out, not through an alias: an alias is compared by the
 * variance of its parameter, which misses a dropped optional field.
 */
type Same<A, B> =
  (<T>() => T extends Frozen<A> ? readonly [T] : 2) extends <
    T,
  >() => T extends Frozen<B> ? readonly [T] : 2
    ? true
    : false;

/** Compiles only when every schema's output is its domain type. */
export type SchemasAreTheDomain = [
  Same<z.output<typeof registry>, StudyRegistry>,
  Same<z.output<typeof study>, Study>,
  Same<z.output<typeof measurement>, Measurement>,
  Same<z.output<typeof requirement>, Requirement>,
  Same<z.output<typeof approval>, Approval>,
  Same<z.output<typeof authorCheck>, AuthorCheck>,
  Same<z.output<typeof plan>, StudyPlan>,
  Same<z.output<typeof legacyPlan>, StudyPlan>,
] extends true[]
  ? true
  : never;

/** The proof is used, so the build checks it. */
export const SCHEMAS_ARE_THE_DOMAIN: SchemasAreTheDomain = true;

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

/** A plan's text, parsed once at the boundary by `schema`: ready, a draft, or every reason it is neither. */
const planParser =
  (schema: Readonly<z.ZodType<StudyPlan>>) =>
  (text: string): ParsedPlan => {
    const json = jsonOf(text);
    if (json === undefined) return { kind: "unreadable", why: "not JSON" };
    const parsed = schema.safeParse(json);
    return parsed.success
      ? readiness(parsed.data)
      : { kind: "unreadable", why: reasons(parsed.error.issues) };
  };

/** A `plan.json`: strict. */
export const parseStudyPlan = planParser(plan);

/** A plan still named `prereg.json`: loose, read only when a row names it. */
export const parseLegacyPlan = planParser(legacyPlan);

export const studyRegistryCodec: StudyRegistryCodec = {
  parse: parseStudyRegistry,
  parsePlan: parseStudyPlan,
  parseLegacyPlan,
};
