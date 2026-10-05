/**
 * The scheduled refresh of the shipped presets' deadlines, on the HotCRP pages recorded in
 * `src/adapters/hotcrp/cassette/` — never the network. Both halves: an unchanged portal leaves the
 * preset's bytes alone (no pull request every day), a moved deadline rewrites that reading and its
 * `read` day only; a portal that cannot be read is REPORTED and does not fail the run.
 */
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  mkdtempSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { parseDeadlinesPage } from "../src/adapters/hotcrp/index.ts";
import { err } from "../src/domain/result.ts";
import { parsePreset } from "../src/tex-requirements.ts";
import {
  argsOf,
  main,
  refreshPreset,
  refreshReadings,
  withDeadlines,
  type Outcome,
} from "./refresh-deadlines.ts";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const PRESETS = join(ROOT, "presets");
const CASSETTE = join(ROOT, "src", "adapters", "hotcrp", "cassette");
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
      read: recorded("msr2027"),
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
      '"at": "2026-10-20T04:00:00Z"',
      '"at": "2026-10-19T04:00:00Z"',
    );
    const o = as(
      await refreshPreset({
        file: MSR,
        text: earlier,
        read: recorded("msr2027"),
        today: "2026-10-06",
      }),
      "changed",
    );
    expect(o.changes).toEqual([
      "submission: 2026-10-19T04:00:00Z → 2026-10-20T04:00:00Z",
    ]);
    expect(readings(o.text).map((r) => [r.what, r.at, r.read])).toEqual([
      ["submission", "2026-10-20T04:00:00Z", "2026-10-06"],
      ["resubmission", "2026-10-23T04:00:00Z", "2026-10-05"],
    ]);
    // Only the deadlines block differs: the comments and every other key are the file's own.
    expect(o.text).toBe(
      msrText.replace(
        '"read": "2026-10-05",\n    },\n    {\n      "what": "resubmission"',
        '"read": "2026-10-06",\n    },\n    {\n      "what": "resubmission"',
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
        read: recorded("msr2027"),
        today: "2026-10-05",
      }),
      "changed",
    );
    expect(o.changes).toEqual([
      "submission: added 2026-10-20T04:00:00Z",
      "resubmission: added 2026-10-23T04:00:00Z",
    ]);
    expect(readings(o.text)).toEqual(readings(msrText));
  });

  test("a preset without a portal, or with one paperlint has no adapter for: nothing to read", async () => {
    const aisec = join(PRESETS, "aisec.jsonc");
    const none = await refreshPreset({
      file: aisec,
      text: readFileSync(aisec, "utf8"),
      read: recorded("msr2027"),
      today: "2026-10-05",
    });
    expect(none).toEqual({ kind: "skipped", why: "no portal" });
    const easychair = await refreshPreset({
      file: MSR,
      text: msrText.replace('"kind": "hotcrp"', '"kind": "easychair"'),
      read: recorded("msr2027"),
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
          read: recorded("nosuch", 404),
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
          read: () =>
            Promise.resolve(
              err({ kind: "unreachable", detail: "connect ECONNREFUSED" }),
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
          read: () =>
            Promise.resolve(
              err({ kind: "malformed", httpStatus: 200, detail: "no init" }),
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

const reading = (
  what: "submission" | "resubmission" | "camera-ready",
  at: string,
  source: "portal" | "call" = "portal",
) => ({
  what,
  at,
  source,
  url: "https://x.example/deadlines",
  read: "2026-10-01",
});
const page = (
  deadlines: readonly {
    what: "submission" | "camera-ready" | null;
    at: string;
  }[],
) => ({
  now: 1,
  open: true,
  blind: true,
  deadlines: deadlines.map((d) => ({ ...d, label: String(d.what) })),
});

describe("refreshReadings — what the page says, over what the preset said", () => {
  test("a reading the portal no longer lists is kept and noted; a call's reading is never touched", () => {
    const r = refreshReadings(
      [
        reading("submission", "2026-10-20T04:00:00Z"),
        reading("submission", "2026-10-21T11:59:59Z", "call"),
        reading("camera-ready", "2026-12-01T00:00:00Z"),
      ],
      page([{ what: "submission", at: "2026-10-20T04:00:00Z" }]),
      "https://x.example/deadlines",
      "2026-10-06",
    );
    expect(r.changes).toEqual([]);
    expect(r.notes).toEqual([
      "camera-ready: no longer on the page — kept as read 2026-10-01",
    ]);
    expect(r.readings).toEqual([
      reading("submission", "2026-10-20T04:00:00Z"),
      reading("submission", "2026-10-21T11:59:59Z", "call"),
      reading("camera-ready", "2026-12-01T00:00:00Z"),
    ]);
  });

  test("a kind the page lists twice binds at the earlier instant; a label paperlint names no kind for is left out", () => {
    const r = refreshReadings(
      [],
      page([
        { what: "submission", at: "2026-10-22T04:00:00Z" },
        { what: "submission", at: "2026-10-20T04:00:00Z" },
        { what: null, at: "2026-09-01T00:00:00Z" },
      ]),
      "https://x.example/deadlines",
      "2026-10-06",
    );
    expect(r.readings).toEqual([
      {
        what: "submission",
        at: "2026-10-20T04:00:00Z",
        source: "portal",
        url: "https://x.example/deadlines",
        read: "2026-10-06",
      },
    ]);
    expect(r.notes).toEqual([
      "submission: the page lists 2026-10-20T04:00:00Z, 2026-10-22T04:00:00Z — the earliest is recorded",
    ]);
  });
});

describe("withDeadlines — located on the JSONC's syntax tree, not by text", () => {
  test.each([
    ["an object with no portal", "{}"],
    ["a list", "[]"],
    ["nothing", ""],
  ])(
    "%s has no `portal` to put `deadlines` after: refused by name",
    async (_what, text) => {
      await expect(withDeadlines(text, "x.jsonc", [])).rejects.toThrow(
        'x.jsonc: no "portal" to put "deadlines" after',
      );
    },
  );

  test("writing back the readings the file holds gives the file's own bytes", async () => {
    expect(await withDeadlines(msrText, MSR, readings(msrText))).toBe(msrText);
  });
});

// ── main, and the script as the workflow runs it ─────────────────────────────────────

const MSR_PAGE = readFileSync(join(CASSETTE, "deadlines-msr2027.html"), "utf8");
const server = createServer((req: IncomingMessage, res: ServerResponse) => {
  const ok = req.url === "/msr/deadlines";
  res.writeHead(ok ? 200 : 404, { "content-type": "text/html" });
  res.end(ok ? MSR_PAGE : '<h1 id="h-title">No such conference</h1>');
});
const portOf = (s: Server): number => {
  const a = s.address();
  assert.ok(a !== null && typeof a === "object", "the server is not listening");
  return a.port;
};
let base = "";
beforeAll(async () => {
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${String(portOf(server))}`;
});
afterAll(
  () =>
    new Promise<void>((r) => {
      server.close(() => {
        r();
      });
    }),
);

/** A presets directory of the test's own: MSR pointing at the local server one day early, and a site that is gone. */
function presetsDirWith(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "deadlines-")));
  const atServer = (path: string) =>
    msrText.split("https://msr2027.hotcrp.com").join(`${base}/${path}`);
  writeFileSync(
    join(dir, "msr.jsonc"),
    atServer("msr").replace(
      '"at": "2026-10-20T04:00:00Z"',
      '"at": "2026-10-19T04:00:00Z"',
    ),
  );
  writeFileSync(join(dir, "gone.jsonc"), atServer("gone"));
  writeFileSync(
    join(dir, "aisec.jsonc"),
    readFileSync(join(PRESETS, "aisec.jsonc")),
  );
  writeFileSync(join(dir, "notes.md"), "not a preset\n");
  return dir;
}

describe("the script, as .github/workflows/deadlines.yml runs it", () => {
  test("rewrites the moved deadline, reports the site it could not read, writes the summary — and exits 0", async () => {
    const dir = presetsDirWith();
    const summary = join(dir, "summary.md");
    // Asynchronously: the local server answers from THIS process, which a synchronous spawn blocks.
    const r = await promisify(execFile)(process.execPath, [
      join(ROOT, "scripts", "refresh-deadlines.ts"),
      "--presets",
      dir,
      "--summary",
      summary,
    ]); // rejects on a non-zero exit, with the output
    expect(readings(readFileSync(join(dir, "msr.jsonc"), "utf8"))[0]?.at).toBe(
      "2026-10-20T04:00:00Z",
    );
    expect(r.stdout).toMatch(
      /^::warning title=deadlines::gone\.jsonc: could not read http:\/\/127\.0\.0\.1:\d+\/gone\/deadlines — HTTP 404: No such conference$/m,
    );
    const md = readFileSync(summary, "utf8");
    expect(md).toMatch(
      /^- `msr\.jsonc` \(http:\/\/127\.0\.0\.1:\d+\/msr\/deadlines\)\n {2}- submission: 2026-10-19T04:00:00Z → 2026-10-20T04:00:00Z$/m,
    );
    expect(md).toMatch(/could not read/);
  });
});

describe("main — what it prints and returns", () => {
  test("nothing changed: one line, nothing written, exit 0", async () => {
    const lines: string[] = [];
    const written: string[] = [];
    const code = await main({
      presetsDir: PRESETS,
      read: bySite,
      today: "2026-10-06",
      log: (l) => lines.push(l),
      write: (f) => written.push(f),
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
    const code = await main({
      presetsDir: dir,
      read: bySite,
      today: "2026-10-06",
      log: (l) => lines.push(l),
      write: () => undefined,
      summary: null,
    });
    expect(code).toBe(1);
    expect(lines.join("\n")).toMatch(
      /^::error title=deadlines::bad\.jsonc does not parse: /m,
    );
  });
});

describe("argsOf", () => {
  test("defaults to the repository's presets and no summary; a flag without a value is no value", () => {
    expect(argsOf([])).toEqual({
      presets: join(ROOT, "presets"),
      summary: null,
    });
    expect(argsOf(["--presets", "/p", "--summary"])).toEqual({
      presets: "/p",
      summary: null,
    });
  });
});
