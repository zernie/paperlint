/**
 * The entry of the scheduled refresh, run as `.github/workflows/deadlines.yml` runs it — `npm run
 * refresh-deadlines` against a local server replaying the recorded MSR page, with no `dist/` — and
 * its command line. What one preset becomes is tested beside the use case
 * (src/refresh-deadlines.test.ts).
 */
import assert from "node:assert/strict";
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
  type Server,
  type ServerResponse,
} from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { parsePreset } from "../src/tex-requirements.ts";
import { argsOf, summaryWriter } from "./refresh-deadlines.ts";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const PRESETS = join(ROOT, "presets");
const CASSETTE = join(ROOT, "src", "adapters", "hotcrp", "cassette");
const MSR = join(PRESETS, "msr.jsonc");
const msrText = readFileSync(MSR, "utf8");
const readings = (text: string) => parsePreset(text, MSR).deadlines ?? [];

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
      '"at": "2026-10-21T11:59:59Z"',
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

describe("🔴 `npm run refresh-deadlines`, the command the workflow runs — with no dist/", () => {
  // A real `node` process: Node strips the types of the script and everything it imports (TypeScript's
  // JSON parser, Prettier) cold — about a second alone, several on a loaded machine, past vitest's 5 s.
  test(
    "rewrites the moved deadline, reports the site it could not read, writes the summary — and exits 0",
    {
      timeout: 60_000,
    },
    async () => {
      const dir = presetsDirWith();
      const summary = join(dir, "summary.md");
      // Asynchronously: the local server answers from THIS process, which a synchronous spawn blocks.
      // The workflow's own command: the npm script. The inherited NODE_OPTIONS are replaced by
      // test/no-dist.ts, which refuses any module in `dist/` — the job installs with --ignore-scripts.
      const env = {
        ...process.env,
        NODE_OPTIONS: `--import ${join(ROOT, "test", "no-dist.ts")}`,
      };
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
        { env, cwd: ROOT },
      ); // rejects on a non-zero exit, with the output
      expect(
        readings(readFileSync(join(dir, "msr.jsonc"), "utf8"))[0]?.at,
      ).toBe("2026-10-21T11:59:59Z");
      expect(r.stdout).toMatch(
        /^::warning title=deadlines::gone\.jsonc: could not read http:\/\/127\.0\.0\.1:\d+\/gone\/deadlines — HTTP 404: No such conference$/m,
      );
      const md = readFileSync(summary, "utf8");
      expect(md).toMatch(
        /^- `msr\.jsonc` \(http:\/\/127\.0\.0\.1:\d+\/msr\/deadlines\)\n {2}- submission: 2026-10-19T04:00:00Z → 2026-10-21T11:59:59Z$/m,
      );
      expect(md).toMatch(/could not read/);
    },
  );
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

test("summaryWriter: no --summary writes nothing; a path is written whole", () => {
  expect(summaryWriter(null)).toBeNull();
  const file = join(realpathSync(mkdtempSync(join(tmpdir(), "sum-"))), "s.md");
  summaryWriter(file)?.("body\n");
  expect(readFileSync(file, "utf8")).toBe("body\n");
});
