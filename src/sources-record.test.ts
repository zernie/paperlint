/**
 * The build's record step (`recordSources`): from the passes' `.fls` and the `.aux`, `.blg` and `.bbl`
 * a run left, the `_build/sources.json` of docs/design/paper-sources.md §1 — on the files of real runs
 * of the planted papers (test/fixtures/tex-output/README.md), over files held in memory. What TeX
 * itself answers for the same papers is `test/e2e/tex/paper-sources.e2e.ts`.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  memoryFiles,
  memoryListDir,
  type MemoryFiles,
} from "./adapters/memory/index.ts";
import { texOutput } from "./adapters/tex-output/index.ts";
import { sourcesCodec } from "./adapters/sources-record/index.ts";
import {
  recordSources,
  sourcesRecorder,
  type TexRun,
} from "./sources-record.ts";

const CAPTURES = join(
  dirname(dirname(fileURLToPath(import.meta.url))),
  "test",
  "fixtures",
  "tex-output",
);
const capture = (paper: string, file: string): string =>
  readFileSync(join(CAPTURES, paper, file), "utf8");

const DIR = "/work/paper";
/** The record step's ports over files held in memory. */
const deps = (files: MemoryFiles) => ({
  files,
  texOutput,
  listDir: memoryListDir(files),
});
const sha = (text: string): string =>
  createHash("sha256").update(text).digest("hex");

/** The run of a planted paper: both captured passes, and what bibtex and TeX left. */
const run = (paper: string, bibtexExit: number | null): TexRun => ({
  fls: ["first-pass.fls", "paper.fls"].map((f) => capture(paper, f)),
  bibtexExit,
});
/** The paper directory after that run: the sources given, TeX's and bibtex's files captured. */
const after = (
  paper: string,
  sources: Readonly<Record<string, string>>,
  captured: readonly string[] = ["paper.aux", "paper.blg", "paper.bbl"],
) =>
  memoryFiles({
    ...Object.fromEntries(
      Object.entries(sources).map(([rel, text]) => [`${DIR}/${rel}`, text]),
    ),
    ...Object.fromEntries(
      captured.map((f) => [`${DIR}/${f}`, capture(paper, f)]),
    ),
  });

const SOURCES = { "paper.tex": "% paper\n", "refs.bib": "@misc{a}\n" };

describe("the record of a build", () => {
  it("lists what TeX read, what bibtex did and the hash of every file the paper is made of", () => {
    const files = after("p1", {
      ...SOURCES,
      "sections/intro.tex": "Intro.\n",
    });
    const out = recordSources(deps(files), DIR, run("p1", 0));
    expect(out).toEqual({
      kind: "recorded",
      path: `${DIR}/_build/sources.json`,
      record: {
        schema: 1,
        inputs: [
          { path: "paper.tex", role: "body" },
          { path: "refs.bib", role: "preamble" },
          { path: "sections/intro.tex", role: "body" },
        ],
        written: [],
        bibdata: ["refs"],
        bibtex: {
          ran: true,
          databases: ["refs.bib"],
          keys: ["stale2020"],
          exit: 0,
          errors: [],
        },
        sha256: {
          "paper.tex": sha("% paper\n"),
          "refs.bib": sha("@misc{a}\n"),
          "sections/intro.tex": sha("Intro.\n"),
        },
      },
    });
  });

  it("writes it to _build/sources.json, and what it wrote parses back to the same record", () => {
    const files = after("p1", { ...SOURCES, "sections/intro.tex": "x" });
    const out = recordSources(deps(files), DIR, run("p1", 0));
    const text = new TextDecoder().decode(
      files.map.get(`${DIR}/_build/sources.json`),
    );
    expect(text.endsWith("}\n")).toBe(true);
    expect(sourcesCodec.parse(text)).toEqual({
      ok: true,
      record: out.kind === "recorded" ? out.record : undefined,
    });
  });
});

describe("what the record leaves out, or marks absent", () => {
  it("a .bib TeX wrote is listed as written and hashed, so an edit to it after the build makes the record stale", () => {
    const files = after("v8-jobname", {
      "paper.tex": "% block\n",
      "paper.bib": "TeX's own copy\n",
    });
    const out = recordSources(deps(files), DIR, run("v8-jobname", 0));
    expect(out.kind === "recorded" ? out.record : out).toEqual({
      schema: 1,
      inputs: [{ path: "paper.tex", role: "body" }],
      written: ["paper.bib"],
      bibdata: ["paper"],
      bibtex: {
        ran: true,
        databases: ["paper.bib"],
        keys: ["jkey"],
        exit: 0,
        errors: [],
      },
      sha256: {
        "paper.tex": sha("% block\n"),
        "paper.bib": sha("TeX's own copy\n"),
      },
    });
  });

  it("a database bibtex names as ./paper.bib is recorded as paper.bib, the name the .fls gave the file TeX wrote", () => {
    const blg = capture("v8-jobname", "paper.blg").replace(
      "Database file #1: paper.bib",
      "Database file #1: ./paper.bib",
    );
    const files = after(
      "v8-jobname",
      {
        "paper.tex": "% block\n",
        "paper.bib": "TeX's own copy\n",
        "paper.blg": blg,
      },
      ["paper.aux", "paper.bbl"],
    );
    const out = recordSources(deps(files), DIR, run("v8-jobname", 0));
    expect(out.kind === "recorded" ? out.record : out).toMatchObject({
      written: ["paper.bib"],
      bibtex: { ran: true, databases: ["paper.bib"] },
      sha256: { "paper.bib": sha("TeX's own copy\n") },
    });
  });
});

