/**
 * The layout of a paper's `repro/` (`src/domain/repro-layout.ts`), judged on its top entries alone.
 * Both halves: the layout itself, the byproducts and dated study folders with a README.md are clean;
 * every other entry is reported once, with where it goes by kind, and a study folder without its
 * README.md is reported once.
 */
import { describe, expect, it } from "vitest";
import {
  DATA_CURE,
  FILE_CURE_BY_KIND,
  MOVED_FILES,
  NOTE_CURE,
  SCRIPT_CURE,
  isStudyName,
  judgeRepro,
  reproMessage,
  suggestedStudyName,
  type ReproEntry,
} from "./repro-layout.ts";

const file = (name: string): ReproEntry => ({
  name,
  kind: "file",
  hasReadme: false,
});
const dir = (name: string, hasReadme = true): ReproEntry => ({
  name,
  kind: "dir",
  hasReadme,
});

describe("isStudyName", () => {
  it.each([
    "context-reading-2026-10",
    "human-labels-2026-10",
    "ablation-2026-10-12",
    "a1-b2-2026-01-31",
    "leap-2024-02-29",
    "leap-2000-02-29",
    "april-2026-04-30",
  ])("%s is a study's name", (name) => {
    expect(isStudyName(name)).toBe(true);
  });

  it.each([
    ["no date", "ablation"],
    ["no slug", "2026-10-12"],
    ["a capital", "Ablation-2026-10-12"],
    ["an underscore", "human_labels-2026-10"],
    ["a doubled hyphen", "a--b-2026-10"],
    ["month 13", "x-2026-13"],
    ["month 00", "x-2026-00-01"],
    ["day 00", "x-2026-10-00"],
    ["31 April", "x-2026-04-31"],
    ["29 February of a common year", "x-2025-02-29"],
    ["29 February 1900", "x-1900-02-29"],
    ["32 October", "x-2026-10-32"],
    ["a two-digit year", "x-26-10-12"],
  ])("not with %s: %s", (_why, name) => {
    expect(isStudyName(name)).toBe(false);
  });
});

describe("suggestedStudyName", () => {
  it("a name that is a study's once lowercased and hyphenated, as it is", () => {
    expect(suggestedStudyName("Human_Labels_2026_10")).toBe(
      "human-labels-2026-10",
    );
  });

  it("a name with no date: its slug, and the date to fill in", () => {
    expect(suggestedStudyName("Old Baseline")).toBe("old-baseline-YYYY-MM-DD");
  });

  it("a name with a date that is not one: the slug without it", () => {
    expect(suggestedStudyName("results-2026-13-01")).toBe("results-YYYY-MM-DD");
  });

  it("a name with no slug at all: a placeholder for one", () => {
    expect(suggestedStudyName("2026-10")).toBe("<slug>-YYYY-MM-DD");
    expect(suggestedStudyName("__")).toBe("<slug>-YYYY-MM-DD");
  });
});

describe("judgeRepro — silent", () => {
  it("on the layout: the index, .gitignore, tools/, data/ and dated studies with a README.md", () => {
    expect(
      judgeRepro([
        file("README.md"),
        file(".gitignore"),
        dir("tools", false),
        dir("data", false),
        dir("ablation-2026-10-12"),
        dir("human-labels-2026-10"),
      ]),
    ).toEqual([]);
  });

  it("on what interpreters, package managers and the system leave, file or folder", () => {
    expect(
      judgeRepro([
        dir("__pycache__", false),
        dir(".pytest_cache", false),
        dir(".mypy_cache", false),
        dir(".ruff_cache", false),
        dir(".ipynb_checkpoints", false),
        dir("node_modules", false),
        dir(".venv", false),
        file(".DS_Store"),
        file("Thumbs.db"),
      ]),
    ).toEqual([]);
  });
});

