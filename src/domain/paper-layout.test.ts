/**
 * The paper folder's layout (`src/domain/paper-layout.ts`), judged on its root entries alone. Both
 * halves: the scaffold `paperlint new` writes, and a folder holding every allowed entry, are clean; a
 * stray file or folder at the root is reported once, by name, with where it belongs.
 */
import { describe, expect, it } from "vitest";
import {
  CURE_BY_DEFAULT,
  CURE_BY_FILE,
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
        "revision-plan.json",
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
  it.each([
    ["PLAN.md", "file", "a section of PIPELINE-STATUS.md"],
    ["Plan.md", "file", "a section of PIPELINE-STATUS.md"],
    ["plans", "dir", "a section of PIPELINE-STATUS.md"],
    ["DECISION-LOG.md", "file", "research/"],
    ["EMAILS.md", "file", "submission/"],
    ["data", "dir", "repro/data/"],
    ["artifact", "dir", "repro/"],
    ["archive", "dir", "extra/"],
    ["venue-corpus", "dir", "<papers-root>/venues/<venue>/"],
  ] as const)(
    "a known name, %s (%s), goes to its one destination",
    (name, kind, cure) => {
      expect(judgeLayout([{ name, kind }], NOTHING_DECLARED)[0]?.cure).toBe(
        cure,
      );
    },
  );

  it.each([
    ["results-final-v2.csv", "repro/data/"],
    ["plot.py", "repro/tools/"],
    ["fig1.PNG", "figures/"],
    ["requirements.txt", "repro/tools/"],
    ["Makefile", "repro/tools/"],
    ["notes.md", "research/"],
  ])(
    "an unlisted file, %s, goes to the folder its kind names",
    (name, cure) => {
      expect(judgeLayout([file(name)], NOTHING_DECLARED)[0]?.cure).toBe(cure);
    },
  );

  it("anything else goes to extra/: an unlisted folder, a file without a known extension", () => {
    expect(
      judgeLayout(
        [dir("corpus"), file("LICENSE"), file("fig1.pdf")],
        NOTHING_DECLARED,
      ),
    ).toEqual([
      { name: "corpus/", kind: "dir", cure: CURE_BY_DEFAULT },
      { name: "LICENSE", kind: "file", cure: CURE_BY_DEFAULT },
      // A root PDF may be a figure, a draft or a review: no one folder is right, and versions/ holds
      // only cycle folders and lock.json (versions/layout).
      { name: "fig1.pdf", kind: "file", cure: CURE_BY_DEFAULT },
    ]);
    expect(CURE_BY_DEFAULT).toBe("extra/");
  });

  it("a known file name, or a file extension, used by a folder is neither: extra/", () => {
    expect(
      judgeLayout([dir("PLAN.md"), dir("runs.csv")], NOTHING_DECLARED).map(
        (s) => s.cure,
      ),
    ).toEqual([CURE_BY_DEFAULT, CURE_BY_DEFAULT]);
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

describe("strayMessage — one short line naming one destination", () => {
  const CURES = [
    ...new Set([
      ...KNOWN_CURES.map((c) => c.cure),
      ...CURE_BY_FILE.map((c) => c.cure),
      CURE_BY_DEFAULT,
    ]),
  ];

  it.each(CURES)(
    "for the destination %s: one line, the entry, the destination, extra/ as the fallback, no tree",
    (cure) => {
      const text = strayMessage({
        name: "results-final-v2.csv",
        kind: "file",
        cure,
      });
      expect(text).not.toContain("\n");
      expect(text.length).toBeLessThanOrEqual(120);
      expect(text.startsWith("`results-final-v2.csv` ")).toBe(true);
      expect(text).toContain(cure);
      expect(text).toContain("extra/");
      expect(text).not.toContain("<paper>/");
    },
  );

  it("names no destination but its own: no other folder of the layout", () => {
    const text = strayMessage({
      name: "x.csv",
      kind: "file",
      cure: "repro/data/",
    });
    expect(
      CURES.filter(
        (c) => c !== "repro/data/" && c !== "extra/" && c !== "repro/",
      ).filter((c) => text.includes(c)),
    ).toEqual([]);
  });
});

describe("PAPER_LAYOUT_TREE — the drawing the rule's page embeds", () => {
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
      "│   └── <id>-<slug>/               ← one folder per study or spike, named by its row in studies.json (P1-S03-baseline)",
    );
    expect(lines.at(-1)).toMatch(/^└── extra\/ +← anything; never judged$/);
  });
});
