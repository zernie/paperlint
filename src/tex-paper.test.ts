/**
 * The reading every parse-tree rule shares (`readPaper`), the files of the paper's body that lint
 * reads on their own (`bodyFiles`), and where a finding of the assembled text is reported
 * (`reportInPaper`).
 */
import { describe, expect, it } from "vitest";
import { latexReader } from "./adapters/latex/index.ts";
import { memoryFiles } from "./adapters/memory/index.ts";
import { join } from "node:path";
import { texInputsDir } from "./package-dirs.ts";
import { bodyFiles } from "./paper-sources.ts";
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

  it("an include the paper's directory lacks is found in paperlint's own inputs, as the build finds it", () => {
    const p = readPaper("/p/paper.tex", "x\\input{guards}y", {
      files: memoryFiles({ [join(texInputsDir(), "guards.tex")]: "G" }),
      latex: latexReader,
    });
    expect({ text: p.text, missing: p.missing }).toEqual({
      text: "xGy",
      missing: [],
    });
  });

  it("the paper's directory comes first: its file wins over paperlint's of the same name", () => {
    const p = readPaper("/p/paper.tex", "\\input{guards}", {
      files: memoryFiles({
        "/p/guards.tex": "mine",
        [join(texInputsDir(), "guards.tex")]: "package",
      }),
      latex: latexReader,
    });
    expect(p.text).toBe("mine");
  });
});

describe("bodyFiles — the files of the body lint reads on their own", () => {
  const doc = (preamble: string, body: string): string =>
    `\\documentclass{article}\n${preamble}\n\\begin{document}\n${body}\n\\end{document}\n`;
  const files = (extra: Record<string, string> = {}) =>
    memoryFiles({
      "/p/macros.tex": "\\newcommand{\\x}{y}",
      "/p/sections/a.tex": "A\n\\input{sections/b}\n",
      "/p/sections/b.tex": "B",
      [join(texInputsDir(), "guards.tex")]: "G",
      ...extra,
    });

  it("every file an include in the document body brings in, nested ones too, by absolute path", () => {
    expect(
      bodyFiles("/p/paper.tex", doc("", "\\input{sections/a}"), {
        files: files(),
        latex: latexReader,
      }),
    ).toEqual({
      files: ["/p/sections/a.tex", "/p/sections/b.tex"],
      missing: [],
    });
  });

  it("not a preamble include (macros), and not a file found only in paperlint's inputs", () => {
    expect(
      bodyFiles(
        "/p/paper.tex",
        doc("\\input{macros}", "\\input{guards}\nText."),
        { files: files(), latex: latexReader },
      ),
    ).toEqual({ files: [], missing: [] });
  });

  it("🔴 a file included in the preamble AND in the body is body: the role is the file's, across every include of it", () => {
    expect(
      bodyFiles(
        "/p/paper.tex",
        doc("\\input{sections/b}", "\\input{sections/b}\nText."),
        { files: files(), latex: latexReader },
      ),
    ).toEqual({ files: ["/p/sections/b.tex"], missing: [] });
  });

  it("an include that resolves nowhere is named, with the file that wrote it", () => {
    expect(
      bodyFiles("/p/paper.tex", doc("", "\\input{gone}"), {
        files: files(),
        latex: latexReader,
      }),
    ).toEqual({ files: [], missing: [{ file: "paper.tex", target: "gone" }] });
  });

  it("a main file with no document environment: every include is the body", () => {
    expect(
      bodyFiles("/p/paper.tex", "\\input{sections/b}", {
        files: files(),
        latex: latexReader,
      }),
    ).toEqual({ files: ["/p/sections/b.tex"], missing: [] });
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
