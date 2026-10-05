/**
 * THE CYCLE — one attempt of a paper at a venue, parsed from `cycles` in `paperlint.json`, and the
 * current attempt derived from the list. Pure.
 */
import { describe, expect, it } from "vitest";
import { present } from "../../test/support.ts";
import {
  currentCycle,
  cycleProblemText,
  effectiveBlind,
  parseCycles,
  type Cycle,
} from "./cycle.ts";

const REJECTED = {
  id: "alpha-2026",
  venue: { kind: "preset", extends: "paperlint:acm-sigconf" },
  kind: "short",
  opened: "2026-07-01",
  deadlines: [
    {
      what: "submission",
      observed: [
        {
          at: "2026-08-06T11:59:00Z",
          source: "call",
          url: "https://example.org/cfp",
          read: "2026-07-01",
        },
      ],
    },
  ],
  outcome: {
    kind: "rejected",
    date: "2026-09-08",
    desk: false,
    evidence: "reviews/alpha.md",
  },
};
const OPEN = {
  id: "beta-2027",
  venue: { kind: "preset", extends: "paperlint:ieee-conference" },
  kind: "technical",
  opened: "2026-09-09",
  phase: "porting",
  deadlines: [
    {
      what: "submission",
      observed: [
        {
          at: "2026-10-20T04:00:00Z",
          source: "call",
          url: "https://beta2027.example.org/call",
          read: "2026-09-09",
        },
      ],
    },
  ],
  submission: { id: 7 },
  outcome: { kind: "open" },
};

const cycles = (r: ReturnType<typeof parseCycles>): readonly Cycle[] => {
  if (!r.ok || r.value === null) throw new Error(JSON.stringify(r));
  return r.value;
};
/** The parsed cycles of `input`, each present — a list a test's own setup guarantees. */
const parsed = (input: readonly unknown[]): Cycle[] =>
  cycles(parseCycles(input)).map((c, i) => present(c, `cycle ${String(i)}`));

describe("parseCycles", () => {
  it("absent is null: a paper without cycles keeps its flat settings", () => {
    expect(parseCycles(undefined)).toEqual({ ok: true, value: null });
  });

  it("reads every field, fills the defaults, and keeps the list order", () => {
    const [a, b] = cycles(parseCycles([REJECTED, OPEN]));
    expect(a).toEqual({
      id: "alpha-2026",
      venue: { kind: "preset", extends: "paperlint:acm-sigconf" },
      kind: "short",
      opened: "2026-07-01",
      phase: "prepared",
      deadlines: [
        {
          what: "submission",
          observed: [
            {
              at: "2026-08-06T11:59:00Z",
              source: "call",
              url: "https://example.org/cfp",
              read: "2026-07-01",
            },
          ],
          override: null,
        },
      ],
      submission: null,
      outcome: {
        kind: "rejected",
        date: "2026-09-08",
        desk: false,
        evidence: "reviews/alpha.md",
      },
    });
    expect(b?.phase).toBe("porting");
    expect(b?.submission).toEqual({ id: 7 });
    expect(b?.outcome).toEqual({ kind: "open" });
  });

  it("a named venue (no preset yet) carries its name and call", () => {
    const [c] = cycles(
      parseCycles([
        {
          ...OPEN,
          venue: {
            kind: "named",
            name: "ExampleSec '27",
            url: "https://example.org/call",
          },
          kind: null,
        },
      ]),
    );
    expect(c?.venue).toEqual({
      kind: "named",
      name: "ExampleSec '27",
      url: "https://example.org/call",
    });
    expect(c?.kind).toBeNull();
  });
});

describe("parseCycles — the outcomes", () => {
  it("a withdrawn outcome: date and evidence, nothing else", () => {
    const [c] = parsed([
      {
        ...REJECTED,
        outcome: { kind: "withdrawn", date: "2026-07-18", evidence: "n.md" },
      },
    ]);
    expect(c?.outcome).toEqual({
      kind: "withdrawn",
      date: "2026-07-18",
      evidence: "n.md",
    });
  });
});