describe("how the record spells a file", () => {
  it("a file TeX logged in the source's spelling is recorded in the disk's, so a file system that ignores case gives the record one that does not", () => {
    const files = memoryFiles({
      [`${DIR}/paper.tex`]: "% p\n",
      [`${DIR}/figures/nexmark.pdf`]: "pdf",
    });
    const out = recordSources(deps(files), DIR, {
      fls: [
        "PWD /work/paper\nINPUT paper.tex\nINPUT Figures/NEXMark.pdf\nINPUT figures/nexmark.pdf\n",
      ],
      bibtexExit: null,
    });
    expect(out.kind === "recorded" ? out.record : out).toMatchObject({
      inputs: [{ path: "paper.tex" }, { path: "figures/nexmark.pdf" }],
      sha256: { "paper.tex": sha("% p\n"), "figures/nexmark.pdf": sha("pdf") },
    });
  });
});

describe("the recorder the build is handed", () => {
  it("sourcesRecorder is recordSources with its ports bound", () => {
    const files = after("p1", { "paper.tex": "% p\n" });
    const bound = sourcesRecorder(deps(files))(DIR, run("p1", 0));
    expect(bound).toEqual(recordSources(deps(files), DIR, run("p1", 0)));
  });
});

describe("what the record hashes", () => {
  it("a database bibtex opened that no TeX input names is hashed all the same", () => {
    const files = after("v17-include-order", {
      "paper.tex": "% p\n",
      "bibsetup.tex": "% s\n",
      "first.bib": "@misc{firstkey}\n",
      "later.bib": "@misc{laterkey}\n",
    });
    const out = recordSources(deps(files), DIR, run("v17-include-order", 2));
    expect(out.kind === "recorded" ? out.record : out).toMatchObject({
      bibdata: ["first", "later"],
      bibtex: { ran: true, databases: ["first.bib"], exit: 2 },
      sha256: {
        "paper.tex": sha("% p\n"),
        "bibsetup.tex": sha("% s\n"),
        "first.bib": sha("@misc{firstkey}\n"),
      },
    });
  });
});

describe("what bibtex reported", () => {
  it("bibtex's errors are recorded as it reported them, with its exit", () => {
    const files = after("v6-unclosed", {
      "paper.tex": "% p\n",
      "refs.bib": "@misc{a",
    });
    const out = recordSources(deps(files), DIR, run("v6-unclosed", 2));
    expect(out.kind === "recorded" ? out.record.bibtex : out).toEqual({
      ran: true,
      databases: ["refs.bib"],
      keys: ["a1", "a4", "a3", "a2unclosed"],
      exit: 2,
      errors: [
        {
          message: "I was expecting a `,' or a `}'",
          file: "refs.bib",
          line: 4,
        },
      ],
    });
  });
});

describe("a build with no bibtex, a missing file, no .fls", () => {
  it("a build that ran no bibtex records none, reads no .blg or .bbl a build before it left, and counts a .bbl TeX read as an input", () => {
    const files = after(
      "v3-declared",
      { "paper.tex": "% p\n", "paper.bbl": "b" },
      ["paper.aux"],
    );
    const out = recordSources(deps(files), DIR, run("v3-declared", null));
    expect(out.kind === "recorded" ? out.record : out).toEqual({
      schema: 1,
      inputs: [
        { path: "paper.tex", role: "body" },
        { path: "paper.bbl", role: "body" },
      ],
      written: [],
      bibdata: ["paper"],
      bibtex: { ran: false },
      sha256: { "paper.tex": sha("% p\n"), "paper.bbl": sha("b") },
    });
  });
});

describe("a file gone, no .aux, no .fls", () => {
  it("a file the record lists that is gone when it is made is recorded as absent, so its return is a change", () => {
    const files = after("p1", {
      "paper.tex": "% p\n",
      "sections/intro.tex": "x",
    });
    const out = recordSources(deps(files), DIR, run("p1", 0));
    expect(out.kind === "recorded" ? out.record.sha256 : out).toEqual({
      "paper.tex": sha("% p\n"),
      "refs.bib": null,
      "sections/intro.tex": sha("x"),
    });
  });

  it("a paper with no \\bibdata has none, and a missing .aux reads as none", () => {
    const files = after("v3-declared", { "paper.tex": "% p\n" }, []);
    const out = recordSources(deps(files), DIR, run("v3-declared", null));
    expect(out.kind === "recorded" ? out.record.bibdata : out).toEqual([]);
  });

  it("bibtex that ran and left no .blg or .bbl (it could not start) records what it was given: nothing opened, nothing typeset", () => {
    const files = after("v3-declared", { "paper.tex": "% p\n" }, ["paper.aux"]);
    const out = recordSources(deps(files), DIR, run("v3-declared", 127));
    expect(out.kind === "recorded" ? out.record.bibtex : out).toEqual({
      ran: true,
      databases: [],
      keys: [],
      exit: 127,
      errors: [],
    });
  });

  it("no .fls, or one that names no file of the paper, records nothing and says why", () => {
    const files = memoryFiles({ [`${DIR}/paper.tex`]: "x" });
    expect(
      recordSources(deps(files), DIR, { fls: [], bibtexExit: null }),
    ).toEqual({
      kind: "not-recorded",
      why: "pdflatex wrote no paper.fls — nothing to record",
    });
    expect(
      recordSources(deps(files), DIR, {
        fls: ["PWD /work/paper\nINPUT /usr/x.cls\n"],
        bibtexExit: null,
      }),
    ).toEqual({
      kind: "not-recorded",
      why: "paper.fls lists no file of the paper directory — nothing to record",
    });
    expect(files.map.has(`${DIR}/_build/sources.json`)).toBe(false);
  });
});
