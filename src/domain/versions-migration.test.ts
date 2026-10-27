/** The migration from `stages:` to folders per attempt, planned before anything moves. */
import { describe, expect, it } from "vitest";
import { cycleId } from "./cycle.ts";
import { asPaperPath } from "./paths.ts";
import { err, ok } from "./result.ts";
import {
  frontmatterOf,
  planMigration,
  rehearse,
  withoutStages,
  type MigrationInput,
} from "./versions-migration.ts";
import type { FileFacts } from "./versions.ts";

const SHA = "c".repeat(64);
const DISK: Readonly<Record<string, FileFacts>> = {
  "versions/2026-07-22-submitted.pdf": { bytes: 305412, sha256: SHA },
  "versions/2026-07-22-submitted.tex": { bytes: 57210, sha256: SHA },
  "versions/2026-10-23-submitted.pdf": { bytes: 186504, sha256: SHA },
  "versions/2026-09-01-arxiv.pdf": { bytes: 9, sha256: SHA },
};
const file = (name: string) => ({ name, kind: "file" as const });

const input = (o: Partial<MigrationInput> = {}): MigrationInput => ({
  cycleIds: [cycleId("alpha-2026"), cycleId("beta-2027")],
  stages: [
    {
      stage: "submitted",
      cycle: "alpha-2026",
      date: new Date("2026-07-22T00:00:00Z"),
      pdf: "versions/2026-07-22-submitted.pdf",
      bytes: 305412,
      source: "versions/2026-07-22-submitted.tex",
      sourceBytes: 57210,
    },
    {
      stage: "submitted",
      cycle: "beta-2027",
      date: "2026-10-23",
      pdf: "versions/2026-10-23-submitted.pdf",
      bytes: 186504,
      sourceLost: true,
    },
    {
      stage: "arxiv",
      cycle: "alpha-2026",
      date: "2026-09-01",
      pdf: "versions/2026-09-01-arxiv.pdf",
    },
  ],
  root: [
    file("2026-07-22-submitted.pdf"),
    file("2026-07-22-submitted.tex"),
    file("2026-10-23-submitted.pdf"),
    file("2026-09-01-arxiv.pdf"),
    file(".gitkeep"),
  ],
  factsOf: (rel) => DISK[rel] ?? null,
  lock: {},
  exists: () => false,
  ...o,
});

describe("planMigration", () => {
  it("each entry's files into its cycle's folder, the lock from the declared day, a lost source recorded", () => {
    expect(planMigration(input())).toStrictEqual(
      ok({
        copies: [],
        moves: [
          {
            from: "versions/2026-07-22-submitted.pdf",
            to: "versions/alpha-2026/submitted.pdf",
          },
          {
            from: "versions/2026-07-22-submitted.tex",
            to: "versions/alpha-2026/submitted.tex",
          },
          {
            from: "versions/2026-10-23-submitted.pdf",
            to: "versions/beta-2027/submitted.pdf",
          },
          {
            from: "versions/2026-09-01-arxiv.pdf",
            to: "versions/alpha-2026/arxiv.pdf",
          },
        ],
        lock: {
          "alpha-2026/submitted.pdf": {
            kind: "file",
            bytes: 305412,
            sha256: SHA,
            frozen: "2026-07-22",
          },
          "alpha-2026/submitted.tex": {
            kind: "file",
            bytes: 57210,
            sha256: SHA,
            frozen: "2026-07-22",
          },
          "beta-2027/submitted.tex": { kind: "lost", frozen: "2026-10-23" },
          "beta-2027/submitted.pdf": {
            kind: "file",
            bytes: 186504,
            sha256: SHA,
            frozen: "2026-10-23",
          },
          "alpha-2026/arxiv.pdf": {
            kind: "file",
            bytes: 9,
            sha256: SHA,
            frozen: "2026-09-01",
          },
        },
      }),
    );
  });
});

describe("planMigration, beside what is there", () => {
  it("keeps the lock already there, moves a withdrawn (STALE) file and any other loose file to extra/, leaves a file already in place and a dot-file", () => {
    const r = planMigration(
      input({
        stages: [
          {
            stage: "submitted",
            cycle: "beta-2027",
            date: "2026-10-23",
            pdf: "versions/beta-2027/submitted.pdf",
          },
        ],
        root: [
          file("2026-07-20-submitted-STALE.pdf"),
          file("lock.json"),
          file("README.md"),
          file(".gitkeep"),
        ],
        factsOf: () => ({ bytes: 1, sha256: SHA }),
        lock: { "alpha-2026/arxiv.tex": { kind: "lost", frozen: null } },
      }),
    );
    expect(r).toStrictEqual(
      ok({
        copies: [],
        moves: [
          {
            from: "versions/2026-07-20-submitted-STALE.pdf",
            to: "extra/versions/2026-07-20-submitted-STALE.pdf",
          },
          // versions/layout allows nothing loose beside lock.json: a note of the old layout goes too.
          { from: "versions/README.md", to: "extra/versions/README.md" },
        ],
        lock: {
          "alpha-2026/arxiv.tex": { kind: "lost", frozen: null },
          "beta-2027/submitted.pdf": {
            kind: "file",
            bytes: 1,
            sha256: SHA,
            frozen: "2026-10-23",
          },
        },
      }),
    );
  });
});

