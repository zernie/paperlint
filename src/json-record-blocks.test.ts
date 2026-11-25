/**
 * The JSON records' blocks: the plan's file is ignored until a block of `rules` turns its rule on, and
 * the records a rule is reached through are found by their names. What the blocks do to a project
 * through `paperlint lint` is in `revision-plan-rule.test.ts` and `corpus-record-rule.test.ts`.
 */
import { describe, expect, it } from "vitest";
import { revisionPlanCodec } from "./adapters/revision-plan/index.ts";
import { venueCorpusCodec } from "./adapters/venue-corpus/index.ts";
import {
  isOn,
  jsonRecordBlocks,
  jsonRecords,
  PLAN_RULE,
  type JsonRecordDeps,
} from "./json-record-blocks.ts";
import { ANY_PAPER, papersScope } from "./paper-files.ts";

const DEPS: JsonRecordDeps = {
  json: {},
  layout: { files: { exists: () => false, read: () => "" }, listDir: () => [] },
  corpus: { entries: () => [], codec: venueCorpusCodec },
  plan: revisionPlanCodec,
};

/** The global-ignore blocks among the blocks: a block with `ignores` and nothing else. */
const ignored = (
  rules: Parameters<typeof jsonRecordBlocks>[1],
  scope = ANY_PAPER,
) =>
  jsonRecordBlocks(scope, rules, DEPS).filter(
    (b) => Object.keys(b).join() === "ignores",
  );

describe("the plan's block", () => {
  it("🔴 ignores every plan while no block turns its rule on", () => {
    expect(ignored([])).toEqual([{ ignores: ["**/revision-plan.json"] }]);
    expect(
      ignored([{ basePath: "/p", rules: { [PLAN_RULE]: "off" } }]),
    ).toEqual([{ ignores: ["**/revision-plan.json"] }]);
  });

  it("🔴 ignores none once any block turns it on", () => {
    expect(
      ignored([
        { basePath: "/p", rules: { "tex/register": "warn" } },
        { basePath: "/p/a", rules: { [PLAN_RULE]: ["warn"] } },
      ]),
    ).toEqual([]);
  });

  it("with no paper to claim, adds no empty ignore", () => {
    expect(ignored([], papersScope([], "/w", []))).toEqual([]);
  });
});

describe("isOn", () => {
  it.each([
    ["warn", true],
    [2, true],
    [["error", {}], true],
    ["off", false],
    [0, false],
    [undefined, false],
  ])("%j → %s", (entry, on) => {
    expect(isOn(entry)).toBe(on);
  });
});

describe("jsonRecords", () => {
  it("keeps each corpus record and each plan once, by name", () => {
    expect(
      jsonRecords([
        "/w/papers/venues/agent/papers.json",
        "/w/papers/p/revision-plan.json",
        "/w/papers/p/paper.tex",
        "/w/papers/p/repro/studies.json",
        "/w/papers/p/revision-plan.json",
      ]),
    ).toEqual([
      "/w/papers/venues/agent/papers.json",
      "/w/papers/p/revision-plan.json",
    ]);
  });
});