describe("judgeRepro — reports, one finding per entry", () => {
  it("a loose file, by kind: script, tool manifest, data, note, anything else", () => {
    expect(
      judgeRepro([
        file("paper_numbers.py"),
        file("check-anon.sh"),
        file("harness.MJS"),
        file("requirements.txt"),
        file("Makefile"),
        file("numbers.tsv"),
        file("runs.jsonl"),
        file("notes.md"),
        file("figure.pdf"),
        file("LICENSE"),
      ]).map((f) => [f.path, f.problem, f.cure]),
    ).toEqual([
      ["repro/paper_numbers.py", "stray", SCRIPT_CURE],
      ["repro/check-anon.sh", "stray", SCRIPT_CURE],
      ["repro/harness.MJS", "stray", SCRIPT_CURE],
      ["repro/requirements.txt", "stray", SCRIPT_CURE],
      ["repro/Makefile", "stray", SCRIPT_CURE],
      ["repro/numbers.tsv", "stray", DATA_CURE],
      ["repro/runs.jsonl", "stray", DATA_CURE],
      ["repro/notes.md", "stray", NOTE_CURE],
      ["repro/figure.pdf", "stray", FILE_CURE_BY_KIND],
      ["repro/LICENSE", "stray", FILE_CURE_BY_KIND],
    ]);
  });

  it("a file paperlint once kept at the top: where it is read now, with the command", () => {
    expect(
      judgeRepro(MOVED_FILES.map((m) => file(m.name))).map((f) => f.cure),
    ).toEqual(MOVED_FILES.map((m) => m.cure));
    expect(MOVED_FILES[0]?.cure).toContain(
      "git mv repro/references-cache.json repro/data/",
    );
  });
});

describe("judgeRepro — reports a folder, one finding each", () => {
  it("an undated folder: rename it as a study, with its first commit's date as the default", () => {
    expect(judgeRepro([dir("Old_Baseline")])).toEqual([
      {
        path: "repro/Old_Baseline/",
        problem: "stray",
        cure: "rename it to `old-baseline-YYYY-MM-DD`, one folder per study or spike, named for what it is and the date it began — the date of its first commit is a fine default (`git log --reverse --format=%as -- repro/Old_Baseline | head -1`, run in the paper folder) — and give it a README.md; if it holds scripts or data shared across the paper instead, move them into repro/tools/ or repro/data/",
      },
    ]);
  });

  it("a study folder without its README.md", () => {
    expect(judgeRepro([dir("ablation-2026-10-12", false)])).toEqual([
      {
        path: "repro/ablation-2026-10-12/",
        problem: "no-readme",
        cure: "add repro/ablation-2026-10-12/README.md — what the study asks, how to run it, what it found — and a line for it in repro/README.md",
      },
    ]);
  });

  it("a name allowed for a folder, as a file, and the other way round", () => {
    expect(
      judgeRepro([
        file("tools"),
        file("ablation-2026-10-12"),
        dir("README.md"),
      ]).map((f) => f.path),
    ).toEqual(["repro/tools", "repro/ablation-2026-10-12", "repro/README.md/"]);
  });
});

describe("reproMessage — stands alone", () => {
  it("a stray entry: what it is, where it goes, what repro/ holds, the rule's page", () => {
    expect(
      reproMessage({
        path: "repro/run.py",
        problem: "stray",
        cure: SCRIPT_CURE,
      }),
    ).toBe(
      [
        `\`repro/run.py\` is loose at the top of the paper's repro/ folder, which holds only an index, the shared tools and data, and one dated folder per study. Where it goes: ${SCRIPT_CURE}.`,
        "What repro/ holds (what interpreters and package managers leave there, like __pycache__/ and node_modules/, is never reported):",
        "repro/",
        "├── README.md           ← the index: one line per study",
        "├── .gitignore          ← keeps the scripts' byproducts out of git",
        "├── tools/              ← scripts used across the paper (numbers, figures, anonymity check, harnesses)",
        "├── data/               ← shared data (tables, caches)",
        "└── <slug>-YYYY-MM-DD/  ← one folder per study or spike (<slug>-YYYY-MM for one that ran over weeks)",
        "    └── README.md       ← required: what it asks, how to run it, what it found",
        "Rule paper/repro-layout: https://github.com/zernie/paperlint/blob/main/docs/rules/paper/repro-layout.md",
      ].join("\n"),
    );
  });

  it("a study without its README.md: what to add", () => {
    expect(
      reproMessage({
        path: "repro/x-2026-10/",
        problem: "no-readme",
        cure: "add it",
      }),
    ).toMatch(
      /^`repro\/x-2026-10\/` is a study folder without a README\.md, and every study in repro\/ has one\. What to do: add it\.\nWhat repro\/ holds/,
    );
  });
});
