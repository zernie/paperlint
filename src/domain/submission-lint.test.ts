import { describe, expect, test } from "vitest";
import { latexReader } from "../adapters/latex/index.ts";
import { assemblePaper } from "./paper-source.ts";
import {
  lintFindingLine,
  lintReportLines,
  submissionLint,
  type LintFinding,
  type PaperSections,
} from "./submission-lint.ts";
import type { Heading, Outline } from "./tex-document.ts";

test("warnings on the abstract include and introduction precede other findings", () => {
  const tex = [
    "\\documentclass{article}",
    "\\begin{document}",
    "\\input{summary}",
    "\\section{Introduction and motivation}",
    "Motivation.",
    "\\section{Results}",
    "The result.",
    "\\end{document}",
  ].join("\n");
  const paper = assemblePaper("paper.tex", tex, {
    includes: latexReader.includes,
    documentBody: latexReader.documentBody,
    read: (name) =>
      name === "summary.tex"
        ? "\\begin{abstract}\nSummary.\n\\end{abstract}\n"
        : null,
  });
  const message = (
    line: number,
    severity: 1 | 2,
    text: string,
  ): LintFinding => ({
    file: "paper.tex",
    line,
    column: 1,
    severity,
    ruleId: "tex/example",
    message: text,
  });
  const findings = submissionLint(
    [
      message(7, 1, "Results warning"),
      message(7, 2, "Results error"),
      message(5, 1, "Introduction warning"),
      message(3, 1, "Abstract warning"),
    ],
    {
      paper,
      abstract: latexReader.abstractSpan(paper.text),
      outline: latexReader.outline(paper.text),
    },
  );
  expect(lintReportLines(findings)).toStrictEqual([
    "lint: 1 error, 3 warnings (abstract: 1, introduction: 1)",
    "Abstract warnings",
    "  paper.tex:3:1 tex/example — Abstract warning",
    "Introduction warnings",
    "  paper.tex:5:1 tex/example — Introduction warning",
    "Lint errors",
    "  paper.tex:7:1 tex/example — Results error",
    "Other lint warnings",
    "  paper.tex:7:1 tex/example — Results warning",
  ]);
});

const sample = [
  "\\section{Introduction}",
  "intro text",
  "\\section{Methods}",
  "method text",
  "\\bibliography{refs}",
  "",
].join("\n");
const offsetOfLine = (line: number): number =>
  sample
    .split("\n")
    .slice(0, line - 1)
    .reduce((n, text) => n + text.length + 1, 0);
const heading = (title: string, line: number): Heading => ({
  title,
  place: {
    kind: "at",
    span: { start: offsetOfLine(line), end: offsetOfLine(line + 1) },
  },
});
const warnAt = (line: number, file = "paper.tex"): LintFinding => ({
  file,
  line,
  column: 1,
  severity: 1,
  ruleId: "tex/example",
  message: `line ${String(line)}`,
});
const sampleSections = (
  outline: Outline,
  abstract: PaperSections["abstract"] = null,
): PaperSections => ({
  paper: assemblePaper("paper.tex", sample, {
    includes: () => [],
    documentBody: () => null,
    read: () => null,
  }),
  abstract,
  outline,
});
const introductionLines = (outline: Outline): readonly (number | undefined)[] =>
  submissionLint(
    [2, 4].map((line) => warnAt(line)),
    sampleSections(outline),
  ).introductionWarnings.map((m) => m.line);

describe("the introduction ends where the next section, the back matter or the document ends", () => {
  const intro = heading("Introduction", 1);
  const methods = heading("Methods", 3);
  const unplaced: Heading = { title: "Preface", place: { kind: "unplaced" } };

  test("at the next placed section, skipping a heading the parser did not place", () => {
    expect(
      introductionLines({
        sections: [unplaced, intro, methods],
        backMatter: null,
        end: null,
      }),
    ).toStrictEqual([2]);
  });

  test("at the back matter when the introduction is the last section", () => {
    expect(
      introductionLines({
        sections: [heading("Intro and background", 1)],
        backMatter: offsetOfLine(5),
        end: sample.length,
      }),
    ).toStrictEqual([2, 4]);
  });

  test("at the end of the document when there is no back matter", () => {
    expect(
      introductionLines({
        sections: [intro],
        backMatter: null,
        end: offsetOfLine(4),
      }),
    ).toStrictEqual([2]);
  });

  test("nowhere when neither the back matter nor the end is known", () => {
    expect(
      introductionLines({ sections: [intro], backMatter: null, end: null }),
    ).toStrictEqual([2, 4]);
  });

  test("there is no introduction when no heading names one", () => {
    expect(
      introductionLines({
        sections: [methods],
        backMatter: null,
        end: null,
      }),
    ).toStrictEqual([]);
  });
});

test("a warning is placed in a section only when its file, line and column point into the paper", () => {
  const abstract = { start: 0, end: sample.length };
  const noColumn: LintFinding = { ...warnAt(2), column: undefined };
  const noLine: LintFinding = { ...warnAt(2), line: undefined };
  const beforeFirstLine: LintFinding = { ...warnAt(2), line: 0 };
  const pastLastLine = warnAt(99);
  const otherFile = warnAt(2, "other.tex");
  const all = [noColumn, noLine, beforeFirstLine, pastLastLine, otherFile];
  const lint = submissionLint(
    all,
    sampleSections({ sections: [], backMatter: null, end: null }, abstract),
  );
  expect(lint.abstractWarnings).toStrictEqual([noColumn]);
  expect(lint.warnings).toStrictEqual(all);
  expect(lint.errors).toStrictEqual([]);
});

test("without the paper's sections no warning belongs to the abstract or the introduction", () => {
  const lint = submissionLint([warnAt(2)], null);
  expect([lint.abstractWarnings, lint.introductionWarnings]).toStrictEqual([
    [],
    [],
  ]);
});

test("a finding line names the place only when the finding has a line, and the rule only when it has one", () => {
  const base: LintFinding = {
    file: "paper.tex",
    severity: 2,
    ruleId: null,
    message: "  broken \n",
  };
  expect([
    lintFindingLine(base),
    lintFindingLine({ ...base, line: 0 }),
    lintFindingLine({ ...base, line: 3 }),
    lintFindingLine({ ...base, line: 3, column: 7, ruleId: "tex/example" }),
  ]).toStrictEqual([
    "paper.tex — broken",
    "paper.tex — broken",
    "paper.tex:3:1 — broken",
    "paper.tex:3:7 tex/example — broken",
  ]);
});
