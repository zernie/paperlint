/**
 * The scheduled refresh's use case over the recorded portal pages (src/adapters/hotcrp/cassette/):
 * what one preset becomes, and what a run prints, writes and returns. No network.
 */
import {
  mkdtempSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { parseDeadlinesPage } from "./adapters/hotcrp/index.ts";
import { jsoncPresets } from "./adapters/jsonc/index.ts";
import { presetFilesIn } from "./adapters/node/index.ts";
import { err } from "./domain/result.ts";
import { presetsDir } from "./package-dirs.ts";
import type { VenueDeadlines } from "./ports/venue-deadlines.ts";
import {
  refreshPreset,
  runRefresh,
  type Outcome,
} from "./refresh-deadlines.ts";
import { parsePreset } from "./tex-requirements.ts";

const PRESETS = presetsDir();
const CASSETTE = join(
  dirname(fileURLToPath(import.meta.url)),
  "adapters",
  "hotcrp",
  "cassette",
);
const MSR = join(PRESETS, "msr.jsonc");
const msrText = readFileSync(MSR, "utf8");

const recorded =
  (site: string, status = 200) =>
  async () =>
    Promise.resolve(
      parseDeadlinesPage(
        status,
        readFileSync(join(CASSETTE, `deadlines-${site}.html`), "utf8"),
      ),
    );

const readings = (text: string, file = MSR) =>
  parsePreset(text, file).deadlines ?? [];

/** A portal that answers `read`, and the JSONC rewriter: what `refreshPreset` reads and writes with. */
const site = (read: VenueDeadlines["read"]) => ({
  portal: (): VenueDeadlines => ({ read }),
  rewriter: jsoncPresets,
});

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

/** Each site's recorded page, by the URL the preset names. */
const bySite = (url: string) =>
  url.includes("acsac") ? recorded("aidc26")() : recorded("msr2027")();

describe("refreshPreset on the recorded MSR 2027 page", () => {
  test("the portal says what the preset says: unchanged — not one byte rewritten, read days kept", async () => {
    const o = await refreshPreset({
      file: MSR,
      text: msrText,
      ...site(recorded("msr2027")),
      today: "2026-10-06",
    });
    expect(o).toEqual({
      kind: "unchanged",
      url: "https://msr2027.hotcrp.com/deadlines",
      notes: [],
    });
  });

  test("the portal moved the submission: that reading changes, with today's read day; the resubmission keeps its own", async () => {
    const earlier = msrText.replace(
      '"at": "2026-10-21T11:59:59Z"',
      '"at": "2026-10-19T04:00:00Z"',
    );
    const o = as(
      await refreshPreset({
        file: MSR,
        text: earlier,
        ...site(recorded("msr2027")),
        today: "2026-10-20",
      }),
      "changed",
    );
    expect(o.changes).toEqual([
      "submission: 2026-10-19T04:00:00Z → 2026-10-21T11:59:59Z",
    ]);
    expect(readings(o.text).map((r) => [r.what, r.at, r.read])).toEqual([
      ["submission", "2026-10-21T11:59:59Z", "2026-10-20"],
      ["resubmission", "2026-10-24T11:59:59Z", "2026-10-19"],
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

describe("refreshPreset — a preset with no readings yet, and the ones it skips", () => {
  test("a preset with a portal and no `deadlines`: the block is inserted after `portal`, and parses", async () => {
    const start = msrText.indexOf("  // Read from the portal");
    const end = msrText.indexOf("  ],\n", start) + "  ],\n".length;
    const bare = msrText.slice(0, start) + msrText.slice(end);
    const o = as(
      await refreshPreset({
        file: MSR,
        text: bare,
        ...site(recorded("msr2027")),
        today: "2026-10-19",
      }),
      "changed",
    );
    expect(o.changes).toEqual([
      "submission: added 2026-10-21T11:59:59Z",
      "resubmission: added 2026-10-24T11:59:59Z",
    ]);
    expect(readings(o.text)).toEqual(readings(msrText));
  });

  test("a preset without a portal, or with one paperlint has no adapter for: nothing to read", async () => {
    const aisec = join(PRESETS, "aisec.jsonc");
    const none = await refreshPreset({
      file: aisec,
      text: readFileSync(aisec, "utf8"),
      ...site(recorded("msr2027")),
      today: "2026-10-05",
    });
    expect(none).toEqual({ kind: "skipped", why: "no portal" });
    const easychair = await refreshPreset({
      file: MSR,
      text: msrText.replace('"kind": "hotcrp"', '"kind": "easychair"'),
      ...site(recorded("msr2027")),
      today: "2026-10-05",
    });
    expect(easychair).toEqual({
      kind: "skipped",
      why: 'portal kind "easychair" is not supported; upload by hand',
    });
  });
});

describe("refreshPreset — a portal that cannot be read is reported, never guessed", () => {
  test.each<[string, () => Promise<Outcome>, RegExp]>([
    [
      "a site that answers 404",
      () =>
        refreshPreset({
          file: MSR,
          text: msrText,
          ...site(recorded("nosuch", 404)),
          today: "2026-10-05",
        }),
      /^HTTP 404: No such conference$/,
    ],
    [
      "a site that does not answer",
      () =>
        refreshPreset({
          file: MSR,
          text: msrText,
          ...site(() =>
            Promise.resolve(
              err({ kind: "unreachable", detail: "connect ECONNREFUSED" }),
            ),
          ),
          today: "2026-10-05",
        }),
      /^unreachable: connect ECONNREFUSED$/,
    ],
    [
      "a page that is not a HotCRP deadlines page",
      () =>
        refreshPreset({
          file: MSR,
          text: msrText,
          ...site(() =>
            Promise.resolve(
              err({ kind: "malformed", httpStatus: 200, detail: "no init" }),
            ),
          ),
          today: "2026-10-05",
        }),
      /^not the page expected \(HTTP 200\): no init$/,
    ],
  ])("%s", async (_what, run, why) => {
    const o = as(await run(), "unreadable");
    expect(o.url).toBe("https://msr2027.hotcrp.com/deadlines");
    expect(o.why).toMatch(why);
  });
});

describe("runRefresh — what it prints and returns", () => {
  test("nothing changed: one line, nothing written, exit 0", async () => {
    const lines: string[] = [];
    const written: string[] = [];
    const code = await runRefresh({
      presets: { ...presetFilesIn(PRESETS), write: (f) => written.push(f) },
      portal: (url) => ({ read: () => bySite(url) }),
      rewriter: jsoncPresets,
      today: "2026-10-06",
      log: (l) => lines.push(l),
      summary: null,
    });
    expect(code).toBe(0);
    expect(written).toEqual([]);
    expect(lines.at(-1)).toMatch(
      /^✓ no deadline changed: \d+ preset\(s\) with a portal read, \d+ skipped$/,
    );
  });

  test("a preset that does not parse is a defect of the repository: exit 1, naming it", async () => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), "deadlines-")));
    writeFileSync(join(dir, "bad.jsonc"), "{ nope");
    const lines: string[] = [];
    const code = await runRefresh({
      presets: presetFilesIn(dir),
      portal: (url) => ({ read: () => bySite(url) }),
      rewriter: jsoncPresets,
      today: "2026-10-06",
      log: (l) => lines.push(l),
      summary: null,
    });
    expect(code).toBe(1);
    expect(lines.join("\n")).toMatch(
      /^::error title=deadlines::bad\.jsonc does not parse: /m,
    );
  });
});

test("a changed preset is written back, and the summary names it", async () => {
  const written: [string, string][] = [];
  const summaries: string[] = [];
  const earlier = msrText.replace(
    '"at": "2026-10-21T11:59:59Z"',
    '"at": "2026-10-19T04:00:00Z"',
  );
  const code = await runRefresh({
    presets: {
      list: () => ["msr.jsonc"],
      read: () => earlier,
      write: (name, text) => written.push([name, text]),
      path: () => MSR,
    },
    portal: () => ({ read: recorded("msr2027") }),
    rewriter: jsoncPresets,
    today: "2026-10-20",
    log: () => undefined,
    summary: (text) => summaries.push(text),
  });
  expect(code).toBe(0);
  expect(written.map(([n, text]) => [n, readings(text)[0]?.at])).toEqual([
    ["msr.jsonc", "2026-10-21T11:59:59Z"],
  ]);
  expect(summaries[0]).toMatch(
    /^- `msr\.jsonc` \(https:\/\/msr2027\.hotcrp\.com\/deadlines\)\n {2}- submission: 2026-10-19T04:00:00Z → 2026-10-21T11:59:59Z$/m,
  );
});
