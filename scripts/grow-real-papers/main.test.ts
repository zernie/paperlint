/**
 * The command line: its options, a dry run that writes nothing, `--write` staging into a directory
 * laid out as `fixtures/` is, and a resumed run reading the log it left. The world is a temp
 * directory and a fake `Get`; the spawned CLI is given a queries file that asks for nothing.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { z } from "zod";
import {
  parseJson,
  runNode,
  useTempDir,
  writeTree,
} from "../../test/support.ts";
import { argsOf, FIXTURES, run, type Args, type World } from "./main.ts";
import { fakeGet, mainTex, tarGz } from "./testkit.ts";

const NOW = Date.parse("2026-11-20T00:00:00Z");
const DEFAULT_QUERIES = join(
  FIXTURES,
  "real-papers",
  "accepted",
  "sampling",
  "queries.json",
);

describe("the options", () => {
  test.each([
    [
      [],
      { queries: DEFAULT_QUERIES, only: null, deadline: Infinity, write: null },
    ],
    [
      [
        "--only",
        "ml,nlp",
        "--minutes",
        "30",
        "--deadline",
        "2026-11-20T00:10:00Z",
        "--write",
        "out",
        "--queries",
        "q.json",
      ],
      {
        queries: "q.json",
        only: ["ml", "nlp"],
        deadline: NOW + 600_000,
        write: resolve("out"),
      },
    ],
    [
      ["--minutes", "1"],
      {
        queries: DEFAULT_QUERIES,
        only: null,
        deadline: NOW + 60_000,
        write: null,
      },
    ],
  ])("%j", (argv, args) => {
    // Guards: the parsed command line; the earlier of the two limits wins.
    expect(argsOf(argv, NOW)).toEqual(args);
  });

  test.each([
    [["--force"], "unknown option --force"],
    [
      ["--minutes", "soon"],
      "--minutes takes a number and --deadline an ISO date",
    ],
    [["--deadline"], "--minutes takes a number and --deadline an ISO date"],
    [["--write"], "--write takes the fixtures directory to stage into"],
  ])("%j is refused", (argv, message) => {
    // Guards: each refusal by its message.
    expect(argsOf(argv, NOW)).toBe(message);
  });
});

const BY = "http://creativecommons.org/licenses/by/4.0/";
const queriesJson = JSON.stringify({
  hardCap: 5,
  maxPages: 1,
  quotas: { nlp: 2 },
  slots: [
    {
      field: "nlp",
      series: "ACL",
      year: 2025,
      cap: 2,
      queries: ['co:"ACL 2025"'],
      max_results: 50,
      venue: "acl",
      classSpec: "acl",
    },
  ],
});
const entry = (id: string) =>
  `<entry><id>http://arxiv.org/abs/${id}</id><updated>2025-05-01</updated><title>T</title><arxiv:comment>Accepted at ACL 2025</arxiv:comment></entry>`;
const camera = tarGz([
  {
    name: "main.tex",
    body: mainTex("Hi.", "\\documentclass{article}\\usepackage{acl}"),
  },
]);

const TMP = useTempDir("grow-main-");
const ids = (path: string) =>
  z
    .array(z.object({ arxiv_id: z.string() }))
    .parse(parseJson(readFileSync(path, "utf8")))
    .map((e) => e.arxiv_id);

/** A fixtures tree with one earlier entry, one preprint, and a world over a fake `Get`. */
function setup(name: string) {
  const root = join(TMP, name);
  writeTree(root, {
    "fixtures/venue-manifest.json": JSON.stringify([
      { arxiv_id: "old", field: "nlp" },
    ]),
    "fixtures/arxiv-manifest.json": JSON.stringify([{ arxiv_id: "pre1v1" }]),
    "presets/acl-2025.jsonc": "{}",
    "presets/README.md": "",
    "queries.json": queriesJson,
  });
  const { get, asked } = fakeGet([
    ["api/query", `<feed>${entry("pre1v2")}${entry("k1v1")}</feed>`],
    ["oai2", `<license>${BY}</license>`],
    ["src/", camera],
  ]);
  const out: string[] = [];
  const world: World = {
    get,
    now: () => NOW,
    log: (l) => out.push(l),
    fixtures: join(root, "fixtures"),
    presets: join(root, "presets"),
  };
  const args = (write: string | null): Args => ({
    queries: join(root, "queries.json"),
    only: null,
    deadline: Infinity,
    write,
  });
  return { root, world, out, asked, args };
}

describe("a run", () => {
  test("a dry run prints each decision and every staged path, and writes nothing", async () => {
    const s = setup("dry");
    const before = readdirSync(join(s.root, "fixtures"));
    // Guards: a dry run succeeds.
    expect(await run(s.args(null), s.world)).toBe(0);
    // Guards: the printed record, in order (it is the output).
    expect(s.out).toEqual([
      "#1 pre1v2 ACL 2025: rejected — already in the corpora",
      "#2 k1v1 ACL 2025: kept — passes rules 1-4",
      "    stage paper.tex",
      "    stage record-by-hand.json",
      "    stage PIPELINE-STATUS.md",
      "    stage paperlint.json",
      "    stage README.md",
      "nlp/ACL 2025: full at rank 2",
      "dry run: 1 paper(s) would be added; nothing written (--write DIR stages them)",
    ]);
    // Guards: nothing written into fixtures/.
    expect(readdirSync(join(s.root, "fixtures"))).toEqual(before);
  });
});

