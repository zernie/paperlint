/**
 * `paperSources` — which files make up a paper (Q1) and which bibliography TeX reads (Q2), against
 * TeX's own answer on the planted papers of `fixtures/paper-sources/` (`tex-truth.json`, recorded by
 * `test/e2e/tex/paper-sources.e2e.ts`), and against the states the design names
 * (docs/design/paper-sources.md).
 */
import { readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { bibReader } from "./adapters/bibtex/index.ts";
import { latexReader } from "./adapters/latex/index.ts";
import { memoryFiles } from "./adapters/memory/index.ts";
import { nodeFiles } from "./adapters/node/index.ts";
import { absolutePath, type AbsolutePath } from "./domain/paths.ts";
import {
  texReads,
  type Bibliography,
  type Database,
  type PaperSources,
} from "./domain/paper-sources.ts";
import { texInputsDir } from "./package-dirs.ts";
import { paperSources, sourcesOf } from "./paper-sources.ts";
import { unseenBy } from "./references.ts";

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
  bibtex: z.object({ exit: z.number(), errors: z.array(z.string()) }),
});

/** Every file of the fixtures counts as committed: they are, in this repository. */
const ALL_COMMITTED = { isCommitted: () => true };
const onDisk = {
  files: nodeFiles,
  latex: latexReader,
  committed: ALL_COMMITTED,
  bib: bibReader,
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

/**
 * What bibtex read that the reader does not see, per planted paper — named by the post-build check
 * (`unseenBy`), never silently dropped. Two kinds, both measured:
 *
 *   - the database is malformed: bibtex reports it, exits 2, and `paperlint build` fails with its
 *     lines (`bibtex.errors` in tex-truth.json); the reader skips the entry it cannot finish;
 *   - the database is well-formed, and the entry is one bibtex reads where the reader sees a comment:
 *     behind `%` or inside `@comment{…}` (bibtex has no comment syntax).
 */
const UNSEEN: Readonly<Record<string, readonly string[]>> = {
  "v5-percent-entry": ["dead2020"],
  "v6-unclosed": ["a4", "a2unclosed"],
  "v7-unbalanced-field": ["a2brace", "a4"],
  "v13-percent-text": ["pt1", "k2inComment"],
};

describe("paperSources agrees with TeX on the planted papers", () => {
  const papers = readdirSync(FIXTURES);
  it.each(papers)("%s", (paper) => {
    const recorded = Truth.parse(
      JSON.parse(readFileSync(join(FIXTURES, paper, "tex-truth.json"), "utf8")),
    );
    const truth = truthOf(recorded);
    const p = sourcesIn(paper);
    const got = answerOf(p, recorded.citations);
    const unseen = unseenBy(p, recorded);
    expect(got.inputs).toEqual(truth.inputs);
    // Every database bibtex opened is one the paper's bibliography names: for `undecided`, a candidate.
    expect(unseen.databases).toEqual([]);
    expect(got.reads).toEqual(
      p.bibliography.kind === "undecided"
        ? expect.arrayContaining([...truth.reads])
        : truth.reads,
    );
    // What bibtex read is what the reader read, plus what the post-build check names.
    expect(unseen.keys).toEqual(UNSEEN[paper] ?? []);
    expect(
      set([
        ...got.found,
        ...unseen.keys.filter((k) => truth.found.includes(k)),
      ]),
    ).toEqual(
      p.bibliography.kind === "undecided"
        ? expect.arrayContaining([...truth.found])
        : truth.found,
    );
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
    bib: bibReader,
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

describe("the bibliography is decided from committed bytes", () => {
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

describe("a declaration the module cannot decide is `undecided`, never silence", () => {
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

describe("names TeX builds from macros, and where bibtex looks", () => {
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

describe("TeX's execution order across files: an include is read where it stands", () => {
  const keysOf = (b: Bibliography) =>
    stateOf(b).map(([kind, name, keys]) => [kind, name, keys]);

  it("v17: an include's \\bibliography stands before the main file's own — bibtex takes one: both, in TeX's order", () => {
    const b = sourcesIn("v17-include-order").bibliography;
    expect([b.kind, databasesOf(b).map((d) => d.name)]).toEqual([
      "undecided",
      ["first", "later"],
    ]);
  });

  it("v18: an include's block runs before a later block of the main file, so the main file's wins", () => {
    const s = sourcesIn("v18-include-block-order");
    expect(keysOf(s.bibliography)).toEqual([
      ["embedded", "refs", ["mainblock"]],
    ]);
  });

  it("v19: an include inside a conditional is conditional: its declaration is a candidate", () => {
    const b = sourcesIn("v19-include-in-conditional").bibliography;
    expect([b.kind, databasesOf(b).map((d) => d.name)]).toEqual([
      "undecided",
      ["anon", "real"],
    ]);
  });

  it("a main file with no document environment is read whole", () => {
    expect(
      stateOf(bibOf("\\bibliography{refs}\n", { "/p/refs.bib": A })),
    ).toEqual([["file", "refs", ["a2024"]]]);
  });

  it("a declaration is placed in the file that holds it", () => {
    const b = sourcesIn("v17-include-order").bibliography;
    expect(
      databasesOf(b).map((d) => [
        basename(d.declared.file),
        d.declared.span.start,
      ]),
    ).toEqual([
      ["bibsetup.tex", 0],
      [
        "paper.tex",
        readFileSync(
          join(FIXTURES, "v17-include-order", "paper.tex"),
          "utf8",
        ).indexOf("\\bibliography{later}"),
      ],
    ]);
  });
});

describe("every block that can be the one TeX's file holds is a candidate", () => {
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
});

describe("a run of switched blocks: outcomes that cannot differ are one", () => {
  const outcomes = (b: Bibliography) =>
    stateOf(b).map(([kind, , keys]) => [kind, keys]);

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

  it("a committed file beside switched blocks: the file when none runs, a conflict for each block that can run last", () => {
    const b = bibOf(
      doc(
        `\\newif\\ifa\n\\newif\\ifb\n\\ifa\n${BLOCK("[overwrite]", A)}\n\\fi\n\\ifb\n${BLOCK("", "@misc{c2021, title={C}}")}\n\\fi`,
        "\\bibliography{refs}",
      ),
      { "/p/refs.bib": B },
    );
    // The second block has no [overwrite]: a file exists, so it never writes — when it runs alone,
    // TeX reads the file and the block is shadowed, a conflict of its own.
    expect([b.kind, outcomes(b)]).toEqual([
      "undecided",
      [
        ["file", ["b2020"]],
        ["conflict", ["a2024"]],
        ["conflict", ["b2020"]],
      ],
    ]);
  });
});

describe("what TeX never reads, and what bibtex reads in a quoted field", () => {
  it("v22: a thebibliography after \\end{document} is never read: none", () => {
    expect(sourcesIn("v22-parked-thebibliography").bibliography).toEqual({
      kind: "none",
    });
  });

  it("v23: an \\input after \\end{document} is never opened: not a file of the paper", () => {
    const s = sourcesIn("v23-parked-include");
    expect(s.includes.map((i) => i.rel)).toEqual([]);
    expect(stateOf(s.bibliography)).toEqual([["file", "refs", ["real"]]]);
  });

  it("v24: an `@` or `)` inside a quoted field is text; each entry ends where bibtex ends it", () => {
    const [db] = databasesOf(sourcesIn("v24-quoted-fields").bibliography);
    const bib = db === undefined ? null : texReads(db);
    expect(bib?.entries.map((e) => e.key)).toEqual([
      "q1",
      "q2",
      "q3",
      "q4",
      "q5",
    ]);
    // The whole first entry, the link after the quoted `@` included.
    expect(
      bib?.entries
        .slice(0, 1)
        .map((e) =>
          bib.text.slice(e.span.start, e.span.end).endsWith("title = {T1}}"),
        ),
    ).toEqual([true]);
  });

  it("v25: a committed file whose @string differs from the block's is not TeX's copy of it: conflict", () => {
    expect(
      databasesOf(sourcesIn("v25-string-differs").bibliography).map(
        (d) => d.kind,
      ),
    ).toEqual(["conflict"]);
  });

  it("a committed file whose @preamble differs is not a copy either", () => {
    const b = bibOf(
      doc(BLOCK("", `@preamble{"x"}\n${A}`), "\\bibliography{refs}"),
      { "/p/refs.bib": `@preamble{"y"}\n${A}\n` },
    );
    expect(stateOf(b)).toEqual([["conflict", "refs", ["a2024"]]]);
  });

  it("but a committed file that differs only in what bibtex skips (text between entries) is the block's copy", () => {
    const b = bibOf(doc(BLOCK("", A), "\\bibliography{refs}"), {
      "/p/refs.bib": `Exported by a tool.\n${A}\n`,
    });
    expect(stateOf(b)).toEqual([["embedded", "refs", ["a2024"]]]);
  });
});

describe("the filecontents blocks TeX writes", () => {
  it("the plain form too, its body from the line after `\\begin` (text after the name is ignored)", () => {
    const b = bibOf(
      doc(
        "\\begin{filecontents}{b.bib} text TeX ignores\n@misc{b, title={B}}\n\\end{filecontents}",
        "\\bibliography{b}",
      ),
    );
    expect(stateOf(b)).toEqual([["embedded", "b", ["b"]]]);
  });

  it("[force] overwrites as [overwrite] does; [nosearch] alone does not", () => {
    const read = (opt: string) =>
      stateOf(
        bibOf(doc(BLOCK(opt, A), "\\bibliography{refs}"), {
          "/p/refs.bib": B,
        }),
      );
    expect([
      read("[force]"),
      read("[nosearch,overwrite]"),
      read("[nosearch]"),
    ]).toEqual([
      [["conflict", "refs", ["a2024"]]],
      [["conflict", "refs", ["a2024"]]],
      [["conflict", "refs", ["b2020"]]],
    ]);
  });

  it("a block that names no file, and one inside \\iffalse, write nothing TeX reads", () => {
    const unnamed = "\\begin{filecontents*}\n@misc{a,}\n\\end{filecontents*}";
    const hidden = `\\iffalse\n${BLOCK("", A)}\n\\fi`;
    expect(
      [unnamed, hidden].map((pre) =>
        stateOf(bibOf(doc(pre, "\\bibliography{refs}"))),
      ),
    ).toEqual([[["missing", "refs", null]], [["missing", "refs", null]]]);
  });
});
