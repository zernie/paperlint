/** The migration from `stages:` to folders per attempt, planned before anything moves. */
import { describe, expect, it } from "vitest";
import { err, ok } from "./result.ts";
import {
  frontmatterOf,
  planMigration,
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
  cycleIds: ["alpha-2026", "beta-2027"],
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
  ...o,
});

describe("planMigration", () => {
  it("each entry's files into its cycle's folder, the lock from the declared day, a lost source recorded", () => {
    expect(planMigration(input())).toStrictEqual(
      ok({
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
  it("keeps the lock already there, moves a withdrawn (STALE) file to extra/, leaves a file already in place", () => {
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
          file("notes.md"),
        ],
        factsOf: () => ({ bytes: 1, sha256: SHA }),
        lock: { "alpha-2026/arxiv.tex": { kind: "lost", frozen: null } },
      }),
    );
    expect(r).toStrictEqual(
      ok({
        moves: [
          {
            from: "versions/2026-07-20-submitted-STALE.pdf",
            to: "extra/versions/2026-07-20-submitted-STALE.pdf",
          },
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
        cycleIds: ["alpha-2026"],
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
