/**
 * `paperSources` — which files make up a paper (Q1) and which bibliography TeX reads (Q2), against
 * TeX's own answer on the planted papers of `fixtures/paper-sources/` (`tex-truth.json`, recorded by
 * `test/e2e/tex/paper-sources.e2e.ts`), and against the states the design names
 * (docs/design/paper-sources.md §3.2, revised in §7.2).
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { latexReader } from "./adapters/latex/index.ts";
import { memoryFiles } from "./adapters/memory/index.ts";
import { nodeFiles } from "./adapters/node/index.ts";
import { absolutePath, type AbsolutePath } from "./domain/paths.ts";
import {
  bibTexts,
  texReads,
  type Bibliography,
  type Database,
  type PaperSources,
} from "./domain/paper-sources.ts";
import { texInputsDir } from "./package-dirs.ts";
import { paperSources, sourcesOf } from "./paper-sources.ts";
import { present } from "../test/support.ts";

const FIXTURES = join(
  dirname(dirname(fileURLToPath(import.meta.url))),
  "fixtures",
  "paper-sources",
);

const Truth = z.object({
  inputs: z.array(z.string()),
  written: z.array(z.string()),
  databases: z.array(z.string()),
  citations: z.array(z.string()),
  bibitems: z.array(z.string()),
});

/** Every file of the fixtures counts as committed: they are, in this repository. */
const ALL_COMMITTED = { isCommitted: () => true };
const onDisk = {
  files: nodeFiles,
  latex: latexReader,
  committed: ALL_COMMITTED,
};

const sourcesIn = (paper: string): PaperSources => {
  const r = paperSources(join(FIXTURES, paper), onDisk);
  if (!r.ok) throw new Error(`no paper.tex in ${paper}`);
  return r.value;
};

/** The databases of a bibliography TeX reads one of: every one, whatever its state. */
const databasesOf = (b: Bibliography): readonly Database[] => {
  switch (b.kind) {
    case "none":
    case "thebibliography":
      return [];
    case "databases":
    case "undecided":
      return b.databases;
  }
};

/** The module's answer in the shape of `tex-truth.json`. */
function answerOf(p: PaperSources, citations: readonly string[]) {
  const reads = databasesOf(p.bibliography).map((d) => texReads(d));
  const keys = new Set(
    reads.flatMap((r) => (r === null ? [] : r.entries.map((e) => e.key))),
  );
  return {
    inputs: [p.main, ...p.includes]
      .filter((f) => f.rel.endsWith(".tex"))
      .map((f) => f.rel),
    // A block TeX wrote is read from the file that holds it: in these papers, paper.tex.
    reads: reads.map((r) => (r === null ? null : relative(p.dir, r.path))),
    found: citations.filter((c) => keys.has(c)),
  };
}

describe("paperSources agrees with TeX on the planted papers", () => {
  const papers = readdirSync(FIXTURES);
  it.each(papers)("%s", (paper) => {
    const truth = Truth.parse(
      JSON.parse(readFileSync(join(FIXTURES, paper, "tex-truth.json"), "utf8")),
    );
    expect(answerOf(sourcesIn(paper), truth.citations)).toEqual({
      inputs: truth.inputs,
      reads: truth.databases.map((d) =>
        truth.written.includes(d) ? "paper.tex" : d,
      ),
      found: truth.citations.filter((c) => truth.bibitems.includes(c)),
    });
  });
});

describe("the bibliography's states, on the planted papers", () => {
  const kinds = (paper: string): readonly string[] =>
    databasesOf(sourcesIn(paper).bibliography).map((d) => d.kind);

  it("v1: a block without [overwrite] beside a committed refs.bib that differs is a conflict, and TeX reads the file", () => {
    expect(kinds("v1-stale")).toEqual(["conflict"]);
  });
  it("v2: the same with [overwrite] is a conflict too, and TeX reads the block", () => {
    expect(kinds("v2-overwrite")).toEqual(["conflict"]);
  });
  it("v3: no block, `\\bibliography{paper}` → the file paper.bib", () => {
    expect(kinds("v3-declared")).toEqual(["file"]);
  });
  it("v4: a commented-out block is no block → the file refs.bib", () => {
    expect(kinds("v4-commented")).toEqual(["file"]);
  });
  it("v5: an entry behind `%` is an entry, as bibtex reads it, and says where the `%` is", () => {
    const [read] = bibTexts(sourcesIn("v5-percent-entry").bibliography);
    expect(
      present(read, "the block").entries.map((e) => [
        e.key,
        e.percent !== null,
      ]),
    ).toEqual([
      ["inline2024", false],
      ["dead2020", true],
    ]);
  });
});

