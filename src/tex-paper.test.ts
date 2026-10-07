/**
 * The reading every parse-tree rule shares (`readPaper`): the paper's text with the files TeX read
 * spliced in — the files the build's record lists, and no others — and where a finding of that text
 * is reported (`reportInPaper`). The record fed to it is TeX's own answer for a planted paper
 * (`fixtures/paper-sources/<name>/tex-truth.json`). `bodyFiles`, the old static answer to "which
 * files", is still here until it goes (docs/design/paper-sources.md §1).
 */
import { describe, expect, it } from "vitest";
import { latexReader } from "./adapters/latex/index.ts";
import { memoryFiles } from "./adapters/memory/index.ts";
import { sourcesCodec } from "./adapters/sources-record/index.ts";
import { join } from "node:path";
import { texInputsDir } from "./package-dirs.ts";
import { bodyFiles } from "./paper-sources.ts";
import { readPaper, reportInPaper } from "./tex-paper.ts";
import {
  builtFixture,
  builtPaper,
  fixtureFiles,
} from "../test/recorded-fixture.ts";

/** What `readPaper` reads with: the files held in memory, the LaTeX reader, the record's schema. */
const proseDeps = (files: Record<string, string>) => ({
  files: memoryFiles(files),
  latex: latexReader,
  codec: sourcesCodec,
});

const MAIN = "/p/paper.tex";
const textOf = (files: Record<string, string>): string => files[MAIN] ?? "";

describe("readPaper — the paper as the rules read it, from the files TeX read", () => {
  it("🔴 splices a file the record lists where its include stands, and TeX's end of line after it", () => {
    // p1: TeX read sections/intro.tex, and the file's last line ends with a newline.
    const files = builtFixture("p1", "/p");
    const p = readPaper(MAIN, textOf(files), proseDeps(files));
    const main = textOf(files);
    const intro = files["/p/sections/intro.tex"] ?? "";
    expect(p.text).toBe(main.replace("\\input{sections/intro}", intro));
    expect(p.missing).toEqual([]);
    expect(p.main).toBe("paper.tex");
  });

  it("an include behind a comment or `\\iffalse` is not spliced: the record does not list it", () => {
    const files = builtFixture("p1", "/p");
    const { text } = readPaper(MAIN, textOf(files), proseDeps(files));
    expect(text).not.toContain("Dead section");
    expect(text).not.toContain("Parked section");
  });

  it("🔴 a file the text names after \\end{document} is not spliced: TeX never read it", () => {
    // v23-parked-include: `\input{parked}` stands past the end of the document; parked.tex is on
    // disk, and the record lists paper.tex alone.
    const files = builtFixture("v23-parked-include", "/p");
    expect(files["/p/parked.tex"]).toBeDefined();
    const p = readPaper(MAIN, textOf(files), proseDeps(files));
    expect(p.text).toBe(textOf(files));
    expect(p.text).not.toContain("\\bibliography{old}");
  });

  it("🔴 with no record, the paper is paper.tex alone: its includes are not read", () => {
    const files = fixtureFiles("p1", "/p");
    const p = readPaper(MAIN, textOf(files), proseDeps(files));
    expect(p.text).toBe(textOf(files));
    expect(p.segments).toHaveLength(1);
    expect(p.missing).toEqual([]);
  });

  it("🔴 with a stale record, the paper is paper.tex alone", () => {
    const files = {
      ...builtFixture("p1", "/p"),
      "/p/sections/intro.tex": "\\section{Changed}\n",
    };
    const p = readPaper(MAIN, textOf(files), proseDeps(files));
    expect(p.text).toBe(textOf(files));
  });

  it("a record this paperlint cannot read is no record", () => {
    const files = {
      ...builtFixture("p1", "/p"),
      "/p/_build/sources.json": "{",
    };
    const p = readPaper(MAIN, textOf(files), proseDeps(files));
    expect(p.text).toBe(textOf(files));
  });
});

describe("readPaper — which files, in which order", () => {
  it("files are found in the paper's directory only: paperlint's inputs are not the paper's", () => {
    const files = {
      ...builtPaper("/p", { "paper.tex": "x\\input{guards}y" }, [
        { path: "paper.tex", role: "body" },
      ]),
      [join(texInputsDir(), "guards.tex")]: "G",
    };
    const p = readPaper(MAIN, textOf(files), proseDeps(files));
    expect(p.text).toBe("xy");
  });

  it("nested includes are spliced in the order TeX read them, each once", () => {
    const files = builtPaper(
      "/p",
      {
        "paper.tex": "A\n\\input{sections/a}\nZ\n",
        "sections/a.tex": "a1\n\\input{sections/b}\na2\n",
        "sections/b.tex": "b1",
      },
      [
        { path: "paper.tex", role: "body" },
        { path: "sections/a.tex", role: "body" },
        { path: "sections/b.tex", role: "body" },
      ],
    );
    const p = readPaper(MAIN, textOf(files), proseDeps(files));
    expect(p.text).toBe("A\na1\nb1\n\na2\n\nZ\n");
    expect([...new Set(p.segments.map((s) => s.file))]).toEqual([
      "paper.tex",
      "sections/a.tex",
      "sections/b.tex",
    ]);
  });

  it("a preamble file the record lists is spliced too: it is a file of the paper", () => {
    const files = builtPaper(
      "/p",
      {
        "paper.tex": "\\input{macros}\n\\begin{document}\nText.\n",
        "macros.tex": "\\newcommand{\\x}{y}\n",
      },
      [
        { path: "paper.tex", role: "body" },
        { path: "macros.tex", role: "preamble" },
      ],
    );
    const p = readPaper(MAIN, textOf(files), proseDeps(files));
    expect(p.text).toBe("\\newcommand{\\x}{y}\n\n\\begin{document}\nText.\n");
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
  const main = "x\n\\input{a}\ny";
  const paper = readPaper(
    "/p/paper.tex",
    main,
    proseDeps(
      builtPaper("/p", { "paper.tex": main, "a.tex": "one\ntwo" }, [
        { path: "paper.tex", role: "body" },
        { path: "a.tex", role: "body" },
      ]),
    ),
  );
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
