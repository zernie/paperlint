/**
 * `cycle/record` and `cycle/evidence` on a paper folder's settings file: both halves of each — the
 * finding on a planted defect, silence on a consistent record and on the flat form.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { memoryFiles } from "./adapters/memory/index.ts";
import { presetsDir } from "./package-dirs.ts";
import { cycleRules } from "./cycle-rules.ts";

const VENUES = presetsDir();
const DIR = "/work/papers/p";
/** The shipped presets, so a cycle naming `paperlint:msr` resolves through the memory files. */
const SHIPPED = Object.fromEntries(
  readdirSync(VENUES)
    .filter((f) => f.endsWith(".jsonc"))
    .map((f) => [join(VENUES, f), readFileSync(join(VENUES, f), "utf8")]),
);

interface Reported {
  readonly rule: string;
  readonly messageId: string;
  readonly message: string;
}

const closed = {
  id: "alpha-2026",
  venue: { kind: "preset", extends: "paperlint:acm-sigconf" },
  kind: "short",
  opened: "2026-07-01",
  outcome: {
    kind: "rejected",
    date: "2026-09-08",
    desk: true,
    evidence: "reviews/alpha-decision.md",
  },
};
const open = {
  id: "beta-2027",
  venue: { kind: "preset", extends: "paperlint:ieee-conference" },
  kind: "technical",
  opened: "2026-09-09",
  deadlines: [
    {
      what: "submission",
      observed: [
        {
          at: "2026-10-20T04:00:00Z",
          source: "portal",
          url: "https://beta2027.example.org/deadlines",
          read: "2026-09-09",
        },
      ],
    },
  ],
};
const CALL = {
  source: "call",
  url: "https://2027.msrconf.org/track/msr-2027-technical-papers",
  read: "2026-10-05",
};
/** A cycle at the shipped `paperlint:msr`, whose preset carries the portal's readings. */
const msr = (deadlines: readonly object[]) => ({
  id: "msr-2027",
  venue: { kind: "preset", extends: "paperlint:msr" },
  kind: "technical",
  opened: "2026-10-05",
  deadlines,
});
const OVERRIDE = {
  at: "2026-10-27T04:00:00Z",
  reason: "the chairs extended the deadline by mail",
  evidence: "mail/extension.eml",
};

/** Every cycle rule over the paper folder holding `settings` (a string: the raw file) and `extra` files. */
function lint(
  settings: object | string | undefined,
  extra: Readonly<Record<string, string>> = {},
  file = "PIPELINE-STATUS.md",
): Reported[] {
  const files = memoryFiles({
    ...(settings === undefined
      ? {}
      : {
          [`${DIR}/paperlint.json`]:
            typeof settings === "string" ? settings : JSON.stringify(settings),
        }),
    ...SHIPPED,
    ...extra,
  });
  const out: Reported[] = [];
  Object.entries(cycleRules({ files, venuesDir: VENUES })).forEach(
    ([name, rule]) => {
      rule
        .create({
          filename: `${DIR}/${file}`,
          sourceCode: { getLocFromIndex: () => ({ line: 1, column: 0 }) },
          report: (d) => {
            const template = rule.meta.messages[d.messageId] ?? "";
            out.push({
              rule: `cycle/${name}`,
              messageId: d.messageId,
              message: Object.entries(d.data).reduce(
                (m, [k, v]) => m.split(`{{${k}}}`).join(String(v)),
                template,
              ),
            });
          },
        })
        .root?.();
    },
  );
  return out;
}

const EVIDENCE = { [`${DIR}/reviews/alpha-decision.md`]: "# decision\n" };

describe("cycle/record", () => {
  it("reports on PIPELINE-STATUS.md only — any other file in the folder gets nothing", () => {
    expect(lint({ cycles: [open, open] }, {}, "paper.tex")).toEqual([]);
  });

  it("a consistent record with its evidence on disk: every cycle rule is silent", () => {
    expect(lint({ cycles: [closed, open] }, EVIDENCE)).toEqual([]);
  });

  it("the flat form, no settings file, or a file that is not JSON: silent — not this rule's to say", () => {
    expect(lint({ extends: "paperlint:aidc", kind: "regular" })).toEqual([]);
    expect(lint(undefined)).toEqual([]);
    expect(lint("{ not json")).toEqual([]);
  });

  it("two open cycles: `broken`, naming both and the cure", () => {
    const [f] = lint({
      cycles: [{ ...closed, outcome: { kind: "open" } }, open],
    });
    expect(f?.messageId).toBe("broken");
    expect(f?.message).toMatch(
      /^paperlint\.json: cycles «alpha-2026» and «beta-2027» are both open/,
    );
  });

  it("a deadline without its zone: `broken`, naming the entry and the key", () => {
    const bad = msr([
      { what: "submission", observed: [{ ...CALL, at: "2026-10-23" }] },
    ]);
    const m: unknown = expect.stringMatching(
      /^paperlint\.json: cycles\[0\]\.deadlines\[0\]\.observed\[0\]: "at" must be an instant with its zone/,
    );
    expect(lint({ cycles: [bad] }).map((f) => f.message)).toEqual([m]);
  });
});

