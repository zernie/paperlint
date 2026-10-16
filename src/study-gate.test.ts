/**
 * `paperlint studies gate <paper-dir> <id>` (`src/study-gate.ts`) on papers held in memory, git a
 * stand-in: 0 once the decision is committed as it stands, 1 with the reason otherwise — and 0 for a
 * study whose run waits on nothing, saying why.
 */
import { expect, it } from "vitest";
import type { StudyMode } from "./domain/study-mode.ts";
import {
  DATE,
  DIR,
  ROW,
  SHA,
  planOf,
  studies,
  tree,
} from "../test/study-tree.ts";

const DECIDED: StudyMode = {
  kind: "decide_before_run",
  outputs: ["RESULTS.md"],
  decision: { file: "repro/P1-S01-outcome/decision.md", note: "exclusions" },
};
const DECISION = `${DIR}/repro/P1-S01-outcome/decision.md`;
const decided = (mode: StudyMode = DECIDED) => tree({}, planOf(mode));

it("open once the decision is committed as it stands: exit 0 with its commit and date", () => {
  const r = studies(
    "gate",
    decided(),
    {},
    {
      git: { [DECISION]: { kind: "committed", commit: SHA, date: DATE } },
    },
  );
  // Guards: the line a runner's log keeps, and the exit code `gate && run` reads.
  expect([r.code, r.log, r.err]).toEqual([
    0,
    [
      `P1-S01: the decision repro/P1-S01-outcome/decision.md is committed in ${SHA} (${DATE}); the run may start.`,
    ],
    [],
  ]);
});

it("closed while the decision is uncommitted, changed since its commit, or unknown to git", () => {
  const gate = (state: Parameters<typeof studies>[3]) =>
    studies("gate", decided(), {}, state);
  // Guards: each reason the run must wait is said, exit 1.
  expect(
    [
      gate({}),
      gate({ git: { [DECISION]: { kind: "changed", commit: SHA } } }),
      gate({
        git: { [DECISION]: { kind: "unknown", why: "git is not installed" } },
      }),
    ].map((r) => [r.code, r.err]),
  ).toEqual([
    [
      1,
      [
        "P1-S01: the decision repro/P1-S01-outcome/decision.md is not committed; the run waits for it. Write the decision there, commit it, then run this again.",
      ],
    ],
    [
      1,
      [
        `P1-S01: the decision repro/P1-S01-outcome/decision.md has changed since its last commit, ${SHA}; the run waits for the decision as committed. Commit it, then run this again.`,
      ],
    ],
    [
      1,
      [
        "P1-S01: git could not say whether the decision repro/P1-S01-outcome/decision.md is committed: git is not installed.",
      ],
    ],
  ]);
});

it("refuses a plan that names no decision file, or one its own outputs match", () => {
  // Guards: a gate on nothing, or on a file the run itself produces, is no gate.
  expect([
    studies("gate", decided({ ...DECIDED, decision: { file: " ", note: "n" } }))
      .err,
    studies("gate", decided({ ...DECIDED, outputs: ["*.md"] })).err,
  ]).toEqual([
    [
      "P1-S01: its plan names no decision file (`mode.decision.file`); the run cannot be gated on nothing.",
    ],
    [
      "P1-S01: its decision repro/P1-S01-outcome/decision.md is matched by its output `*.md`; a decision cannot be what its own run produces.",
    ],
  ]);
});

it("a blind or an exploratory study's run waits on nothing: exit 0, saying so", () => {
  // Guards: the runner may call gate on every study; the answer names the mode.
  expect([
    studies("gate", tree()).log,
    studies("gate", decided({ kind: "exploratory", reason: "a first look" }))
      .log,
  ]).toEqual([
    [
      "P1-S01 is blind: its run needs no decision. Seal its outputs as soon as they exist (`npx paperlint studies seal papers/example P1-S01`).",
    ],
    [
      "P1-S01 is exploratory (a first look): it has no gate, and its results are reported as exploratory.",
    ],
  ]);
});

it("refuses a study that declares no mode, and an --identity it does not take", () => {
  // Guards: a measurement with no mode is not gated by default — it is refused until it says how.
  expect(
    [
      studies("gate", tree({}, planOf(undefined))),
      studies("gate", tree({}, planOf(undefined), { ...ROW, id: "P1-S01" }), {
        identity: "k.txt",
      }),
    ].map((r) => [r.code, r.err]),
  ).toEqual([
    [
      1,
      [
        "P1-S01 declares no mode in papers/example: no row of papers/example/repro/studies.json with this id names a plan.json that parses with `mode`. Lint the paper (`npx paperlint lint`) to see why.",
      ],
    ],
    [2, ["studies gate takes no --identity: only unseal opens sealed files"]],
  ]);
});
