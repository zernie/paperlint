/**
 * The paper as one text: includes spliced where they stand, every character mapped back to its
 * file, a missing file reported, a subfile's body only, and a file that includes itself entered once.
 * The reader is a stand-in that finds `\input{…}` by position, so these tests are about assembling,
 * not about parsing LaTeX (the LaTeX adapter's own tests cover `includes`).
 */
import { describe, expect, it } from "vitest";
import {
  assemblePaper,
  originOf,
  type AssembleDeps,
  type Include,
} from "./paper-source.ts";

/** `\input{x}` / `\include{x}` / `\subfile{x}` in `src`, by a scan good enough for these inputs. */
const includes = (src: string): readonly Include[] =>
  [...src.matchAll(/\\(input|include|subfile)\{([^}]*)\}/gu)].map((m) => ({
    macro:
      m[1] === "subfile" ? "subfile" : m[1] === "include" ? "include" : "input",
    target: m[2] ?? "",
    span: { start: m.index, end: m.index + m[0].length },
  }));

const deps = (files: Record<string, string>): AssembleDeps => ({
  includes,
  documentBody: (src) => {
    const a = src.indexOf("\\begin{document}");
    const b = src.indexOf("\\end{document}");
    return a < 0 || b < 0
      ? null
      : { start: a + "\\begin{document}".length, end: b };
  },
  read: (p) => files[p] ?? null,
});

describe("assemblePaper — the text TeX reads", () => {
  it("splices each file where its include stands; `.tex` is tried first", () => {
    const main = "A\\input{s/one}B\\include{two.tex}C";
    const p = assemblePaper(
      "paper.tex",
      main,
      deps({ "s/one.tex": "one", "two.tex": "two" }),
    );
    expect(p.text).toBe("AoneBtwoC");
    expect(p.missing).toEqual([]);
    expect([...new Set(p.segments.map((g) => g.file))]).toEqual([
      "paper.tex",
      "s/one.tex",
      "two.tex",
    ]);
  });

  it("nested includes resolve from the paper directory, and map back through the outermost include", () => {
    const main = "x\\input{a}y";
    const p = assemblePaper(
      "paper.tex",
      main,
      deps({ "a.tex": "[\\input{s/b}]", "s/b.tex": "BB" }),
    );
    expect(p.text).toBe("x[BB]y");
    expect(originOf(p, { start: 2, end: 4 })).toEqual({
      file: "s/b.tex",
      source: "BB",
      span: { start: 0, end: 2 },
      via: { start: 1, end: 10 },
    });
  });

  it("🔴 a missing file is reported where it stands, and left out", () => {
    const main = "a\\input{gone}b";
    const p = assemblePaper("paper.tex", main, deps({}));
    expect(p.text).toBe("ab");
    expect(p.missing).toEqual([
      {
        file: "paper.tex",
        target: "gone",
        span: { start: 1, end: 13 },
        via: { start: 1, end: 13 },
      },
    ]);
  });
});

describe("assemblePaper — subfiles and a file that includes itself", () => {
  it("a subfile contributes its document body, not its preamble", () => {
    const sub =
      "\\documentclass[paper]{subfiles}\\begin{document}BODY\\end{document}";
    const p = assemblePaper(
      "paper.tex",
      "<\\subfile{s}>",
      deps({ "s.tex": sub }),
    );
    expect(p.text).toBe("<BODY>");
  });

  it("a subfile with no document environment is read whole", () => {
    const p = assemblePaper(
      "paper.tex",
      "<\\subfile{s}>",
      deps({ "s.tex": "ALL" }),
    );
    expect(p.text).toBe("<ALL>");
  });

  it("a file that includes itself is entered once", () => {
    const p = assemblePaper(
      "paper.tex",
      "m\\input{a}",
      deps({ "a.tex": "a\\input{a}\\input{paper.tex}" }),
    );
    expect(p.text).toBe("ma");
  });
});

describe("originOf — where a span of the assembled text comes from", () => {
  const p = assemblePaper(
    "paper.tex",
    "ab\\input{x}cd",
    deps({ "x.tex": "XYZ" }),
  );

  it("in the main file: its own offsets, via nothing", () => {
    expect(originOf(p, { start: 0, end: 2 })).toEqual({
      file: "paper.tex",
      source: "ab\\input{x}cd",
      span: { start: 0, end: 2 },
      via: null,
    });
  });

  it("after the include: offsets in the main file past the macro", () => {
    expect(originOf(p, { start: 5, end: 7 })).toEqual({
      file: "paper.tex",
      source: "ab\\input{x}cd",
      span: { start: 11, end: 13 },
      via: null,
    });
  });

  it("a span running out of an included file is cut at its end", () => {
    expect(originOf(p, { start: 3, end: 7 })).toEqual({
      file: "x.tex",
      source: "XYZ",
      span: { start: 1, end: 3 },
      via: { start: 2, end: 11 },
    });
  });

  it("an empty span at the very end belongs to the last stretch; outside the text there is none", () => {
    expect(originOf(p, { start: 7, end: 7 })?.span).toEqual({
      start: 13,
      end: 13,
    });
    expect(originOf(p, { start: 9, end: 9 })).toBe(null);
  });
});
