/**
 * `paper/prereg-coverage` — a study's pre-registration says which population the paper's claim is
 * about, what the screens between that population and the sample removed, what share of it the
 * sample can represent, and that the author looked at the drawn units before the run.
 *
 * ── THE FAILURE IT PREVENTS ──────────────────────────────────────────────────────
 * A measurement study of how language models read coding rules drew its rules from three pools,
 * kept only the rules "judgeable from one code excerpt of at most 40 lines", restricted one pool to a
 * classifier's "enforceable" lane, and let a model pick short excerpts. Each screen was reasonable
 * alone; together they left a sample of crisp rules. The labeller found 93 % of the items designed as
 * borderline clear-cut, and the rules looked nothing like the ones met in practice. A spot-check of
 * ten items flagged it (seven of ten clear-cut) and the run went ahead: nothing in the design made
 * anyone state what share of the population the sample covered, or which screens removed which kinds
 * of rules. The four fields below are those statements, and this rule makes them part of the record.
 *
 * ── WHERE IT LOOKS ───────────────────────────────────────────────────────────────
 * A study lives in a folder at the top of the paper's `repro/` (`paper/repro-layout` names the
 * layout); `tools/` and `data/` beside them are shared, not studies. Every study folder that holds a
 * `prereg.json` is judged; a study without one owes nothing here. The findings are reported on the paper's `PIPELINE-STATUS.md`, first line, as the other rules
 * about a paper's folders are: `prereg.json` is not a file paperlint lints, and every paper has a
 * status file.
 *
 * ── THE FIELDS ───────────────────────────────────────────────────────────────────
 *   population    { about, source, size }            what the claim is about, where it comes from, how many
 *   strata        { by, values }                     the one stratification the screens are counted by
 *   screens       [{ name, removed: {value: n} }]    each screen, and what it removed per stratum value
 *   coverage      { share, reason?, unreachable }    0–1, or null with a reason; strata it cannot reach
 *   author_check  { who, when, units_seen, units_drawn, verdict, decision? }
 *
 * A pre-registration holds much more (hypotheses, arms, models, budget); every other key is the
 * author's and is not read. The shape is `PREREG` below — a zod schema whose every field carries the
 * text a finding gives for it — and the relations between fields that a schema of one field cannot
 * see (`removed` keyed by the declared strata, a null share with a reason, a doubtful verdict with a
 * decision) are `crossProblems`.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { z } from "zod";
import type { RuleContext } from "./rule-context.ts";

/**
 * The folder of a paper that holds its studies, the folders in it that are shared rather than a
 * study's, and the file a study pre-registers in. The first two are `paper/repro-layout`'s
 * (`src/domain/repro-layout.ts`, `REPRO_DIR` and `REPRO_DIRS`), copied because a module here is
 * compiled before `src/`; the test beside this file holds the copies equal.
 */
export const REPRO_DIR = "repro";
export const SHARED_DIRS: readonly string[] = ["tools", "data"];
export const PREREG_FILE = "prereg.json";
const STATUS_FILE = "PIPELINE-STATUS.md";
const PAGE =
  "https://github.com/zernie/paperlint/blob/main/docs/rules/paper/prereg-coverage.md";

/** The one sentence every finding ends with: why the fields exist. */
export const WHY =
  "Why: a study once screened its sample down to rules that are easy to judge — its labeller found 93 % of the items designed as borderline clear-cut — and nothing in its design made anyone state what share of the real population the sample covered or which screens removed which kinds of units.";

/** A zod error option: `what` is the text a finding gives for the field, missing or malformed. */
const field = (
  what: string,
): { readonly error: (iss: { readonly input?: unknown }) => string } => ({
  error: (iss) =>
    iss.input === undefined
      ? `is missing — add ${what}`
      : `is not valid — it must be ${what}`,
});

/** Text that says something: a string with more than white space in it. */
const text = (what: string) =>
  z
    .string(field(what))
    .trim()
    .min(1, { error: `is empty — write ${what}` });

/** A whole number above 0. */
const positive = (what: string) =>
  z.number(field(what)).int(field(what)).positive(field(what));

const POPULATION = z.object(
  {
    about: text(
      "what the paper's claim is about, in the paper's own words (e.g. the rules written in agent instruction files of public repositories)",
    ),
    source: text(
      "where the population's units come from — the census, crawl or registry, with its date",
    ),
    size: positive(
      "the number of units in the population, a whole number above 0 (an estimate is fine; say how it was made in `source`)",
    ),
  },
  field(
    "`population`: what the paper's claim is about (`about`), where its units come from (`source`) and how many there are (`size`)",
  ),
);

const STRATA = z.object(
  {
    by: text("the property the units are stratified by, e.g. rule type"),
    values: z
      .array(
        text("a value of the stratum"),
        field("the stratum's values, a list of names"),
      )
      .min(1, {
        error: "is empty — list the stratum's values, at least one",
      }),
  },
  field(
    "`strata`: the property the screens are counted by (`by`, e.g. rule type) and its values (`values`)",
  ),
);