describe("paperSources — which files make up the paper (Q1)", () => {
  it("P: the main file, then what TeX opens — not a commented, an \\iffalse'd or an unincluded file", () => {
    const p = sourcesIn("p1");
    expect({
      main: p.main.rel,
      includes: p.includes.map((f) => [f.rel, f.role]),
    }).toEqual({
      main: "paper.tex",
      includes: [["sections/intro.tex", "body"]],
    });
  });

  it("a preamble include is `preamble`, a file found only on paperlint's inputs is `package-input`", () => {
    const tex =
      "\\documentclass{article}\n\\input{macros}\n\\input{guards}\n\\begin{document}\n\\input{s/a}\n\\end{document}\n";
    const files = memoryFiles({
      "/p/paper.tex": tex,
      "/p/macros.tex": "\\newcommand{\\x}{y}",
      "/p/s/a.tex": "A",
      [join(texInputsDir(), "guards.tex")]: "G",
    });
    const r = paperSources("/p", { ...onDisk, files });
    if (!r.ok) throw new Error("no paper.tex");
    const p = r.value;
    expect(p.includes.map((f) => [f.rel, f.role])).toEqual([
      ["macros.tex", "preamble"],
      ["guards.tex", "package-input"],
      ["s/a.tex", "body"],
    ]);
  });

  it("a directory without paper.tex is `no-main`, not an empty paper", () => {
    expect(paperSources("/p", { ...onDisk, files: memoryFiles() })).toEqual({
      ok: false,
      error: { kind: "no-main", dir: "/p" },
    });
  });
});

/** The bibliography of a paper.tex held in memory, beside `files`, with `committed` paths. */
function bibOf(
  tex: string,
  files: Readonly<Record<string, string>> = {},
  committed: readonly string[] = Object.keys(files),
): Bibliography {
  const main = absolutePath("/p/paper.tex");
  return sourcesOf(main, tex, {
    files: memoryFiles({ [main]: tex, ...files }),
    latex: latexReader,
    committed: { isCommitted: (p: AbsolutePath) => committed.includes(p) },
  }).bibliography;
}

const doc = (preamble: string, body: string): string =>
  `\\documentclass{article}\n${preamble}\n\\begin{document}\n${body}\n\\end{document}\n`;
const BLOCK = (opt: string, entry: string): string =>
  `\\begin{filecontents*}${opt}{refs.bib}\n${entry}\n\\end{filecontents*}`;
const A = "@misc{a2024, title={A}}";
const B = "@misc{b2020, title={B}}";

describe("the bibliography is decided from committed bytes (§7.2)", () => {
  const stateOf = (b: Bibliography) =>
    databasesOf(b).map((d) => {
      const r = texReads(d);
      return [d.kind, d.name, r === null ? null : r.entries.map((e) => e.key)];
    });

  it("a block and NO file on disk: embedded", () => {
    expect(stateOf(bibOf(doc(BLOCK("", A), "\\bibliography{refs}")))).toEqual([
      ["embedded", "refs", ["a2024"]],
    ]);
  });

  it("an UNCOMMITTED refs.bib beside the block is this machine's state, not the paper's: still embedded", () => {
    const b = bibOf(
      doc(BLOCK("", A), "\\bibliography{refs}"),
      { "/p/refs.bib": B },
      [],
    );
    expect(stateOf(b)).toEqual([["embedded", "refs", ["a2024"]]]);
  });

  it("a committed refs.bib whose entries equal the block's (TeX's own output, trailing spaces dropped): embedded", () => {
    const b = bibOf(doc(BLOCK("", `${A}   `), "\\bibliography{refs}"), {
      "/p/refs.bib": `${A}\n`,
    });
    expect(stateOf(b)).toEqual([["embedded", "refs", ["a2024"]]]);
  });

  it("a committed refs.bib that differs: conflict — TeX reads the file without [overwrite], the block with it", () => {
    const files = { "/p/refs.bib": B };
    expect(
      stateOf(bibOf(doc(BLOCK("", A), "\\bibliography{refs}"), files)),
    ).toEqual([["conflict", "refs", ["b2020"]]]);
    for (const opt of ["[overwrite]", "[force]", "[nosearch,overwrite]"])
      expect(
        stateOf(bibOf(doc(BLOCK(opt, A), "\\bibliography{refs}"), files)),
      ).toEqual([["conflict", "refs", ["a2024"]]]);
  });
});

