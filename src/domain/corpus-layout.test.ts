/**
 * The layout of a venue corpus (`src/domain/corpus-layout.ts`). Both halves: the seven names and
 * the byproducts are clean; every other entry is reported once, with where it goes by kind.
 */
import { describe, expect, it } from "vitest";
import {
  CORPUS_LAYOUT_TREE,
  DIR_CURE,
  FILE_CURE,
  FILE_CURES,
  corpusStrayMessage,
  judgeCorpusLayout,
  judgeVenues,
  looseMessage,
  storesWithoutRecord,
  unrecordedMessage,
} from "./corpus-layout.ts";
import type { LayoutEntry } from "./paper-layout.ts";

const file = (name: string): LayoutEntry => ({ name, kind: "file" });
const dir = (name: string): LayoutEntry => ({ name, kind: "dir" });
const cure = (i: number): string => FILE_CURES[i]?.cure ?? "";

const SEVEN: readonly LayoutEntry[] = [
  ...["papers.json", "MANIFEST.md", "measurements.json"].map(file),
  ...["pdf", "text", "deep-reads", "sources"].map(dir),
];

describe("judgeCorpusLayout", () => {
  it("🔴 reports nothing for the seven names and the byproducts", () => {
    expect(
      judgeCorpusLayout([...SEVEN, file(".DS_Store"), dir("__pycache__")]),
    ).toEqual([]);
  });

  it("🔴 a .gitignore that keeps the stored copies out of git is no stray", () => {
    // Guards: a public repository keeps a corpus's pdf/ out of git with it (no false red).
    expect(judgeCorpusLayout([...SEVEN, file(".gitignore")])).toEqual([]);
  });

  it("🔴 reports each stray once, by kind, in the order given", () => {
    // One file per entry of FILE_CURES, in its order.
    const names = [
      "a.pdf",
      "a.txt",
      "notes.md",
      "x.py",
      "list.csv",
      "cfp.html",
    ];
    expect(
      judgeCorpusLayout([...SEVEN, ...names.map(file), file("odd.bin")]),
    ).toEqual([
      ...names.map((name, i) => ({ name, cure: cure(i) })),
      { name: "odd.bin", cure: FILE_CURE },
    ]);
  });

  it("judges a name by its kind too: a folder named papers.json, a file named pdf", () => {
    expect(judgeCorpusLayout([dir("papers.json"), file("pdf")])).toEqual([
      { name: "papers.json/", cure: DIR_CURE },
      { name: "pdf", cure: FILE_CURE },
    ]);
  });
});

describe("storesWithoutRecord", () => {
  it.each([
    ["pdf/ and no papers.json", [dir("pdf")], true],
    ["text/ and no papers.json", [dir("text"), file("MANIFEST.md")], true],
    ["pdf/ with papers.json", [dir("pdf"), file("papers.json")], false],
    ["no stored copies", [dir("sources")], false],
    ["a file named pdf", [file("pdf")], false],
  ] as const)("%s", (_, entries, want) => {
    expect(storesWithoutRecord(entries)).toBe(want);
  });
});

describe("the messages", () => {
  it("a stray names itself, its cure, the layout and the rule's page", () => {
    expect(
      corpusStrayMessage("venues/agent", { name: "x/", cure: DIR_CURE }),
    ).toBe(
      [
        `\`venues/agent/x/\` is not one of the names a venue corpus holds. Where it goes: ${DIR_CURE}.`,
        "What a corpus holds (.DS_Store and what interpreters leave, like __pycache__/, are never reported):",
        CORPUS_LAYOUT_TREE,
        "Rule corpus/allowed-files-only: https://github.com/zernie/paperlint/blob/main/docs/rules/corpus/allowed-files-only.md",
      ].join("\n"),
    );
  });

  it("an unrecorded corpus names the folder and both cures", () => {
    expect(unrecordedMessage("papers/venues/agent")).toBe(
      "`papers/venues/agent/` stores copies in pdf/ or text/ and has no papers.json, so nothing records which paper each file is a copy of, or under which licence it is kept. What to do: write papers/venues/agent/papers.json (study-accepted-papers writes it; its fields are in papers.schema.json), or remove pdf/ and text/ and keep the papers' ids. Rule corpus/allowed-files-only: https://github.com/zernie/paperlint/blob/main/docs/rules/corpus/allowed-files-only.md",
    );
  });
});

describe("judgeVenues", () => {
  it("🔴 reports each file loose in venues/, and no corpus folder, index or byproduct", () => {
    const entries = [
      dir("agent"),
      dir("scripts"),
      ...["README.md", "CLAUDE.md", "AGENTS.md", ".DS_Store"].map(file),
      file("codebook.md"),
      file("check.py"),
    ];
    // Guards: a folder is a corpus (its own names are judged inside it); only loose files are strays.
    expect(judgeVenues(entries)).toEqual(["codebook.md", "check.py"]);
  });

  it("says where a loose file goes, and what venues/ holds", () => {
    expect(looseMessage("papers/venues", "check.py")).toBe(
      "`papers/venues/check.py` is a file loose in venues/, which holds one folder per venue corpus, and README.md, CLAUDE.md or AGENTS.md. Where it goes: into the corpus it is about (caveats into its MANIFEST.md, saved pages into its sources/), or out of venues/ when it serves several (a script into a paper's repro/tools/, its command into each papers.json's `rebuild`). Rule corpus/allowed-files-only: https://github.com/zernie/paperlint/blob/main/docs/rules/corpus/allowed-files-only.md",
    );
  });
});
