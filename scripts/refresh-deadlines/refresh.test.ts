/**
 * The refresh's logic: what one preset becomes, what a run prints, writes and returns — over a
 * fake VenueDeadlines port that answers plain domain values (how HotCRP's page is parsed is
 * src/adapters/hotcrp/deadlines.test.ts's) and presets held in memory.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import type { PortalDeadlines } from "#src/domain/deadline";
import { err, ok, type Result } from "#src/domain/result";
import type { PortalFailure } from "#src/domain/submission";
import type { VenueDeadlines } from "#src/ports/venue-deadlines";
import { parsePreset } from "#src/tex-requirements";
import { FROZEN_DIR, frozenText } from "../../test/frozen-presets.ts";
import {
  refreshPreset,
  runRefresh,
  withDeadlines,
  type Outcome,
  type PresetFiles,
} from "./refresh.ts";

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const PRESETS = join(ROOT, "presets");
// The logic is tested over presets FROZEN at the portal's reading of 2026-10-19 (test/frozen-presets.ts):
// the shipped files' dates are the refresh's own output, and a test of the refresh that read them
// would turn red on the refresh's own pull request.
const MSR = join(FROZEN_DIR, "msr.jsonc");
const msrText = frozenText("msr.jsonc");
const readings = (text: string) => parsePreset(text, MSR).deadlines ?? [];
/** MSR with its submission deadline two days before the portal's. */
const earlier = msrText.replace(
  '"at": "2026-10-21T11:59:59Z"',
  '"at": "2026-10-19T04:00:00Z"',
);
/** Presets held in memory, by name: what a run reads, and what it writes back. */
function inMemory(files: Readonly<Record<string, string>>) {
  const written: Record<string, string> = {};
  const presets: PresetFiles = {
    names: Object.keys(files).toSorted(),
    read: (name) => files[name] ?? "",
    write: (name, text) => {
      written[name] = text;
    },
    path: (name) => join(FROZEN_DIR, name),
  };
  return { presets, written };
}

/** What MSR 2027's portal lists — the readings the frozen msr.jsonc holds. */
const MSR_PAGE: PortalDeadlines = {
  now: 1792434476,
  open: true,
  blind: true,
  deadlines: [
    {
      what: "submission",
      label: "Submission deadline",
      at: "2026-10-21T11:59:59Z",
    },
    {
      what: "resubmission",
      label: "Resubmission deadline",
      at: "2026-10-24T11:59:59Z",
    },
  ],
};
/** What AIDC 2026's portal lists — the readings presets/aidc.jsonc holds. */
const AIDC_PAGE: PortalDeadlines = {
  now: 1791194489,
  open: true,
  blind: true,
  deadlines: [
    {
      what: "submission",
      label: "Submission deadline",
      at: "2026-10-03T11:59:59Z",
    },
    { what: "camera-ready", label: "camera-ready", at: "2026-10-31T11:59:59Z" },
  ],
};
/** A portal that answers `answer`. */
const answering =
  (answer: Result<PortalDeadlines, PortalFailure>) => (): VenueDeadlines => ({
    read: () => Promise.resolve(answer),
  });
/** Each site's page, by the URL the preset names. */
const bySite = (url: string): VenueDeadlines =>
  answering(ok(url.includes("acsac") ? AIDC_PAGE : MSR_PAGE))();

/** The outcome, known to be of `kind` — or the test fails naming what it was. */
function as<K extends Outcome["kind"]>(
  o: Outcome,
  kind: K,
): Extract<Outcome, { kind: K }> {
  const isKind = (x: Outcome): x is Extract<Outcome, { kind: K }> =>
    x.kind === kind;
  if (!isKind(o)) throw new Error(`expected ${kind}, got ${JSON.stringify(o)}`);
  return o;
}

describe("withDeadlines — the `deadlines` value replaced by jsonc-parser, everything else as written", () => {
  test("writing back the readings the file holds gives the file's own bytes", async () => {
    expect(await withDeadlines(msrText, MSR, readings(msrText))).toBe(msrText);
  });
});

test("a preset with a portal and no `deadlines` yet: each reading added, the block right after `portal`", async () => {
  const start = msrText.indexOf("  // Read from the portal");
  const end = msrText.indexOf("  ],\n", start) + "  ],\n".length;
  const o = as(
    await refreshPreset({
      file: MSR,
      text: msrText.slice(0, start) + msrText.slice(end),
      portal: answering(ok(MSR_PAGE)),
      today: "2026-10-19",
    }),
    "changed",
  );
  expect(o.changes).toEqual([
    "submission: added 2026-10-21T11:59:59Z",
    "resubmission: added 2026-10-24T11:59:59Z",
  ]);
  expect(readings(o.text)).toEqual(readings(msrText));
  expect(o.text).toMatch(
    /"url": "https:\/\/msr2027\.hotcrp\.com",\n {2}\},\n {2}"deadlines": \[/,
  );
});

