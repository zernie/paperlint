/**
 * The schema of a paper's `revision-plan.json` — the one place its shape is checked
 * (src/domain/revision-plan.ts). The text is parsed once, here, into the domain's `RevisionPlan`;
 * whatever reads a plan after it never re-validates. The venue corpus's pattern
 * (`src/adapters/venue-corpus/`): every object strict, each problem at the path of its field, and the
 * JSON Schema generated from this parser rather than written beside it.
 */
import { z } from "zod";
import { CYCLE_ID_PATTERN, cycleId } from "../../domain/cycle.ts";
import { SERIES_ID } from "../../domain/edition.ts";
import { isInside } from "../../domain/study-registry.ts";
import {
  DROP_KINDS,
  ROW_ID_PATTERN,
  ROW_STATES,
  RULE_ID_PATTERN,
  type ParsedPlan,
  type PlanProblem,
  type RevisionPlan,
} from "../../domain/revision-plan.ts";
import type { RevisionPlanCodec } from "../../ports/revision-plan-codec.ts";

const words = z.string().trim().min(1, "a non-empty text");
const date = z.iso.date();

// The pattern first, so the JSON Schema carries it; then the id, minted by the cycle's own function.
const cycle = z
  .string()
  .regex(
    new RegExp(`^${CYCLE_ID_PATTERN}$`, "u"),
    "a cycle id: lowercase words and digits joined by hyphens, as in `langcode-2027`",
  )
  .transform(cycleId);

const series = z
  .string()
  .regex(
    SERIES_ID,
    "a venue corpus's series: its folder under venues/, as in `usenix-sec`",
  );

/** A file of the paper, relative to its folder: never absolute (`/…`, `C:…`) and never above it. */
const paperFile = z
  .string()
  .min(1, "a path relative to the paper folder")
  .refine(
    isInside,
    "a path inside the paper folder: relative, with `/` between its parts, never above it",
  );

/** A discriminated union whose unknown or missing tag names the tags it takes. */
const oneOf = <
  const K extends string,
  const O extends readonly [
    z.core.$ZodTypeDiscriminable,
    ...z.core.$ZodTypeDiscriminable[],
  ],
>(
  key: K,
  tags: readonly string[],
  options: O,
) =>
  z.discriminatedUnion(key, options, {
    error: `"${key}" is one of ${tags.map((t) => `"${t}"`).join(", ")}`,
  });

const bar = oneOf(
  "kind",
  ["corpus", "proxy", "none"],
  [
    z.strictObject({
      kind: z.literal("corpus"),
      series,
      editions: z
        .array(z.int().min(1900).max(2999))
        .nonempty("at least one edition the corpus covers"),
    }),
    z.strictObject({
      kind: z.literal("proxy"),
      series,
      stands_in_for: words,
    }),
    z.strictObject({ kind: z.literal("none"), why: words }),
  ],
);

const measurement = oneOf(
  "kind",
  ["open", "enough"],
  [
    z.strictObject({ kind: z.literal("open") }),
    z.strictObject({
      kind: z.literal("enough"),
      since: date,
      evidence: paperFile,
    }),
  ],
);

const source = oneOf(
  "kind",
  ["author", "venue", "finding", "prior-reviews"],
  [
    z.strictObject({ kind: z.literal("author") }),
    z.strictObject({ kind: z.literal("venue") }),
    z.strictObject({
      kind: z.literal("finding"),
      file: paperFile,
      finding: z.union([words, z.int().min(1)]),
    }),
    z.strictObject({ kind: z.literal("prior-reviews"), cycle }),
  ],
);

const base = {
  id: z.string().regex(ROW_ID_PATTERN, "a row id: R and a number, as in `R3`"),
  what: words,
  from: source,
  added: date,
};

