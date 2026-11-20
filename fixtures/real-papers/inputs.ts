/**
 * Does every real paper hold the files its source names? A pure check over one paper directory:
 * each `\input`/`\include` reached from `paper.tex` (comments stripped) must resolve to a file in
 * the directory, and each `.tex` file it resolves to must be listed in `record-by-hand.json`, the
 * record the lint reads instead of a TeX run. A target that resolves only by case-folding is
 * reported apart: TeX Live finds it (kpathsea falls back to a case-insensitive match), paperlint
 * does not. `inputs.test.ts` runs it on planted directories and on every paper of `accepted/` and
 * `preprints/`. What it cannot see: inputs built by a macro at run time (a target with `#` is
 * skipped), `\subfile`, `\import`, and files TeX finds outside the directory.
 */
import * as R from "remeda";

/** One paper directory: every file's path relative to it, and the text of its `.tex` files. */
export type PaperFiles = Readonly<{
  paths: readonly string[];
  tex: ReadonlyMap<string, string>;
  /** The `inputs[].path` of `record-by-hand.json`, or undefined when the paper has none. */
  recorded: readonly string[] | undefined;
}>;

export type InputProblem = Readonly<
  | { kind: "missing"; from: string; target: string }
  | { kind: "case-only"; from: string; target: string; file: string }
  | { kind: "not-recorded"; file: string }
>;

/** Extensions TeX reads that are not prose sources: their absence is not this check's business. */
const NOT_PROSE = /\.(sty|cls|bbl|bst|tikz|pgf|pdf_tex)$/;

const stripComments = (s: string): string =>
  s
    .split("\n")
    .map((l) => l.replace(/(^|[^\\])%.*$/, "$1"))
    .join("\n");

const targetsOf = (text: string): readonly string[] =>
  [...stripComments(text).matchAll(/\\(?:input|include)\s*\{([^}]+)\}/g)]
    .flatMap((m) => m.slice(1, 2))
    .map((t) => t.trim().replace(/^\.\//, ""))
    .filter((t) => t !== "" && !t.includes("#") && !NOT_PROSE.test(t));

const candidates = (t: string): readonly string[] => [t, `${t}.tex`];

type Step = Readonly<{ seen: ReadonlySet<string>; problems: readonly InputProblem[] }>;

/** Follows the inputs from `paper.tex`, depth first, in source order. */
export const inputProblems = (paper: PaperFiles): readonly InputProblem[] => {
  const lower = new Map(paper.paths.map((p) => [p.toLowerCase(), p]));
  const visit = (file: string, acc: Step): Step =>
    targetsOf(paper.tex.get(file) ?? "").reduce<Step>((step, target) => {
      const exact = candidates(target).find((c) => paper.paths.includes(c));
      const folded =
        exact ?? candidates(target).map((c) => lower.get(c.toLowerCase())).find(R.isDefined);
      if (folded === undefined)
        return { ...step, problems: [...step.problems, { kind: "missing", from: file, target }] };
      // paperlint does not read a case-only match, so it is neither followed nor required in the record.
      if (exact === undefined)
        return {
          ...step,
          problems: [...step.problems, { kind: "case-only", from: file, target, file: folded }],
        };
      if (step.seen.has(exact) || !exact.endsWith(".tex")) return step;
      return visit(exact, { ...step, seen: new Set([...step.seen, exact]) });
    }, acc);
  const walked = visit("paper.tex", { seen: new Set(["paper.tex"]), problems: [] });
  const notRecorded: readonly InputProblem[] =
    paper.recorded === undefined
      ? []
      : [...walked.seen]
          .filter((f) => !paper.recorded?.includes(f))
          .map((file) => ({ kind: "not-recorded", file }));
  return [...walked.problems, ...notRecorded];
};
