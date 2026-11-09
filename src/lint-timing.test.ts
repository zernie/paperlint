import { describe, expect, it } from "vitest";
import { ruleTimes, timingLines } from "./lint-timing.ts";

const pass = (rules: Record<string, number>) => ({
  rules: Object.fromEntries(
    Object.entries(rules).map(([k, total]) => [k, { total }]),
  ),
});

describe("ruleTimes — each rule's milliseconds, summed over files and passes", () => {
  it("sums a rule across files and passes, slowest first, ties by name", () => {
    const results = [
      {
        stats: {
          times: { passes: [pass({ "a/x": 5, "b/y": 7 }), pass({ "a/x": 4 })] },
        },
      },
      { stats: { times: { passes: [pass({ "a/x": 1, "c/z": 10 })] } } },
    ];
    expect(ruleTimes(results)).toEqual([
      { rule: "a/x", ms: 10 },
      { rule: "c/z", ms: 10 },
      { rule: "b/y", ms: 7 },
    ]);
  });

  it("a result without stats, and a pass without rules, add nothing", () => {
    expect(ruleTimes([{}, { stats: { times: { passes: [{}] } } }])).toEqual([]);
  });
});

describe("timingLines — what `paperlint lint` says about its time", () => {
  const rules = [
    { rule: "repro/outputs-before-decision", ms: 50346.4 },
    { rule: "paper/figure-ref-style", ms: 2231 },
    { rule: "tex/x", ms: 900 },
    { rule: "tex/y", ms: 5 },
  ];

  it("one line, one decimal, when the run took 10 s or less", () => {
    expect(timingLines({ files: 3, ms: 10000, rules })).toEqual([
      "linted 3 file(s) in 10.0 s",
    ]);
    expect(timingLines({ files: 1, ms: 1234, rules })).toEqual([
      "linted 1 file(s) in 1.2 s",
    ]);
  });

  it("over 10 s, a second line names the three slowest rules with whole milliseconds", () => {
    expect(timingLines({ files: 12, ms: 53210, rules })).toEqual([
      "linted 12 file(s) in 53.2 s",
      "slowest rules: repro/outputs-before-decision 50346 ms · paper/figure-ref-style 2231 ms · tex/x 900 ms",
    ]);
  });

  it("over 10 s with no rule times, only the first line", () => {
    expect(timingLines({ files: 2, ms: 10001, rules: [] })).toEqual([
      "linted 2 file(s) in 10.0 s",
    ]);
  });
});
