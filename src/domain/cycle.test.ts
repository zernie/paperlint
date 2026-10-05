/**
 * THE CYCLE — one attempt of a paper at a venue, parsed from `cycles` in `paperlint.json`, and the
 * current attempt derived from the list. Pure.
 */
import { describe, expect, it } from "vitest";
import { present } from "../../test/support.ts";
import {
  currentCycle,
  cycleProblemText,
  deadlineOrderProblems,
  effectiveBlind,
  instantOf,
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
      at: "2026-08-06T11:59:00Z",
      source: "call",
      url: "https://example.org/cfp",
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
      at: "2026-10-20T04:00:00Z",
      source: "portal",
      url: "https://beta2027.example.org/deadlines",
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
          at: "2026-08-06T11:59:00Z",
          source: "call",
          url: "https://example.org/cfp",
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
      "a deadline of an unknown kind",
      [{ ...OPEN, deadlines: [{ ...OPEN.deadlines[0], what: "abstract" }] }],
      /"what" must be one of registration, submission, resubmission, notification, camera-ready/,
    ],
    [
      "a deadline without a time zone",
      [{ ...OPEN, deadlines: [{ ...OPEN.deadlines[0], at: "2026-10-20" }] }],
      /"at" must be an instant with its zone/,
    ],
    [
      "a deadline whose source is neither portal nor call",
      [{ ...OPEN, deadlines: [{ ...OPEN.deadlines[0], source: "email" }] }],
      /"source" must be "portal" or "call"/,
    ],
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

describe("instantOf", () => {
  it("accepts an ISO instant with Z or an offset, normalised to Z", () => {
    expect(instantOf("2026-10-20T04:00:00Z")).toEqual({
      ok: true,
      value: "2026-10-20T04:00:00Z",
    });
    expect(instantOf("2026-10-20T09:00:00+05:00")).toEqual({
      ok: true,
      value: "2026-10-20T04:00:00Z",
    });
  });

  it("turns a call's `YYYY-MM-DD AoE` into the instant it means: the end of that day at UTC-12", () => {
    // «October 2, 2026 (AoE)» ends at 2026-10-03T11:59:59Z — the day after, in UTC.
    expect(instantOf("2026-10-02 AoE")).toEqual({
      ok: true,
      value: "2026-10-03T11:59:59Z",
    });
    expect(instantOf("2026-12-31 AoE")).toEqual({
      ok: true,
      value: "2027-01-01T11:59:59Z",
    });
  });

  it("refuses a bare date, a bare local time and nonsense: an instant without a zone is the deadline people get wrong", () => {
    for (const bad of ["2026-10-20", "2026-10-20T04:00:00", "soon", ""]) {
      const r = instantOf(bad);
      expect(r.ok, bad).toBe(false);
    }
  });
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

describe("deadlineOrderProblems", () => {
  const dl = (what: string, at: string) => ({
    what,
    at,
    source: "call",
    url: "https://example.org/cfp",
  });
  it("registration ≤ submission ≤ resubmission < notification < camera-ready is silent", () => {
    const [c] = parsed([
      {
        ...OPEN,
        deadlines: [
          dl("registration", "2026-10-13T11:59:59Z"),
          dl("submission", "2026-10-20T04:00:00Z"),
          dl("resubmission", "2026-10-23T04:00:00Z"),
          dl("notification", "2027-01-08T11:59:00Z"),
          dl("camera-ready", "2027-02-01T11:59:00Z"),
        ],
      },
    ]);
    expect(deadlineOrderProblems(present(c, "cycle").deadlines)).toEqual([]);
  });

  it("names the pair that is out of order, and a kind recorded twice", () => {
    const [c] = parsed([
      {
        ...OPEN,
        deadlines: [
          dl("submission", "2026-10-20T04:00:00Z"),
          dl("registration", "2026-10-21T11:59:59Z"),
          dl("submission", "2026-10-22T04:00:00Z"),
        ],
      },
    ]);
    expect(deadlineOrderProblems(present(c, "cycle").deadlines)).toEqual([
      'the "submission" deadline is recorded twice',
      'the "registration" deadline (2026-10-21T11:59:59Z) is after the "submission" deadline (2026-10-20T04:00:00Z)',
    ]);
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
    expect(effectiveBlind(true, { kind: "cycle", cycle: accepted })).toBe(
      false,
    );
    expect(effectiveBlind(true, { kind: "parked", last: accepted })).toBe(
      false,
    );
    expect(effectiveBlind(true, { kind: "none" })).toBe(true);
    expect(effectiveBlind(false, { kind: "cycle", cycle: open })).toBe(false);
  });
});
