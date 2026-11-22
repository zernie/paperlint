import { expect, test } from "vitest";
import { latexReader } from "../adapters/latex/index.ts";
import { assemblePaper } from "./paper-source.ts";
import {
  lintReportLines,
  submissionLint,
  type LintFinding,
} from "./submission-lint.ts";

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
