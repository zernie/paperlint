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
