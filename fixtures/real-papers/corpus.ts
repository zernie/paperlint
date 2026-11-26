/**
 * The real-papers corpus, split so its lint runs on every core. Every paper of `accepted/` and
 * `preprints/` is one entry of `PAPERS`; `shardOf` deals them round-robin into as many shards as
 * there are `shard-<n>.test.ts` files beside this one, and each of those files lints its shard in
 * ONE `paperlint lint --json` over a temporary project. vitest runs each test file in its own worker
 * thread, so the shards run at once: one run over every paper used one core of the four a runner has.
 *
 * Each paper is compared with its own `baseline.json`, so a paper's verdict does not depend on which
 * shard it lands in; `../real-papers.test.ts` asserts the shards together hold every paper once.
 */
import { cpSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { run } from "../../src/cli.ts";
import { layRecord } from "../../test/recorded-fixture.ts";
import { useTempDir, writeTree } from "../../test/support.ts";
import {
  compareToBaseline,
  countByPaper,
  RECORDED_OPT_IN,
  recordedFindings,
} from "./baseline.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
export const ACCEPTED_DIR = join(HERE, "accepted");
const FOLDERS = [ACCEPTED_DIR, join(HERE, "preprints")];

/** The directories of a folder that are not papers: the record of how `accepted/` was sampled. */
const NOT_PAPERS: ReadonlySet<string> = new Set(["sampling"]);

export type Paper = Readonly<{ name: string; dir: string }>;

/** Every paper: its directory name (unique across the folders) and where it is. */
export const PAPERS: readonly Paper[] = FOLDERS.flatMap((root) =>
  readdirSync(root)
    .filter(
      (name) =>
        !NOT_PAPERS.has(name) && statSync(join(root, name)).isDirectory(),
    )
    .map((name) => ({ name, dir: join(root, name) })),
);

const SHARD_FILE = /^shard-(\d+)\.test\.ts$/;

/** The shard numbers, from the `shard-<n>.test.ts` files beside this module. */
export const SHARDS: readonly number[] = readdirSync(HERE)
  .flatMap((f) => {
    const m = SHARD_FILE.exec(f);
    return m === null ? [] : [Number(m[1])];
  })
  .toSorted((a, b) => a - b);

/** The papers of shard `n` (1-based) of `count`: every `count`-th paper, starting at the `n`-th. */
export const shardOf = <T>(
  items: readonly T[],
  n: number,
  count: number,
): readonly T[] => items.filter((_, i) => i % count === n - 1);

/** One `paperlint lint --json` over a project holding `papers`: findings per rule, per paper. */
async function lintAll(
  papers: readonly Paper[],
): Promise<ReturnType<typeof countByPaper>> {
  const dir = writeTree(useTempDir("paperlint-real-papers-"), {
    "package.json": '{"name":"consumer","private":true}',
    // The opt-in rules the baselines count, on for every paper (baseline.ts says why).
    "paperlint.json": JSON.stringify({ rules: RECORDED_OPT_IN }),
  });
  for (const { name, dir: from } of papers) {
    cpSync(from, join(dir, "papers", name), {
      recursive: true,
      verbatimSymlinks: true,
    });
    // The paper as a build left it: lint reads the files of the paper from the record, not the text.
    layRecord(join(dir, "papers", name));
  }
  const out: string[] = [];
  await run(["lint", "--json"], {
    cwd: dir,
    log: (...a: unknown[]) => out.push(a.join(" ")),
    err: () => undefined,
  });
  return countByPaper(out.join("\n"));
}

/**
 * The day the baselines were measured. `paper/edition-over` reads the clock: an edition preset whose
 * last deadline passes (`sp-2027`'s on 2027-04-09) would grow a baseline on that day with no change
 * to the code or the papers. The lint runs on this day, so a count moves only when something here does.
 */
const MEASURED_ON = "2026-11-19T12:00:00Z";

/** The test of the shard whose file is `url` (`shard-<n>.test.ts`): its papers against their baselines. */
export function lintShard(url: string): void {
  const file = basename(fileURLToPath(url));
  const n = Number(SHARD_FILE.exec(file)?.[1]);
  const papers = shardOf(PAPERS, n, SHARDS.length);
  describe(`real papers, shard ${String(n)} of ${String(SHARDS.length)}`, () => {
    it(
      "says no more than recorded, and no recorded rule has gone quiet",
      // 206 papers in 4 shards: 378.8 s on 2026-11-27, slowest shard 250.4 s (one run: 582.7 s).
      { timeout: 20 * 60_000 },
      async () => {
        // Guards: a shard file whose name is not shard-<n>, or a shard with nothing in it.
        expect(papers.length).toBeGreaterThan(0);
        vi.setSystemTime(MEASURED_ON);
        const found = await lintAll(papers).finally(() => vi.useRealTimers());
        const verdicts = papers
          .map(({ name, dir }) => ({
            name,
            ...compareToBaseline(found[name] ?? {}, recordedFindings(dir)),
          }))
          .filter((v) => v.grew.length > 0 || v.vanished.length > 0);
        expect(verdicts).toEqual([]);
      },
    );
  });
}
