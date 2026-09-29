/**
 * The reading every parse-tree rule shares (`readPaper`), and where a finding of the assembled text
 * is reported (`reportInPaper`).
 */
import { describe, expect, it } from "vitest";
import { latexReader } from "./adapters/latex/index.ts";
import { memoryFiles } from "./adapters/memory/index.ts";
import { readPaper, reportInPaper } from "./tex-paper.ts";

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
