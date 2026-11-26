#!/usr/bin/env node
/**
 * Grow the accepted set (fixtures/real-papers/accepted/README.md, «Growing this set without bias»).
 *
 *   node scripts/grow-real-papers/main.ts [--only ml,nlp] [--minutes N | --deadline ISO]
 *        [--queries FILE] [--write FIXTURES-DIR]
 *   node scripts/grow-real-papers/main.ts --summary [--queries FILE]
 *
 * Without `--write`, a dry run: it fetches and judges exactly as a real run, prints each candidate
 * with its rank and reason and, for each kept paper, where each staged file would go — and writes
 * nothing. `--write DIR` stages into DIR laid out as `fixtures/` is: `DIR/venue-manifest.json`
 * (entries appended), `DIR/real-papers/accepted/<id>/`, and `probe-log.jsonl` and
 * `staging-notes.json` in `DIR/real-papers/accepted/sampling/`, each written as soon as a candidate
 * is decided, so a stopped run resumes from its log. `--write fixtures` stages in place, and only
 * while the queries file is committed (rule 1: the quotas are fixed before collecting).
 *
 * Every run ends with `summary.ts`'s table and the command to run next, and exits 1 when a walk
 * stopped by time or a search error. `--summary` fetches nothing: it prints the table over the whole
 * log and exits 1 when the log keeps a paper the manifest lacks.
 */
import { execFileSync } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as R from "remeda";
import { z } from "zod";
import { isMain } from "../../skills/paper-pipeline/scripts/consumer.mjs";
import { presetsDir } from "../../src/package-dirs.ts";
import {
  collect,
  CountedSchema,
  ProbeLineSchema,
  QueriesSchema,
  type Counted,
  type ProbeLine,
  type SlotEnd,
} from "./collect.ts";
import { realClock, throttledGet } from "./http.ts";
import type { KeptPaper } from "./paper.ts";
import { baseId, type Get } from "./sources.ts";
import { logReport, report } from "./summary.ts";

/** This repository's `fixtures/`, found from this file, never from the caller's directory. */
export const FIXTURES = fileURLToPath(
  new URL("../../fixtures/", import.meta.url),
);
const SAMPLING = join("real-papers", "accepted", "sampling");

export type Args = Readonly<{
  queries: string;
  only: readonly string[] | null;
  deadline: number;
  write: string | null;
  summary: boolean;
}>;

const KNOWN = [
  "--only",
  "--minutes",
  "--deadline",
  "--queries",
  "--write",
  "--summary",
];

/** The value after a flag: undefined when the flag is absent, "" when it has none. */
const valueOf = (argv: readonly string[], flag: string): string | undefined =>
  argv.includes(flag) ? (argv[argv.indexOf(flag) + 1] ?? "") : undefined;

/** The earlier of `--minutes` from now and `--deadline`; Infinity when neither is given. */
const deadlineOf = (argv: readonly string[], now: number): number | string => {
  const minutes = valueOf(argv, "--minutes");
  const deadline = valueOf(argv, "--deadline");
  const limits = [
    minutes === undefined ? Infinity : now + Number(minutes) * 60_000,
    deadline === undefined ? Infinity : Date.parse(deadline),
  ];
  return limits.some((t) => Number.isNaN(t)) || [minutes, deadline].includes("")
    ? "--minutes takes a number and --deadline an ISO date"
    : Math.min(...limits);
};

/** The command line, or what is wrong with it. */
export function argsOf(argv: readonly string[], now: number): Args | string {
  const unknown = argv.filter((a) => a.startsWith("--") && !KNOWN.includes(a));
  if (unknown.length > 0) return `unknown option ${unknown.join(", ")}`;
  const deadline = deadlineOf(argv, now);
  if (typeof deadline === "string") return deadline;
  const write = valueOf(argv, "--write");
  if (write === "") return "--write takes the fixtures directory to stage into";
  return {
    queries:
      valueOf(argv, "--queries") ?? join(FIXTURES, SAMPLING, "queries.json"),
    only: valueOf(argv, "--only")?.split(",") ?? null,
    deadline,
    write: write === undefined ? null : resolve(write),
    summary: argv.includes("--summary"),
  };
}

const json = (v: unknown): string => `${JSON.stringify(v, null, 2)}\n`;
const readJson = (path: string, fallback: unknown): unknown =>
  existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : fallback;
const Entries = z.array(CountedSchema);
const Notes = z.record(z.string(), z.unknown());
const logLines = (path: string): readonly ProbeLine[] =>
  existsSync(path)
    ? readFileSync(path, "utf8")
        .split("\n")
        .filter((l) => l !== "")
        .map((l) => ProbeLineSchema.parse(JSON.parse(l)))
    : [];

/** What `run` needs from the world. */
export type World = Readonly<{
  get: Get;
  now: () => number;
  log: (line: string) => void;
  /** The repository's `fixtures/`: the manifests and the log every run reads. */
  fixtures: string;
  presets: string;
  /** Whether the file is tracked by git with no uncommitted change. */
  committed: (path: string) => boolean;
}>;

