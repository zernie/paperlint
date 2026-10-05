/**
 * A VENUE'S DEADLINE as a paper records it — what each page said (`observed`), and a human's
 * explicit `override` — and the instant that binds: the override, else the EARLIEST reading. Pure.
 */
import { describe, expect, it } from "vitest";
import {
  deadlineOrderProblems,
  deadlinesInForce,
  instantOf,
  instantOfUnix,
  parseDeadlines,
  type Deadline,
  type Reading,
} from "./deadline.ts";

const PORTAL = {
  at: "2026-10-20T04:00:00Z",
  source: "portal",
  url: "https://beta2027.example.org/deadlines",
  read: "2026-10-05",
};
const CALL = {
  at: "2026-10-23 AoE",
  source: "call",
  url: "https://beta2027.example.org/call",
  read: "2026-10-05",
};
const OVERRIDE = {
  at: "2026-10-27T04:00:00Z",
  reason: "the chairs extended the deadline by mail to every author",
  evidence: "mail/extension.eml",
};

const parsed = (input: unknown): readonly Deadline[] => {
  const r = parseDeadlines(input, "cycles[0]");
  if (!r.ok) throw new Error(r.error);
  return r.value;
};

const refusal = (input: unknown): string => {
  const r = parseDeadlines(input, "cycles[0]");
  if (r.ok) throw new Error(`accepted: ${JSON.stringify(r.value)}`);
  return r.error;
};

describe("parseDeadlines — the record", () => {
  it("absent is no deadlines", () => {
    expect(parsed(undefined)).toEqual([]);
  });

  it("holds the portal's AND the call's reading of one deadline, the call's AoE day converted", () => {
    expect(parsed([{ what: "submission", observed: [PORTAL, CALL] }])).toEqual([
      {
        what: "submission",
        observed: [
          PORTAL,
          { ...CALL, at: "2026-10-24T11:59:59Z" }, // the end of 2026-10-23 at UTC−12
        ],
        override: null,
      },
    ]);
  });

  it("holds an override with its reason and evidence, its instant normalised to UTC", () => {
    expect(
      parsed([
        {
          what: "submission",
          observed: [PORTAL],
          override: { ...OVERRIDE, at: "2026-10-27T09:00:00+05:00" },
        },
      ]),
    ).toEqual([
      {
        what: "submission",
        observed: [PORTAL],
        override: OVERRIDE,
      },
    ]);
  });

  it("an override alone is a record: a preset venue's readings come from the preset", () => {
    expect(parsed([{ what: "submission", override: OVERRIDE }])).toEqual([
      { what: "submission", observed: [], override: OVERRIDE },
    ]);
  });
});

describe("parseDeadlines refuses an unknown key ANYWHERE in a deadline, naming it", () => {
  it.each([
    [
      "beside what and observed (an override typed as a plain value under another name)",
      [{ what: "submission", observed: [PORTAL], notes: "x" }],
      /^cycles\[0\]\.deadlines\[0\]: unknown key "notes" — a deadline's keys: what, observed, override$/,
    ],
    [
      "in a reading",
      [{ what: "submission", observed: [{ ...PORTAL, checked: true }] }],
      /^cycles\[0\]\.deadlines\[0\]\.observed\[0\]: unknown key "checked" — a reading's keys: at, source, url, read$/,
    ],
    [
      "in an override",
      [{ what: "submission", override: { ...OVERRIDE, by: "me" } }],
      /^cycles\[0\]\.deadlines\[0\]\.override: unknown key "by" — an override's keys: at, reason, evidence$/,
    ],
  ])("%s", (_what, input, re) => {
    expect(refusal(input)).toMatch(re);
  });
});

describe("parseDeadlines refuses what cannot be in force, naming the place and the cure", () => {
  it.each([
    [
      "an override written as a bare date: it would be silently ignored",
      [{ what: "submission", observed: [PORTAL], override: "2026-10-01 AoE" }],
      /deadlines\[0\]: "override" must be \{ "at", "reason", "evidence" \}/,
    ],
    [
      "an override without a reason",
      [{ what: "submission", override: { ...OVERRIDE, reason: "" } }],
      /deadlines\[0\]\.override: "reason" must say why this instant binds/,
    ],
    [
      "an override without evidence",
      [{ what: "submission", override: { ...OVERRIDE, evidence: undefined } }],
      /deadlines\[0\]\.override: "evidence" must be a file in the paper folder/,
    ],
    [
      "an override whose instant has no zone",
      [{ what: "submission", override: { ...OVERRIDE, at: "2026-10-27" } }],
      /deadlines\[0\]\.override: "at" must be an instant with its zone \(2026-10-20T04:00:00Z\) or a call's "YYYY-MM-DD AoE", got "2026-10-27"/,
    ],
    [
      "a deadline that records nothing",
      [{ what: "submission", observed: [] }],
      /deadlines\[0\]: the "submission" deadline records nothing — add what a page said \("observed"\) or an "override"/,
    ],
    [
      "one deadline in two entries",
      [
        { what: "submission", observed: [PORTAL] },
        { what: "submission", observed: [CALL] },
      ],
      /^cycles\[0\]: the "submission" deadline has two entries \(deadlines\[0\] and deadlines\[1\]\) — one entry per deadline: put every reading of it in that entry's "observed" list$/,
    ],
  ])("%s", (_what, input, re) => {
    expect(refusal(input)).toMatch(re);
  });
});

