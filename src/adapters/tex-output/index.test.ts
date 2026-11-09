/**
 * The readers of what TeX writes beside a paper — `.fls` (pdflatex `-recorder`) and the errors in
 * bibtex's `.blg` — on files captured whole from real runs of the planted papers in
 * `fixtures/paper-sources/` (test/fixtures/tex-output/README.md), not on text written for the test.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { texOutput } from "./index.ts";

const CAPTURES = join(
  dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url))))),
  "test",
  "fixtures",
  "tex-output",
);
const capture = (paper: string, file: string): string =>
  readFileSync(join(CAPTURES, paper, file), "utf8");

/** The lines that name a file of the paper: not the TeX tree's (absolute) files. */
const ofPaper = (text: string) =>
  texOutput.fls(text).lines.filter((l) => !l.path.startsWith("/"));

describe("the .fls reader", () => {
  it("reads every INPUT and OUTPUT line in order, and the directory pdflatex ran in", () => {
    const fls = texOutput.fls(capture("v8-jobname", "paper.fls"));
    expect(fls.pwd).toBe("/work/paper");
    expect(fls.lines.filter((l) => !l.path.startsWith("/"))).toEqual([
      { op: "INPUT", path: "paper.tex" },
      { op: "OUTPUT", path: "paper.log" },
      { op: "INPUT", path: "./paper.bib" },
      { op: "INPUT", path: "paper.bib" },
      { op: "OUTPUT", path: "paper.bib" },
      { op: "INPUT", path: "./paper.aux" },
      { op: "INPUT", path: "./paper.aux" },
      { op: "INPUT", path: "paper.aux" },
      { op: "OUTPUT", path: "paper.aux" },
      { op: "INPUT", path: "./paper.bbl" },
      { op: "INPUT", path: "./paper.bbl" },
      { op: "INPUT", path: "paper.bbl" },
      { op: "OUTPUT", path: "paper.pdf" },
      { op: "INPUT", path: "paper.aux" },
    ]);
  });

  it("keeps the TeX tree's files too, as the absolute paths TeX opened", () => {
    const fls = texOutput.fls(capture("v3-declared", "paper.fls"));
    expect(fls.lines.slice(0, 4)).toEqual([
      { op: "INPUT", path: "/usr/share/texlive/texmf.cnf" },
      { op: "INPUT", path: "/usr/share/texlive/texmf-dist/web2c/texmf.cnf" },
      {
        op: "INPUT",
        path: "/usr/share/texlive/texmf-var/web2c/pdftex/pdflatex.fmt",
      },
      { op: "INPUT", path: "paper.tex" },
    ]);
  });
});

describe("the .fls reader, on the shapes of a real run", () => {
  it("a file in a folder keeps its folder; a first pass has no .aux to read yet; a block over a .bib that is already there writes nothing", () => {
    expect(ofPaper(capture("p1", "first-pass.fls"))).toEqual([
      { op: "INPUT", path: "paper.tex" },
      { op: "OUTPUT", path: "paper.log" },
      { op: "INPUT", path: "./refs.bib" },
      { op: "INPUT", path: "refs.bib" },
      { op: "OUTPUT", path: "paper.aux" },
      { op: "INPUT", path: "./sections/intro.tex" },
      { op: "INPUT", path: "./sections/intro.tex" },
      { op: "INPUT", path: "./sections/intro.tex" },
      { op: "INPUT", path: "./sections/intro.tex" },
      { op: "INPUT", path: "sections/intro.tex" },
      { op: "OUTPUT", path: "paper.pdf" },
      { op: "INPUT", path: "paper.aux" },
    ]);
  });

  it("a path with a space is the whole rest of the line; text that is not a line of the format is skipped", () => {
    expect(
      texOutput.fls(
        "PWD /a b/p\nINPUT my file.tex\nOUTPUT out dir/x.aux\nsomething else\nINPUT\n",
      ),
    ).toEqual({
      pwd: "/a b/p",
      lines: [
        { op: "INPUT", path: "my file.tex" },
        { op: "OUTPUT", path: "out dir/x.aux" },
      ],
    });
  });

  it("an .fls with no PWD line has no directory", () => {
    expect(texOutput.fls("INPUT paper.tex\n")).toEqual({
      pwd: null,
      lines: [{ op: "INPUT", path: "paper.tex" }],
    });
  });
});

describe("the .blg error reader", () => {
  it("a run that ends well reports none, warnings included", () => {
    expect(texOutput.blgErrors(capture("v3-declared", "paper.blg"))).toEqual(
      [],
    );
    expect(
      texOutput.blgErrors(
        "Database file #1: x.bib\nWarning--I'm ignoring a's extra \"year\" field\n--line 1 of file x.bib\n",
      ),
    ).toEqual([]);
  });
});

