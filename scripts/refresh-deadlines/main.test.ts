/**
 * The scheduled refresh over the recorded portal pages (src/adapters/hotcrp/cassette/): what one
 * preset becomes, what a run prints, writes and returns, and the npm script the workflow runs —
 * against a local server replaying the MSR page, with no `dist/`.
 */
import { execFile } from "node:child_process";
import {
  cpSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { parseDeadlinesPage } from "../../src/adapters/hotcrp/index.ts";
import { err } from "../../src/domain/result.ts";
import type { VenueDeadlines } from "../../src/ports/venue-deadlines.ts";
import { parsePreset } from "../../src/tex-requirements.ts";
import {
  argsOf,
  refreshPreset,
  runRefresh,
  withDeadlines,
  type Outcome,
} from "./main.ts";

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const PRESETS = join(ROOT, "presets");
const CASSETTE = join(ROOT, "src", "adapters", "hotcrp", "cassette");
const MSR = join(PRESETS, "msr.jsonc");
const msrText = readFileSync(MSR, "utf8");
const readings = (text: string) => parsePreset(text, MSR).deadlines ?? [];
/** MSR with its submission deadline two days before the portal's. */
const earlier = msrText.replace(
  '"at": "2026-10-21T11:59:59Z"',
  '"at": "2026-10-19T04:00:00Z"',
);
const tempDir = (prefix: string) =>
  realpathSync(mkdtempSync(join(tmpdir(), prefix)));

const recorded =
  (site: string, status = 200) =>
  async () =>
    Promise.resolve(
      parseDeadlinesPage(
        status,
        readFileSync(join(CASSETTE, `deadlines-${site}.html`), "utf8"),
      ),
    );
/** A portal that answers `read`. */
const answering = (read: VenueDeadlines["read"]) => (): VenueDeadlines => ({
  read,
});
/** Each site's recorded page, by the URL the preset names. */
const bySite = (url: string): VenueDeadlines => ({
  read: recorded(url.includes("acsac") ? "aidc26" : "msr2027"),
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
      portal: answering(recorded("msr2027")),
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

describe("refreshPreset on the recorded MSR 2027 page", () => {
  test("the portal says what the preset says: unchanged", async () => {
    const o = await refreshPreset({
      file: MSR,
      text: msrText,
      portal: answering(recorded("msr2027")),
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
        portal: answering(recorded("msr2027")),
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
        portal: answering(recorded("msr2027")),
        today: "2026-10-05",
      }),
    ).toEqual(skipped);
    expect(
      await refreshPreset({
        file: MSR,
        text: msrText.replace('"kind": "hotcrp"', '"kind": "easychair"'),
        portal: answering(recorded("msr2027")),
        today: "2026-10-05",
      }),
    ).toEqual(skipped);
  });

  test.each<[string, VenueDeadlines["read"], string]>([
    [
      "a site that answers 404",
      recorded("nosuch", 404),
      "HTTP 404: No such conference",
    ],
    [
      "a site that does not answer",
      () =>
        Promise.resolve(
          err({ kind: "unreachable", detail: "connect ECONNREFUSED" }),
        ),
      "unreachable: connect ECONNREFUSED",
    ],
    [
      "a page that is not a HotCRP deadlines page",
      () =>
        Promise.resolve(
          err({ kind: "malformed", httpStatus: 200, detail: "no init" }),
        ),
      "not the page expected (HTTP 200): no init",
    ],
  ])("%s is reported, never guessed", async (_what, read, why) => {
    expect(
      await refreshPreset({
        file: MSR,
        text: msrText,
        portal: answering(read),
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
  test("nothing changed: one line, no file rewritten, exit 0", async () => {
    const dir = tempDir("deadlines-");
    cpSync(PRESETS, dir, { recursive: true });
    const before = readdirSync(dir)
      .filter((f) => f.endsWith(".jsonc"))
      .map((f) => readFileSync(join(dir, f), "utf8"));
    const lines: string[] = [];
    const code = await runRefresh({
      dir,
      portal: bySite,
      today: "2026-10-06",
      log: (l) => lines.push(l),
      summary: null,
    });
    expect(code).toBe(0);
    expect(
      readdirSync(dir)
        .filter((f) => f.endsWith(".jsonc"))
        .map((f) => readFileSync(join(dir, f), "utf8")),
    ).toEqual(before);
    expect(lines.at(-1)).toMatch(
      /^✓ no deadline changed: 2 preset\(s\) with a portal read, \d+ skipped$/,
    );
  });

  test("a preset that does not parse is a defect of the repository: exit 1, naming it", async () => {
    const dir = tempDir("deadlines-");
    writeFileSync(join(dir, "bad.jsonc"), "{ nope");
    const lines: string[] = [];
    const code = await runRefresh({
      dir,
      portal: bySite,
      today: "2026-10-06",
      log: (l) => lines.push(l),
      summary: join(dir, "summary.md"),
    });
    expect(code).toBe(1);
    expect(lines[0]).toMatch(
      /^::error title=deadlines::bad\.jsonc does not parse: /,
    );
    expect(readFileSync(join(dir, "summary.md"), "utf8")).toMatch(
      /^- 🔴 `bad\.jsonc` does not parse: /m,
    );
  });
});

describe("runRefresh — a changed preset", () => {
  test("a changed preset is written back, and the summary names it", async () => {
    const dir = tempDir("deadlines-");
    writeFileSync(join(dir, "msr.jsonc"), earlier);
    const lines: string[] = [];
    const code = await runRefresh({
      dir,
      portal: bySite,
      today: "2026-10-20",
      log: (l) => lines.push(l),
      summary: join(dir, "summary.md"),
    });
    expect(code).toBe(0);
    expect(readings(readFileSync(join(dir, "msr.jsonc"), "utf8"))[0]?.at).toBe(
      "2026-10-21T11:59:59Z",
    );
    expect(lines.at(-1)).toBe("1 preset(s) changed");
    expect(readFileSync(join(dir, "summary.md"), "utf8")).toMatch(
      /^- `msr\.jsonc` \(https:\/\/msr2027\.hotcrp\.com\/deadlines\)\n {2}- submission: 2026-10-19T04:00:00Z → 2026-10-21T11:59:59Z$/m,
    );
  });
});

const MSR_PAGE = readFileSync(join(CASSETTE, "deadlines-msr2027.html"), "utf8");
const server = createServer((req: IncomingMessage, res: ServerResponse) => {
  const ok = req.url === "/msr/deadlines";
  res.writeHead(ok ? 200 : 404, { "content-type": "text/html" });
  res.end(ok ? MSR_PAGE : '<h1 id="h-title">No such conference</h1>');
});
const base = { url: "" };
beforeAll(async () => {
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const a = server.address();
  base.url = `http://127.0.0.1:${String(typeof a === "object" && a !== null ? a.port : 0)}`;
});
afterAll(
  () =>
    new Promise<void>((r) =>
      server.close(() => {
        r();
      }),
    ),
);

describe("`npm run refresh-deadlines`, the command the workflow runs — with no dist/", () => {
  // A real `node` process: Node strips the types of the script and everything it imports cold —
  // about a second alone, several on a loaded machine, past vitest's 5 s.
  test(
    "rewrites the moved deadline, reports the site it could not read, writes the summary — and exits 0",
    { timeout: 60_000 },
    async () => {
      const dir = tempDir("deadlines-");
      const atServer = (text: string, path: string) =>
        text.split("https://msr2027.hotcrp.com").join(`${base.url}/${path}`);
      writeFileSync(join(dir, "msr.jsonc"), atServer(earlier, "msr"));
      writeFileSync(join(dir, "gone.jsonc"), atServer(msrText, "gone"));
      writeFileSync(join(dir, "notes.md"), "not a preset\n");
      const summary = join(dir, "summary.md");
      // Asynchronously: the local server answers from THIS process, which a synchronous spawn blocks.
      // The inherited NODE_OPTIONS are replaced by test/no-dist.ts, which refuses any module in
      // `dist/` — the job installs with --ignore-scripts.
      const r = await promisify(execFile)(
        "npm",
        [
          "run",
          "-s",
          "refresh-deadlines",
          "--",
          "--presets",
          dir,
          "--summary",
          summary,
        ],
        {
          env: {
            ...process.env,
            NODE_OPTIONS: `--import ${join(ROOT, "test", "no-dist.ts")}`,
          },
          cwd: ROOT,
        },
      ); // rejects on a non-zero exit, with the output
      expect(
        readings(readFileSync(join(dir, "msr.jsonc"), "utf8"))[0]?.at,
      ).toBe("2026-10-21T11:59:59Z");
      expect(r.stdout).toMatch(
        /^::warning title=deadlines::gone\.jsonc: could not read http:\/\/127\.0\.0\.1:\d+\/gone\/deadlines — HTTP 404: No such conference$/m,
      );
      expect(readFileSync(summary, "utf8")).toMatch(
        /^- ⚠️ `gone\.jsonc`: could not read /m,
      );
    },
  );
});

test("argsOf: the repository's presets and no summary by default; a flag without a value is no value", () => {
  expect(argsOf([])).toEqual({ presets: PRESETS, summary: null });
  expect(argsOf(["--presets", "/p", "--summary"])).toEqual({
    presets: "/p",
    summary: null,
  });
});
