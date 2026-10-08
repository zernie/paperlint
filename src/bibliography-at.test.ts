/**
 * `bibliographyAt` — a path a person gave, and the bibliography to read for it. A `.bib` is read alone,
 * as named; a `.tex`, or a directory holding `paper.tex`, is the bibliography the last build's bibtex
 * opened (`_build/sources.json`, docs/design/paper-sources.md §1) — read from the text the author
 * edits: the `filecontents` block that wrote a database, or the file itself. A paper with no current
 * record is refused, in one vocabulary, naming the command that records it.
 */
import { describe, expect, it } from "vitest";
import { bibReader } from "./adapters/bibtex/index.ts";
import { latexReader } from "./adapters/latex/index.ts";
import { memoryFiles } from "./adapters/memory/index.ts";
import { sourcesCodec } from "./adapters/sources-record/index.ts";
import type { BibText } from "./domain/paper-sources.ts";
import { absolutePath } from "./domain/paths.ts";
import { bibliographyAt, bibliographyUnreadWhy } from "./paper-sources.ts";
import {
  leftByTeX,
  planted,
  recordText,
  type Shape,
} from "../test/recorded-fixture.ts";

const doc = (body: string): string =>
  `\\documentclass{article}\n\\begin{document}\n${body}\n\\end{document}\n`;
const A = "@misc{a, title = {A}}\n";
const B = "@misc{b, title = {B}}\n";

/** A directory as TeX and the build leave it: the files, and the record over them (none: not built). */
function built(
  dir: string,
  files: Readonly<Record<string, string>>,
  shape: Shape | string | null,
): Record<string, string> {
  const record =
    shape === null
      ? {}
      : {
          [`${dir}/_build/sources.json`]:
            typeof shape === "string" ? shape : recordText(files, shape),
        };
  return {
    ...Object.fromEntries(
      Object.entries(files).map(([f, t]) => [`${dir}/${f}`, t]),
    ),
    ...record,
  };
}

const PAPER = doc("\\bibliography{refs}");
const SHAPE: Shape = {
  inputs: [
    ["paper.tex", "body"],
    ["refs.bib", "preamble"],
  ],
  databases: ["refs.bib"],
};
const OWN = { "paper.tex": PAPER, "refs.bib": A, "other.bib": B };

/** Each text read, with the keys of the entries it holds. */
const keysIn = (
  r: ReturnType<typeof bibliographyAt>,
): readonly (readonly [string, readonly string[]])[] =>
  r.ok ? r.value.texts.map((t) => [t.path, entryKeys(t)] as const) : [];
const entryKeys = (t: BibText): readonly string[] =>
  t.entries.map((e) => e.key);

const depsOf = (disk: Readonly<Record<string, string>>) => ({
  files: memoryFiles({ "/p/notes.txt": "notes", ...disk }),
  codec: sourcesCodec,
  latex: latexReader,
  bib: bibReader,
});

/** What a path comes to: the paper's directory and the files read, or the one sentence why not. */
const at = (disk: Readonly<Record<string, string>>, path: string) => {
  const r = bibliographyAt(absolutePath(path), depsOf(disk));
  return r.ok
    ? [r.value.paperDir, r.value.texts.map((t) => t.path)]
    : bibliographyUnreadWhy(r.error);
};

describe("bibliographyAt — the paths it reads", () => {
  const disk = built("/p", OWN, SHAPE);

  it("a .bib is read alone, as named — with no record of any build", () => {
    expect([
      at(built("/p", OWN, null), "/p/other.bib"),
      at(disk, "/p/other.bib"),
    ]).toEqual([
      ["/p", ["/p/other.bib"]],
      ["/p", ["/p/other.bib"]],
    ]);
  });

  it("a .tex, or the directory of a paper.tex, is the bibliography the last build's bibtex opened — not every .bib in the folder", () => {
    expect([at(disk, "/p/paper.tex"), at(disk, "/p")]).toEqual([
      ["/p", ["/p/refs.bib"]],
      ["/p", ["/p/refs.bib"]],
    ]);
  });

  it("🔴 a .bib TeX wrote from a block is read from the block of the .tex the author edits, where its entries stand", () => {
    const tex =
      "\\documentclass{article}\n\\begin{filecontents*}[overwrite]{refs.bib}\n" +
      A +
      "\\end{filecontents*}\n\\begin{document}\nx\\bibliography{refs}\n\\end{document}\n";
    const files = { "paper.tex": tex, "refs.bib": A };
    const d = built("/p", files, {
      inputs: [["paper.tex", "body"]],
      written: ["refs.bib"],
      databases: ["refs.bib"],
    });
    expect(keysIn(bibliographyAt(absolutePath("/p"), depsOf(d)))).toEqual([
      ["/p/paper.tex", ["a"]],
    ]);
  });
});

describe("bibliographyAt — where a block is", () => {
  it("a block that is in an included file is read from that file", () => {
    const files = {
      "paper.tex": doc("\\input{bibblock}\\bibliography{refs}"),
      "bibblock.tex": `\\begin{filecontents*}{refs.bib}\n${A}\\end{filecontents*}\n`,
      "refs.bib": A,
    };
    const d = built("/p", files, {
      inputs: [
        ["paper.tex", "body"],
        ["bibblock.tex", "body"],
      ],
      written: ["refs.bib"],
      databases: ["refs.bib"],
    });
    expect(at(d, "/p")).toEqual(["/p", ["/p/bibblock.tex"]]);
  });

  it("when no text holds what bibtex read, the file TeX left is read", () => {
    const files = {
      "paper.tex": doc("\\bibliography{refs}"),
      "refs.bib": A,
    };
    const d = built("/p", files, {
      inputs: [["paper.tex", "body"]],
      written: ["refs.bib"],
      databases: ["refs.bib"],
    });
    expect(at(d, "/p")).toEqual(["/p", ["/p/refs.bib"]]);
  });
});

