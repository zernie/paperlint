/**
 * The paper folder's layout (`src/domain/paper-layout.ts`), judged on its root entries alone. Both
 * halves: the scaffold `paperlint new` writes, and a folder holding every allowed entry, are clean; a
 * stray file or folder at the root is reported once, by name, with where it belongs.
 */
import { describe, expect, it } from "vitest";
import {
  CURE_BY_KIND,
  KNOWN_CURES,
  NOTHING_DECLARED,
  PAPER_LAYOUT_TREE,
  ROOT_DIRS,
  ROOT_FILES,
  judgeLayout,
  strayMessage,
  type LayoutEntry,
} from "./paper-layout.ts";

const file = (name: string): LayoutEntry => ({ name, kind: "file" });
const dir = (name: string): LayoutEntry => ({ name, kind: "dir" });

describe("judgeLayout — silent", () => {
  it("on the scaffold `paperlint new` writes", () => {
    expect(
      judgeLayout(
        [file("PIPELINE-STATUS.md"), file("paper.tex"), file("paperlint.json")],
        NOTHING_DECLARED,
      ),
    ).toEqual([]);
  });
});

describe("judgeLayout — silent on the whole allowed set", () => {
  it("on every allowed file and folder, the TeX inputs and the build's byproducts", () => {
    const entries = [
      ...[
        "PIPELINE-STATUS.md",
        "paper.tex",
        "paperlint.json",
        "README.md",
        "CLAUDE.md",
        "CLAIMS.md",
        "NOTES.md",
        "SUBMIT-CHECKLIST.md",
        ".gitignore",
        "paper.pdf",
        "numbers.tex",
        "refs.bib",
        "acmart.cls",
        "pbalance.sty",
        "ACM-Reference-Format.bst",
        "paper.aux",
        "paper.log",
        "paper.bbl",
        "paper.blg",
        "paper.out",
        "paper.fls",
        "paper.toc",
        "paper.synctex.gz",
        ".DS_Store",
      ].map(file),
      ...[
        "_build",
        "versions",
        "reviews",
        "siblings",
        "research",
        "repro",
        "figures",
        "sections",
        "talk",
        "submission",
        "extra",
      ].map(dir),
    ];
    expect(judgeLayout(entries, NOTHING_DECLARED)).toEqual([]);
  });

  it("on what the paper's settings name at its root: another PDF, another talk folder, its own preset", () => {
    expect(
      judgeLayout([file("main.pdf"), dir("video"), file("venue.jsonc")], {
        roots: ["main.pdf", "video", "venue.jsonc"],
      }),
    ).toEqual([]);
  });
});

