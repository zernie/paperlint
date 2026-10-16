/**
 * `paper/study-mode-claim` and `paper/study-mode-stated` (`src/study-claim-rules.ts`, judges in
 * `src/domain/study-claims.ts`) over a paper held in memory, read by the real LaTeX reader, git a
 * stand-in. Both halves: silent on a paper whose linked paragraphs say what their studies are; loud
 * on each overclaim, each link to no study, each unlabelled exploratory number.
 */
import { expect, it } from "vitest";
import { latexReader } from "./adapters/latex/index.ts";
import { memoryFiles, memoryListDir } from "./adapters/memory/index.ts";
import { sourcesCodec } from "./adapters/sources-record/index.ts";
import { studyRegistryCodec } from "./adapters/study-registry/index.ts";
import type { OrderFacts } from "./domain/decide-first.ts";
import type { StudyMode } from "./domain/study-mode.ts";
import { planText, registryText } from "./domain/study-registry.ts";
import { studyClaimRules } from "./study-claim-rules.ts";
import { BLIND, DIR, ROW, fakeGit, planOf } from "../test/study-tree.ts";

const DECIDED: StudyMode = {
  kind: "decide_before_run",
  outputs: ["RESULTS.md"],
  decision: { file: "repro/P1-S01-a/decision.md", note: "exclusions" },
};
const D = { commit: "d".repeat(40), date: "2026-10-16T10:00:00+05:00" };
const AFTER: OrderFacts = {
  kind: "read",
  decision: D,
  files: [
    {
      path: "RESULTS.md",
      commit: "a".repeat(40),
      date: D.date,
      order: "after",
    },
  ],
};
const SAME: OrderFacts = {
  kind: "read",
  decision: D,
  files: [{ path: "RESULTS.md", ...D, order: "same" }],
};

/** A paper with studies P1-S01 (decided first), P1-S02 (exploratory), P1-S03 (no mode). */
const tree = (body: string): Record<string, string> => ({
  [`${DIR}/PIPELINE-STATUS.md`]: "# status\n",
  [`${DIR}/paper.tex`]: `\\documentclass{article}\n\\begin{document}\n${body}\n\\end{document}\n`,
  [`${DIR}/repro/studies.json`]: registryText({
    prefix: "P1",
    studies: [
      { ...ROW, id: "P1-S01", folder: "P1-S01-a" },
      { ...ROW, id: "P1-S02", folder: "P1-S02-a" },
      { ...ROW, id: "P1-S03", folder: "P1-S03-a" },
      { ...ROW, id: "P1-S04", folder: "P1-S04-a" },
    ],
  }),
  [`${DIR}/repro/P1-S04-a/plan.json`]: planText(planOf(BLIND)),
  [`${DIR}/repro/P1-S01-a/plan.json`]: planText(planOf(DECIDED)),
  [`${DIR}/repro/P1-S02-a/plan.json`]: planText(
    planOf({ kind: "exploratory", reason: "a first look" }),
  ),
  [`${DIR}/repro/P1-S03-a/plan.json`]: planText(planOf(undefined)),
});

/** Each rule's reports over the paper: message id and line. */
const lint = (body: string, order: OrderFacts = AFTER, raw = true) => {
  const files = memoryFiles(tree(body));
  const rules = studyClaimRules({
    prose: { files, latex: latexReader, codec: sourcesCodec },
    studies: {
      files,
      listDir: memoryListDir(files),
      codec: studyRegistryCodec,
      git: fakeGit({}, order),
    },
  });
  const src = new TextDecoder().decode(
    files.readBytes(`${DIR}/paper.tex`) ?? new Uint8Array(),
  );
  return (["study-mode-claim", "study-mode-stated"] as const).map((name) => {
    const out: string[] = [];
    rules[name]
      .create({
        filename: `${DIR}/paper.tex`,
        sourceCode: {
          text: src,
          ...(raw ? { raw: src } : {}),
          getLocFromIndex: (i: number) => ({
            line: src.slice(0, i).split("\n").length,
            column: 0,
          }),
        },
        report: (d: {
          readonly messageId?: string;
          readonly loc: { readonly start: { readonly line: number } };
        }) => out.push(`${String(d.messageId)}@${String(d.loc.start.line)}`),
      })
      .root?.();
    return out;
  });
};

it("silent on a paper whose linked paragraphs say what their studies are, and on one with no link", () => {
  const body = [
    "We pre-registered the exclusions; 41 of 60 runs pass. % study: P1-S01",
    "",
    "In an exploratory look, 12 runs stall.",
    "% study: P1-S02",
    "",
    "Nothing here is pre-registered, and 7 is a number.",
    "",
    "The labels were blinded. % study: P1-S04",
  ].join("\n");
  // Guards: the correct paper — and an unlinked paragraph is never judged.
  expect(lint(body)).toEqual([[], []]);
});

it("an overclaim on an exploratory study, on one with no mode, and on one whose history does not show the order", () => {
  const body = [
    "The study was preregistered. % study: P1-S02",
    "",
    "It was decided before the run. % study: P1-S03",
    "",
    "A blind evaluation. % study: P1-S01",
  ].join("\n");
  // Guards: each claim word is one error, at its line; the decide-first study only when its order is not shown.
  expect(lint(body, SAME)).toEqual([
    ["overclaim@3", "overclaim@5", "overclaim@7"],
    [],
  ]);
  expect(lint(body, AFTER)[0]).toEqual(["overclaim@3", "overclaim@5"]);
});

it("a link to an unregistered study, and an exploratory number left unlabelled", () => {
  const body = ["In total 12 runs stall. % study: P1-S02, P9-S99"].join("\n");
  // Guards: a broken link is an error; the number from an exploratory study, unlabelled, a warning.
  expect(lint(body, AFTER, false)).toEqual([
    ["unknownStudy@3"],
    ["unlabelled@3"],
  ]);
});
