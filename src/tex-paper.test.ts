/**
 * `tex/missing-input` and the reading every parse-tree rule shares (`readPaper`): an include that
 * names no file is reported where it stands in `paper.tex`, once, whether `paper.tex` wrote it or a
 * file it includes did; an include that resolves says nothing.
 */
import { describe, expect, it } from "vitest";
import { latexReader } from "./adapters/latex/index.ts";
import { memoryFiles } from "./adapters/memory/index.ts";
import { missingInputRule, readPaper, reportInPaper } from "./tex-paper.ts";

const doc = (body: string): string =>
  `\\documentclass{article}\n\\begin{document}\n${body}\n\\end{document}\n`;

/** What the rule reports over `/p/paper.tex` holding `src`, with `files` on disk. */
function run(src: string, files: Record<string, string> = {}) {
  const out: { line: number; messageId: string; data: unknown }[] = [];
  const rule = missingInputRule({
    files: memoryFiles(files),
    latex: latexReader,
  });
  rule
    .create({
      filename: "/p/paper.tex",
      sourceCode: {
        text: src,
        getLocFromIndex: (i) => ({
          line: src.slice(0, i).split("\n").length,
          column: 0,
        }),
      },
      report: (d) => {
        if ("messageId" in d)
          out.push({
            line: d.loc.start.line,
            messageId: d.messageId,
            data: d.data,
          });
      },
    })
    .root?.();
  return out;
}

describe("tex/missing-input", () => {
  it("an \\input naming no file is reported at its line, naming the target", () => {
    expect(run(doc("Text.\n\\input{sections/gone}"))).toEqual([
      {
        line: 4,
        messageId: "missing",
        data: { target: "sections/gone", file: "paper.tex" },
      },
    ]);
  });

  it("one missing in an included file is reported at the include that brought that file in", () => {
    expect(run(doc("\\input{a}"), { "/p/a.tex": "A\n\\input{b}\n" })).toEqual([
      { line: 3, messageId: "missingIn", data: { target: "b", file: "a.tex" } },
    ]);
  });

  it("silent when every include resolves, with `.tex` added or not", () => {
    expect(
      run(doc("\\input{a}\\include{b.tex}"), {
        "/p/a.tex": "A",
        "/p/b.tex": "B",
      }),
    ).toEqual([]);
  });
});

describe("readPaper — the paper as the rules read it", () => {
  it("reads includes from the paper's own directory", () => {
    const p = readPaper("/p/paper.tex", "x\\input{s/a}y", {
      files: memoryFiles({ "/p/s/a.tex": "AAA" }),
      latex: latexReader,
    });
    expect(p.text).toBe("xAAAy");
    expect(p.main).toBe("paper.tex");
  });
});

describe("reportInPaper — where a finding of the assembled text is reported", () => {
  const paper = readPaper("/p/paper.tex", "x\n\\input{a}\ny", {
    files: memoryFiles({ "/p/a.tex": "one\ntwo" }),
    latex: latexReader,
  });
  const report = (
    at: { start: number; end: number } | null,
    messageId = "m",
  ) => {
    const out: unknown[] = [];
    reportInPaper(
      {
        filename: "/p/paper.tex",
        sourceCode: {
          text: "",
          getLocFromIndex: (i) => ({ line: i, column: 0 }),
        },
        report: (d) =>
          out.push(
            "messageId" in d
              ? { at: d.loc.start.line, id: d.messageId }
              : { at: d.loc.start.line, message: d.message },
          ),
      },
      { m: "said {{w}}" },
      paper,
      [{ messageId, data: { w: "so" }, at }],
    );
    return out;
  };

  it("in the main file: at its own place, by its id", () => {
    expect(report({ start: 0, end: 1 })).toEqual([{ at: 0, id: "m" }]);
  });

  it("in an included file: at the include, the file, line and column in front of the filled message", () => {
    // "x\n" then "one\ntwo": offset 6 is the `t` of `two`, line 2 column 1 of a.tex.
    expect(report({ start: 6, end: 9 })).toEqual([
      { at: 2, message: "a.tex:2:1: said so" },
    ]);
  });

  it("no place, or a place outside the text: the top of the file; an unknown id is printed as itself", () => {
    expect(report(null)).toEqual([{ at: 0, id: "m" }]);
    expect(report({ start: 99, end: 99 })).toEqual([{ at: 0, id: "m" }]);
    expect(report({ start: 6, end: 9 }, "unknown")).toEqual([
      { at: 2, message: "a.tex:2:1: unknown" },
    ]);
  });
});