const REMOVED_WHAT =
  "the number of candidates the screen removed in each declared stratum value, an object {<value>: <count>} with 0 where it removed none";

const SCREEN = z.object(
  {
    name: text(
      "what the screen keeps, as it was applied (e.g. judgeable from one code excerpt of at most 40 lines)",
    ),
    removed: z.record(
      z.string(),
      z
        .number(field("a count, a whole number from 0"))
        .int(field("a count, a whole number from 0"))
        .nonnegative(field("a count, a whole number from 0")),
      field(REMOVED_WHAT),
    ),
  },
  field("a screen: `name` and `removed`"),
);

const SCREENS = z.array(
  SCREEN,
  field(
    "`screens`: one entry per screen applied between the population and the sample, each with `name` and `removed` — [] when none was",
  ),
);

const SHARE_WHAT =
  "the share of the population the sample can represent, a number from 0 to 1, or null with a `reason`";

const COVERAGE = z.object(
  {
    share: z
      .number(field(SHARE_WHAT))
      .min(0, field(SHARE_WHAT))
      .max(1, field(SHARE_WHAT))
      .nullable(),
    reason: text("why the share cannot be stated").optional(),
    unreachable: z.array(
      text("a stratum or kind of unit"),
      field(
        "the strata (or kinds of units) the sample cannot reach, a list of names — [] only when it reaches them all",
      ),
    ),
  },
  field(
    "`coverage`: the share of the population the sample can represent (`share`, 0 to 1, or null with a `reason`) and the strata it cannot reach (`unreachable`)",
  ),
);

/** The answers to "is this what you meet in practice?"; any but the first needs a decision. */
export const VERDICTS = ["representative", "partly", "not-representative"];

const DECISION = z.object(
  {
    proceed: z.boolean(
      field("whether the study runs on this sample, true or false"),
    ),
    by: text("who decided"),
    why: text("why, in a sentence"),
  },
  field(
    "the decision taken after the verdict: `proceed` (true or false), `by` whom, and `why`",
  ),
);

const AUTHOR_CHECK = z.object(
  {
    who: text("who looked at the drawn units (a name or a role)"),
    when: z.iso.date(field("the date of the check, YYYY-MM-DD")),
    units_seen: positive(
      "how many of the drawn units — the rules or cases drawn, not the items made from them — the author looked at, a whole number above 0",
    ),
    units_drawn: positive("how many units the sample drew"),
    verdict: z.enum(
      VERDICTS,
      field(
        `the author's answer to "is this what you meet in practice?" — one of ${VERDICTS.join(", ")}`,
      ),
    ),
    decision: DECISION.optional(),
  },
  field(
    "`author_check`: who looked at the drawn units before the run (`who`), when (`when`), how many of how many (`units_seen`, `units_drawn`), and what they said (`verdict`)",
  ),
);

/** The declaration a `prereg.json` must carry. Every other key of the file is the author's. */
export const PREREG = z.object(
  {
    population: POPULATION,
    strata: STRATA,
    screens: SCREENS,
    coverage: COVERAGE,
    author_check: AUTHOR_CHECK,
  },
  field(
    "a JSON object holding `population`, `strata`, `screens`, `coverage` and `author_check`",
  ),
);

export type Prereg = z.infer<typeof PREREG>;

/** A zod path as it is written in the file: `screens[0].removed.vague`. */
export const pathText = (path: readonly PropertyKey[]): string =>
  path
    .map((k) => (typeof k === "number" ? `[${String(k)}]` : `.${String(k)}`))
    .join("")
    .replace(/^\./u, "");

/** One problem: the field it is about, and what is wrong with it. */
export interface Problem {
  readonly at: string;
  readonly text: string;
}

/** The values that occur more than once in `values`, each once. */
const repeated = (values: readonly string[]): readonly string[] => [
  ...new Set(values.filter((v, i) => values.indexOf(v) !== i)),
];

/** What one screen's `removed` lacks and holds beyond the declared strata. */
const removedProblems = (
  removed: Readonly<Record<string, number>>,
  i: number,
  values: readonly string[],
): readonly Problem[] => [
  ...values
    .filter((v) => !(v in removed))
    .map((v) => ({
      at: `screens[${String(i)}].removed.${v}`,
      text: `is missing — every screen states how many candidates it removed in each declared stratum value (${values.join(", ")}), 0 where it removed none`,
    })),
  ...Object.keys(removed)
    .filter((k) => !values.includes(k))
    .map((k) => ({
      at: `screens[${String(i)}].removed.${k}`,
      text: `is not a declared stratum value — \`strata.values\` declares ${values.join(", ")}; add it there or count it under one of them`,
    })),
];

