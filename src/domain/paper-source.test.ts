/**
 * The paper as one text: includes spliced where they stand, every character mapped back to its
 * file, a file with nothing behind it left out, a subfile's body only, and a file that includes itself entered once.
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
    expect(p.text).toBe("Aone\nBtwo\nC");
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
    expect(p.text).toBe("x[BB\n]\ny");
    expect(originOf(p, { start: 2, end: 4 })).toEqual({
      file: "s/b.tex",
      source: "BB",
      span: { start: 0, end: 2 },
      via: { start: 1, end: 10 },
    });
  });

  it("a file the reader has none of contributes nothing", () => {
    const p = assemblePaper("paper.tex", "a\\input{gone}b", deps({}));
    expect(p.text).toBe("ab");
    expect(p.segments.map((g) => g.file)).toEqual(["paper.tex", "paper.tex"]);
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
    expect(p.text).toBe("<ALL\n>");
  });

  it("a file that includes itself is entered once", () => {
    const p = assemblePaper(
      "paper.tex",
      "m\\input{a}",
      deps({ "a.tex": "a\\input{a}\\input{paper.tex}" }),
    );
    expect(p.text).toBe("ma\n");
  });
});

describe("assemblePaper — TeX's end of line after the last line of an included file", () => {
  // Measured with TeX Live 2026: `a\input f b` with f = `foo`, no final newline, typesets «afoo b» —
  // the file's last line is ended like any other; `f` = `bar` plus a newline typesets the same; an
  // empty file reads no line and adds nothing.
  it("a file whose last line has no newline is ended, so what follows it is a new word", () => {
    const p = assemblePaper(
      "paper.tex",
      "a\\input{f}b",
      deps({ "f.tex": "foo" }),
    );
    expect(p.text).toBe("afoo\nb");
  });

  it("a file that ends with a newline gets no second one", () => {
    const p = assemblePaper(
      "paper.tex",
      "a\\input{f}b",
      deps({ "f.tex": "foo\n" }),
    );
    expect(p.text).toBe("afoo\nb");
  });

  it("an empty file reads no line: it adds nothing", () => {
    const p = assemblePaper("paper.tex", "a\\input{f}b", deps({ "f.tex": "" }));
    expect(p.text).toBe("ab");
  });

  it("the main file is not ended: its text is the caller's, as given", () => {
    const p = assemblePaper("paper.tex", "no newline", deps({}));
    expect(p.text).toBe("no newline");
  });

  it("the end of line belongs to the file it ends, at the end of that file", () => {
    const p = assemblePaper(
      "paper.tex",
      "a\\input{f}b",
      deps({ "f.tex": "foo" }),
    );
    expect(originOf(p, { start: 4, end: 5 })).toEqual({
      file: "f.tex",
      source: "foo",
      span: { start: 3, end: 4 },
      via: { start: 1, end: 10 },
    });
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
    expect(originOf(p, { start: 6, end: 8 })).toEqual({
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
    expect(originOf(p, { start: 8, end: 8 })?.span).toEqual({
      start: 13,
      end: 13,
    });
    expect(originOf(p, { start: 10, end: 10 })).toBe(null);
  });
});
