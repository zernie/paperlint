/**
 * What an item's free text says that belongs in a field the card shows properly (#373). A fix to the
 * card shipped as an optional field protects only the pages written after someone remembers it, so the
 * build reads the text for the old shape and refuses it, naming the field:
 *
 * - a linter rule named in the text ("rule: ruff `TID251`", "eslint `no-console`") → `rules`, which
 *   shows the linter's own description;
 * - a source line carried as text ("From the line: «…»", "requirement 1 of 2", "CLAUDE.md:25") →
 *   `unit`, which shows the line with the requirement marked;
 * - two readings in one string ("reading A: … · reading B: …") → `readings`, one row each.
 *
 * Pure: text in, findings out. A rule id is looked for only after a word that says it is one (rule,
 * ruff, eslint), so a code-like word in prose ("ES2022", "H264", `kebab-case`) is not a rule.
 */

/** One old shape found in an item's text: what was found, and the field that must hold it. */
export interface Finding {
  readonly field: "rules" | "unit" | "readings";
  readonly found: string;
  /** For `rules`: the rule, so the item's `rules` can be checked for it. */
  readonly rule?: { readonly linter: "eslint" | "ruff"; readonly id: string };
}

const RUFF_CODE = /^[A-Z]{1,4}[0-9]{1,4}$/;
const ESLINT_ID = /^(?:@[a-z0-9-]+\/)?(?:[a-z0-9-]+\/)*[a-z][a-z0-9-]*$/;
// A word that says a rule id follows: "rule:", "rule eslint", "ruff", "ESLint rule". The id is
// backticked, or bare when it cannot be an English word (a Ruff code, an ESLint id with - or /).
const RULE_NAMED =
  /\b(?:rules?\s*:?\s+(?:(ruff|eslint)\s+)?|(ruff|eslint)(?:\s+rules?)?\s*:?\s+)(?:`([^`\s]+)`|([@\w/-]+))/gi;

type Linter = "eslint" | "ruff";
const ruleOf = (
  said: string | undefined,
  id: string,
  ticked: boolean,
): Finding["rule"] => {
  const linter: Linter | undefined =
    said === undefined
      ? undefined
      : said.toLowerCase() === "ruff"
        ? "ruff"
        : "eslint";
  const shape: Linter | undefined = RUFF_CODE.test(id)
    ? "ruff"
    : ESLINT_ID.test(id) && (ticked || /[-/]/.test(id))
      ? "eslint"
      : undefined;
  return shape !== undefined && (linter === undefined || linter === shape)
    ? { linter: shape, id }
    : undefined;
};

/** Every linter rule the text names, in order. */
export const rulesNamed = (text: string): readonly Finding[] =>
  [...text.matchAll(RULE_NAMED)].flatMap((m) => {
    // the pattern's last alternation fills exactly one of the two id groups
    const id = m[3] ?? String(m[4]);
    const rule = ruleOf(m[1] ?? m[2], id, m[3] !== undefined);
    return rule === undefined
      ? []
      : [{ field: "rules" as const, found: `${rule.linter} \`${id}\``, rule }];
  });

/** The first of `signs` the text shows, as a finding for `field`. */
const firstSign =
  (field: "unit" | "readings", signs: readonly RegExp[]) =>
  (text: string): readonly Finding[] =>
    signs
      .flatMap((re) => re.exec(text)?.[0] ?? [])
      .slice(0, 1)
      .map((m) => ({ field, found: m.slice(0, 40).trim() }));
/** A source line carried or cited; a line of code (`src/a.py:12`) is not a requirement's line. */
export const lineNamed = firstSign("unit", [
  /\bfrom the (?:source )?line\b/i,
  /\brequirement \d+ of \d+\b/i,
  /[\w./-]*\.(?:md|mdc|markdown|txt|rst|adoc|cursorrules|windsurfrules)(?::\d+|\s+line\s+\d+|#L\d+)\b/i,
]);
/** Two readings written into one string. */
export const readingsNamed = firstSign("readings", [
  // a label, case-sensitive: "reading A:", "Reading B —", "readings A and B"; never "reading a file"
  /\b[Rr]eadings? [AB](?=\s*[:—–-]|\s+and\s+[AB]\b)/,
  /(?:^|[·|;•])\s*A:\s[\s\S]*(?:^|[·|;•])\s*B:\s/,
]);

/** What an item holds in its fields, to tell a finding the field already covers from a missing one. */
export interface Holds {
  readonly rules: readonly { readonly linter: string; readonly id: string }[];
  readonly unit: boolean;
  readonly readings: boolean;
}
const covered = ({ field, rule }: Finding, holds: Holds): boolean =>
  rule !== undefined
    ? holds.rules.some((r) => r.linter === rule.linter && r.id === rule.id)
    : field === "unit"
      ? holds.unit
      : holds.readings;

/** The old shapes in `texts` (field → text) that the item's own fields do not hold. */
export const oldShapes = (
  texts: readonly (readonly [string, string])[],
  holds: Holds,
): readonly (Finding & { readonly in: string })[] =>
  texts.flatMap(([name, text]) =>
    [...rulesNamed(text), ...lineNamed(text), ...readingsNamed(text)]
      .filter((f) => !covered(f, holds))
      .map((f) => ({ ...f, in: name })),
  );
