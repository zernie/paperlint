/**
 * Which files of the paper directory a build's TeX passes read, and which `.bib` files they wrote —
 * decided from the `.fls` lines of each pass. The inputs are `.fls` files captured whole from real
 * runs of the planted papers (test/fixtures/tex-output/README.md); the few shapes no planted paper
 * has are written out, and say so.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { texOutput } from "../adapters/tex-output/index.ts";
import { filesOfRun } from "./tex-run.ts";

const CAPTURES = join(
  dirname(dirname(dirname(fileURLToPath(import.meta.url)))),
  "test",
  "fixtures",
  "tex-output",
);
/** A planted paper's passes, as `.fls` text → lines, in the order they ran. */
const passes = (paper: string) =>
  ["first-pass.fls", "paper.fls"].map((f) =>
    texOutput.fls(readFileSync(join(CAPTURES, paper, f), "utf8")),
  );
const BIBTEX_RAN = { jobname: "paper", generated: ["paper.bbl"] };

describe("the files a build's TeX read", () => {
  it("a paper of one file: the main file, a body", () => {
    expect(filesOfRun(passes("v3-declared"), BIBTEX_RAN)).toEqual({
      inputs: [{ path: "paper.tex", role: "body" }],
      written: [],
    });
  });

  it("an include read after \\begin{document} is body, a database TeX read before it is preamble — in first-read order", () => {
    expect(filesOfRun(passes("p1"), BIBTEX_RAN)).toEqual({
      inputs: [
        { path: "paper.tex", role: "body" },
        { path: "refs.bib", role: "preamble" },
        { path: "sections/intro.tex", role: "body" },
      ],
      written: [],
    });
  });

  it("a file read before \\begin{document} and never after is preamble", () => {
    expect(filesOfRun(passes("v16-included-block"), BIBTEX_RAN)).toEqual({
      inputs: [
        { path: "paper.tex", role: "body" },
        { path: "bibblock.tex", role: "preamble" },
        { path: "refs.bib", role: "preamble" },
      ],
      written: [],
    });
  });
});

describe("the .bib files TeX wrote", () => {
  it("a .bib TeX wrote (filecontents) is written, and is no input: its bytes are the block's", () => {
    expect(filesOfRun(passes("v8-jobname"), BIBTEX_RAN)).toEqual({
      inputs: [{ path: "paper.tex", role: "body" }],
      written: ["paper.bib"],
    });
  });

  it("🔴 a block writes its file on the first pass only (the later passes find it there and read it): the last pass alone would list it as an input and not as written", () => {
    const [first, last] = passes("plain-block");
    expect(last?.lines.filter((l) => l.path.endsWith(".bib"))).toEqual([
      { op: "INPUT", path: "./refs.bib" },
      { op: "INPUT", path: "refs.bib" },
    ]);
    expect(filesOfRun(passes("plain-block"), BIBTEX_RAN)).toEqual({
      inputs: [{ path: "paper.tex", role: "body" }],
      written: ["refs.bib"],
    });
    expect(first?.lines.filter((l) => l.path.endsWith(".bib"))).toEqual([
      { op: "OUTPUT", path: "refs.bib" },
    ]);
  });
});

describe("what is not the paper's: its TeX tree, a sibling directory, what TeX writes", () => {
  it("the .bbl bibtex wrote is no input of the paper; with no bibtex run it is a file TeX read, and so is one", () => {
    const last = passes("v3-declared");
    expect(
      filesOfRun(last, { jobname: "paper", generated: [] }).inputs,
    ).toEqual([
      { path: "paper.tex", role: "body" },
      { path: "paper.bbl", role: "body" },
    ]);
  });

  it("files the paper's TeX tree supplies are not the paper's: only the paper directory's files are listed", () => {
    const fls = texOutput.fls(
      [
        "PWD /work/paper",
        "INPUT /usr/share/texlive/texmf-dist/tex/latex/base/article.cls",
        "INPUT paper.tex",
        "INPUT /work/paper/inside.tex",
        "INPUT ../shared/outside.tex",
        "INPUT /elsewhere/other.tex",
        "OUTPUT paper.aux",
      ].join("\n"),
    );
    expect(
      filesOfRun([fls], { jobname: "paper", generated: [] }).inputs,
    ).toEqual([
      { path: "paper.tex", role: "body" },
      { path: "inside.tex", role: "preamble" },
    ]);
  });
});

describe("an .fls with no directory, and a name that merely starts with dots", () => {
  it("an .fls that names no directory lists the files named relative to it and no absolute path", () => {
    const fls = texOutput.fls(
      "INPUT /usr/share/texlive/article.cls\nINPUT paper.tex\nINPUT ..x.tex\n",
    );
    expect(
      filesOfRun([fls], { jobname: "paper", generated: [] }).inputs,
    ).toEqual([
      { path: "paper.tex", role: "body" },
      { path: "..x.tex", role: "preamble" },
    ]);
  });
});

describe("roles on the edges: both places, no body, no passes", () => {
  it("a file read in the preamble and again in the body is body: its first read alone would drop it from the prose", () => {
    const fls = texOutput.fls(
      [
        "PWD /work/paper",
        "INPUT paper.tex",
        "INPUT ./macros.tex",
        "OUTPUT paper.aux",
        "INPUT ./macros.tex",
        "INPUT ./intro.tex",
      ].join("\n"),
    );
    expect(
      filesOfRun([fls], { jobname: "paper", generated: [] }).inputs,
    ).toEqual([
      { path: "paper.tex", role: "body" },
      { path: "macros.tex", role: "body" },
      { path: "intro.tex", role: "body" },
    ]);
  });

  it("a run that stopped before opening the .aux has no body: everything but the main file is preamble", () => {
    const fls = texOutput.fls(
      "PWD /work/paper\nINPUT paper.tex\nINPUT ./a.tex\nINPUT ./b.tex\n",
    );
    expect(
      filesOfRun([fls], { jobname: "paper", generated: [] }).inputs,
    ).toEqual([
      { path: "paper.tex", role: "body" },
      { path: "a.tex", role: "preamble" },
      { path: "b.tex", role: "preamble" },
    ]);
  });

  it("a file TeX wrote on any pass is not an input, even one it also reads on a later pass (.toc, .out)", () => {
    const first = texOutput.fls(
      "PWD /w\nINPUT paper.tex\nOUTPUT paper.aux\nOUTPUT paper.toc\n",
    );
    const second = texOutput.fls(
      "PWD /w\nINPUT paper.tex\nINPUT ./paper.toc\nOUTPUT paper.aux\n",
    );
    expect(
      filesOfRun([first, second], { jobname: "paper", generated: [] }).inputs,
    ).toEqual([{ path: "paper.tex", role: "body" }]);
  });

  it("no passes, or passes that opened nothing of the paper, list nothing", () => {
    expect(filesOfRun([], { jobname: "paper", generated: [] })).toEqual({
      inputs: [],
      written: [],
    });
    expect(
      filesOfRun([texOutput.fls("PWD /w\nINPUT /usr/x.cls\n")], {
        jobname: "paper",
        generated: [],
      }),
    ).toEqual({ inputs: [], written: [] });
  });
});
