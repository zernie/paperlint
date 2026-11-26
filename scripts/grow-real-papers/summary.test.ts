/**
 * The summary a run prints: per field the manifest's total against its quota and what the log
 * judged; per venue edition its count against the cap, unfielded entries included; and every
 * edition whose walk did not finish.
 */
import { describe, expect, test } from "vitest";
import type { ProbeLine, Queries, SlotEnd } from "./collect.ts";
import {
  keptNotInManifest,
  logReport,
  renderSummary,
  report,
  summarize,
} from "./summary.ts";

const slot = (field: string, series: string, year: number) => ({
  field,
  series,
  year,
  cap: 1,
  queries: [],
  max_results: 50,
  venue: series.toLowerCase(),
  classSpec: "article",
});
const queries: Queries = {
  hardCap: 3,
  maxPages: 1,
  quotas: { ml: 2, nlp: 1 },
  slots: [slot("ml", "ICML", 2025), slot("nlp", "ACL", 2025)],
};
const line = (
  id: string,
  field: string,
  outcome: "kept" | "rejected",
  reason: string,
): ProbeLine => ({
  id,
  field,
  series: field === "ml" ? "ICML" : "ACL",
  year: 2025,
  rank: 1,
  query: "q",
  source: "arxiv-comment",
  acceptance: "arxiv-comment",
  outcome,
  reason,
});
const lines = [
  line("1", "ml", "kept", "passes rules 1-4"),
  line("2", "ml", "rejected", "over 300 KB"),
  line("2", "ml", "rejected", "over 300 KB"),
  line("3", "ml", "rejected", "no acceptance statement"),
  line("4", "ml", "rejected", "over 300 KB"),
];
const entries = [
  { arxiv_id: "1", field: "ml", series: "ICML", year: 2025 },
  { arxiv_id: "0", field: "ml", series: "ICML", year: 2025 },
  { arxiv_id: "9", series: "ICML", year: 2025 },
  { arxiv_id: "8" },
];
const ends: readonly SlotEnd[] = [
  { slot: "ml/ICML 2025", ended: "full", walkedTo: 4 },
  { slot: "nlp/ACL 2025", ended: "search error", walkedTo: 0, error: "503" },
];

describe("the summary", () => {
  test("fields, editions and the walks that did not finish", () => {
    // Guards: totals from the manifest, kept and probed (distinct ids) from the log, apart.
    expect(summarize({ queries, entries, lines, ends })).toEqual({
      fields: [
        {
          field: "ml",
          total: 2,
          quota: 2,
          kept: 1,
          probed: 4,
          top: [
            ["over 300 KB", 2],
            ["no acceptance statement", 1],
          ],
        },
        { field: "nlp", total: 0, quota: 1, kept: 0, probed: 0, top: [] },
      ],
      editions: [
        { edition: "ICML 2025", count: 3, cap: 3 },
        { edition: "ACL 2025", count: 0, cap: 3 },
      ],
      incomplete: [ends[1]],
    });
  });

  test("printed as two tables and the unfinished walks", () => {
    const s = summarize({ queries, entries, lines, ends });
    // Guards: the documented output, whole: what a maintainer reads before --write.
    expect(renderSummary(s, "this run")).toEqual([
      "field | total / quota | kept (this run) | probed (this run) | yield | top 3 rejection reasons",
      "ml | 2 / 2 | 1 | 4 | 25.0% | over 300 KB (2); no acceptance statement (1)",
      "nlp | 0 / 1 ⚠ short | 0 | 0 | — | —",
      "edition | count / cap",
      "ICML 2025 | 3 / 3 full",
      "ACL 2025 | 0 / 3",
      "not finished: nlp/ACL 2025 ended by search error (503); rerun to resume",
    ]);
    // Guards: a finished run says so, and an edition over its cap is marked.
    expect(
      renderSummary(
        {
          ...s,
          editions: [{ edition: "X 2025", count: 4, cap: 3 }],
          incomplete: [],
        },
        "the log",
      ).slice(-2),
    ).toEqual(["X 2025 | 4 / 3 ❌ over cap", "every walk finished"]);
    // Guards: a walk stopped by the clock carries no error text.
    expect(
      renderSummary(
        {
          ...s,
          incomplete: [{ slot: "ml/X 2025", ended: "time", walkedTo: 2 }],
        },
        "this run",
      ).at(-1),
    ).toBe("not finished: ml/X 2025 ended by time; rerun to resume");
  });
});

describe("the log against the manifest", () => {
  test("a kept line with no manifest entry is named", () => {
    // Guards: both halves: a kept id missing from the manifest, and none when all are there.
    expect([
      keptNotInManifest(lines, entries.slice(1)),
      keptNotInManifest(lines, [{ arxiv_id: "1v2" }]),
    ]).toEqual([["1"], []]);
  });
});

describe("what a run and --summary print last", () => {
  test("the next command, and exit 1 while a walk is unfinished", () => {
    const at = (ends: readonly SlotEnd[], write: boolean) => {
      const r = report({ queries, entries, lines, ends }, write);
      return [r.lines.at(-1), r.code];
    };
    // Guards: unfinished exits 1 and says rerun; a finished dry run and --write name their next step.
    expect([
      at(ends, true),
      at(ends.slice(0, 1), false),
      at(ends.slice(0, 1), true),
    ]).toEqual([
      ["next: rerun the same command to finish the walks", 1],
      ["next: commit the quotas, then rerun with --write fixtures", 0],
      [
        "next: npx vitest run fixtures/real-papers/balance.test.ts fixtures/real-papers/inputs.test.ts",
        0,
      ],
    ]);
  });

  test("--summary: the whole log, no walk line, and exit 1 on a kept id the manifest lacks", () => {
    const ok = logReport({ queries, entries, lines });
    const bad = logReport({ queries, entries: entries.slice(1), lines });
    // Guards: no walk was run, so no line about walks; the scope says the log.
    expect([
      ok.code,
      ok.lines.at(-1),
      ok.lines[0]?.includes("(the log)"),
    ]).toEqual([0, "ACL 2025 | 0 / 3", true]);
    // Guards: the mismatch is named and fails.
    expect([bad.code, bad.lines.at(-1)]).toEqual([
      1,
      "❌ kept in the log but not in venue-manifest.json: 1",
    ]);
  });
});