describe("parseDeadlines refuses a reading that cannot be in force, naming the place and the cure", () => {
  it.each([
    [
      "two readings from one source",
      [
        {
          what: "submission",
          observed: [PORTAL, { ...PORTAL, read: "2026-10-06" }],
        },
      ],
      /deadlines\[0\]: two "portal" readings — keep one per source, the latest \(its "read" says when\)/,
    ],
    [
      "a reading without the day it was read",
      [{ what: "submission", observed: [{ ...PORTAL, read: "today" }] }],
      /observed\[0\]: "read" must be the day the page was read, YYYY-MM-DD/,
    ],
    [
      "a reading from a mail: that is an override, with the mail as its evidence",
      [{ what: "submission", observed: [{ ...PORTAL, source: "email" }] }],
      /observed\[0\]: "source" must be "portal" or "call", got "email" — a deadline moved by mail is an "override", with the mail as its "evidence"/,
    ],
    [
      "a reading with a bare date — the message names the AoE form",
      [{ what: "submission", observed: [{ ...CALL, at: "2026-10-24" }] }],
      /observed\[0\]: "at" must be an instant with its zone \(2026-10-20T04:00:00Z\) or a call's "YYYY-MM-DD AoE", got "2026-10-24"/,
    ],
    [
      "a reading whose instant is a number (Unix seconds)",
      [{ what: "submission", observed: [{ ...PORTAL, at: 1792468800 }] }],
      /observed\[0\]: "at" must be an instant with its zone .*, got 1792468800/,
    ],
    [
      "a reading without the page it was read on",
      [{ what: "submission", observed: [{ ...CALL, url: "" }] }],
      /observed\[0\]: "url" must be where the deadline was read/,
    ],
    [
      "the call's word «abstract» — the message says what each kind is",
      [{ what: "abstract", observed: [CALL] }],
      /"what" must be one of registration \(abstract registration: a call's "abstract" date\), submission \(the full paper: a call's "paper" date\), resubmission \(updates to a completed submission\), notification, camera-ready; got "abstract"/,
    ],
  ])("%s", (_what, input, re) => {
    expect(refusal(input)).toMatch(re);
  });
});

describe("parseDeadlines refuses a value of the wrong shape, naming the place", () => {
  it.each([
    [
      "readings that are not a list",
      [{ what: "submission", observed: PORTAL }],
      /deadlines\[0\]: "observed" must be a list of readings \{ "at", "source", "url", "read" \}/,
    ],
    [
      "a reading that is not an object",
      [{ what: "submission", observed: ["2026-10-20T04:00:00Z"] }],
      /observed\[0\]: a reading must be \{ "at", "source", "url", "read" \}/,
    ],
    [
      "a deadline that is not an object",
      ["2026-10-20T04:00:00Z"],
      /deadlines\[0\]: a deadline must be \{ "what", "observed": \[ … \], "override"\? \}/,
    ],
    [
      "deadlines that are not a list",
      { what: "submission" },
      /^cycles\[0\]: "deadlines" must be a list/,
    ],
    [
      "two bad deadlines: the first is named",
      ["x", "y"],
      /deadlines\[0\]: a deadline must be/,
    ],
    [
      "two bad readings: the first is named",
      [{ what: "submission", observed: ["x", "y"] }],
      /observed\[0\]: a reading must be/,
    ],
  ])("%s", (_what, input, re) => {
    expect(refusal(input)).toMatch(re);
  });
});

const reading = (
  what: Reading["what"],
  at: string,
  source: Reading["source"] = "portal",
): Reading => ({
  what,
  at,
  source,
  url: `https://example.org/${source}`,
  read: "2026-10-05",
});

