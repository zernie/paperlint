/**
 * Every rule, on every real paper of the corpus: the accepted papers of
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
 * The lint itself runs in the `real-papers/shard-<n>.test.ts` files, one `paperlint lint --json` each
 * over its share of the papers, at once on the runner's cores (`real-papers/corpus.ts`); this file
 * holds what is asserted about the corpus as a whole, the shards' coverage of it among them. One run
 * over many papers, not one run per paper: measured, one run is 1.7 s a paper and one CLI run per
 * paper about 3 s, startup being a large part of the second. They are their own vitest project
 * (`real-papers`), outside `unit`, so the macOS shards and the coverage job do not repeat them; CI
 * runs it in the job of the same name.
 *
 * What is asserted beside the lint comparison, not in a second lint loop: the `tex/register` measures
 * of the accepted papers (below), which read the parse tree of one paper and not lint's output. The
 * register band the AIDC preset anchors on is held by `src/register-bands.test.ts`.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it, describe } from "vitest";
import { latexReader } from "../src/adapters/latex/index.ts";
import { nodeFiles } from "../src/adapters/node/index.ts";
import { sourcesCodec } from "../src/adapters/sources-record/index.ts";
import { judgeRegister, measureRegister } from "../src/register.ts";
import { readPaper } from "../src/tex-paper.ts";
import { withRecord } from "../test/recorded-fixture.ts";
import {
  ACCEPTED_DIR,
  PAPERS,
  SHARDS,
  shardOf,
} from "./real-papers/corpus.ts";

it("the corpus holds papers, with names that are unique — an empty or colliding listing would make every case below vacuous", () => {
  expect(PAPERS.length).toBeGreaterThanOrEqual(100);
  expect(new Set(PAPERS.map((p) => p.name)).size).toBe(PAPERS.length);
});

describe("the shards", () => {
  it("are numbered 1 to their count, so every shard file lints a share", () => {
    // Guards: a gap (shard-1, shard-3) would leave the papers of the missing number unlinted.
    expect(SHARDS).toEqual(SHARDS.map((_, i) => i + 1));
    expect(SHARDS.length).toBeGreaterThan(1);
  });

  it("hold every paper exactly once, so no paper goes unlinted", () => {
    const names = PAPERS.map((p) => p.name);
    const dealt = SHARDS.flatMap((n) => shardOf(names, n, SHARDS.length));
    // Guards: a paper in no shard, or in two.
    expect(dealt.toSorted()).toEqual(names.toSorted());
  });

  it("deal round-robin: shard n of k takes every k-th item from the n-th", () => {
    // Guards: the dealing itself, on a list whose length the shard count does not divide.
    expect([1, 2, 3].map((n) => shardOf(["a", "b", "c", "d", "e", "f", "g"], n, 3))).toEqual([
      ["a", "d", "g"],
      ["b", "e"],
      ["c", "f"],
    ]);
  });
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
