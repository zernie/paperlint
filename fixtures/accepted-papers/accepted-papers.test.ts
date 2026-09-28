/**
 * Every rule, on papers that were ACCEPTED — text nobody here wrote for a linter. The subject is the
 * corpus as one object: each directory beside this file is a paper with its own `baseline.json`,
 * and the directory listing is the list of papers, so a paper added without a baseline fails here.
 *
 * A rule that says MORE about an accepted paper than recorded has gained a false positive until
 * shown otherwise; a rule that goes fully quiet without the recording being updated has died. A
 * partial drop is what a fix looks like. The comparison is the one `fixtures/real-markdown-paper/`
 * uses (`baseline.ts`), not a second copy of it.
 *
 * The integration tier: the CLI's own `run`, in-process, on a copy of the paper under `papers/` —
 * nothing here is true only after an install, and no build artifact is read (docs/e2e.md).
 */
import { cpSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { run } from "../../src/cli.ts";
import { useTempDir, writeTree } from "../../test/support.ts";
import {
  compareToBaseline,
  countByRule,
  recordedFindings,
} from "../real-markdown-paper/baseline.ts";

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

describe.each(PAPERS)("the accepted paper %s", (name) => {
  it("says no more than recorded, and no recorded rule has gone quiet", async () => {
    const { grew, vanished } = compareToBaseline(
      await lintPaper(name),
      recordedFindings(join(HERE, name)),
    );
    expect({ grew, vanished }).toEqual({ grew: [], vanished: [] });
  });
});
