// The findings the page shows. Each message is quoted from the file named in `source`, in that
// file's own placeholder syntax (`{{x}}` for an ESLint message, `${s.x}` for a template literal);
// findings.test.ts fails when the quoted text, or a value marked `sourced`, is no longer in that
// file, so a reworded rule message cannot leave a stale copy on the site. `title` and `plain` are
// the same finding in words a scientist who does not program reads first (site/CLAUDE.md, "Not
// Scary For Non Programmers"); the exact message is shown under them.

export interface Finding {
  readonly rule: string;
  readonly level: "error" | "warning";
  /** A short title in plain words. */
  readonly title: string;
  /** What is wrong with the paper and what to do, in one or two plain sentences. */
  readonly plain: string;
  /** The message as `source` spells it, placeholders included. */
  readonly template: string;
  /** The values the site puts in the placeholders. */
  readonly values: Readonly<Record<string, string>>;
  /** Keys of `values` that are themselves quoted from `source`. */
  readonly sourced?: readonly string[];
  /** The repository file that holds `template` verbatim. */
  readonly source: string;
}

/** `template` with its placeholders filled from `values`, and a template literal's escaped backticks undone. */
export const render = (f: Finding): string =>
  f.template
    .replace(/\\`/g, "`")
    .replace(/\{\{(\w+)\}\}/g, (whole, key: string) => f.values[key] ?? whole)
    .replace(/\$\{s\.(\w+)\}/g, (whole, key: string) => f.values[key] ?? whole);

export const pageLimit: Finding = {
  rule: "format/page-limit",
  level: "error",
  title: "One page over the limit",
  plain:
    "Seven pages come before the references, which start on page 8. AIDC short papers allow six. Cut the text before you submit.",
  template:
    "body pages (up to the references on page 8): 7, over the limit 6 for AIDC/short — a desk reject; cut the text",
  values: {},
  source: "src/venue-rules.test.ts",
};

export const folder: Finding = {
  rule: "paper/allowed-files-only",
  level: "error",
  title: "A stray file in the paper folder",
  plain:
    "results-final-v2.csv sits at the top of the paper folder, which holds only paperlint's layout. The message says where each kind of file goes: data behind your numbers belongs in repro/.",
  template:
    "\\`${s.name}\\` is at the root of a paper folder (the folder holding PIPELINE-STATUS.md), and that root holds only paperlint's layout. Where it goes: ${s.cure}.",
  values: {
    name: "results-final-v2.csv",
    cure: "decide by what it is — a record or research → research/; about submitting (forms, mails, checklists, portal records) → submission/; live state of the paper (plan, status) → a section of PIPELINE-STATUS.md; reproduction (scripts, data, the artifact) → repro/; a frozen PDF of a stage → versions/; unclear → extra/, which is never judged",
  },
  sourced: ["cure"],
  source: "src/domain/paper-layout.ts",
};

export const study: Finding = {
  rule: "repro/study-registered",
  level: "error",
  title: "A running study without a plan",
  plain:
    "Study P1-S01 is marked running, but its plan does not yet say whether the analysis was fixed before the runs or is exploratory. Fill in the plan, or set the study back to designing.",
  template:
    "The plan of `P1-S01`, `plan.json` in its folder, leaves `mode` empty, and the study is `running`: a plan is written before the runs. What to do: fill them in, or set the study back to `designing`.",
  values: {},
  source: "src/study-registry-rule.test.ts",
};

export const prose: Finding = {
  rule: "tex/max-sentence-words",
  level: "warning",
  title: "A 61-word sentence",
  plain:
    "The sentence that starts “Because the agent…” runs to 61 words, over the writing set's limit of 55. Split it where a clause could stand alone.",
  template:
    "a sentence of {{words}} words, over {{max}} — «{{head}}». A reader loses its subject before its verb; cut it where a clause could stand alone",
  values: { words: "61", max: "55", head: "Because the agent…" },
  source: "src/readability.ts",
};

export const all: readonly Finding[] = [pageLimit, folder, study, prose];
