/**
 * `paper/edition-over` (`src/edition-rule.ts`) on papers held in memory beside the SHIPPED presets,
 * with the clock fixed: the warning when every deadline of the paper's edition has passed, naming
 * the newer editions of its series; silence while one is still ahead, and with nothing to judge.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { memoryFiles } from "./adapters/memory/index.ts";
import { presetsDir } from "./package-dirs.ts";
import {
  EDITION_RULE_LEVELS,
  editionRules,
  judgeEdition,
} from "./edition-rule.ts";
import { venuePreset } from "../test/support.ts";

const VENUES = presetsDir();
const PAPERS = "/work/papers";
const shipped = Object.fromEntries(
  readdirSync(VENUES)
    .filter((f) => f.endsWith(".jsonc") || f.endsWith(".json"))
    .map((f) => [join(VENUES, f), readFileSync(join(VENUES, f))]),
);

/** The rule over one paper's PIPELINE-STATUS.md at the instant `now`: each message, as ESLint words it. */
function lint(
  settings: object,
  now: string,
  {
    file = "PIPELINE-STATUS.md",
    extra = {},
  }: { file?: string; extra?: Record<string, string> } = {},
): string[] {
  const dir = `${PAPERS}/p`;
  const files = memoryFiles({
    ...shipped,
    [`${dir}/paperlint.json`]: JSON.stringify(settings),
    ...extra,
  });
  const rule = editionRules({ files, venuesDir: VENUES, now: () => now })[
    "edition-over"
  ];
  const out: string[] = [];
  rule
    .create({
      filename: `${dir}/${file}`,
      sourceCode: { getLocFromIndex: () => ({ line: 1, column: 0 }) },
      report: (d) => {
        out.push(
          Object.entries(d.data).reduce(
            (m, [k, v]) => m.split(`{{${k}}}`).join(String(v)),
            rule.meta.messages[d.messageId] ?? "",
          ),
        );
      },
    })
    .root?.();
  return out;
}

const reading = (what: string, at: string) => ({
  what,
  at,
  source: "call",
  url: "https://example.org/cfp",
  read: "2026-11-19",
});

describe("paper/edition-over — every deadline of the edition has passed", () => {
  it("🔴 the edition is over: warned once, naming the last deadline", () => {
    expect(
      lint(
        { extends: "paperlint:aidc-2026", kind: "regular" },
        "2027-01-01T00:00:00Z",
      ),
    ).toEqual([
      'AIDC 2026 is over: every deadline its preset records has passed, the last (camera-ready) at 2026-11-09T11:59:59Z. paperlint ships no newer edition of it yet; if the paper goes elsewhere, point "extends" at that venue',
    ]);
  });

  it("🔴 a newer edition of the series ships: it is named", () => {
    const own = `${PAPERS}/p/icse-2026.jsonc`;
    const extra = {
      [own]: JSON.stringify(
        venuePreset("ICSE", {
          extends: "paperlint:icse-2028",
          deadlines: [reading("submission", "2025-07-02T11:59:59Z")],
        }),
      ),
    };
    expect(
      lint({ extends: "./icse-2026.jsonc" }, "2026-11-19T00:00:00Z", { extra }),
    ).toEqual([
      'ICSE 2026 is over: every deadline its preset records has passed, the last (submission) at 2025-07-02T11:59:59Z. paperlint ships a newer edition: paperlint:icse-2027, paperlint:icse-2028 — if the paper goes there, point "extends" at it',
    ]);
  });
});

describe("paper/edition-over — silent", () => {
  it.each<[string, object, string]>([
    [
      "a deadline is still ahead",
      { extends: "paperlint:aidc-2026", kind: "regular" },
      "2026-11-01T00:00:00Z",
    ],
    [
      "at the last deadline's very instant",
      { extends: "paperlint:aidc-2026", kind: "regular" },
      "2026-11-09T11:59:59Z",
    ],
    [
      "an edition whose preset records no deadline",
      { extends: "paperlint:agenticdev-2026", kind: "short" },
      "2030-01-01T00:00:00Z",
    ],
    [
      "a template family",
      { extends: "paperlint:acm-sigconf" },
      "2030-01-01T00:00:00Z",
    ],
    ["no extends", { extends: null }, "2030-01-01T00:00:00Z"],
    [
      "an extends that does not resolve — pdf/profile says so",
      { extends: "paperlint:nope" },
      "2030-01-01T00:00:00Z",
    ],
  ])("%s", (_, settings, now) => {
    expect(lint(settings, now)).toEqual([]);
  });

  it("judged once per paper, on PIPELINE-STATUS.md only", () => {
    expect(
      lint({ extends: "paperlint:aidc-2026" }, "2030-01-01T00:00:00Z", {
        file: "paper.tex",
      }),
    ).toEqual([]);
  });

  it("a preset of one's own without a year in its id: over, and no series to look up", () => {
    expect(
      judgeEdition(
        {
          id: "mine",
          label: "Mine",
          year: null,
          deadlines: [
            {
              ...reading("submission", "2026-01-01T00:00:00Z"),
              what: "submission",
              source: "call",
            },
          ],
        },
        "2026-02-01T00:00:00Z",
        ["mine-2027"],
      ).map((f) => f.messageId),
    ).toEqual(["overNoNewer"]);
  });
});

it("the level: a warning — the move to another edition is the author's call", () => {
  expect(EDITION_RULE_LEVELS).toEqual({ "paper/edition-over": "warn" });
});
