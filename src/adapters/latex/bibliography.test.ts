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

/** The entries of `text` as a `.bib`: type, key, text, and the `%` before each. */
const entries = (text: string) =>
  latexReader.bibText(absolutePath("/p/refs.bib"), text).entries.map((e) => ({
    type: e.type,
    key: e.key,
    text: text.slice(e.span.start, e.span.end),
    percent:
      e.percent === null ? null : text.slice(e.percent.start, e.percent.end),
  }));

describe("bibText — a BibTeX text's entries, as bibtex finds them", () => {
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
        percent: "% ",
      },
      {
        type: "misc",
        key: "dead2021",
        text: "@misc{dead2021,}",
        percent: "%% ",
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
  it("text before the `@` after a `%` is part of what the `%` hides from LaTeX; bibtex reads the entry", () => {
    const [e] = entries("% see @misc{pt1, title={x}}\n");
    expect([e?.key, e?.percent]).toEqual(["pt1", "% see "]);
  });

  it("a `%` after the `@` on the entry's line, or in the entry before it, hides nothing", () => {
    expect(
      entries(
        "@misc{a, title={50%}} @misc{b, title={x}}\n@misc{c, note={100%}}\n",
      ).map((e) => [e.key, e.percent]),
    ).toEqual([
      ["a", null],
      ["b", null],
      ["c", null],
    ]);
  });
});

describe("bibText — quoted fields, as bibtex 0.99d reads them (PR review)", () => {
  const keys = (t: string) => entries(t).map((e) => e.key);

  it("an `@` inside a quoted field is text, and so is a `)` in a parenthesised entry", () => {
    expect(
      keys(
        '@misc{q1, note = "mail a@b.org", title={T1}}\n@misc{q2, title={T2}}\n',
      ),
    ).toEqual(["q1", "q2"]);
    expect(
      keys(
        '@misc(p1, note = "a ) @misc{g, title={G}} b", title={T5})\n@misc{p2, title={T6}}\n',
      ),
    ).toEqual(["p1", "p2"]);
  });

  it('a `"` inside braces is a character, in a quoted field or a braced one', () => {
    expect(
      keys('@misc{q3, note = "x {"} @y", title={T3}}\n@misc{q4, title={T4}}\n'),
    ).toEqual(["q3", "q4"]);
    expect(
      keys(
        '@misc{p9, note = {a "b} @misc{p10, title={T14}}\n@misc{p11, title={T15}}\n',
      ),
    ).toEqual(["p9", "p10", "p11"]);
  });

  it("a quote left open runs to the end of the file: no `@` after it starts an entry", () => {
    expect(
      keys(
        '@misc{q6, note = "open @misc{q7, title={T7}}\n@misc{q8, title={T8}}\n',
      ),
    ).toEqual(["q6"]);
  });

  it("a `}` at depth 0 ends the entry even inside quotes, in either kind of entry", () => {
    const spans = (t: string) => entries(t).map((e) => [e.key, e.text]);
    expect(
      spans(
        '@misc{q13, note = "a } b", title={T13}}\n@misc{q14, title={T14}}\n',
      ),
    ).toEqual([
      ["q13", '@misc{q13, note = "a }'],
      ["q14", "@misc{q14, title={T14}}"],
    ]);
    expect(
      spans('@misc(p3, note = "a } b", title={T8})\n@misc{p4, title={T9}}\n'),
    ).toEqual([
      ["p3", '@misc(p3, note = "a }'],
      ["p4", "@misc{p4, title={T9}}"],
    ]);
  });

  it("an `@` after a closed quote, at depth 0, starts the next entry as before", () => {
    expect(
      keys(
        '@misc{q10, note = "n" @misc{q11, title={T11}}\n@misc{q12, title={T12}}\n',
      ),
    ).toEqual(["q10", "q11", "q12"]);
  });
});

describe("bibText — how bibtex recovers from a malformed entry", () => {
  // Each case below was run through bibtex 0.99d with \nocite{*} (fixtures/paper-sources/v6, v7, and
  // the probes listed in docs/design/paper-sources.md §9); the keys are the ones its .bbl printed.
  it("🔴 an entry never closed is read, and so is every entry after it", () => {
    const keys = (t: string) => entries(t).map((e) => e.key);
    expect(keys("@misc{a,}\n@misc{open, title={x}\n")).toEqual(["a", "open"]);
    expect(
      keys(
        "@misc{a1, url={u}}\n@misc{a2, url={u}\n\n@misc{a3, title={T}}\n% @misc{a4, title={F}}\n",
      ),
    ).toEqual(["a1", "a2", "a3", "a4"]);
  });

  it("an `@` at brace depth 0 inside an open entry starts the next one; inside a field it is text", () => {
    const keys = (t: string) => entries(t).map((e) => e.key);
    expect(
      keys("@misc{x, title={T} @misc{y, title={U}}\n@misc{z, title={V}}\n"),
    ).toEqual(["x", "y", "z"]);
    // A field left open (`{Two {Unbalanced}`): the entry's own close only balances it.
    expect(
      keys(
        "@misc{a2, title={Two {Unbalanced}, url={u}}\n\n@misc{a3, title={T}}\n",
      ),
    ).toEqual(["a2", "a3"]);
    expect(
      keys(
        "@misc{d1, abstract={one\n@line two}, title={D}}\n@misc{d2, title={E}}\n",
      ),
    ).toEqual(["d1", "d2"]);
    expect(
      keys(
        "@misc{g1, title={x @misc{g2, title={U}} y}}\n@misc{g3, title={V}}\n",
      ),
    ).toEqual(["g1", "g3"]);
  });

  it("an `@` right after a comma, where bibtex expects a field name, is swallowed with what it starts", () => {
    expect(
      entries(
        "@misc{m1, title={A},\n@misc{m2, title={B}}\n@misc{m3, title={C}}\n",
      ).map((e) => e.key),
    ).toEqual(["m1", "m3"]);
  });

  it("the word bibtex skips in `@comment` is named, so a parser can be told to skip it too", () => {
    const text = "@comment{ @misc{k2, title={x}} }\n@misc{k3, title={y}}\n";
    const bib = latexReader.bibText(absolutePath("/p/refs.bib"), text);
    expect(bib.comments.map((s) => text.slice(s.start, s.end))).toEqual([
      "@comment",
    ]);
  });
});
