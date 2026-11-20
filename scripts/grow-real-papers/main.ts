#!/usr/bin/env node
/**
 * Grow the accepted set (fixtures/real-papers/accepted/README.md, «Growing this set without bias»).
 *
 *   node scripts/grow-real-papers/main.ts [--only ml,nlp] [--minutes N | --deadline ISO]
 *        [--queries FILE] [--write FIXTURES-DIR]
 *
 * Without `--write`, a dry run: it fetches and judges exactly as a real run, prints each candidate
 * with its rank and reason and, for each kept paper, where each staged file would go — and writes
 * nothing. `--write DIR` stages into DIR laid out as `fixtures/` is: `DIR/venue-manifest.json`
 * (entries appended), `DIR/real-papers/accepted/<id>/`, and `probe-log.jsonl` and
 * `staging-notes.json` in `DIR/real-papers/accepted/sampling/`, each written as soon as a candidate
 * is decided, so a stopped run resumes from its log. `--write fixtures` stages in place.
 */
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { isMain } from "../../skills/paper-pipeline/scripts/consumer.mjs";
import { presetsDir } from "../../src/package-dirs.ts";
import {
  collect,
  QueriesSchema,
  summary,
  type Counted,
  type ProbeLine,
} from "./collect.ts";
import { throttledGet } from "./http.ts";
import type { KeptPaper } from "./paper.ts";
import { baseId, type Get } from "./sources.ts";

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
}>;

/** The command line, or what is wrong with it. */
export function argsOf(argv: readonly string[], now: number): Args | string {
  const value = (flag: string): string | undefined =>
    argv.includes(flag) ? (argv[argv.indexOf(flag) + 1] ?? "") : undefined;
  const known = ["--only", "--minutes", "--deadline", "--queries", "--write"];
  const unknown = argv.filter((a) => a.startsWith("--") && !known.includes(a));
  if (unknown.length > 0) return `unknown option ${unknown.join(", ")}`;
  const minutes = value("--minutes");
  const deadline = value("--deadline");
  const limits = [
    minutes === undefined ? Infinity : now + Number(minutes) * 60_000,
    deadline === undefined ? Infinity : Date.parse(deadline),
  ];
  if (limits.some((t) => Number.isNaN(t)) || [minutes, deadline].includes(""))
    return "--minutes takes a number and --deadline an ISO date";
  const write = value("--write");
  if (write === "") return "--write takes the fixtures directory to stage into";
  return {
    queries: value("--queries") ?? join(FIXTURES, SAMPLING, "queries.json"),
    only: value("--only")?.split(",") ?? null,
    deadline: Math.min(...limits),
    write: write === undefined ? null : resolve(write),
  };
}

const json = (v: unknown): string => `${JSON.stringify(v, null, 2)}\n`;
const readJson = (path: string, fallback: unknown): unknown =>
  existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : fallback;
const Entries = z.array(z.looseObject({ arxiv_id: z.string() }));
const logLines = (path: string): readonly ProbeLine[] =>
  existsSync(path)
    ? readFileSync(path, "utf8")
        .split("\n")
        .filter((l) => l !== "")
        .map((l) => JSON.parse(l) as ProbeLine)
    : [];

/** What `run` needs from the world. */
export type World = Readonly<{
  get: Get;
  now: () => number;
  log: (line: string) => void;
  /** The repository's `fixtures/`: the manifests and the log every run reads. */
  fixtures: string;
  presets: string;
}>;

/** Runs the walk; prints what it decided; with `--write`, stages as it goes. Returns the exit code. */
export async function run(args: Args, world: World): Promise<number> {
  const dirs = [
    ...new Set(
      [world.fixtures, ...(args.write === null ? [] : [args.write])].map((d) =>
        resolve(d),
      ),
    ),
  ];
  const manifests = dirs.map((d) => join(d, "venue-manifest.json"));
  const entries = [
    ...new Map(
      manifests
        .flatMap((p) => Entries.parse(readJson(p, [])))
        .map((e) => [
          e.arxiv_id,
          e as Counted & Readonly<Record<string, unknown>>,
        ]),
    ).values(),
  ];
  const queries = QueriesSchema.parse(readJson(args.queries, null));
  const preprints = Entries.parse(
    readJson(join(world.fixtures, "arxiv-manifest.json"), []),
  );
  const out = args.write;
  const lines: ProbeLine[] = dirs.flatMap((d) =>
    logLines(join(d, SAMPLING, "probe-log.jsonl")),
  );
  const added: (typeof entries)[number][] = [];
  const emit = (line: ProbeLine, paper?: KeptPaper): void => {
    lines.push(line);
    world.log(
      `#${String(line.rank)} ${line.id} ${line.series} ${String(line.year)}: ${line.outcome} — ${line.reason}`,
    );
    if (paper !== undefined) {
      added.push(paper.entry as (typeof entries)[number]);
      for (const path of paper.files.keys()) world.log(`    stage ${path}`);
    }
    if (out === null) return;
    const sampling = join(out, SAMPLING);
    mkdirSync(sampling, { recursive: true });
    appendFileSync(
      join(sampling, "probe-log.jsonl"),
      `${JSON.stringify(line)}\n`,
    );
    if (paper === undefined) return;
    const dir = join(out, "real-papers", "accepted", paper.id);
    for (const [path, body] of paper.files) {
      mkdirSync(dirname(join(dir, path)), { recursive: true });
      writeFileSync(join(dir, path), body);
    }
    const notesPath = join(sampling, "staging-notes.json");
    const notes = z
      .record(z.string(), z.unknown())
      .parse(readJson(notesPath, {}));
    writeFileSync(notesPath, json({ ...notes, [paper.id]: paper.note }));
    const manifest = join(out, "venue-manifest.json");
    writeFileSync(
      manifest,
      json([...Entries.parse(readJson(manifest, [])), paper.entry]),
    );
  };
  const ends = await collect({
    queries,
    only: args.only,
    entries,
    otherIds: new Set(preprints.map((e) => baseId(e.arxiv_id))),
    logged: [...lines],
    shipped: new Set(
      readdirSync(world.presets)
        .filter((f) => f.endsWith(".jsonc"))
        .map((f) => f.replace(/\.jsonc$/, "")),
    ),
    get: world.get,
    outOfTime: () => world.now() > args.deadline,
    emit,
  });
  for (const e of ends)
    world.log(
      `${e.slot}: ${e.ended} at rank ${String(e.walkedTo)}${e.error === undefined ? "" : ` (${e.error})`}`,
    );
  world.log(summary(queries, [...entries, ...added], lines));
  world.log(
    out === null
      ? `dry run: ${String(added.length)} paper(s) would be added; nothing written (--write DIR stages them)`
      : `staged ${String(added.length)} paper(s) into ${out}`,
  );
  return 0;
}

if (isMain(import.meta.url)) {
  const args = argsOf(process.argv.slice(2), Date.now());
  if (typeof args === "string") {
    console.error(args);
    process.exit(2);
  }
  const clock = {
    now: Date.now,
    sleep: (ms: number) => new Promise<void>((done) => setTimeout(done, ms)),
  };
  process.exit(
    await run(args, {
      get: throttledGet(fetch, clock),
      now: Date.now,
      log: console.log,
      fixtures: FIXTURES,
      presets: presetsDir(),
    }),
  );
}
