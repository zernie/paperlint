/**
 * What the build records for the accepted papers of `fixtures/accepted-papers/`, written beside each
 * one as `tex-truth.json` — TeX's own answer to "which files make up this paper", so the tests that
 * read a paper whole (the register measures, the baselines of every rule) are fed what TeX read and
 * not a list written by hand (docs/design/paper-sources.md §1, §8).
 *
 * The same record the planted papers of `fixtures/paper-sources/` carry
 * (`test/e2e/tex/paper-sources.e2e.ts`), made the same way: the paper is copied to a scratch
 * directory, built with the build's own pdflatex arguments and TEXINPUTS, bibtex when the `.aux` names
 * a database, the passes after it, and the build's own record step turns what TeX left into
 * `_build/sources.json`. That file is the snapshot: paths relative to the paper, hashes over bytes,
 * nothing of the machine or the time. `vitest -u` on a machine with TeX writes the new answer; a
 * paper edited since fails the unit tests that read it, by the record's own hash.
 *
 * 🔴 A RECORD IS OF A BUILD THAT COMPILED, as in `paperlint build`: the last pass must exit 0, or the
 * paper has no record. `NOT_BUILT` names the papers that do not compile in paperlint's TeX tree — their
 * packages (subfig, svg, cleveref, listings … eleven in all) are in no preset — and a test requires
 * each of them to still fail, so the exclusion cannot outlive the reason for it. Such a paper carries
 * `record-by-hand.json` instead of `tex-truth.json`: the files its `\input`s name, in order — not
 * TeX's answer, and named so (fixtures/accepted-papers/README.md).
 *
 *   npm run test:e2e:tex
 */
import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { nodeFiles, nodeListDir } from "../../../dist/adapters/node/index.js";
import { texOutput } from "../../../dist/adapters/tex-output/index.js";
import {
  bibInput,
  JOB,
  pdflatexArgs,
  withTexInputs,
} from "../../../dist/build.js";
import { serializeSourcesRecord } from "../../../dist/domain/sources-record.js";
import { texSearchPath } from "../../../dist/package-dirs.js";
import { recordSources } from "../../../dist/sources-record.js";
import { cacheRoot, cachedTree } from "../../../dist/toolchain.js";
import { missing } from "../need.ts";

const ROOT = dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url)))));
const CORPUS = join(ROOT, "fixtures", "accepted-papers");
const TRUTH = "tex-truth.json";
/** Papers that do not compile in paperlint's TeX tree (see the header). */
const NOT_BUILT: readonly string[] = ["llm-splained-acsac25"];
const PAPERS = readdirSync(CORPUS, { withFileTypes: true })
  .filter(
    (d) => d.isDirectory() && existsSync(join(CORPUS, d.name, "paper.tex")),
  )
  .map((d) => d.name)
  .filter((name) => !NOT_BUILT.includes(name));

/** paperlint's TeX Live when it is installed, else whatever `pdflatex` is on PATH. */
const tree = cachedTree(cacheRoot(process.env));
const env = withTexInputs(
  {
    ...process.env,
    PATH: [tree?.bin, process.env.PATH].filter(Boolean).join(delimiter),
  },
  texSearchPath("."),
);
const hasTex =
  spawnSync("pdflatex", ["--version"], { env }).status === 0 &&
  spawnSync("bibtex", ["--version"], { env }).status === 0;

const scratch = realpathSync(
  mkdtempSync(join(tmpdir(), "accepted-papers-truth-")),
);
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

/** One program run in `dir`, and its exit code; not judged — TeX's warnings are part of the answer. */
const run = (dir: string, cmd: string, args: readonly string[]): number =>
  spawnSync(cmd, [...args], { cwd: dir, env, encoding: "utf8" }).status ?? -1;

/** One pdflatex pass, with the build's own arguments: its exit code, and what `-recorder` wrote for it. */
function pass(
  dir: string,
  final: boolean,
): { readonly status: number; readonly fls: string } {
  const status = run(dir, "pdflatex", pdflatexArgs(final));
  return { status, fls: readFileSync(join(dir, `${JOB}.fls`), "utf8") };
}

/** The record of a build of `paper`: the loop the build runs, then `recordSources` over what it left. */
function recordOf(paper: string): string {
  const dir = join(scratch, paper);
  cpSync(join(CORPUS, paper), dir, { recursive: true });
  rmSync(join(dir, TRUTH), { force: true });
  const first = pass(dir, false);
  const bibtexExit =
    bibInput(dir).kind === "needed" ? run(dir, "bibtex", [JOB]) : null;
  const rest = [pass(dir, false), pass(dir, true)];
  const last = rest[rest.length - 1];
  if (last?.status !== 0)
    throw new Error(
      `${paper}: the last pdflatex pass exited ${String(last?.status)}`,
    );
  const recorded = recordSources(
    { files: nodeFiles, listDir: nodeListDir, texOutput },
    dir,
    {
      fls: [first, ...rest].map((p) => p.fls),
      bibtexExit,
    },
  );
  if (recorded.kind !== "recorded")
    throw new Error(`${paper}: ${recorded.why}`);
  return serializeSourcesRecord(recorded.record);
}

describe.skipIf(missing("pdflatex and bibtex", hasTex))(
  "what the build records for the accepted papers of fixtures/accepted-papers",
  () => {
    it.each(PAPERS)("%s: tex-truth.json is TeX's own answer", async (paper) => {
      await expect(recordOf(paper)).toMatchFileSnapshot(
        join(CORPUS, paper, TRUTH),
      );
    });

    it.each(NOT_BUILT)(
      "%s still does not compile here: its record is by hand, and the reason is still true",
      (paper) => {
        expect(() => recordOf(paper)).toThrow(/last pdflatex pass exited/);
      },
    );
  },
);
