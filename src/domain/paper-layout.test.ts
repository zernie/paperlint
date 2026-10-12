/**
 * The paper folder's layout (`src/domain/paper-layout.ts`), judged on its root entries alone. Both
 * halves: the scaffold `paperlint new` writes, and a folder holding every allowed entry, are clean; a
 * stray file or folder at the root is reported once, by name, with where it belongs.
 */
import { describe, expect, it } from "vitest";
import {
  CURE_BY_KIND,
  NOTHING_DECLARED,
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

  it("names the entry, where it goes, what is allowed, and the rule's page", () => {
    expect(text).toMatch(/^`PLAN\.md` is at the root of a paper folder/);
    expect(text).toContain("Where it goes: a section of PIPELINE-STATUS.md");
    expect(text).toContain(
      "folders: _build/, versions/, reviews/, siblings/, research/, repro/, figures/, sections/, talk/, submission/, extra/",
    );
    expect(text).toContain(
      "files: PIPELINE-STATUS.md, paper.tex, paperlint.json",
    );
    expect(text).toMatch(/docs\/rules\/paper\/folder-layout\.md$/);
  });
});
