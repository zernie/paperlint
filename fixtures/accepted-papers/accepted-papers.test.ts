/**
 * Every rule, on papers that were ACCEPTED — text nobody here wrote for a linter. The subject is the
 * corpus as one object: each directory beside this file is a paper with its own `baseline.json`,
 * and the directory listing is the list of papers, so a paper added without a baseline fails here.
 *
 * A rule that says MORE about an accepted paper than recorded has gained a false positive until
 * shown otherwise; a rule that goes fully quiet without the recording being updated has died. A
 * partial drop is what a fix looks like. The comparison is `baseline.ts` beside this file, the one
 * the install e2e uses too, not a second copy of it.
 *
 * The integration tier: the CLI's own `run`, in-process, on a copy of the paper under `papers/` —
 * nothing here is true only after an install, and no build artifact is read (docs/e2e.md).
 */
import { cpSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { run } from "../../src/cli.ts";
import { latexReader } from "../../src/adapters/latex/index.ts";
import { nodeFiles } from "../../src/adapters/node/index.ts";
import { judgeRegister, measureRegister } from "../../src/register.ts";
import { readPaper } from "../../src/tex-paper.ts";
import { useTempDir, writeTree } from "../../test/support.ts";
import {
  compareToBaseline,
  countByRule,
  recordedFindings,
} from "./baseline.ts";

const HERE = dirname(fileURLToPath(import.meta.url));

/** Every paper of the corpus: each directory here. */
const PAPERS = readdirSync(HERE).filter((name) =>
  statSync(join(HERE, name)).isDirectory(),
);

/** `paperlint lint --json` over one paper, copied under `papers/`: findings per rule. */
async function lintPaper(name: string): Promise<Record<string, number>> {
  const dir = writeTree(useTempDir("paperlint-accepted-"), {
    "package.json": '{"name":"consumer","private":true}',
  });
  cpSync(join(HERE, name), join(dir, "papers", name), {
    recursive: true,
    verbatimSymlinks: true,
  });
  const out: string[] = [];
  await run(["lint", "--json"], {
    cwd: dir,
    log: (...a: unknown[]) => out.push(a.join(" ")),
    err: () => undefined,
  });
  return countByRule(out.join("\n"));
}

it("the corpus holds papers — an empty listing would make every case below vacuous", () => {
  expect(PAPERS.length).toBeGreaterThanOrEqual(3);
});

/**
 * One run of the whole CLI over a full paper: 2.7 s here and 6.2 s on the CI runner (measured), so
 * the 5 s default is too tight. Linting each included file on its own (#144) made the paper with
 * eight of them 1.6 times slower (12.7 s → 20.3 s on a loaded container, 40 s under coverage there),
 * so 60 s. `leaking-queries-acsac25`, ten included files, went past 60 s under coverage in a local
`npm run check` (2026-09-29), so 120 s.
 */
const LINT_TIMEOUT_MS = 120_000;

describe.each(PAPERS)("the accepted paper %s", (name) => {
  it(
    "says no more than recorded, and no recorded rule has gone quiet",
    { timeout: LINT_TIMEOUT_MS },
    async () => {
      const { grew, vanished } = compareToBaseline(
        await lintPaper(name),
        recordedFindings(join(HERE, name)),
      );
      expect({ grew, vanished }).toEqual({ grew: [], vanished: [] });
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

describe.each(PAPERS)("tex/register on the accepted paper %s", (name) => {
  const file = join(HERE, name, "paper.tex");
  const m = measureRegister(
    latexReader.bodyProse(
      readPaper(file, readFileSync(file, "utf8"), {
        files: nodeFiles,
        latex: latexReader,
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
