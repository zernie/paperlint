/**
 * The command line: its options, a dry run that writes nothing, `--write` staging into a directory
 * laid out as `fixtures/` is, and a resumed run reading the log it left. The world is a temp
 * directory and a fake `Get`; the spawned CLI is given a queries file that asks for nothing.
 */
import { execFileSync } from "node:child_process";
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
import { argsOf, FIXTURES, gitCommitted, run, type World } from "./main.ts";
import { NOW, queriesJson, setup } from "./main.testkit.ts";
import { fakeGet } from "./testkit.ts";

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
      {
        queries: DEFAULT_QUERIES,
        only: null,
        deadline: Infinity,
        write: null,
        summary: false,
      },
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
        summary: false,
      },
    ],
    [
      ["--minutes", "1"],
      {
        queries: DEFAULT_QUERIES,
        only: null,
        deadline: NOW + 60_000,
        write: null,
        summary: false,
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

const TMP = useTempDir("grow-main-");
const ids = (path: string) =>
  z
    .array(z.object({ arxiv_id: z.string() }))
    .parse(parseJson(readFileSync(path, "utf8")))
    .map((e) => e.arxiv_id);

describe("a run", () => {
  test("a dry run prints each decision and every staged path, and writes nothing", async () => {
    const s = setup(join(TMP, "dry"));
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
      "field | total / quota | kept (this run) | probed (this run) | yield | top 3 rejection reasons",
      "nlp | 2 / 2 | 1 | 2 | 50.0% | already in the corpora (1)",
      "edition | count / cap",
      "ACL 2025 | 1 / 5",
      "every walk finished",
      "next: commit the quotas, then rerun with --write fixtures",
    ]);
    // Guards: nothing written into fixtures/.
    expect(readdirSync(join(s.root, "fixtures"))).toEqual(before);
  });
});

describe("a run with --write", () => {
  test("--write stages into the directory, and a rerun resumes from its log", async () => {
    const s = setup(join(TMP, "write"));
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
    expect([s.out[0], s.out.at(-1), s.asked.length]).toEqual([
      "staged 0 paper(s) into " + out,
      "next: npx vitest run fixtures/real-papers/balance.test.ts fixtures/real-papers/inputs.test.ts",
      asked,
    ]);
  });
});

describe("a run with --write that stops halfway", () => {
  test("a paper whose files fail to write is not logged as kept, so a rerun judges it again", async () => {
    const s = setup(join(TMP, "broken"));
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
    const s = setup(join(TMP, "inplace"));
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
    const printed = ok.stdout.trim().split("\n");
    // Guards: no slot, no request, a dry run that says so and names the next step.
    expect([ok.status, printed[0], printed.at(-1)]).toEqual([
      0,
      "dry run: 0 paper(s) would be added; nothing written (--write DIR stages them)",
      "next: commit the quotas, then rerun with --write fixtures",
    ]);
  });
});

describe("a run whose search fails", () => {
  test("prints the edition's error", async () => {
    const s = setup(join(TMP, "fails"));
    const world: World = { ...s.world, get: fakeGet([]).get };
    // Guards: a failed search is an unfinished run: exit 1.
    expect(await run(s.args(null), world)).toBe(1);
    // Guards: the edition's end names the error, and the summary repeats it with the cure.
    expect([s.out[0], ...s.out.slice(-2)]).toEqual([
      'nlp/ACL 2025: search error at rank 0 (co:"ACL 2025" page 0: 404)',
      'not finished: nlp/ACL 2025 ended by search error (co:"ACL 2025" page 0: 404); rerun to resume',
      "next: rerun the same command to finish the walks",
    ]);
  });
});

describe("the guards", () => {
  test("--write refuses while the queries file is not committed, and asks nothing", async () => {
    const s = setup(join(TMP, "uncommitted"));
    const world: World = { ...s.world, committed: () => false };
    // Guards: exit 2, one line naming the file, no request made.
    expect([await run(s.args(join(s.root, "out")), world), s.asked]).toEqual([
      2,
      [],
    ]);
    expect(s.out).toEqual([
      `refusing --write: ${join(s.root, "queries.json")} has changes git has not committed; commit the quotas first, as they are fixed before collecting`,
    ]);
  });

  test("--summary reads the log, fetches nothing, and fails on a kept id the manifest lacks", async () => {
    const s = setup(join(TMP, "summary"));
    // Guards: no log yet: the summary alone, exit 0, no request.
    expect([
      await run(s.args(null, true), s.world),
      s.out.at(-1),
      s.asked,
    ]).toEqual([0, "ACL 2025 | 0 / 5", []]);
    const log = join(s.root, "fixtures", "real-papers", "accepted", "sampling");
    writeTree(log, {
      "probe-log.jsonl": `${JSON.stringify({ id: "gone1", field: "nlp", series: "ACL", year: 2025, rank: 1, query: "q", source: "arxiv-comment", acceptance: "arxiv-comment", outcome: "kept", reason: "passes rules 1-4" })}\n`,
    });
    // Guards: a kept line with no manifest entry fails by name.
    expect([await run(s.args(null, true), s.world), s.out.at(-1)]).toEqual([
      1,
      "❌ kept in the log but not in venue-manifest.json: gone1",
    ]);
  });

  test("gitCommitted: tracked and clean only", () => {
    const repo = join(TMP, "repo");
    writeTree(repo, { "q.json": "{}", "new.json": "{}" });
    const git = (...a: string[]) =>
      execFileSync("git", [
        "-C",
        repo,
        "-c",
        "user.name=t",
        "-c",
        "user.email=t@example.com",
        ...a,
      ]);
    git("init", "-q");
    git("add", "q.json");
    git("commit", "-qm", "q");
    const clean = gitCommitted(join(repo, "q.json"));
    writeFileSync(join(repo, "q.json"), "{ }");
    // Guards: clean is committed; changed, untracked, and outside a repository are not.
    expect([
      clean,
      gitCommitted(join(repo, "q.json")),
      gitCommitted(join(repo, "new.json")),
      gitCommitted(join(TMP, "summary", "queries.json")),
    ]).toEqual([true, false, false, false]);
  });
});
