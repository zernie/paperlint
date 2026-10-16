/**
 * `repro/blind-plaintext` (`src/blind-plaintext-rule.ts`) called directly, on paper folders held in
 * memory: it reports on `PIPELINE-STATUS.md` only, and reads a row's plan only where a disk could hold
 * it. The findings themselves are judged in `src/domain/sealed-study.test.ts`, and the rule through
 * real ESLint in `src/rule-cases.test.ts`.
 */
import { expect, it } from "vitest";
import { memoryFiles, memoryListDir } from "./adapters/memory/index.ts";
import { studyRegistryCodec } from "./adapters/study-registry/index.ts";
import { blindPlaintextRules, blindStudies } from "./blind-plaintext-rule.ts";
import {
  planTemplate,
  planText,
  registryText,
  type Study,
} from "./domain/study-registry.ts";

const DIR = "/work/papers/example";
const ROW: Study = {
  id: "P1-S01",
  folder: "P1-S01-outcome",
  title: "Outcome",
  question: "q?",
  kind: "measurement",
  status: "designing",
  date: "2026-10-01",
  in_paper: "no",
  plan: "plan.json",
};
const BLIND_PLAN = planText({
  ...planTemplate(),
  blind: {
    recipients: [`age1${"q".repeat(58)}`],
    outputs: ["RESULTS.md"],
    unseal_after: { file: "exclusions.md", note: "n" },
  },
});

const deps = (tree: Readonly<Record<string, string>>) => {
  const files = memoryFiles(tree);
  return { files, listDir: memoryListDir(files), codec: studyRegistryCodec };
};

const TREE = {
  [`${DIR}/PIPELINE-STATUS.md`]: "# status\n",
  [`${DIR}/repro/studies.json`]: registryText({ prefix: "P1", studies: [ROW] }),
  [`${DIR}/repro/P1-S01-outcome/plan.json`]: BLIND_PLAN,
  [`${DIR}/repro/P1-S01-outcome/RESULTS.md`]: "41 of 60\n",
};

it("reports only on PIPELINE-STATUS.md: any other file of the paper gets no visitor", () => {
  const rule = blindPlaintextRules(deps(TREE))["blind-plaintext"];
  const reported: string[] = [];
  const on = (filename: string) =>
    rule.create({
      filename,
      sourceCode: { getLocFromIndex: () => ({ line: 1, column: 0 }) },
      report: (d) => reported.push(d.messageId),
    });
  on(`${DIR}/paper.tex`).root?.();
  on(`${DIR}/PIPELINE-STATUS.md`).root?.();
  // Guards: the finding is reported once per paper, not once per file ESLint lints.
  expect(reported).toEqual(["plaintext"]);
});

it("a plan path no disk can hold (a NUL) is no plan, read without probing the disk", () => {
  const tree = {
    ...TREE,
    [`${DIR}/repro/studies.json`]: registryText({
      prefix: "P1",
      studies: [{ ...ROW, plan: "plan\0.json" }],
    }),
  };
  // Guards: a hand-edited row cannot make the rule throw; the row is simply not a blind study.
  expect(blindStudies(DIR, deps(tree))).toEqual([]);
});