const row = oneOf("state", ROW_STATES, [
  z.strictObject({ ...base, state: z.enum(["todo", "doing"]) }),
  z.strictObject({ ...base, state: z.literal("done"), evidence: words }),
  z.strictObject({
    ...base,
    state: z.literal("dropped"),
    reason: words,
    kind: z.enum(DROP_KINDS),
  }),
  z.strictObject({
    ...base,
    state: z.literal("by-rule"),
    rule: z
      .string()
      .regex(
        RULE_ID_PATTERN,
        "a rule id as `paperlint lint` reports it, as in `tex/required-section`",
      ),
  }),
]);

/** The index of each id that occurs earlier in `ids`, with the index of its first. */
const repeats = (
  ids: readonly string[],
): readonly (readonly [number, number])[] =>
  ids.flatMap((v, i) => {
    const first = ids.indexOf(v);
    return first === i ? [] : [[i, first] as const];
  });

const plan = z
  .strictObject({
    cycle,
    written: date,
    bar,
    measurement,
    remaining: z.array(row),
  })
  .superRefine((p, ctx) => {
    repeats(p.remaining.map((r) => r.id)).forEach(([i, first]) => {
      ctx.addIssue({
        code: "custom",
        path: ["remaining", i, "id"],
        message: `"${String(p.remaining[i]?.id)}" is the id of row ${String(first + 1)} too: each row has its own`,
      });
    });
  });

/** The JSON `text` holds, or undefined when it is not JSON. */
function jsonOf(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/**
 * One zod issue as a problem. A misspelt key's path ends at the key (the first, when there are
 * several), so a reader of the file lands on it rather than on the object holding it.
 */
const problemOf = (i: z.core.$ZodIssue): PlanProblem => ({
  path: [
    ...i.path.filter((s) => typeof s !== "symbol"),
    ...(i.code === "unrecognized_keys" ? i.keys.slice(0, 1) : []),
  ],
  message: i.message,
});

/** A `revision-plan.json`'s text, parsed once at the boundary: the plan, or every reason it is not one. */
export function parseRevisionPlan(text: string): ParsedPlan {
  const json = jsonOf(text);
  if (json === undefined)
    return { ok: false, problems: [{ path: [], message: "not JSON" }] };
  // A field left out is "missing", not zod's "expected string, received undefined".
  const parsed = plan.safeParse(json, {
    error: (i) =>
      i.code === "invalid_type" && i.input === undefined
        ? "missing: the shape requires it here"
        : undefined,
  });
  if (!parsed.success)
    return { ok: false, problems: parsed.error.issues.map(problemOf) };
  const value: RevisionPlan = parsed.data;
  return { ok: true, plan: value };
}

export const revisionPlanCodec: RevisionPlanCodec = {
  parse: parseRevisionPlan,
};

/** Where the shipped JSON Schema of the plan sits, below the package root: in the skill that writes it. */
export const SCHEMA_FILE = "skills/paper-pipeline/revision-plan.schema.json";

/**
 * The JSON Schema of a `revision-plan.json`, generated from the parser's own shape: what an editor
 * completes and a skill reads instead of a hand-written table. Shipped as `SCHEMA_FILE`; a test holds
 * the file to this. A schema cannot say that each row's id is unique or that a path stays inside the paper
 * folder: `revision-plan/record` does.
 */
export const revisionPlanJsonSchema = (): unknown => ({
  ...z.toJSONSchema(plan, { io: "input", unrepresentable: "any" }),
  title: "A paper's revision-plan.json",
  description:
    "The paper's revision plan for its current cycle: the accepted papers it is held against (bar), whether evidence is still being gathered (measurement), and the closed list of what remains (remaining). This schema lists the fields; it cannot express that each row's id is unique or that a path stays inside the paper folder, which the lint rule revision-plan/record checks with the rest.",
});

/** The shipped file's text: the schema, indented, with a closing newline. */
export const revisionPlanSchemaText = (): string =>
  `${JSON.stringify(revisionPlanJsonSchema(), null, 2)}\n`;
