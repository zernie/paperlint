/**
 * `cycle/record` and `cycle/evidence` on a paper folder's settings file: both halves of each — the
 * finding on a planted defect, silence on a consistent record and on the flat form.
 */
import { describe, expect, it } from "vitest";
import { memoryFiles } from "./adapters/memory/index.ts";
import { presetsDir } from "./package-dirs.ts";
import { cycleRules } from "./cycle-rules.ts";

const VENUES = presetsDir();
const DIR = "/work/papers/p";

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
      at: "2026-10-20T04:00:00Z",
      source: "portal",
      url: "https://beta2027.example.org/deadlines",
    },
  ],
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
    const bad = {
      ...open,
      deadlines: [{ ...open.deadlines[0], at: "2026-10-20" }],
    };
    const m: unknown = expect.stringMatching(
      /^paperlint\.json: cycles\[0\]\.deadlines\[0\]: "at" must be an instant with its zone/,
    );
    expect(lint({ cycles: [bad] }).map((f) => f.message)).toEqual([m]);
  });

  it("deadlines out of order: `order`, once per problem, naming the cycle", () => {
    const late = {
      what: "registration",
      at: "2026-10-21T11:59:59Z",
      source: "call",
      url: "https://example.org/cfp",
    };
    const fs = lint({
      cycles: [{ ...open, deadlines: [...open.deadlines, late] }],
    });
    expect(fs.map((f) => f.messageId)).toEqual(["order"]);
    expect(fs[0]?.message).toMatch(
      /cycle «beta-2027»: the "registration" deadline \(2026-10-21T11:59:59Z\) is after the "submission" deadline/,
    );
  });

  it("reports on PIPELINE-STATUS.md only — any other file in the folder gets nothing", () => {
    expect(lint({ cycles: [open, open] }, {}, "paper.tex")).toEqual([]);
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

  it("an open cycle owes no evidence; a broken record is `cycle/record`'s alone", () => {
    expect(lint({ cycles: [open] })).toEqual([]);
    expect(
      lint({ cycles: [{ ...closed, outcome: { kind: "open" } }, open] }).map(
        (f) => f.rule,
      ),
    ).toEqual(["cycle/record"]);
  });
});