describe("cycle/record — the deadlines, over the venue preset's readings", () => {
  it("MSR 2027 as a newcomer records the call: abstract → registration, paper → submission; the preset's portal readings are derived — silent", () => {
    // The portal's submission (2026-10-20T04:00Z, from the preset) is earlier than the call's
    // registration (the end of 2026-10-20 AoE): two sources disagreeing, not a typo.
    const fs = lint({
      cycles: [
        msr([
          {
            what: "registration",
            observed: [{ ...CALL, at: "2026-10-20 AoE" }],
          },
          { what: "submission", observed: [{ ...CALL, at: "2026-10-23 AoE" }] },
        ]),
      ],
    });
    expect(fs).toEqual([]);
  });

  it("the call's own dates out of order: `order`, naming the cycle and the source", () => {
    const fs = lint({
      cycles: [
        msr([
          {
            what: "registration",
            observed: [{ ...CALL, at: "2026-10-25 AoE" }],
          },
          { what: "submission", observed: [{ ...CALL, at: "2026-10-23 AoE" }] },
        ]),
      ],
    });
    expect(fs.map((f) => f.messageId)).toEqual(["order"]);
    expect(fs[0]?.message).toBe(
      'paperlint.json, cycle «msr-2027»: the call\'s "registration" (2026-10-26T11:59:59Z) is after its "submission" (2026-10-24T11:59:59Z) — a date typed wrong, or an AoE day miscounted (write a call\'s date as "YYYY-MM-DD AoE" and paperlint converts it)',
    );
  });
});

describe("cycle/record — a portal reading beside the preset's", () => {
  it("a portal reading of a deadline the venue's preset already carries: `presetCopy`, naming the preset's reading", () => {
    const fs = lint({
      cycles: [
        msr([
          {
            what: "submission",
            observed: [
              {
                at: "2026-10-20T04:00:00Z",
                source: "portal",
                url: "https://msr2027.hotcrp.com/deadlines",
                read: "2026-10-01",
              },
            ],
          },
        ]),
      ],
    });
    expect(fs.map((f) => f.message)).toEqual([
      "paperlint.json, cycle «msr-2027»: the \"submission\" deadline records a portal reading, and the preset paperlint:msr carries the portal's reading of it (2026-10-20T04:00:00Z, read 2026-10-05) — a second copy drifts when paperlint updates the preset: delete this one (the call's reading and an override stay)",
    ]);
  });

  it("a portal reading of a venue whose preset carries none, or a named venue: the paper's to record — silent", () => {
    expect(lint({ cycles: [open] })).toEqual([]);
    expect(
      lint({
        cycles: [
          {
            ...open,
            venue: {
              kind: "named",
              name: "Beta '27",
              url: "https://beta.example.org",
            },
          },
        ],
      }),
    ).toEqual([]);
  });

  it("a cycle whose preset does not resolve: its readings are judged alone (pdf/profile names the preset)", () => {
    expect(
      lint({
        cycles: [
          { ...open, venue: { kind: "preset", extends: "paperlint:nosuch" } },
        ],
      }),
    ).toEqual([]);
  });
});

describe("cycle/evidence", () => {
  it("a closed cycle whose evidence file is not in the folder: `missing`, with the path", () => {
    const fs = lint({ cycles: [closed, open] });
    expect(fs.map((f) => f.rule)).toEqual(["cycle/evidence"]);
    expect(fs[0]?.message).toMatch(
      /^cycle «alpha-2026» is rejected \(2026-09-08\) with evidence `reviews\/alpha-decision\.md`, which is not in the paper folder/,
    );
  });

  it("an override whose evidence is not in the folder: `overrideMissing`; on disk: silent", () => {
    const settings = {
      cycles: [msr([{ what: "submission", override: OVERRIDE }])],
    };
    expect(lint(settings).map((f) => [f.rule, f.message])).toEqual([
      [
        "cycle/evidence",
        'cycle «msr-2027»: the override of the "submission" deadline (2026-10-27T04:00:00Z) rests on `mail/extension.eml`, which is not in the paper folder — save the mail or the page that grants it there, or correct the path',
      ],
    ]);
    expect(
      lint(settings, { [`${DIR}/mail/extension.eml`]: "From: chairs\n" }),
    ).toEqual([]);
  });

  it("an open cycle owes no evidence; a broken record is `cycle/record`'s alone", () => {
    expect(lint({ cycles: [open] })).toEqual([]);
    expect(
      lint({ cycles: [{ ...closed, outcome: { kind: "open" } }, open] }).map(
        (f) => f.rule,
      ),
    ).toEqual(["cycle/record"]);
  });
});