describe("refreshPreset on MSR 2027's page", () => {
  test("the portal says what the preset says: unchanged", async () => {
    const o = await refreshPreset({
      file: MSR,
      text: msrText,
      portal: answering(ok(MSR_PAGE)),
      today: "2026-10-06",
    });
    expect(o).toEqual({
      kind: "unchanged",
      url: "https://msr2027.hotcrp.com/deadlines",
      notes: [],
    });
  });

  test("the portal moved the submission: only that reading changes, with today's read day", async () => {
    const o = as(
      await refreshPreset({
        file: MSR,
        text: earlier,
        portal: answering(ok(MSR_PAGE)),
        today: "2026-10-20",
      }),
      "changed",
    );
    expect(o.changes).toEqual([
      "submission: 2026-10-19T04:00:00Z → 2026-10-21T11:59:59Z",
    ]);
    // Only the deadlines block differs: the comments and every other key are the file's own.
    expect(o.text).toBe(
      msrText.replace(
        '"read": "2026-10-19",\n    },\n    {\n      "what": "resubmission"',
        '"read": "2026-10-20",\n    },\n    {\n      "what": "resubmission"',
      ),
    );
  });
});

describe("refreshPreset — what it skips, and a portal it cannot read", () => {
  test("a preset without a portal, or with one paperlint has no adapter for, is skipped", async () => {
    const aisec = join(PRESETS, "aisec.jsonc");
    const skipped = { kind: "skipped" };
    expect(
      await refreshPreset({
        file: aisec,
        text: readFileSync(aisec, "utf8"),
        portal: answering(ok(MSR_PAGE)),
        today: "2026-10-05",
      }),
    ).toEqual(skipped);
    expect(
      await refreshPreset({
        file: MSR,
        text: msrText.replace('"kind": "hotcrp"', '"kind": "easychair"'),
        portal: answering(ok(MSR_PAGE)),
        today: "2026-10-05",
      }),
    ).toEqual(skipped);
  });

  test.each<[string, PortalFailure, string]>([
    [
      "a site that answers 404",
      {
        kind: "refused",
        httpStatus: 404,
        messages: [
          { message: "No such conference", field: null, status: null },
        ],
      },
      "the portal refused (HTTP 404): No such conference",
    ],
    [
      "a site that does not answer",
      { kind: "unreachable", detail: "connect ECONNREFUSED" },
      "the portal cannot be reached: connect ECONNREFUSED",
    ],
    [
      "a page that is not the one expected",
      { kind: "malformed", httpStatus: 200, detail: "no init" },
      "the portal answered HTTP 200, but not as its API does: no init",
    ],
  ])("%s is reported, never guessed", async (_what, failure, why) => {
    expect(
      await refreshPreset({
        file: MSR,
        text: msrText,
        portal: answering(err(failure)),
        today: "2026-10-05",
      }),
    ).toEqual({
      kind: "unreadable",
      url: "https://msr2027.hotcrp.com/deadlines",
      why,
    });
  });
});

describe("runRefresh — what it prints, writes and returns", () => {
  test("nothing changed: one line, no preset written, exit 0", async () => {
    const { presets, written } = inMemory(
      Object.fromEntries(
        readdirSync(FROZEN_DIR)
          .filter((f) => f.endsWith(".jsonc"))
          .map((f) => [f, frozenText(f)]),
      ),
    );
    const lines: string[] = [];
    const code = await runRefresh({
      presets,
      portal: bySite,
      today: "2026-10-06",
      log: (l) => lines.push(l),
      summary: null,
    });
    expect([code, written]).toStrictEqual([0, {}]);
    expect(lines.at(-1)).toMatch(
      /^✓ no deadline changed: 2 preset\(s\) with a portal read, \d+ skipped$/,
    );
  });

  test("a preset that does not parse is a defect of the repository: exit 1, naming it", async () => {
    const lines: string[] = [];
    const summaries: string[] = [];
    const code = await runRefresh({
      presets: inMemory({ "bad.jsonc": "{ nope" }).presets,
      portal: bySite,
      today: "2026-10-06",
      log: (l) => lines.push(l),
      summary: (text) => summaries.push(text),
    });
    expect(code).toBe(1);
    expect(lines[0]).toMatch(
      /^::error title=deadlines::bad\.jsonc does not parse: /,
    );
    expect(summaries[0]).toMatch(/^- 🔴 `bad\.jsonc` does not parse: /m);
  });
});

describe("runRefresh — a changed preset", () => {
  test("a changed preset is written back, and the summary names it", async () => {
    const { presets, written } = inMemory({ "msr.jsonc": earlier });
    const lines: string[] = [];
    const summaries: string[] = [];
    const code = await runRefresh({
      presets,
      portal: bySite,
      today: "2026-10-20",
      log: (l) => lines.push(l),
      summary: (text) => summaries.push(text),
    });
    expect(code).toBe(0);
    expect(readings(written["msr.jsonc"] ?? "")[0]?.at).toBe(
      "2026-10-21T11:59:59Z",
    );
    expect(lines.at(-1)).toBe("1 preset(s) changed");
    expect(summaries[0]).toMatch(
      /^- `msr\.jsonc` \(https:\/\/msr2027\.hotcrp\.com\/deadlines\)\n {2}- submission: 2026-10-19T04:00:00Z → 2026-10-21T11:59:59Z$/m,
    );
  });
});