describe("the .blg error reader, on what real runs reported", () => {
  it("an entry never closed: the message before the dashes, the file and the line after", () => {
    expect(texOutput.blgErrors(capture("v6-unclosed", "paper.blg"))).toEqual([
      {
        message: "I was expecting a `,' or a `}'",
        file: "refs.bib",
        line: 4,
      },
    ]);
  });

  it("a second \\bibdata command is an error in the .aux", () => {
    expect(
      texOutput.blgErrors(capture("v9-two-bibliographies", "paper.blg")),
    ).toEqual([
      {
        message: "Illegal, another \\bibdata command",
        file: "paper.aux",
        line: 5,
      },
    ]);
  });

  it("dashes on the first line of the log have no message before them", () => {
    expect(texOutput.blgErrors("---line 1 of file paper.aux\n")).toEqual([
      { message: "", file: "paper.aux", line: 1 },
    ]);
  });

  it("a message on the line before its dashes, and an error with no line", () => {
    expect(
      texOutput.blgErrors(
        [
          "The style file: plain.bst",
          "I couldn't open database file paper.bib",
          "---line 4 of file paper.aux",
          " : \\bibdata{paper",
          " :               }",
          "I'm skipping whatever remains of this command",
          "I found no database files---while reading file paper.aux",
          'Warning--I didn\'t find a database entry for "declared2023"',
          "(There were 2 error messages)",
        ].join("\n"),
      ),
    ).toEqual([
      {
        message: "I couldn't open database file paper.bib",
        file: "paper.aux",
        line: 4,
      },
      {
        message: "I found no database files",
        file: "paper.aux",
        line: null,
      },
    ]);
  });
});

describe("the .aux label reader, on what real runs wrote", () => {
  /** A nested aux of a captured paper, or null for a name it does not have. */
  const nested =
    (paper: string, names: readonly string[]) =>
    (name: string): string | null =>
      names.includes(name) ? capture(paper, name) : null;

  it("🔴 an IEEEtran paper: each label's printed number, its kind, and the labels an \\include wrote into its own aux", () => {
    // Guards: the case this reader exists for — sec:rq2 sits inside the subsection sec:check names.
    const labels = texOutput.labels(
      capture("ref-list-include", "paper.aux"),
      nested("ref-list-include", ["results.aux"]),
    );
    expect(Object.fromEntries(labels)).toEqual({
      "sec:rq2": { number: "II-A", kind: "subsection" },
      "fig:x": { number: "1", kind: "figure" },
      "sec:results": { number: "II", kind: "section" },
      "sec:check": { number: "II-A", kind: "subsection" },
      "sec:rq3": { number: "II-B", kind: "subsection" },
    });
  });

  it("an \\@input whose aux is missing gives nothing; the main aux's own labels stay", () => {
    expect(
      texOutput.labels(capture("ref-list-include", "paper.aux"), () => null)
        .size,
    ).toBe(0);
    expect(
      Object.fromEntries(
        texOutput.labels(capture("ref-kinds", "paper.aux"), () => null),
      ),
    ).toEqual({
      "fig:a": { number: "1", kind: "figure" },
      "tab:a": { number: "1", kind: "table" },
      "sec:method": { number: "1", kind: "section" },
    });
  });

  it("an aux that inputs itself is read once", () => {
    // Guards: a cycle of \\@input lines ends instead of recursing forever.
    const aux = "\\@input{paper.aux}\n\\newlabel{a}{{1}{1}{}{section.1}{}}\n";
    const read = (name: string) => (name === "paper.aux" ? aux : null);
    expect(Object.fromEntries(texOutput.labels(aux, read))).toEqual({
      a: { number: "1", kind: "section" },
    });
  });

  it("the older two-field form, a cleveref kind before the anchor's, a later definition, an escaped brace", () => {
    const aux = [
      "\\newlabel{old}{{3}{2}}",
      "\\newlabel{app}{{A}{4}{}{section.A}{}}",
      "\\newlabel{app@cref}{{[appendix][1][]A}{[1][4][]4}{}{}{}}",
      "\\newlabel{twice}{{1}{1}{}{figure.1}{}}",
      "\\newlabel{twice}{{2}{1}{}{figure.2}{}}",
      "\\newlabel{brace}{{\\{1\\}}{1}{}{}{}}",
    ].join("\n");
    expect(Object.fromEntries(texOutput.labels(aux, () => null))).toEqual({
      old: { number: "3", kind: null },
      app: { number: "A", kind: "appendix" },
      twice: { number: "2", kind: "figure" },
      brace: { number: "\\1\\", kind: null },
    });
  });

  it("lines that define no label are not labels", () => {
    // Guards: a truncated or foreign line is skipped, never read as a label with an invented number.
    const aux = [
      "\\newlabel{nobody}",
      "\\newlabel{empty}{}",
      "\\newlabel{x@cref}{{1}{1}}",
      "\\newlabel{y@cref}{{[]1}{1}}",
      "\\newlabelfoo{z}{{1}}",
      "\\@input",
      "\\relax ",
    ].join("\n");
    expect(texOutput.labels(aux, () => null).size).toBe(0);
  });
});