describe("planMigration, refused", () => {
  it("refuses the whole migration with every reason: no place, no cycle, no date, no pdf, a file gone or replaced, one left over, two in one place", () => {
    const r = planMigration(
      input({
        cycleIds: [cycleId("alpha-2026")],
        stages: [
          { stage: "accepted" },
          "not a mapping",
          { stage: "submitted", cycle: "gamma", date: "2026-07-22" },
          { stage: "submitted", cycle: "alpha-2026", date: "July" },
          { stage: "arxiv", cycle: "alpha-2026", date: 20260722 },
          { stage: "arxiv", cycle: "alpha-2026", date: "2026-09-01" },
          {
            stage: "submitted",
            cycle: "alpha-2026",
            date: "2026-07-22",
            pdf: "versions/2026-07-22-submitted.pdf",
            bytes: 1,
            source: "versions/none.tex",
          },
          {
            stage: "submitted",
            cycle: "alpha-2026",
            date: "2026-10-23",
            pdf: "versions/2026-10-23-submitted.pdf",
          },
          {
            stage: "submitted",
            cycle: "alpha-2026",
            date: "2026-10-23",
            pdf: "versions/2026-09-01-arxiv.pdf",
          },
          { stage: ["submitted"] },
        ],
      }),
    );
    expect(r).toStrictEqual(
      err([
        "stages[0]: the stage «accepted» has no place in versions/<cycle>/ — the stages are submitted, camera-ready, arxiv",
        "stages[1]: the stage «» has no place in versions/<cycle>/ — the stages are submitted, camera-ready, arxiv",
        "stages[2] («submitted»): names no cycle of paperlint.json — add `cycle: <id>` (alpha-2026), the attempt the PDF was sent in, then migrate",
        'stages[3] («submitted»): "date" is not YYYY-MM-DD',
        'stages[4] («arxiv»): "date" is not YYYY-MM-DD',
        'stages[5] («arxiv»): no "pdf"',
        "stages[6]: `versions/2026-07-22-submitted.pdf` has 305412 bytes, the stage declares 1 — it is not the file that was frozen: restore it from git first",
        "stages[6]: `versions/none.tex` is not on disk",
        'stages[9]: the stage «["submitted"]» has no place in versions/<cycle>/ — the stages are submitted, camera-ready, arxiv',
        "versions/2026-07-22-submitted.tex: no stage in `stages:` names it — declare it with its cycle, or move it to extra/, then migrate",
        "versions/alpha-2026/submitted.pdf: `versions/2026-10-23-submitted.pdf` and `versions/2026-09-01-arxiv.pdf` would both go there — an attempt keeps its last upload per stage: move the older to extra/, drop its entry from `stages:`, then migrate",
      ]),
    );
  });

  it("a paper with no cycles names none", () => {
    const r = planMigration(input({ cycleIds: [] }));
    expect(!r.ok && r.error[0]).toBe(
      "stages[0] («submitted»): names no cycle of paperlint.json — add `cycle: <id>` (none declared), the attempt the PDF was sent in, then migrate",
    );
  });
});

describe("the scorecard's stages: list, taken out", () => {
  it("the key and every line under it go; the keys around it stay", () => {
    const md =
      "---\ntitle: x\nstages:\n  - stage: submitted\n    date: 2026-07-22\n\n  # a note\n- stage: arxiv\nstate: open\n---\n# Status\n";
    expect(withoutStages(md)).toBe(
      "---\ntitle: x\nstate: open\n---\n# Status\n",
    );
    expect(frontmatterOf(md)).toBe(
      "title: x\nstages:\n  - stage: submitted\n    date: 2026-07-22\n\n  # a note\n- stage: arxiv\nstate: open\n",
    );
  });

  it("a frontmatter that held only the list is dropped; an inline empty list too", () => {
    expect(withoutStages("---\nstages:\n  - stage: x\n---\n# S\n")).toBe(
      "# S\n",
    );
    expect(withoutStages("---\nstages: []\n---\n")).toBe("");
  });

  it("no frontmatter, an empty one, or none with stages: nothing to take out", () => {
    expect(withoutStages("# S\n")).toBeNull();
    expect(withoutStages("---\n---\n# S\n")).toBeNull();
    expect(withoutStages("---\ntitle: x\n---\n")).toBeNull();
    expect(frontmatterOf("# S\n")).toBeNull();
    expect(frontmatterOf("---\n---\n")).toBe("");
  });
});