/** The real `committed`: tracked, and `git status` shows nothing for it; false outside a repository. */
export function gitCommitted(path: string): boolean {
  const opts = { cwd: dirname(resolve(path)), encoding: "utf8" } as const;
  try {
    execFileSync("git", ["ls-files", "--error-unmatch", basename(path)], {
      ...opts,
      stdio: "pipe",
    });
    return (
      execFileSync("git", ["status", "--porcelain", "--", basename(path)], opts)
        .length === 0
    );
  } catch {
    return false;
  }
}

/**
 * Writes one decided candidate into `out`: when kept, its files and entries first; its log line
 * last, so a run that stops halfway leaves no logged decision whose files are missing.
 */
function stage(out: string, line: ProbeLine, paper?: KeptPaper): void {
  const sampling = join(out, SAMPLING);
  mkdirSync(sampling, { recursive: true });
  if (paper !== undefined) {
    const dir = join(out, "real-papers", "accepted", paper.id);
    for (const [path, body] of paper.files) {
      mkdirSync(dirname(join(dir, path)), { recursive: true });
      writeFileSync(join(dir, path), body);
    }
    const notes = join(sampling, "staging-notes.json");
    writeFileSync(
      notes,
      json({ ...Notes.parse(readJson(notes, {})), [paper.id]: paper.note }),
    );
    const manifest = join(out, "venue-manifest.json");
    writeFileSync(
      manifest,
      json([...Entries.parse(readJson(manifest, [])), paper.entry]),
    );
  }
  appendFileSync(
    join(sampling, "probe-log.jsonl"),
    `${JSON.stringify(line)}\n`,
  );
}

/** Everything a run reads before it starts: the counts, the ids to skip, the log so far. */
function load(args: Args, world: World) {
  const dirs = [
    ...new Set(
      [world.fixtures, args.write ?? world.fixtures].map((d) => resolve(d)),
    ),
  ];
  const entries = R.uniqueBy(
    dirs.flatMap((d) =>
      Entries.parse(readJson(join(d, "venue-manifest.json"), [])),
    ),
    (e) => e.arxiv_id,
  );
  const preprints = Entries.parse(
    readJson(join(world.fixtures, "arxiv-manifest.json"), []),
  );
  return {
    queries: QueriesSchema.parse(readJson(args.queries, null)),
    entries,
    otherIds: new Set(preprints.map((e) => baseId(e.arxiv_id))),
    logged: dirs.flatMap((d) => logLines(join(d, SAMPLING, "probe-log.jsonl"))),
    shipped: new Set(
      readdirSync(world.presets)
        .filter((f) => f.endsWith(".jsonc"))
        .map((f) => f.replace(/\.jsonc$/, "")),
    ),
  };
}

const endLine = (e: SlotEnd): string =>
  `${e.slot}: ${e.ended} at rank ${String(e.walkedTo)}${e.error === undefined ? "" : ` (${e.error})`}`;

/** The walk itself: each decision printed and, with `--write`, staged as soon as it is made. */
async function walk(args: Args, world: World, before: ReturnType<typeof load>) {
  const added: Counted[] = [];
  const judged: ProbeLine[] = [];
  const emit = (line: ProbeLine, paper?: KeptPaper): void => {
    judged.push(line);
    world.log(
      `#${String(line.rank)} ${line.id} ${line.series} ${String(line.year)}: ${line.outcome} — ${line.reason}`,
    );
    if (paper !== undefined) {
      added.push(paper.entry);
      for (const path of paper.files.keys()) world.log(`    stage ${path}`);
    }
    if (args.write !== null) stage(args.write, line, paper);
  };
  const ends = await collect({
    ...before,
    only: args.only,
    get: world.get,
    outOfTime: () => world.now() > args.deadline,
    emit,
  });
  for (const e of ends) world.log(endLine(e));
  return { added, judged, ends };
}

const print = (
  world: World,
  r: Readonly<{ lines: readonly string[]; code: number }>,
): number => {
  for (const l of r.lines) world.log(l);
  return r.code;
};

/**
 * Runs the walk, then prints the summary and the next command; `--summary` prints the summary of
 * the log alone. Returns the exit code.
 */
export async function run(args: Args, world: World): Promise<number> {
  const before = load(args, world);
  if (args.summary)
    return print(world, logReport({ ...before, lines: before.logged }));
  if (args.write !== null && !world.committed(args.queries)) {
    world.log(
      `refusing --write: ${args.queries} has changes git has not committed; commit the quotas first, as they are fixed before collecting`,
    );
    return 2;
  }
  const { added, judged, ends } = await walk(args, world, before);
  world.log(
    args.write === null
      ? `dry run: ${String(added.length)} paper(s) would be added; nothing written (--write DIR stages them)`
      : `staged ${String(added.length)} paper(s) into ${args.write}`,
  );
  const entries = [...before.entries, ...added];
  return print(
    world,
    report({ ...before, entries, lines: judged, ends }, args.write !== null),
  );
}

if (isMain(import.meta.url)) {
  const args = argsOf(process.argv.slice(2), Date.now());
  if (typeof args === "string") {
    console.error(args);
    process.exit(2);
  }
  process.exit(
    await run(args, {
      get: throttledGet(fetch, realClock),
      now: Date.now,
      log: console.log,
      fixtures: FIXTURES,
      presets: presetsDir(),
      committed: gitCommitted,
    }),
  );
}
