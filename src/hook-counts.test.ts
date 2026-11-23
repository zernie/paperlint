/**
 * The doctor's hook arithmetic (`src/hook-counts.ts`), both halves: a hook is short when fewer commands
 * run it than the wiring ships (none, or some: `lint-edited` after an Edit only, as an older `init`
 * wired it), over-wired when more do, and neither when the set is whole or entirely unwired.
 */
import { describe, expect, it } from "vitest";
import {
  overWired,
  partlyMissing,
  shortLabels,
  type HookCount,
} from "./hook-counts.ts";

/** `lint-edited` hangs off an Edit and a Bash command; the others once each. */
const SHIPPED = { "submission-confirm": 1, "lint-edited": 2 };
const count = (name: string, ours: number, other = 0): HookCount => ({
  name,
  ours,
  other,
});

describe("hook counts — against the shipped wiring", () => {
  it("🔴 wired by an older init, lint-edited once of its two commands: short, and named with its count", () => {
    const counts = [count("submission-confirm", 1), count("lint-edited", 1)];
    expect(partlyMissing(counts, SHIPPED)).toEqual(["lint-edited"]);
    expect(shortLabels(counts, SHIPPED)).toEqual([
      "lint-edited (1 of its 2 commands)",
    ]);
    expect(overWired(counts, SHIPPED)).toEqual([]);
  });

  it("a hook nothing runs is named bare; a name the wiring does not ship counts as once", () => {
    const counts = [count("submission-confirm", 1), count("unknown", 0)];
    expect(shortLabels(counts, SHIPPED)).toEqual(["unknown"]);
  });

  it("wired as shipped, under any spelling: nothing short, nothing over", () => {
    const counts = [count("submission-confirm", 0, 1), count("lint-edited", 2)];
    expect(partlyMissing(counts, SHIPPED)).toEqual([]);
    expect(overWired(counts, SHIPPED)).toEqual([]);
  });

  it("nothing wired at all is not partly wired", () => {
    const counts = [count("submission-confirm", 0), count("lint-edited", 0)];
    expect(partlyMissing(counts, SHIPPED)).toEqual([]);
  });

  it("🔴 more commands than shipped: over-wired, lint-edited only past its two", () => {
    const counts = [count("submission-confirm", 1, 1), count("lint-edited", 2)];
    expect(overWired(counts, SHIPPED)).toEqual([counts[0]]);
    expect(overWired([count("lint-edited", 3)], SHIPPED)).toHaveLength(1);
  });
});