describe("planMigration, what could stop it half-way", () => {
  it("a destination already taken is a reason, for a stage's file and for a loose one bound for extra/", () => {
    const r = planMigration(
      input({
        root: [file("2026-07-22-submitted.pdf"), file("notes.md")],
        exists: (rel) =>
          rel === "versions/alpha-2026/submitted.pdf" ||
          rel === "extra/versions/notes.md",
      }),
    );
    expect(!r.ok && r.error).toStrictEqual([
      "versions/alpha-2026/submitted.pdf is already there, and `versions/2026-07-22-submitted.pdf` would replace it — compare the two, keep one, move the other out of versions/, then migrate",
      "extra/versions/notes.md is already there, and `versions/notes.md` would replace it — compare the two, keep one, move the other out of versions/, then migrate",
    ]);
  });

  it("one source named by two stages: copied to the first destination, moved to the last", () => {
    const r = planMigration(
      input({
        stages: [
          {
            stage: "submitted",
            cycle: "beta-2027",
            date: "2026-10-23",
            pdf: "versions/s.pdf",
            source: "versions/s.tex",
          },
          {
            stage: "arxiv",
            cycle: "beta-2027",
            date: "2026-10-25",
            pdf: "versions/a.pdf",
            source: "versions/s.tex",
          },
        ],
        root: [],
        factsOf: () => ({ bytes: 1, sha256: SHA }),
      }),
    );
    expect(r.ok && r.value.copies).toStrictEqual([
      { from: "versions/s.tex", to: "versions/beta-2027/submitted.tex" },
    ]);
    expect(r.ok && r.value.moves).toStrictEqual([
      { from: "versions/s.pdf", to: "versions/beta-2027/submitted.pdf" },
      { from: "versions/a.pdf", to: "versions/beta-2027/arxiv.pdf" },
      { from: "versions/s.tex", to: "versions/beta-2027/arxiv.tex" },
    ]);
  });
});

describe("planMigration, a path as the list spells it", () => {
  it("a declared path is read in one spelling: `./` and `//` name the file the listing names", () => {
    const r = planMigration(
      input({
        stages: [
          {
            stage: "submitted",
            cycle: "beta-2027",
            date: "2026-10-23",
            pdf: "./versions//s.pdf",
            source: "./versions/s.tex",
          },
        ],
        root: [file("s.pdf"), file("s.tex")],
        factsOf: () => ({ bytes: 1, sha256: SHA }),
      }),
    );
    expect(r.ok && r.value.moves).toStrictEqual([
      { from: "versions/s.pdf", to: "versions/beta-2027/submitted.pdf" },
      { from: "versions/s.tex", to: "versions/beta-2027/submitted.tex" },
    ]);
  });

  it("a path out of the paper, as the PDF or the source, and a listed name no path can hold: reasons", () => {
    const r = planMigration(
      input({
        stages: [
          {
            stage: "submitted",
            cycle: "beta-2027",
            date: "2026-10-23",
            pdf: "../s.pdf",
            source: "/abs/s.tex",
          },
        ],
        root: [file("a\\b.md")],
      }),
    );
    expect(!r.ok && r.error).toStrictEqual([
      "stages[0]: `../s.pdf` is not a path inside the paper folder — a stage names a file of this paper, relative to it",
      "stages[0]: `/abs/s.tex` is not a path inside the paper folder — a stage names a file of this paper, relative to it",
      "versions/a\\b.md: not a file name migrate can move — rename it, then migrate",
    ]);
  });
});

describe("rehearse", () => {
  const p = asPaperPath;
  const at =
    (...there: readonly string[]) =>
    (q: string) =>
      there.includes(q);

  it("a plan that runs to the end, each file the lock vouches for there: accepted", () => {
    expect(
      rehearse(
        {
          copies: [
            { from: p("versions/s.tex"), to: p("versions/c/submitted.tex") },
          ],
          moves: [{ from: p("versions/s.tex"), to: p("versions/c/arxiv.tex") }],
          lock: {
            "c/submitted.tex": {
              kind: "file",
              bytes: 1,
              sha256: SHA,
              frozen: "2026-10-23",
            },
            "c/arxiv.pdf": { kind: "lost", frozen: null },
          },
        },
        at("versions/s.tex"),
      ),
    ).toStrictEqual(ok(null));
  });

  it("a step without its source, a step onto a file, a lock that vouches for a file not there: each refused", () => {
    expect(
      rehearse(
        {
          copies: [
            { from: p("versions/a.tex"), to: p("versions/c/submitted.tex") },
          ],
          moves: [
            { from: p("versions/s.pdf"), to: p("versions/c/submitted.pdf") },
          ],
          lock: {
            "c/arxiv.pdf": {
              kind: "file",
              bytes: 1,
              sha256: SHA,
              frozen: "2026-10-23",
            },
          },
        },
        at("versions/s.pdf", "versions/c/submitted.pdf"),
      ),
    ).toStrictEqual(
      err([
        "copy versions/a.tex → versions/c/submitted.tex: versions/a.tex is not there at that step",
        "move versions/s.pdf → versions/c/submitted.pdf: versions/c/submitted.pdf is already there at that step",
        "versions/lock.json would vouch for versions/c/arxiv.pdf, which would not be there after the migration",
      ]),
    );
  });
});
