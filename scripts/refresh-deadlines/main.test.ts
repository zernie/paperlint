/**
 * The entry of the scheduled refresh: the npm script the workflow runs, end to end, and the
 * command line and files main.ts hands the logic.
 */
import { execFile } from "node:child_process";
import {
  mkdtempSync,
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
import { parsePreset } from "#src/tex-requirements";
import { argsOf, presetsIn, summaryTo } from "./main.ts";
import { FROZEN_DIR, frozenText } from "../../test/frozen-presets.ts";

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const PRESETS = join(ROOT, "presets");
const CASSETTE = join(ROOT, "src", "adapters", "hotcrp", "cassette");
// Frozen at the portal's reading of 2026-10-19 (test/frozen-presets.ts): the shipped file's dates
// are the refresh's own output.
const MSR = join(FROZEN_DIR, "msr.jsonc");
const msrText = frozenText("msr.jsonc");
const readings = (text: string) => parsePreset(text, MSR).deadlines ?? [];
/** MSR with its submission deadline two days before the portal's. */
const earlier = msrText.replace(
  '"at": "2026-10-21T11:59:59Z"',
  '"at": "2026-10-19T04:00:00Z"',
);
const tempDir = (prefix: string) =>
  realpathSync(mkdtempSync(join(tmpdir(), prefix)));

const MSR_HTML = readFileSync(join(CASSETTE, "deadlines-msr2027.html"), "utf8");
const server = createServer((req: IncomingMessage, res: ServerResponse) => {
  const ok = req.url === "/msr/deadlines";
  res.writeHead(ok ? 200 : 404, { "content-type": "text/html" });
  res.end(ok ? MSR_HTML : '<h1 id="h-title">No such conference</h1>');
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

// The one end-to-end test: main.ts's isMain block wires the real HotCRP adapter, run against the cassette.
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
        /^::warning title=deadlines::gone\.jsonc: could not read http:\/\/127\.0\.0\.1:\d+\/gone\/deadlines — the portal refused \(HTTP 404\): No such conference$/m,
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

test("presetsIn: the *.jsonc files of a directory, sorted, read and written there; summaryTo: a file, or nowhere", () => {
  const dir = tempDir("presets-");
  writeFileSync(join(dir, "b.jsonc"), "B");
  writeFileSync(join(dir, "a.jsonc"), "A");
  writeFileSync(join(dir, "notes.md"), "not a preset");
  const p = presetsIn(dir);
  p.write("a.jsonc", "A2");
  summaryTo(join(dir, "s.md"))?.("body\n");
  expect([
    p.names,
    p.read("a.jsonc"),
    p.path("b.jsonc"),
    readFileSync(join(dir, "s.md"), "utf8"),
    summaryTo(null),
  ]).toStrictEqual([
    ["a.jsonc", "b.jsonc"],
    "A2",
    join(dir, "b.jsonc"),
    "body\n",
    null,
  ]);
});
