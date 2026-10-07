/**
 * `paperSources` — which files make up a paper (Q1) and which bibliography TeX reads (Q2), against
 * TeX's own answer on the planted papers of `fixtures/paper-sources/` (`tex-truth.json`, recorded by
 * `test/e2e/tex/paper-sources.e2e.ts`), and against the states the design names
 * (docs/design/paper-sources.md §3.2, revised in §7.2).
 */
import { readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
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

/** Sorted and distinct, so two answers compare as sets. */
const set = (xs: readonly string[]): readonly string[] =>
  [...new Set(xs)].sort();

/**
 * The module's answer in the shape of `tex-truth.json`: the files TeX opens, the files each
 * database is read from (a block TeX wrote: the file that holds it, in these papers paper.tex), and
 * the cited keys it finds — every key, for a paper that cites `\nocite{*}`.
 */
function answerOf(p: PaperSources, citations: readonly string[]) {
  const reads = databasesOf(p.bibliography).flatMap((d) => {
    const r = texReads(d);
    return r === null ? [] : [r];
  });
  const keys = reads.flatMap((r) => r.entries.map((e) => e.key));
  return {
    inputs: [p.main, ...p.includes]
      .filter((f) => f.rel.endsWith(".tex"))
      .map((f) => f.rel),
    reads: set(reads.map((r) => relative(p.dir, r.path))),
    found: set(
      citations.includes("*")
        ? keys
        : citations.filter((c) => keys.includes(c)),
    ),
  };
}

/** TeX's answer in the same shape. */
const truthOf = (t: z.infer<typeof Truth>) => ({
  inputs: t.inputs,
  reads: set(t.databases.map((d) => (t.written.includes(d) ? "paper.tex" : d))),
  found: set(
    t.citations.includes("*")
      ? t.bibitems
      : t.citations.filter((c) => t.bibitems.includes(c)),
  ),
});

describe("paperSources agrees with TeX on the planted papers", () => {
  const papers = readdirSync(FIXTURES);
  it.each(papers)("%s", (paper) => {
    const recorded = Truth.parse(
      JSON.parse(readFileSync(join(FIXTURES, paper, "tex-truth.json"), "utf8")),
    );
    const truth = truthOf(recorded);
    const p = sourcesIn(paper);
    const got = answerOf(p, recorded.citations);
    if (p.bibliography.kind !== "undecided") {
      expect(got).toEqual(truth);
      return;
    }
    // Undecided: what TeX chose is among the candidates the module names.
    expect(got.inputs).toEqual(truth.inputs);
    expect(got.reads).toEqual(expect.arrayContaining([...truth.reads]));
    expect(got.found).toEqual(expect.arrayContaining([...truth.found]));
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

/** Each database: its state, its name, and the keys TeX reads from it. */
const stateOf = (b: Bibliography) =>
  databasesOf(b).map((d) => {
    const r = texReads(d);
    return [d.kind, d.name, r === null ? null : r.entries.map((e) => e.key)];
  });

describe("the bibliography is decided from committed bytes (§7.2)", () => {
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

describe("names TeX builds from macros, and where bibtex looks (design §9)", () => {
  it("\\jobname is the main file's name: a block writing \\jobname.bib and \\bibliography{\\jobname}", () => {
    const b = bibOf(
      doc(
        "\\begin{filecontents*}[overwrite]{\\jobname.bib}\n@misc{jkey, title={J}}\n\\end{filecontents*}",
        "\\bibliography{\\jobname}",
      ),
    );
    expect([b.kind, stateOf(b)]).toEqual([
      "databases",
      [["embedded", "paper", ["jkey"]]],
    ]);
  });

  it("any other macro in a name is a name this reader cannot compute: undecided, never dropped", () => {
    const b = bibOf(
      doc("\\newcommand{\\bibfile}{refs}", "\\bibliography{\\bibfile,other}"),
      {
        "/p/other.bib": B,
      },
    );
    expect([b.kind, stateOf(b)]).toEqual([
      "undecided",
      [
        ["unresolved", "\\bibfile", null],
        ["file", "other", ["b2020"]],
      ],
    ]);
  });

  it("a parameter (`\\bibliography{#1}` in a definition) declares nothing where it is written", () => {
    expect(
      bibOf(doc("\\newcommand{\\refs}[1]{\\bibliography{#1}}", "x")).kind,
    ).toBe("none");
  });

  it("biblatex's other resources declare databases too: \\addglobalbib, \\addsectionbib", () => {
    const b = bibOf(
      doc(
        "\\addglobalbib{a.bib}\n\\addsectionbib[location=remote]{https://e.org/s.bib}",
        "x",
      ),
      {
        "/p/a.bib": A,
      },
    );
    expect(stateOf(b)).toEqual([
      ["file", "a", ["a2024"]],
      ["remote", "https://e.org/s.bib", null],
    ]);
  });

  it("an absolute path is that file, as bibtex opens it", () => {
    expect(
      stateOf(
        bibOf(doc("", "\\bibliography{/shared/lib}"), { "/shared/lib.bib": A }),
      ),
    ).toEqual([["file", "/shared/lib", ["a2024"]]]);
  });
});

describe("TeX's execution order across files: an include is read where it stands (PR review)", () => {
  const keysOf = (b: Bibliography) =>
    stateOf(b).map(([kind, name, keys]) => [kind, name, keys]);

  it("v17: an include's \\bibliography before the main file's own is the first one, so bibtex reads it", () => {
    expect(keysOf(sourcesIn("v17-include-order").bibliography)).toEqual([
      ["file", "first", ["firstkey"]],
    ]);
  });

  it("v18: an include's block runs before a later block of the main file, so the main file's wins", () => {
    const s = sourcesIn("v18-include-block-order");
    expect(keysOf(s.bibliography)).toEqual([
      ["embedded", "refs", ["mainblock"]],
    ]);
    // Every block, in the order TeX runs them, each in the file that holds it.
    expect(
      s.blocks.map((b) => [basename(b.bib.path), b.bib.entries[0]?.key]),
    ).toEqual([
      ["earlyblock.tex", "includeblock"],
      ["paper.tex", "mainblock"],
    ]);
  });

  it("v19: an include inside a conditional is conditional: its declaration is a candidate", () => {
    const b = sourcesIn("v19-include-in-conditional").bibliography;
    expect([b.kind, databasesOf(b).map((d) => d.name)]).toEqual([
      "undecided",
      ["anon", "real"],
    ]);
  });

  it("an include in a macro's body is read where the macro is used: a candidate", () => {
    const b = bibOf(doc("\\newcommand{\\refs}{\\input{bibsetup}}", "\\refs"), {
      "/p/bibsetup.tex": "\\bibliography{refs}\n",
      "/p/refs.bib": A,
    });
    expect([b.kind, databasesOf(b).map((d) => d.name)]).toEqual([
      "undecided",
      ["refs"],
    ]);
  });

  it("a declaration in an include is placed in that file", () => {
    const b = sourcesIn("v17-include-order").bibliography;
    expect(
      databasesOf(b).map((d) => [basename(d.declared.file), d.declared.span]),
    ).toEqual([
      ["bibsetup.tex", { start: 0, end: "\\bibliography{first}".length }],
    ]);
  });
});

describe("every block that can be the one TeX's file holds is a candidate (PR review)", () => {
  /** Each candidate's state and the keys TeX would read from it. */
  const outcomes = (b: Bibliography) =>
    stateOf(b).map(([kind, , keys]) => [kind, keys]);

  it("v20: blocks in the two branches of one switch — no block, either one", () => {
    const b = sourcesIn("v20-exclusive-blocks").bibliography;
    expect([b.kind, outcomes(b)]).toEqual([
      "undecided",
      [
        ["missing", null],
        ["embedded", ["anonblock"]],
        ["embedded", ["realblock"]],
      ],
    ]);
  });

  it("v21: blocks behind two independent switches — no block, the first alone, the second", () => {
    const b = sourcesIn("v21-independent-switches").bibliography;
    expect([b.kind, outcomes(b)]).toEqual([
      "undecided",
      [
        ["missing", null],
        ["embedded", ["shortblock"]],
        ["embedded", ["longblock"]],
      ],
    ]);
  });

  it("a sure [overwrite] block after the switched ones always wins: decided", () => {
    const b = bibOf(
      doc(
        `\\newif\\ifanon\n\\ifanon\n${BLOCK("[overwrite]", A)}\n\\fi\n${BLOCK("[overwrite]", B)}`,
        "\\bibliography{refs}",
      ),
    );
    expect([b.kind, outcomes(b)]).toEqual([
      "databases",
      [["embedded", ["b2020"]]],
    ]);
  });

  it("a switched block without [overwrite] after a sure one never writes: decided", () => {
    const b = bibOf(
      doc(
        `${BLOCK("", A)}\n\\newif\\ifanon\n\\ifanon\n${BLOCK("", B)}\n\\fi`,
        "\\bibliography{refs}",
      ),
    );
    expect([b.kind, outcomes(b)]).toEqual([
      "databases",
      [["embedded", ["a2024"]]],
    ]);
  });

  it("a committed file beside switched blocks: the file when none runs, a conflict for each that can win", () => {
    const b = bibOf(
      doc(
        `\\newif\\ifa\n\\newif\\ifb\n\\ifa\n${BLOCK("[overwrite]", A)}\n\\fi\n\\ifb\n${BLOCK("", "@misc{c2021, title={C}}")}\n\\fi`,
        "\\bibliography{refs}",
      ),
      { "/p/refs.bib": B },
    );
    // The second block has no [overwrite]: a file exists, so it never writes.
    expect([b.kind, outcomes(b)]).toEqual([
      "undecided",
      [
        ["file", ["b2020"]],
        ["conflict", ["a2024"]],
      ],
    ]);
  });
});