/** A problem when `when` holds, else none. */
const problemIf = (
  when: boolean,
  at: string,
  text: string,
): readonly Problem[] => (when ? [{ at, text }] : []);

/** The author's check against itself: no more units seen than drawn, a doubtful verdict decided. */
const checkProblems = (
  check: Readonly<Prereg["author_check"]>,
): readonly Problem[] => [
  ...problemIf(
    check.units_seen > check.units_drawn,
    "author_check.units_seen",
    `is ${String(check.units_seen)}, more than the ${String(check.units_drawn)} units drawn (\`units_drawn\`)`,
  ),
  ...problemIf(
    check.verdict !== "representative" && check.decision === undefined,
    "author_check.decision",
    `is missing — the verdict is «${check.verdict}», and a doubtful verdict with no recorded decision is how a sample the author doubted gets run anyway: add \`proceed\` (true or false), \`by\` whom and \`why\``,
  ),
];

/** What a schema of one field cannot see: how the fields of a parsed declaration relate. */
export function crossProblems(p: Readonly<Prereg>): readonly Problem[] {
  const values = p.strata.values;
  return [
    ...repeated(values).map((v) => ({
      at: "strata.values",
      text: `names «${v}» more than once — each stratum value once`,
    })),
    ...p.screens.flatMap((s, i) => removedProblems(s.removed, i, values)),
    ...problemIf(
      p.coverage.share === null && p.coverage.reason === undefined,
      "coverage.reason",
      "is missing — `share` is null, so say why the share cannot be stated",
    ),
    ...checkProblems(p.author_check),
  ];
}

/** Everything wrong with the parsed JSON of one `prereg.json`, in the file's field order. */
export function judgePrereg(data: unknown): readonly Problem[] {
  const parsed = PREREG.safeParse(data);
  return parsed.success
    ? crossProblems(parsed.data)
    : parsed.error.issues.map((i) => ({
        at: pathText(i.path),
        text: i.message,
      }));
}

/** What `JSON.parse` says about the text it refused. */
const Thrown = z
  .object({ message: z.string() })
  .catch({ message: "unparseable" });

/** The problems of one `prereg.json` whose text is `source`: a parse failure, or the judgement. */
export function preregProblems(source: string): readonly Problem[] {
  const parsed = ((): { readonly data: unknown } | { readonly why: string } => {
    try {
      const data: unknown = JSON.parse(source);
      return { data };
    } catch (e) {
      return { why: Thrown.parse(e).message };
    }
  })();
  return "why" in parsed
    ? [
        {
          at: "",
          text: `does not parse as JSON (${parsed.why}) — there is no declaration to read`,
        },
      ]
    : judgePrereg(parsed.data);
}

/** The one text a problem in the file `file` (relative to the paper) is reported with. */
export const problemMessage = (file: string, p: Problem): string =>
  [
    p.at === ""
      ? `\`${file}\` ${p.text}.`
      : `\`${file}\`: \`${p.at}\` ${p.text}.`,
    WHY,
    `Rule paper/prereg-coverage: ${PAGE}`,
  ].join(" ");

/**
 * The `prereg.json` of every study folder at the top of `<paperDir>/repro/`, relative to the paper:
 * every folder there but the shared ones, whatever its name — a study folder misnamed is
 * `paper/repro-layout`'s finding, and its pre-registration is still judged here.
 */
export function preregFiles(paperDir: string): readonly string[] {
  const repro = join(paperDir, REPRO_DIR);
  return existsSync(repro) && statSync(repro).isDirectory()
    ? readdirSync(repro, { withFileTypes: true })
        .filter((e) => e.isDirectory() && !SHARED_DIRS.includes(e.name))
        .map((e) => `${REPRO_DIR}/${e.name}/${PREREG_FILE}`)
        .filter((rel) => existsSync(join(paperDir, rel)))
        .sort()
    : [];
}

/** Every finding for the paper folder `paperDir`, one text each. */
export const paperFindings = (paperDir: string): readonly string[] =>
  preregFiles(paperDir).flatMap((rel) =>
    preregProblems(readFileSync(join(paperDir, rel), "utf8")).map((p) =>
      problemMessage(rel, p),
    ),
  );

export default {
  rules: {
    "prereg-coverage": {
      meta: {
        type: "problem" as const,
        docs: {
          description:
            "every study's prereg.json declares its population, the screens and what each removed per stratum, the sample's coverage, and the author's check of the drawn units",
          url: PAGE,
        },
        schema: [],
        messages: { coverage: "{{text}}" },
      },
      create(context: RuleContext) {
        if (basename(context.filename) !== STATUS_FILE) return {};
        return {
          root() {
            const at = context.sourceCode.getLocFromIndex(0);
            paperFindings(dirname(context.filename)).forEach((t) => {
              context.report({
                loc: { start: at, end: at },
                messageId: "coverage",
                data: { text: t },
              });
            });
          },
        };
      },
    },
  },
};