describe("parseCycles refuses, naming the entry and the key", () => {
  it.each([
    ["not a list", "a cycle", /must be a LIST/],
    ["an entry that is not an object", [1], /cycles\[0\] must be an object/],
    [
      "an unknown key",
      [{ ...OPEN, venu: 1 }],
      /cycles\[0\]: unknown key "venu"/,
    ],
    ["a missing id", [{ ...OPEN, id: undefined }], /cycles\[0\]: "id" must be/],
    [
      "an opened date that is not a date",
      [{ ...OPEN, opened: "September" }],
      /"opened" must be a date YYYY-MM-DD/,
    ],
    [
      "a venue of an unknown kind",
      [{ ...OPEN, venue: { kind: "url" } }],
      /"venue" must be \{ "kind": "preset", "extends": … \} or \{ "kind": "named", "name": …, "url": … \}/,
    ],
  ])("refuses %s, naming the entry and the key", (_what, input, re) => {
    const r = parseCycles(input);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(re);
  });
});

describe("parseCycles refuses a malformed deadline, outcome or submission", () => {
  it.each([
    [
      "a deadline the deadline parser refuses, named by its place in the list",
      [{ ...OPEN, deadlines: [{ what: "submission", notes: "x" }] }],
      /^cycles\[0\]\.deadlines\[0\]: unknown key "notes"/,
    ],
    [
      "an unknown key in an open outcome",
      [{ ...OPEN, outcome: { kind: "open", foo: 1 } }],
      /^cycles\[0\]\.outcome: unknown key "foo" — an open outcome's keys: kind$/,
    ],
    [
      "an unknown key in a decision",
      [{ ...REJECTED, outcome: { ...REJECTED.outcome, reviews: 3 } }],
      /^cycles\[0\]\.outcome: unknown key "reviews" — a rejected outcome's keys: kind, date, evidence, desk$/,
    ],
    [
      "a desk flag on an acceptance",
      [
        {
          ...REJECTED,
          outcome: {
            kind: "accepted",
            date: "2026-08-21",
            evidence: "r.md",
            desk: false,
          },
        },
      ],
      /^cycles\[0\]\.outcome: unknown key "desk" — an accepted outcome's keys: kind, date, evidence$/,
    ],
    [
      "an unknown key in a venue",
      [{ ...OPEN, venue: { ...OPEN.venue, portal: "https://x" } }],
      /^cycles\[0\]\.venue: unknown key "portal" — a preset venue's keys: kind, extends$/,
    ],
    [
      "an unknown key in a named venue",
      [
        {
          ...OPEN,
          venue: { kind: "named", name: "X", url: "https://x", year: 2027 },
        },
      ],
      /^cycles\[0\]\.venue: unknown key "year" — a named venue's keys: kind, name, url$/,
    ],
    [
      "an unknown key in a submission",
      [{ ...OPEN, submission: { id: 7, url: "https://x" } }],
      /^cycles\[0\]\.submission: unknown key "url" — a submission's keys: id$/,
    ],
  ])("refuses %s, naming the entry and the key", (_what, input, re) => {
    const r = parseCycles(input);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(re);
  });
});

describe("parseCycles refuses a malformed decision, phase or submission", () => {
  it.each([
    [
      "a decision without evidence",
      [
        {
          ...REJECTED,
          outcome: { kind: "rejected", date: "2026-09-08", desk: false },
        },
      ],
      /"outcome" of kind rejected needs "evidence"/,
    ],
    [
      "a desk flag that is not a boolean",
      [{ ...REJECTED, outcome: { ...REJECTED.outcome, desk: "yes" } }],
      /"outcome.desk" must be true or false/,
    ],
    [
      "an outcome of an unknown kind",
      [{ ...OPEN, outcome: { kind: "desk-reject" } }],
      /"outcome" kind must be one of open, accepted, rejected, withdrawn/,
    ],
    [
      "a phase that is not porting or prepared",
      [{ ...OPEN, phase: "draft" }],
      /"phase" must be "porting" or "prepared"/,
    ],
    [
      "a submission id that is not a positive integer",
      [{ ...OPEN, submission: { id: 0 } }],
      /"submission" must be \{ "id": <the submission number/,
    ],
  ])("refuses %s, naming the entry and the key", (_what, input, re) => {
    const r = parseCycles(input);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(re);
  });
});

/** The one-line refusal, as every table below asserts it. */
const refuses = (_what: string, input: unknown, re: RegExp): void => {
  const r = parseCycles(input);
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.error).toMatch(re);
};