/** `reading("submission", "2026-10-20T04:00:00Z")` as a deadline's reading: no `what`. */
const PORTAL_READ = {
  at: "2026-10-20T04:00:00Z",
  source: "portal",
  url: "https://example.org/portal",
  read: "2026-10-05",
};

describe("deadlinesInForce — the override, else the EARLIEST reading", () => {
  it("the portal and the call disagree: the earlier binds, and both readings are kept", () => {
    const own = parsed([{ what: "submission", observed: [CALL] }]);
    const preset = [reading("submission", "2026-10-20T04:00:00Z")];
    expect(deadlinesInForce(own, preset)).toEqual([
      {
        what: "submission",
        at: "2026-10-20T04:00:00Z",
        by: { kind: "reading", reading: PORTAL_READ },
        readings: [PORTAL_READ, { ...CALL, at: "2026-10-24T11:59:59Z" }],
      },
    ]);
  });

  it("an override wins over every reading, even a later one", () => {
    const own = parsed([{ what: "submission", override: OVERRIDE }]);
    const [d] = deadlinesInForce(own, [
      reading("submission", "2026-10-20T04:00:00Z"),
    ]);
    expect(d?.at).toBe("2026-10-27T04:00:00Z");
    expect(d?.by).toEqual({ kind: "override", override: OVERRIDE });
  });

  it("derived from the preset alone, in the order of the kinds; a tie keeps the first reading", () => {
    const preset = [
      reading("resubmission", "2026-10-23T04:00:00Z"),
      reading("submission", "2026-10-20T04:00:00Z"),
      reading("submission", "2026-10-20T04:00:00Z", "call"),
    ];
    const got = deadlinesInForce([], preset);
    expect(got.map((d) => [d.what, d.at, d.by.kind])).toEqual([
      ["submission", "2026-10-20T04:00:00Z", "reading"],
      ["resubmission", "2026-10-23T04:00:00Z", "reading"],
    ]);
    expect(got[0]?.by).toEqual({ kind: "reading", reading: PORTAL_READ });
  });

  it("nothing recorded, nothing in force", () => {
    expect(deadlinesInForce([], [])).toEqual([]);
  });
});

describe("deadlineOrderProblems — within ONE source; across sources is the disagreement the record holds", () => {
  it("the portal's submission before the call's abstract day is not a problem: the earlier binds", () => {
    // MSR 2027, as recorded 2026-10-05: the portal closes completed submissions on Oct 20, 04:00 UTC;
    // the call names Oct 20 AoE for the abstract and Oct 23 AoE for the paper.
    const own = parsed([
      {
        what: "registration",
        observed: [{ ...CALL, at: "2026-10-20 AoE" }],
      },
      { what: "submission", observed: [CALL] },
    ]);
    const preset = [
      reading("submission", "2026-10-20T04:00:00Z"),
      reading("resubmission", "2026-10-23T04:00:00Z"),
    ];
    expect(deadlineOrderProblems(own, preset)).toEqual([]);
  });

  it("registration ≤ submission ≤ resubmission < notification < camera-ready, per source", () => {
    const own = parsed([
      {
        what: "registration",
        observed: [{ ...CALL, at: "2026-10-25 AoE" }],
      },
      { what: "submission", observed: [CALL] },
    ]);
    const preset = [
      reading("camera-ready", "2027-01-01T00:00:00Z"),
      reading("notification", "2027-02-01T00:00:00Z"),
    ];
    expect(deadlineOrderProblems(own, preset)).toEqual([
      'the portal\'s "notification" (2027-02-01T00:00:00Z) is after its "camera-ready" (2027-01-01T00:00:00Z)',
      'the call\'s "registration" (2026-10-26T11:59:59Z) is after its "submission" (2026-10-24T11:59:59Z)',
    ]);
  });

  it("overrides are typed by a human and are checked against each other", () => {
    const own = parsed([
      {
        what: "registration",
        override: { ...OVERRIDE, at: "2026-10-28T04:00:00Z" },
      },
      { what: "submission", override: OVERRIDE },
    ]);
    expect(deadlineOrderProblems(own, [])).toEqual([
      'the override of "registration" (2026-10-28T04:00:00Z) is after the override of "submission" (2026-10-27T04:00:00Z)',
    ]);
  });
});

describe("instantOf", () => {
  it("Unix seconds, as a portal gives them, are an instant in UTC", () => {
    expect(instantOfUnix(1792468800)).toBe("2026-10-20T04:00:00Z");
  });

  it("refuses a day that is no day, as AoE and as a zoned instant", () => {
    expect(instantOf("2026-13-45 AoE").ok).toBe(false);
    expect(instantOf("2026-13-45T00:00:00Z").ok).toBe(false);
  });

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