describe("bibliographyAt — every refusal in one vocabulary, naming the path and what to give instead", () => {
  it("a path that is not a paper, a .bib or a .tex", () => {
    const disk = built("/p", OWN, SHAPE);
    expect([
      at(disk, "/p/gone.bib"),
      at(disk, "/nowhere"),
      at(disk, "/p/notes.txt"),
      at(disk, "/p/gone.tex"),
    ]).toEqual([
      "/p/gone.bib does not exist — nowhere to take a bibliography from",
      "no paper.tex in /nowhere — name the paper's .tex, or a .bib to read it alone",
      "/p/notes.txt is neither a .bib nor a .tex — name the paper's directory, its .tex, or a .bib",
      "/p/gone.tex does not exist — nowhere to take a bibliography from",
    ]);
  });

  it("🔴 a paper with no record of a build is not read from its source — run `npx paperlint build` first", () => {
    const disk = built("/p", OWN, null);
    expect([at(disk, "/p"), at(disk, "/p/paper.tex")]).toEqual([
      "/p has not been built — run `npx paperlint build` first, which records the databases bibtex reads",
      "/p has not been built — run `npx paperlint build` first, which records the databases bibtex reads",
    ]);
  });

  it("a record the paper has changed since, and one that cannot be read, name the command too", () => {
    const stale = built("/p", OWN, SHAPE);
    stale["/p/refs.bib"] = `${A}${B}`;
    expect(at(stale, "/p")).toBe(
      "/p changed since the last build (refs.bib edited) — run `npx paperlint build` first",
    );
    const broken = built("/p", OWN, "{ not json");
    expect(at(broken, "/p")).toMatch(
      /^the last build's record of \/p cannot be used \(.+\) — run `npx paperlint build` first$/,
    );
  });

  it("a build whose bibtex read no database, and one whose databases are gone, have nothing to read", () => {
    const none = built(
      "/q",
      { "paper.tex": doc("no bibliography") },
      {
        inputs: [["paper.tex", "body"]],
      },
    );
    expect(at(none, "/q")).toBe(
      "bibtex read no database in the last build of /q — there is nothing to read",
    );
    const gone = built(
      "/s",
      { "paper.tex": doc("\\bibliography{gone}") },
      {
        inputs: [["paper.tex", "body"]],
        databases: ["gone.bib"],
      },
    );
    expect(at(gone, "/s")).toBe(
      "bibtex opened gone.bib in the last build of /s, and none of them is on disk now",
    );
  });
});

describe("bibliographyAt — a bibliography it can read only in part", () => {
  it("🔴 a build whose bibtex also opened a database outside the paper directory (BIBINPUTS) is refused, not read in part", () => {
    // Measured: with BIBINPUTS=../shared, bibtex's .blg names `Database file #2: shared.bib` and the
    // .bbl typesets its entry; the paper directory holds refs.bib only.
    const partly = built(
      "/r",
      { "paper.tex": doc("\\bibliography{refs,shared}"), "refs.bib": A },
      {
        inputs: [["paper.tex", "body"]],
        databases: ["refs.bib", "shared.bib"],
      },
    );
    expect(at(partly, "/r")).toBe(
      "bibtex opened shared.bib in the last build of /r from outside it (its search path, BIBINPUTS), and paperlint reads only the paper's own databases — copy it into /r, or name each .bib to read it alone",
    );
  });
});

describe("bibliographyAt on the planted papers, with the record TeX wrote for each", () => {
  it.each([
    ["v3-declared", ["/p/paper.bib"]],
    ["v26-comment-in-names", ["/p/one.bib", "/p/two.bib"]],
    ["v16-included-block", ["/p/refs.bib"]],
    ["v25-string-differs", ["/p/refs.bib"]],
    // A block that TeX wrote: read from the block where the author edits it.
    ["v8-jobname", ["/p/paper.tex"]],
    ["v5-percent-entry", ["/p/paper.tex"]],
    // The block names its file on the line after \\begin: still read from the block.
    ["v30-name-next-line", ["/p/paper.tex"]],
  ])("%s", (name, files) => {
    const p = planted(name);
    const disk = built("/p", leftByTeX(p), p.record);
    expect(at(disk, "/p")).toEqual(["/p", files]);
  });
});

describe("bibliographyAt — an @string one database defines and a later one uses", () => {
  /** Each text read, with each entry's author and booktitle as the reader read them. */
  const fieldsAt = (name: string) => {
    const p = planted(name);
    const r = bibliographyAt(
      absolutePath("/p"),
      depsOf(built("/p", leftByTeX(p), p.record)),
    );
    return r.ok
      ? r.value.texts.map((t) => [
          t.path,
          t.entries.map((e) => [
            e.key,
            e.names["author"],
            e.fields["booktitle"],
          ]),
        ])
      : r.error;
  };
  const LATE = [
    "late",
    [{ lastName: "Lovelace", firstName: "Ada" }],
    "Proceedings of the Shared Venue",
  ];

  it("🔴 v27-shared-string: references.bib's entry is read with the @strings abbreviations.bib defined, as bibtex read it", () => {
    expect(fieldsAt("v27-shared-string")).toEqual([
      ["/p/abbreviations.bib", []],
      ["/p/references.bib", [LATE]],
    ]);
  });

  it("🔴 v28-shared-string-block: a block that uses them is still the database TeX wrote, read where the author edits it", () => {
    expect(fieldsAt("v28-shared-string-block")).toEqual([
      ["/p/abbreviations.bib", []],
      ["/p/paper.tex", [LATE]],
    ]);
  });
});
