/**
 * Every rule, on every real paper of the corpus, in ONE run of the CLI: the accepted papers of
 * `real-papers/accepted/` (published; the calibration yardstick) and the arXiv preprints of
 * `real-papers/preprints/` (drafts; `real-papers/README.md` says what each folder answers). The
 * subject is the corpus as one object: each directory of those folders is a paper with its own
 * `baseline.json`, so a paper added without a baseline fails here.
 *
 * A rule that says MORE about a real paper than recorded has gained a false positive until shown
 * otherwise; a rule that goes fully quiet without the recording being updated has died. A partial
 * drop is what a fix looks like. The comparison is `real-papers/baseline.ts`, the one the install
 * e2e uses too, not a second copy.
 *
 * One `paperlint lint --json` over a temporary project holding every paper under `papers/`, not one
 * run per paper: measured, one run is 1.7 s a paper and one CLI run per paper about 3 s, startup
 * being a large part of the second. It is its own vitest project (`real-papers`), outside `unit`, so
 * the macOS shards and the coverage job do not repeat it; CI runs it in the job of the same name.
 *
 * What is asserted beside the lint comparison, not in a second lint loop: the `tex/register` measures
 * of the accepted papers (below), which read the parse tree of one paper and not lint's output. The
 * register band the AIDC preset anchors on is held by `src/register-bands.test.ts`.
 */
import { cpSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { run } from "../src/cli.ts";
import { latexReader } from "../src/adapters/latex/index.ts";
import { nodeFiles } from "../src/adapters/node/index.ts";
import { sourcesCodec } from "../src/adapters/sources-record/index.ts";
import { judgeRegister, measureRegister } from "../src/register.ts";
import { readPaper } from "../src/tex-paper.ts";
import { layRecord, withRecord } from "../test/recorded-fixture.ts";
import { useTempDir, writeTree } from "../test/support.ts";
import {
  compareToBaseline,
  countByPaper,
  RECORDED_OPT_IN,
  recordedFindings,
} from "./real-papers/baseline.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const ACCEPTED_DIR = join(HERE, "real-papers", "accepted");
const FOLDERS = [ACCEPTED_DIR, join(HERE, "real-papers", "preprints")];

/** The directories of a folder that are not papers: the record of how `accepted/` was sampled. */
const NOT_PAPERS: ReadonlySet<string> = new Set(["sampling"]);

/** Every paper: its directory name (unique across the folders) and where it is. */
const PAPERS = FOLDERS.flatMap((root) =>
  readdirSync(root)
    .filter(
      (name) =>
        !NOT_PAPERS.has(name) && statSync(join(root, name)).isDirectory(),
    )
    .map((name) => ({ name, dir: join(root, name) })),
);

/** One `paperlint lint --json` over a project holding all of `PAPERS`: findings per rule, per paper. */
async function lintAll(): Promise<ReturnType<typeof countByPaper>> {
  const dir = writeTree(useTempDir("paperlint-real-papers-"), {
    "package.json": '{"name":"consumer","private":true}',
    // The opt-in rules the baselines count, on for every paper (baseline.ts says why).
    "paperlint.json": JSON.stringify({ rules: RECORDED_OPT_IN }),
  });
  for (const { name, dir: from } of PAPERS) {
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

it("the corpus holds papers, with names that are unique — an empty or colliding listing would make every case below vacuous", () => {
  expect(PAPERS.length).toBeGreaterThanOrEqual(100);
  expect(new Set(PAPERS.map((p) => p.name)).size).toBe(PAPERS.length);
});

/**
 * The day the baselines were measured. `paper/edition-over` reads the clock: an edition preset whose
 * last deadline passes (`sp-2027`'s on 2027-04-09) would grow a baseline on that day with no change
 * to the code or the papers. The lint runs on this day, so a count moves only when something here does.
 */
const MEASURED_ON = "2026-11-19T12:00:00Z";

describe("every real paper, in one run", () => {
  it(
    "says no more than recorded, and no recorded rule has gone quiet",
    { timeout: 10 * 60_000 },
    async () => {
      vi.setSystemTime(MEASURED_ON);
      const found = await lintAll().finally(() => vi.useRealTimers());
      const verdicts = PAPERS.map(({ name, dir }) => ({
        name,
        ...compareToBaseline(found[name] ?? {}, recordedFindings(dir)),
      })).filter((v) => v.grew.length > 0 || v.vanished.length > 0);
      expect(verdicts).toEqual([]);
    },
  );
});

/**
 * What `tex/register` measures on each paper, recorded: sentences opening with And, So, But, Nor,
 * Or or Yet per 1000 words. The papers written by others read at most 0.37, under the limit;
 * `agenticdev-acm26` is ours, and its rate is over the limit — the one finding its baseline records.
 * A change to how the body is read moves these.
 */
const CONJUNCTION_STARTS_PER_1000: Readonly<Record<string, string>> = {
  "agenticdev-acm26": "1.60",
  "barovox-acsac24": "0.00",
  "leaking-queries-acsac25": "0.00",
  "llm-splained-acsac25": "0.00",
  "rr-dataset-quality-acsac24": "0.37",
  "secure-acsac24": "0.00",
};

/** The six papers whose register is recorded, named: the other papers of `accepted/` are not among them. */
const ACCEPTED_REGISTER_PAPERS = Object.keys(CONJUNCTION_STARTS_PER_1000);

describe.each(ACCEPTED_REGISTER_PAPERS)("tex/register on the accepted paper %s", (name) => {
  const file = join(ACCEPTED_DIR, name, "paper.tex");
  const m = measureRegister(
    latexReader.bodyProse(
      readPaper(file, readFileSync(file, "utf8"), {
        files: withRecord(nodeFiles, join(ACCEPTED_DIR, name)),
        latex: latexReader,
        codec: sourcesCodec,
      }).text,
    ),
  );

  it("measures the recorded rate", () => {
    expect(((1000 * m.conjunctionStarts) / m.words).toFixed(2)).toBe(
      CONJUNCTION_STARTS_PER_1000[name],
    );
  });

  it("is silent on the papers written by others, and reports ours", () => {
    expect(judgeRegister(m).length).toBe(name === "agenticdev-acm26" ? 1 : 0);
  });
});
