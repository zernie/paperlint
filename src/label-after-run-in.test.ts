/**
 * `tex/label-after-run-in`: which placed labels its judge reports and what each message says the
 * reference will print, then the rule over a paper and its includes. Its run through real ESLint is
 * in `rule-cases.test.ts`.
 */
import { describe, expect, it } from "vitest";
import { latexReader } from "./adapters/latex/index.ts";
import { memoryFiles } from "./adapters/memory/index.ts";
import { sourcesCodec } from "./adapters/sources-record/index.ts";
import type { PlacedLabel } from "./domain/tex-document.ts";
import { labelAfterRunInRule, strayLabels } from "./label-after-run-in.ts";
import { builtPaper } from "../test/recorded-fixture.ts";

const at = { start: 10, end: 25 };

describe("strayLabels", () => {
  it("reports a run-in's label with the heading whose number it prints, and nothing else", () => {
    const labels: readonly PlacedLabel[] = [
      {
        key: "sec:check",
        span: { start: 0, end: 5 },
        anchor: { kind: "numbered" },
        enclosing: { level: "subsection", title: "Check" },
      },
      {
        key: "sec:rq2",
        span: at,
        anchor: { kind: "run-in", title: "Merged history." },
        enclosing: { level: "subsection", title: "Check" },
      },
      {
        key: "plain",
        span: { start: 30, end: 40 },
        anchor: { kind: "none" },
        enclosing: null,
      },
    ];
    // Guards: only the run-in's label is reported, at its own span, naming the subsection it prints.
    expect(strayLabels(labels)).toEqual([
      {
        messageId: "runIn",
        data: {
          key: "sec:rq2",
          heading: "Merged history.",
          prints: "the number of the enclosing \\subsection «Check»",
        },
        at,
      },
    ]);
  });

  it("before any numbered heading, it prints whatever was numbered last", () => {
    const labels: readonly PlacedLabel[] = [
      {
        key: "x",
        span: at,
        anchor: { kind: "run-in", title: "RQ1." },
        enclosing: null,
      },
    ];
    expect(strayLabels(labels)).toEqual([
      {
        messageId: "runIn",
        data: {
          key: "x",
          heading: "RQ1.",
          prints: "the number of whatever was numbered last before it",
        },
        at,
      },
    ]);
  });
});

/** What the rule reported: the line, and the id with its data or the whole message. */
type Report =
  | {
      readonly line: number;
      readonly messageId: string;
      readonly data?: unknown;
    }
  | { readonly line: number; readonly message: string };

const doc = (body: string): string =>
  `\\documentclass{article}\n\\begin{document}\n${body}\n\\end{document}\n`;

/** Run the rule over `/p/paper.tex` holding `src`, as ESLint runs it: `create`, then `root`. */
function run(
  files: Record<string, string>,
  src: string,
  raw = true,
): readonly Report[] {
  const reports: Report[] = [];
  labelAfterRunInRule({
    files: memoryFiles(files),
    latex: latexReader,
    codec: sourcesCodec,
  })
    .create({
      filename: "/p/paper.tex",
      sourceCode: {
        text: src,
        ...(raw ? { raw: src } : {}),
        getLocFromIndex: (i) => ({
          line: src.slice(0, i).split("\n").length,
          column: 0,
        }),
      },
      report: (d) =>
        reports.push(
          "messageId" in d
            ? { line: d.loc.start.line, messageId: d.messageId, data: d.data }
            : { line: d.loc.start.line, message: d.message },
        ),
    })
    .root?.();
  return reports;
}

describe("the rule, as ESLint runs it", () => {
  it("reads `text` when the source code carries no `raw`", () => {
    expect(run({}, doc("\\textbf{RQ1.}\\label{x} Text."), false)).toEqual([
      {
        line: 3,
        messageId: "runIn",
        data: {
          key: "x",
          heading: "RQ1.",
          prints: "the number of whatever was numbered last before it",
        },
      },
    ]);
  });

  it("a label in an included file is reported at its \\input, naming the file, line and column", () => {
    const main = doc("\\subsection{Check}\nIntro.\n\\input{sections/rq}");
    const files = builtPaper(
      "/p",
      {
        "paper.tex": main,
        "sections/rq.tex":
          "Text.\n\n\\textbf{Merged history.}\\label{sec:rq2} We.\n",
      },
      [
        { path: "paper.tex", role: "body" },
        { path: "sections/rq.tex", role: "body" },
      ],
    );
    // Guards: the include is spliced, so the label sees the subsection that encloses it in paper.tex.
    expect(run(files, main)).toEqual([
      {
        line: 5,
        message:
          "sections/rq.tex:3:25: \\label{sec:rq2} follows «Merged history.», which steps no counter, so \\ref{sec:rq2} prints the number of the enclosing \\subsection «Check». Put the label on a numbered heading, a caption or a numbered environment, or refer to this place in words",
      },
    ]);
  });
});
