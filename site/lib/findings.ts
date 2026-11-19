// The findings the journey shows. Each message is quoted from the file named in `source`, in that
// file's own placeholder syntax (`{{x}}` for an ESLint message, `${s.x}` for a template literal);
// `site/lib/findings.test.ts` fails when the quoted text is no longer in that file, so a reworded
// rule message cannot leave a stale copy on the site.

export interface Finding {
  readonly rule: string;
  readonly level: "error" | "warning";
  /** The message as `source` spells it, placeholders included. */
  readonly template: string;
  /** The values the site puts in the placeholders. */
  readonly values: Readonly<Record<string, string>>;
  /** The repository file that holds `template` verbatim. */
  readonly source: string;
}

/** `template` with its placeholders filled from `values`, and a template literal's escaped backticks undone. */
export const render = (f: Finding): string =>
  f.template
    .replace(/\\`/g, "`")
    .replace(/\{\{(\w+)\}\}/g, (whole, key: string) => f.values[key] ?? whole)
    .replace(/\$\{s\.(\w+)\}/g, (whole, key: string) => f.values[key] ?? whole);

export const desk: readonly Finding[] = [
  {
    rule: "format/page-limit",
    level: "error",
    template:
      "body pages (up to the references on page 8): 7, over the limit 6 for AIDC/short — a desk reject; cut the text",
    values: {},
    source: "src/venue-rules.test.ts",
  },
  {
    rule: "pdf/fonts",
    level: "error",
    template:
      "no font starts with `LinLibertine` (body text of AgenticDev); the PDF has: CMR10, …",
    values: {},
    source: "README.md",
  },
  {
    rule: "pdf/geometry",
    level: "error",
    template:
      "1 column(s), AgenticDev requires 2 — the wrong document class or class option",
    values: {},
    source: "README.md",
  },
];

export const folder: Finding = {
  rule: "paper/allowed-files-only",
  level: "error",
  template:
    "\\`${s.name}\\` is at the root of a paper folder (the folder holding PIPELINE-STATUS.md), and that root holds only paperlint's layout.",
  values: { name: "results-final-v2.csv" },
  source: "src/domain/paper-layout.ts",
};

export const study: Finding = {
  rule: "repro/study-registered",
  level: "error",
  template:
    "The plan of `P1-S01`, `plan.json` in its folder, leaves `mode` empty, and the study is `running`: a plan is written before the runs.",
  values: {},
  source: "src/study-registry-rule.test.ts",
};

export const prose: Finding = {
  rule: "tex/max-sentence-words",
  level: "warning",
  template:
    "a sentence of {{words}} words, over {{max}} — «{{head}}». A reader loses its subject before its verb; cut it where a clause could stand alone",
  values: { words: "61", max: "55", head: "Because the agent…" },
  source: "src/readability.ts",
};

export const all: readonly Finding[] = [...desk, folder, study, prose];
