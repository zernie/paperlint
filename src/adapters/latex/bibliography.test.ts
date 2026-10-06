/**
 * The latex adapter's bibliography readers: the `filecontents` blocks of a source, and the entries
 * of a BibTeX text read the way bibtex reads them.
 */
import { describe, expect, it } from "vitest";
import { absolutePath } from "../../domain/paths.ts";
import { latexReader } from "./index.ts";

describe("filecontents — the blocks a source writes, from the tree", () => {
  const blocks = (src: string) =>
    latexReader.filecontents(src).map((b) => ({
      writes: b.writes,
      overwrite: b.overwrite,
      env: src.slice(b.span.start, b.span.end).split("\n")[0],
      body: src.slice(b.body.start, b.body.end),
    }));

  it("the starred and plain forms, the option, the name, and the body after the begin line", () => {
    const src =
      "x\n\\begin{filecontents*}[overwrite]{refs.bib}\n@misc{a,}\n\\end{filecontents*}\n" +
      "\\begin{filecontents}{b.bib} junk TeX ignores\n@misc{b,}\n\\end{filecontents}\n";
    expect(blocks(src)).toEqual([
      {
        writes: "refs.bib",
        overwrite: true,
        env: "\\begin{filecontents*}[overwrite]{refs.bib}",
        body: "@misc{a,}\n",
      },
      {
        writes: "b.bib",
        overwrite: false,
        env: "\\begin{filecontents}{b.bib} junk TeX ignores",
        body: "@misc{b,}\n",
      },
    ]);
  });

  it("[force] overwrites as [overwrite] does; [nosearch] alone does not", () => {
    const one = (opt: string) =>
      blocks(`\\begin{filecontents*}${opt}{r.bib}\n\\end{filecontents*}`)[0]
        ?.overwrite;
    expect([
      one("[force]"),
      one("[nosearch, overwrite]"),
      one("[nosearch]"),
      one(""),
    ]).toEqual([true, true, false, false]);
  });

  it("a block that names no file writes nothing TeX can name, so it is no block", () => {
    expect(
      blocks("\\begin{filecontents*}\n@misc{a,}\n\\end{filecontents*}\n"),
    ).toEqual([]);
  });

  it("a commented-out block and one inside \\iffalse are no blocks (v4)", () => {
    const src =
      "% \\begin{filecontents*}{refs.bib}\n% @misc{a,}\n% \\end{filecontents*}\n" +
      "\\iffalse\n\\begin{filecontents*}{old.bib}\n@misc{b,}\n\\end{filecontents*}\n\\fi\n";
    expect(blocks(src)).toEqual([]);
  });
});

describe("bibText — a BibTeX text's entries, as bibtex finds them", () => {
  const entries = (text: string) =>
    latexReader.bibText(absolutePath("/p/refs.bib"), text).entries.map((e) => ({
      type: e.type,
      key: e.key,
      text: text.slice(e.span.start, e.span.end),
      percent:
        e.percent === null ? null : text.slice(e.percent.start, e.percent.end),
    }));

  it("braces and parentheses, nested braces, an `@` inside a field, junk between entries", () => {
    const text =
      'junk @ that is not an entry\n@Article{a1, title={A {B} C}, note={x@y.z}}\nmore junk\n@misc(b2, title="B")\n';
    expect(entries(text)).toEqual([
      {
        type: "article",
        key: "a1",
        text: "@Article{a1, title={A {B} C}, note={x@y.z}}",
        percent: null,
      },
      { type: "misc", key: "b2", text: '@misc(b2, title="B")', percent: null },
    ]);
  });

  it("🔴 bibtex has no comment character: an entry behind `%` is read, and the `%` is named", () => {
    expect(
      entries("% @misc{dead2020, title={D}}\n  %% @misc{dead2021,}\n"),
    ).toEqual([
      {
        type: "misc",
        key: "dead2020",
        text: "@misc{dead2020, title={D}}",
        percent: "%",
      },
      {
        type: "misc",
        key: "dead2021",
        text: "@misc{dead2021,}",
        percent: "%%",
      },
    ]);
  });

  // Measured with bibtex 0.99d: `@comment` is skipped as a word and its braces are junk, so an entry
  // written inside it is read; `@string` and `@preamble` are commands, not entries.
  it("@string and @preamble are not entries; an entry inside @comment{…} is one", () => {
    expect(
      entries(
        '@string{v = "Venue"}\n@preamble{"x"}\n@comment{@misc{c1, title={C}}}\n@misc{k,}',
      ).map((e) => e.key),
    ).toEqual(["c1", "k"]);
  });

  it("an entry never closed is no entry: bibtex reports it and reads on", () => {
    expect(
      entries("@misc{a,}\n@misc{open, title={x}\n").map((e) => e.key),
    ).toEqual(["a"]);
  });
});