describe("the bibliography's other states", () => {
  const stateOf = (b: Bibliography) =>
    databasesOf(b).map((d) => {
      const r = texReads(d);
      return [d.kind, d.name, r === null ? null : r.entries.map((e) => e.key)];
    });

  it("several names, a file, a missing one, and biblatex's resources — local, with `.bib`, and remote", () => {
    const b = bibOf(
      doc(
        "\\addbibresource{bibs/x.bib}\n\\addbibresource[location=remote]{https://example.org/r.bib}",
        "\\bibliography{a, nope}",
      ),
      { "/p/a.bib": A, "/p/bibs/x.bib": B },
    );
    expect(stateOf(b)).toEqual([
      ["file", "bibs/x", ["b2020"]],
      ["remote", "https://example.org/r.bib", null],
      ["file", "a", ["a2024"]],
      ["missing", "nope", null],
    ]);
  });

  it("no declaration: none, even with a block (a stray file write); thebibliography: its own state", () => {
    expect(bibOf(doc(BLOCK("", A), "x")).kind).toBe("none");
    expect(
      bibOf(
        doc(
          "",
          "\\begin{thebibliography}{9}\\bibitem{k} K.\\end{thebibliography}",
        ),
      ).kind,
    ).toBe("thebibliography");
  });
});

describe("a declaration the module cannot decide is `undecided`, never silence (finding 4)", () => {
  it("behind a \\newif switch: both branches are candidates", () => {
    const b = bibOf(
      doc(
        "\\newif\\ifanon",
        "\\ifanon\\bibliography{anon}\\else\\bibliography{refs}\\fi",
      ),
      { "/p/anon.bib": A, "/p/refs.bib": B },
    );
    expect([b.kind, databasesOf(b).map((d) => d.name)]).toEqual([
      "undecided",
      ["anon", "refs"],
    ]);
  });

  it("after the switch's \\fi, a declaration is read unconditionally again", () => {
    const b = bibOf(
      doc(
        "\\newif\\ifanon\n\\ifanon\\author{A}\\else\\author{B}\\fi",
        "\\bibliography{refs}",
      ),
      { "/p/refs.bib": B },
    );
    expect([b.kind, databasesOf(b).map((d) => d.name)]).toEqual([
      "databases",
      ["refs"],
    ]);
  });

  it("inside a macro definition: read wherever the macro is used, so a candidate", () => {
    const b = bibOf(
      doc("\\newcommand{\\refs}{\\bibliography{refs}}", "\\refs"),
      {
        "/p/refs.bib": B,
      },
    );
    expect([b.kind, databasesOf(b).map((d) => d.name)]).toEqual([
      "undecided",
      ["refs"],
    ]);
  });

  it("but a redefinition OF \\bibliography (the accepted ACM paper's) declares nothing; its use does", () => {
    const b = bibOf(
      doc(
        "\\makeatletter\n\\let\\paper@bibliography\\bibliography\n\\renewcommand{\\bibliography}[1]{\\label{x}\\paper@bibliography{#1}}\n\\makeatother",
        "\\bibliography{refs}",
      ),
      { "/p/refs.bib": B },
    );
    expect([b.kind, databasesOf(b).map((d) => d.name)]).toEqual([
      "databases",
      ["refs"],
    ]);
  });
});
