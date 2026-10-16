/**
 * A study's mode (`src/domain/study-mode.ts`): which kinds must declare one, where a decision lies
 * relative to the study, and when a decision would be one of the study's own outputs.
 */
import { expect, it } from "vitest";
import {
  decisionAsOutput,
  gateOf,
  inStudy,
  needsMode,
  type Blind,
  type DecideFirst,
} from "./study-mode.ts";

const DECIDED: DecideFirst = {
  kind: "decide_before_run",
  outputs: ["**/*.md"],
  decision: { file: "repro/S1-x/decision.md", note: "n" },
};
const BLIND: Blind = {
  kind: "blind",
  outputs: ["out/**"],
  recipients: [],
  unseal_after: { file: "research/exclusions.md", note: "n" },
};

it("only a measurement must declare its mode", () => {
  // Guards: a spike and the other kinds may omit it.
  expect(
    (
      [
        "measurement",
        "spike",
        "tooling",
        "data",
        "artifact",
        "salvage",
      ] as const
    ).map(needsMode),
  ).toEqual([true, false, false, false, false, false]);
});

it("a paper-relative path inside the study's folder, normalised; outside it, none", () => {
  // Guards: `./` and `x/../` spellings land where they point; another folder is not this study's.
  expect([
    inStudy("S1-x", "repro/S1-x/a/b.md"),
    inStudy("S1-x", "./repro/S1-x/z/../c.md"),
    inStudy("S1-x", "repro/S1-xy/c.md"),
    inStudy("S1-x", "research/d.md"),
  ]).toEqual(["a/b.md", "c.md", null, null]);
});

it("the decision a gated mode waits on, and the output glob that would swallow it", () => {
  // Guards: a decision in the folder that an output matches is named by the glob; one elsewhere is not.
  expect([gateOf(DECIDED).file, gateOf(BLIND).file]).toEqual([
    "repro/S1-x/decision.md",
    "research/exclusions.md",
  ]);
  expect([
    decisionAsOutput("S1-x", DECIDED),
    decisionAsOutput("S1-x", { ...DECIDED, outputs: ["out/**"] }),
    decisionAsOutput("S1-x", BLIND),
  ]).toEqual(["**/*.md", null, null]);
});
