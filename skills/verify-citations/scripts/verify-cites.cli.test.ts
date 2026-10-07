/**
 * verify-cites.mjs as a process — the way the verify-citations skill runs it, which is THROUGH A
 * SYMLINK (`.claude/skills/verify-citations -> …/skills/verify-citations`, made by `paperlint
 * init`). Only `--offline` runs here: the online resolvers are driven in-process with a fake
 * `fetch` (verify-cites.net.test.mjs), because a test must not depend on four live APIs.
 */
import assert from "node:assert/strict";
import { readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";
import { z } from "zod";
import { absolutePath } from "#src/domain/paths";
import { bibliographyUnreadWhy } from "#src/paper-sources";
import {
  runNode,
  useTempDir,
  writeTree,
  type ScriptResult,
} from "../../../test/support.ts";

/** The verdicts `verify-cites --json`… prints: one per citation, with the fields these tests read. */
const Verdicts = z.array(
  z.looseObject({
    id: z.unknown().optional(),
    verdict: z.unknown().optional(),
    flags: z.array(z.unknown()).nullish(),
  }),
);
const Cache = z.record(z.string(), z.unknown());

const HERE = dirname(fileURLToPath(import.meta.url));
const root = useTempDir("verify-cites-cli-");
// The skill's own address for the script: a link to the skill directory, as `paperlint init` makes.
symlinkSync(join(HERE, ".."), join(root, "verify-citations"));
const LINKED = join(root, "verify-citations", "scripts", "verify-cites.mjs");

test("run through the skill's symlink, the CLI runs at all (--help prints the usage)", () => {
  assert.deepEqual(runNode(LINKED, ["--help"]), {
    status: 0,
    stdout: "",
    stderr: "usage: verify-cites.mjs <cites.json | refs.bib | -> [--offline]\n",
  });
});

const SCRIPT = join(HERE, "verify-cites.mjs");
const CACHE = join(root, "cache.json");
const env = { VERIFY_CITES_CACHE: CACHE };
writeTree(root, {
  "cites.json": JSON.stringify([
    { id: "a", doi: "10.1/x", title: "A Title Of Some Length" },
    { title: "no id at all" },
    { id: "h", title: "Hygiene", commit: "abc123" },
  ]),
  "one.json": JSON.stringify({ id: "solo", title: "Just One Citation" }),
  "refs.bib": "@article{k, title={A Bib Title}, doi={10.2/y}, year={2020}}\n",
  "bad.json": "{ not json",
  // Loaded with --import before the script: every registry answers 404, so a DOI the authority
  // does not know is FALSE — the one verdict that fails the run.
  "fetch-404.mjs":
    "globalThis.fetch = async () => new Response(null, { status: 404 });\n",
  // Prints the User-Agent of every request, then answers 404.
  "fetch-ua.mjs":
    "globalThis.fetch = async (url, init) => {\n" +
    "  process.stderr.write(`UA ${init.headers['User-Agent']}\\n`);\n" +
    "  return new Response(null, { status: 404 });\n};\n",
  "consumer/paperlint.json": JSON.stringify({ contactEmail: "me@example.org" }),
});
const offline = (
  args: readonly string[],
  opts: { input?: string } = {},
): ScriptResult => runNode(SCRIPT, [...args, "--offline"], { env, ...opts });
const parsed = (r: ScriptResult) => ({
  ...r,
  stdout: Verdicts.parse(JSON.parse(r.stdout)),
});
const SUMMARY_PASS = (n: number, t: number, u: number, flagged: number) =>
  `\nverify-cites: ${String(n)} citation(s) — ${String(t)} true, 0 false (fabrication), ${String(u)} unresolvable` +
  (flagged ? `, ${String(flagged)} with hygiene flag(s)` : "") +
  "\nPASS — no fabrication (unresolvable is advisory)\n";

test("-h is --help", () => {
  assert.equal(
    runNode(SCRIPT, ["-h"]).stderr,
    runNode(SCRIPT, ["--help"]).stderr,
  );
});

test("an input that cannot be read: exit 2, named", () => {
  const r = offline([join(root, "bad.json")]);
  assert.deepEqual(
    { status: r.status, stdout: r.stdout, stderr: r.stderr.split(" — ")[0] },
    { status: 2, stdout: "", stderr: "error: could not read input" },
  );
});

test("a .bib that is not there: exit 2, in bibliographyAt's words", () => {
  // The path → bibliography vocabulary is tested once, beside bibliographyAt (src/paper-sources.ts).
  const gone = join(root, "gone.bib");
  const r = offline([gone]);
  assert.deepEqual(
    { status: r.status, stdout: r.stdout, stderr: r.stderr },
    {
      status: 2,
      stdout: "",
      stderr: `error: could not read input — ${bibliographyUnreadWhy({ kind: "missing", path: absolutePath(gone) })}\n`,
    },
  );
});

test("offline over a JSON list: a citation with no id is unresolvable by name, a short SHA is flagged", () => {
  const r = parsed(offline([join(root, "cites.json")]));
  assert.deepEqual(
    {
      status: r.status,
      ids: r.stdout.map((x) => [x.id, x.verdict, x.flags?.length ?? 0]),
      stderr: r.stderr,
    },
    {
      status: 0,
      ids: [
        ["a", "unresolvable", 0],
        [null, "unresolvable", 0],
        ["h", "unresolvable", 1],
      ],
      stderr: SUMMARY_PASS(3, 0, 3, 1),
    },
  );
});

test("one JSON object on stdin, with `-` and with no path at all", () => {
  const input = readFileSync(join(root, "one.json"), "utf8");
  const dash = parsed(offline(["-"], { input }));
  const bare = parsed(offline([], { input }));
  assert.deepEqual(
    [dash.stdout.map((x) => x.id), bare.stdout.map((x) => x.id), dash.status],
    [["solo"], ["solo"], 0],
  );
});

test("a .bib file is parsed into citations", () => {
  const r = parsed(offline([join(root, "refs.bib")]));
  assert.deepEqual(
    r.stdout.map((x) => x.id),
    ["k"],
  );
});

test("online, a DOI the authority does not know is FALSE: FAIL, exit 1, and the cache is written", () => {
  rmSync(CACHE, { force: true });
  const r = runNode(SCRIPT, [join(root, "refs.bib")], {
    env,
    nodeArgs: ["--import", join(root, "fetch-404.mjs")],
  });
  assert.deepEqual(
    {
      status: r.status,
      verdicts: Verdicts.parse(JSON.parse(r.stdout)).map((x) => x.verdict),
      tail: r.stderr.trim().split("\n").pop(),
      cached: Object.keys(
        Cache.parse(JSON.parse(readFileSync(CACHE, "utf8"))),
      ).sort(),
    },
    {
      status: 1,
      verdicts: ["false"],
      tail: "FAIL — fabrication(s) found (exit 1)",
      // 404s are successful transports, so they are cached; the authority's 100 is not.
      cached: [
        "crossref:doi:10.2/y",
        "openalex:doi:10.2/y",
        "semantic_scholar:doi:10.2/y",
      ],
    },
  );
});

test("a corrupt cache is ignored, and a cache that cannot be written does not fail the run", () => {
  writeFileSync(CACHE, "{ corrupt");
  const corrupt = offline([join(root, "one.json")]);
  const unwritable = runNode(SCRIPT, [join(root, "one.json"), "--offline"], {
    env: { VERIFY_CITES_CACHE: root }, // a directory: reading and writing both fail
  });
  assert.deepEqual([corrupt.status, unwritable.status], [0, 0]);
});

test("the consumer's declared contact reaches every request's User-Agent (Crossref's polite pool)", () => {
  const r = runNode(SCRIPT, [join(root, "refs.bib")], {
    env: { ...env, CLAUDE_PROJECT_DIR: join(root, "consumer") },
    nodeArgs: ["--import", join(root, "fetch-ua.mjs")],
  });
  const agents = new Set(
    r.stderr.split("\n").filter((l) => l.startsWith("UA ")),
  );
  assert.deepEqual(
    [...agents],
    ["UA verify-cites/1.0 (citation gate; mailto:me@example.org)"],
  );
});