describe("parseCycles refuses a value of the wrong shape, naming the entry and the key", () => {
  it.each([
    [
      "a venue that is not an object",
      [{ ...OPEN, venue: "paperlint:ieee-conference" }],
      /"venue" must be \{ "kind": "preset"/,
    ],
    [
      "a decision whose date is not a day",
      [{ ...REJECTED, outcome: { ...REJECTED.outcome, date: "08.09.2026" } }],
      /"outcome" of kind rejected needs "date" \(YYYY-MM-DD\)/,
    ],
    [
      "a kind that is not a string",
      [{ ...OPEN, kind: 5 }],
      /"kind" must be a string or null/,
    ],
    [
      "two broken cycles: the first is named, the second never read",
      [{}, {}],
      /^cycles\[0\]: "id" must be a non-empty string/,
    ],
  ])("refuses %s", refuses);
});

describe("currentCycle", () => {
  it("no cycles: none; the last cycle open: that cycle; the last cycle closed: parked on it", () => {
    expect(currentCycle([])).toEqual({ ok: true, value: { kind: "none" } });
    const [a, b] = parsed([REJECTED, OPEN]);
    expect(currentCycle(parsed([REJECTED, OPEN]))).toEqual({
      ok: true,
      value: { kind: "cycle", cycle: b },
    });
    expect(currentCycle(parsed([REJECTED]))).toEqual({
      ok: true,
      value: { kind: "parked", last: a },
    });
  });
});

describe("currentCycle — closed lists", () => {
  it("an ACCEPTED last cycle is not parked: the paper lives on at that venue", () => {
    const [a] = parsed([
      {
        ...REJECTED,
        outcome: { kind: "accepted", date: "2026-08-21", evidence: "r.md" },
      },
    ]);
    expect(
      currentCycle(
        parsed([
          {
            ...REJECTED,
            outcome: { kind: "accepted", date: "2026-08-21", evidence: "r.md" },
          },
        ]),
      ),
    ).toEqual({
      ok: true,
      value: { kind: "accepted", cycle: a },
    });
  });

  it("two open cycles is dual submission (or a cycle never closed), by name", () => {
    const r = currentCycle(
      parsed([{ ...REJECTED, outcome: { kind: "open" } }, OPEN]),
    );
    expect(r).toEqual({
      ok: false,
      error: { kind: "two-open", ids: ["alpha-2026", "beta-2027"] },
    });
    if (!r.ok)
      expect(cycleProblemText(r.error)).toMatch(
        /cycles «alpha-2026» and «beta-2027» are both open/,
      );
  });

  it("an open cycle that is not the last is a record out of order", () => {
    const list = parsed([
      { ...REJECTED, outcome: { kind: "open" } },
      { ...OPEN, outcome: REJECTED.outcome },
    ]);
    expect(currentCycle(list)).toEqual({
      ok: false,
      error: { kind: "open-not-last", id: "alpha-2026" },
    });
  });

  it("two cycles with one id cannot be told apart by a stage", () => {
    expect(
      currentCycle(parsed([REJECTED, { ...OPEN, id: "alpha-2026" }])),
    ).toEqual({
      ok: false,
      error: { kind: "duplicate-id", id: "alpha-2026" },
    });
  });
});

describe("cycleProblemText — one line per problem, naming what to change", () => {
  it.each([
    [
      { kind: "open-not-last", id: "alpha-2026" },
      /cycle «alpha-2026» is open but is not the last entry/,
    ],
    [
      { kind: "duplicate-id", id: "alpha-2026" },
      /two cycles carry the id «alpha-2026»/,
    ],
  ] as const)("%j", (problem, text) => {
    expect(cycleProblemText(problem)).toMatch(text);
  });
});

describe("effectiveBlind", () => {
  it("a blind venue stops being blind for an ACCEPTED cycle: the camera-ready carries the authors", () => {
    const [a, b] = parsed([REJECTED, OPEN]);
    const open = present(b, "open cycle");
    const accepted: Cycle = {
      ...present(a, "closed cycle"),
      outcome: {
        kind: "accepted",
        date: "2026-08-21",
        evidence: "reviews/a.md",
      },
    };
    expect(effectiveBlind(true, { kind: "cycle", cycle: open })).toBe(true);
    expect(effectiveBlind(true, { kind: "accepted", cycle: accepted })).toBe(
      false,
    );
    expect(effectiveBlind(true, { kind: "parked", last: accepted })).toBe(true);
    expect(effectiveBlind(true, { kind: "none" })).toBe(true);
    expect(effectiveBlind(false, { kind: "cycle", cycle: open })).toBe(false);
  });
});