describe("judgeLayout — reports", () => {
  it("a known name with its one destination: the plan is a section of the status file", () => {
    const [plan] = judgeLayout(
      [file("paper.tex"), file("PLAN.md")],
      NOTHING_DECLARED,
    );
    expect(plan?.name).toBe("PLAN.md");
    expect(plan?.cure).toMatch(
      /^a section of PIPELINE-STATUS\.md .*"Plan \/ now"/,
    );
  });

  it.each([
    ["DECISION-LOG.md", "file", /^research\//],
    ["EMAILS.md", "file", /^submission\//],
    ["data", "dir", /^repro\//],
    ["artifact", "dir", /^repro\//],
    [
      "archive",
      "dir",
      /^versions\/ for frozen PDFs, submission\/ .*, extra\/ for the rest$/,
    ],
    [
      "venue-corpus",
      "dir",
      /^<papers-root>\/venues\/<venue>\/, outside the paper folder/,
    ],
    ["plans", "dir", /^a section of PIPELINE-STATUS\.md/],
    ["Plan.md", "file", /^a section of PIPELINE-STATUS\.md/],
  ] as const)("%s (%s) goes to its destination", (name, kind, cure) => {
    expect(judgeLayout([{ name, kind }], NOTHING_DECLARED)[0]?.cure).toMatch(
      cure,
    );
  });

  it("an unknown name gets the choice by what it is", () => {
    expect(judgeLayout([dir("corpus")], NOTHING_DECLARED)).toEqual([
      { name: "corpus/", kind: "dir", cure: CURE_BY_KIND },
    ]);
  });

  it("a known file name used by a folder is not that file: the choice by kind", () => {
    expect(judgeLayout([dir("PLAN.md")], NOTHING_DECLARED)[0]?.cure).toBe(
      CURE_BY_KIND,
    );
  });
});

describe("judgeLayout — the build's byproducts", () => {
  // What pdflatex, bibtex, makeindex, biber, glossaries, beamer and latexmk write next to paper.tex.
  const byproducts = [
    "aux",
    "log",
    "out",
    "toc",
    "lof",
    "lot",
    "loa",
    "lol",
    "bbl",
    "blg",
    "idx",
    "ind",
    "ilg",
    "glo",
    "gls",
    "glg",
    "nlo",
    "nls",
    "fls",
    "fdb_latexmk",
    "synctex.gz",
    "run.xml",
    "bcf",
    "nav",
    "snm",
    "vrb",
    "xdv",
    "dvi",
  ];

  it("a root holding paper.idx, paper.ind, paper.ilg and the rest of the job's outputs reports nothing", () => {
    expect(
      judgeLayout(
        byproducts.map((ext) => file(`paper.${ext}`)),
        NOTHING_DECLARED,
      ),
    ).toEqual([]);
  });

  it("only under the paper's own job name: draft.idx is reported", () => {
    expect(
      judgeLayout([file("draft.idx"), file("paper.idx")], NOTHING_DECLARED).map(
        (s) => s.name,
      ),
    ).toEqual(["draft.idx"]);
  });

  it("🔴 the .aux that \\include writes beside a root source: chapter.aux with chapter.tex is the build's; alone it is reported", () => {
    expect(
      judgeLayout(
        [file("chapter.tex"), file("chapter.aux"), file("orphan.aux")],
        NOTHING_DECLARED,
      ).map((s) => s.name),
    ).toEqual(["orphan.aux"]);
  });
});

describe("judgeLayout — reports by name, exactly", () => {
  it("a PDF other than the built one, a dotfile, another job's byproduct", () => {
    expect(
      judgeLayout(
        [file("paper-2026-07-18.pdf"), file(".body-limit"), file("draft.aux")],
        NOTHING_DECLARED,
      ).map((s) => s.name),
    ).toEqual(["paper-2026-07-18.pdf", ".body-limit", "draft.aux"]);
  });

  it("an allowed folder's name used by a file, and an allowed file's name used by a folder", () => {
    expect(
      judgeLayout([file("reviews"), dir("README.md")], NOTHING_DECLARED).map(
        (s) => s.name,
      ),
    ).toEqual(["reviews", "README.md/"]);
  });

  it("names compared exactly: case matters", () => {
    expect(
      judgeLayout([dir("Reviews")], NOTHING_DECLARED).map((s) => s.name),
    ).toEqual(["Reviews/"]);
  });

  it("each stray entry once, in the order given", () => {
    expect(
      judgeLayout(
        [file("a.md"), file("paper.tex"), dir("data")],
        NOTHING_DECLARED,
      ).map((s) => s.name),
    ).toEqual(["a.md", "data/"]);
  });
});

describe("strayMessage — stands alone for a reader with no context", () => {
  const [plan] = judgeLayout([file("PLAN.md")], NOTHING_DECLARED);
  const text = plan === undefined ? "" : strayMessage(plan);

  it("names the entry, where it goes, draws the whole layout, and links the rule's page", () => {
    expect(text.split("\n")).toEqual([
      `\`PLAN.md\` is at the root of a paper folder (the folder holding PIPELINE-STATUS.md), and that root holds only paperlint's layout. Where it goes: ${KNOWN_CURES[0]?.cure ?? ""}.`,
      "The layout (extra/ takes anything and is never judged; the build's paper.* byproducts are never reported):",
      ...PAPER_LAYOUT_TREE.split("\n"),
      "Rule paper/folder-layout: https://github.com/zernie/paperlint/blob/main/docs/rules/paper/folder-layout.md",
    ]);
  });

  it("the layout it draws holds every allowed root entry, repro/'s own layout inside", () => {
    const lines = PAPER_LAYOUT_TREE.split("\n");
    expect(lines[0]).toBe("<paper>/");
    const drawn = new Set(
      lines.map((l) =>
        l
          .replace(/^[│ ]*[├└]── /u, "")
          .split(" ", 1)
          .join(""),
      ),
    );
    expect(
      [...ROOT_FILES, ...ROOT_DIRS.map((d) => `${d}/`)].filter(
        (name) => !drawn.has(name),
      ),
    ).toEqual([]);
    expect(lines).toContain(
      "│   └── <slug>-YYYY-MM-DD/         ← one folder per study or spike (<slug>-YYYY-MM for one that ran over weeks)",
    );
    expect(lines.at(-1)).toMatch(/^└── extra\/ +← anything; never judged$/);
  });
});
