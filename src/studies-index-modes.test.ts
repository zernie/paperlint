/**
 * `paperlint studies index` and `studies new` (`src/studies.ts`) writing the index's mode columns from
 * the plans and git's history (a stand-in), and refusing a registry whose row names a folder outside
 * `repro/` before reading or writing through it.
 */
import { expect, it } from "vitest";
import {
  DECIDED,
  DIR,
  ROW,
  planOf,
  studies,
  tree,
} from "../test/study-tree.ts";

const D = { commit: "d".repeat(40), date: "2026-10-14T09:12:00+05:00" };
const A = { commit: "a".repeat(40), date: "2026-10-16T11:00:00+05:00" };
const README = `${DIR}/repro/README.md`;

/** The row of P1-S01 in the README `studies index` wrote, its cells trimmed. */
const rowOf = (after: Readonly<Record<string, string>>): string[] =>
  (after[README] ?? "")
    .split("\n")
    .filter((l) => l.startsWith("| P1-S01"))
    .flatMap((l) => l.split("|").map((c) => c.trim()))
    .filter((c) => c !== "");

it("writes the decision's first commit and the first output's, read from git", () => {
  const r = studies(
    "index",
    tree({ [`${DIR}/repro/P1-S01-outcome/RESULTS.md`]: "41 of 60\n" }),
    { title: undefined },
    {
      order: {
        kind: "read",
        decision: D,
        decisionDeleted: false,
        files: [
          { path: "decision.md", ...D, order: "same" },
          { path: "RESULTS.md", ...A, order: "after" },
        ],
      },
    },
  );
  // Guards: the cells the review skills read the Methods sentence's facts from.
  expect([r.code, r.log, rowOf(r.after)]).toEqual([
    0,
    ["wrote the index of 1 study in papers/example/repro/README.md"],
    [
      "P1-S01",
      "Outcome",
      "running",
      "—",
      "no",
      "decide_before_run",
      "dddddddddddd 2026-10-14",
      "aaaaaaaaaaaa 2026-10-16",
      "[P1-S01-outcome/](P1-S01-outcome/)",
    ],
  ]);
});

it("rewrites the index when only git's columns moved, and leaves it when nothing did", () => {
  const before = studies("index", tree(), { title: undefined }).after;
  const order = {
    kind: "read",
    decision: D,
    decisionDeleted: false,
    files: [],
  } as const;
  const moved = studies("index", before, { title: undefined }, { order });
  const again = studies("index", moved.after, { title: undefined }, { order });
  // Guards: the lint ignores those two columns, so the command is what keeps them current.
  expect([rowOf(before)[6], moved.log, again.log]).toEqual([
    "unknown (git could not answer)",
    ["wrote the index of 1 study in papers/example/repro/README.md"],
    ["the index in papers/example/repro/README.md is in sync with 1 study"],
  ]);
});

it("an exploratory study's mode carries its reason, and no commit", () => {
  const r = studies(
    "index",
    tree({}, planOf({ kind: "exploratory", reason: "a first look" })),
    { title: undefined },
  );
  expect(rowOf(r.after).slice(5, 8)).toEqual([
    "exploratory: a first look",
    "—",
    "—",
  ]);
});

it("refuses a registry whose row names a folder outside repro/, for index and for new", () => {
  const escaping = tree(
    { [`${DIR}/x/plan.json`]: JSON.stringify(planOf(DECIDED)) },
    planOf(DECIDED),
    { ...ROW, folder: "../x" },
  );
  const line =
    "P1-S01 in papers/example/repro/studies.json names the folder `../x`, which is not one folder inside repro/: nothing is read or written through it. Give the row its own folder's name, then run this again.";
  const index = studies("index", escaping, { title: undefined });
  const added = studies("new", escaping, { title: "Second" });
  // Guards: nothing is written — no README, no new folder — when a row could lead outside the paper.
  expect([
    [index.code, index.err, README in index.after],
    [added.code, added.err, Object.keys(added.after).length],
  ]).toEqual([
    [1, [line], false],
    [1, [line], Object.keys(escaping).length],
  ]);
});