describe("a run with --write", () => {
  test("--write stages into the directory, and a rerun resumes from its log", async () => {
    const s = setup("write");
    const out = join(s.root, "staged");
    expect(await run(s.args(out), s.world)).toBe(0);
    const sampling = join(out, "real-papers", "accepted", "sampling");
    const reasons = readFileSync(join(sampling, "probe-log.jsonl"), "utf8")
      .trim()
      .split("\n")
      .map((l) => z.object({ reason: z.string() }).parse(parseJson(l)).reason);
    // Guards: one log line per candidate, with its reason.
    expect(reasons).toEqual(["already in the corpora", "passes rules 1-4"]);
    const notes = z
      .record(z.string(), z.unknown())
      .parse(
        parseJson(readFileSync(join(sampling, "staging-notes.json"), "utf8")),
      );
    // Guards: the paper's directory, its note and its manifest entry.
    expect([
      readdirSync(join(out, "real-papers", "accepted", "k1v1")).toSorted(),
      Object.keys(notes),
      ids(join(out, "venue-manifest.json")),
    ]).toEqual([
      [
        "PIPELINE-STATUS.md",
        "README.md",
        "paper.tex",
        "paperlint.json",
        "record-by-hand.json",
      ],
      ["k1v1"],
      ["k1v1"],
    ]);
    const asked = s.asked.length;
    s.out.length = 0;
    expect(await run(s.args(out), s.world)).toBe(0);
    // Guards: the rerun counts the staged paper, so the quota of 2 is met and nothing is asked.
    expect([s.out, s.asked.length]).toEqual([
      ["staged 0 paper(s) into " + out],
      asked,
    ]);
  });
});

describe("a run with --write that stops halfway", () => {
  test("a paper whose files fail to write is not logged as kept, so a rerun judges it again", async () => {
    const s = setup("broken");
    const out = join(s.root, "staged");
    // A file where the paper's directory must go makes staging its files fail.
    writeTree(out, { "real-papers/accepted/k1v1": "" });
    await expect(run(s.args(out), s.world)).rejects.toThrow();
    const log = join(
      out,
      "real-papers",
      "accepted",
      "sampling",
      "probe-log.jsonl",
    );
    const outcomes = readFileSync(log, "utf8")
      .trim()
      .split("\n")
      .map((l) =>
        z.object({ id: z.string(), outcome: z.string() }).parse(parseJson(l)),
      );
    // Guards: only the decision whose staging finished is in the log.
    expect(outcomes).toEqual([{ id: "pre1v2", outcome: "rejected" }]);
  });
});

describe("a run with --write into fixtures/", () => {
  test("a second paper adds to the staged notes and manifest", async () => {
    const s = setup("inplace");
    const out = join(s.root, "fixtures");
    writeFileSync(
      join(s.root, "queries.json"),
      queriesJson.replace('"nlp": 2', '"nlp": 3'),
    );
    // Guards: staging in place (--write fixtures) appends to the existing manifest.
    expect(await run(s.args(out), s.world)).toBe(0);
    expect(ids(join(out, "venue-manifest.json"))).toEqual(["old", "k1v1"]);
  });
});

describe("the command", () => {
  test("refuses a bad option with exit 2, and runs a queries file that asks for nothing", () => {
    const main = join(import.meta.dirname, "main.ts");
    const bad = runNode(main, ["--write"]);
    // Guards: a bad command line exits 2 with its reason.
    expect([bad.status, bad.stderr.trim()]).toEqual([
      2,
      "--write takes the fixtures directory to stage into",
    ]);
    const root = join(TMP, "cli");
    writeTree(root, {
      "q.json": JSON.stringify({
        hardCap: 5,
        maxPages: 1,
        quotas: {},
        slots: [],
      }),
    });
    const ok = runNode(main, ["--queries", join(root, "q.json")]);
    // Guards: no slot, no request, a dry run that says so.
    expect([ok.status, ok.stdout.trim()]).toEqual([
      0,
      "dry run: 0 paper(s) would be added; nothing written (--write DIR stages them)",
    ]);
  });
});

describe("a run whose search fails", () => {
  test("prints the edition's error", async () => {
    const s = setup("fails");
    const world: World = { ...s.world, get: fakeGet([]).get };
    // Guards: a failed search still ends the run cleanly.
    expect(await run(s.args(null), world)).toBe(0);
    // Guards: the edition's end names the error.
    expect(s.out).toEqual([
      'nlp/ACL 2025: search error at rank 0 (co:"ACL 2025" page 0: 404)',
      "dry run: 0 paper(s) would be added; nothing written (--write DIR stages them)",
    ]);
  });
});
