/**
 * What the build records for the planted papers of `fixtures/paper-sources/`, written beside each one
 * as `tex-truth.json` — TeX's own answer, so the tests that run the module on a paper compare with
 * what TeX did, not with what the hand that wrote the module believes (docs/design/paper-sources.md §1).
 *
 * Each paper is copied to a scratch directory and built the way the build builds it: the build's own
 * pdflatex arguments (`-recorder` among them) and TEXINPUTS, a bibtex run when the `.aux` names a
 * database, the passes after it — then the build's own record step (`recordSources`) turns the files
 * TeX and bibtex left into `_build/sources.json`. That file, as written, is the snapshot: schema 1,
 * paths relative to the paper, hashes over the files' bytes, so it depends on neither the machine's
 * paths nor the time. It is compared byte for byte (`toMatchFileSnapshot`): a TeX that answers
 * differently fails here, and `vitest -u` on a machine with TeX writes the new answer.
 *
 * A second test builds three papers through `paperlint build` itself and compares the record the command
 * wrote with the snapshot: the wiring (the flags, the passes handed to the recorder) is the one that
 * produced the truth.
 *
 *   npm run test:e2e:tex
 */
import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { nodeFiles, nodeListDir } from "../../../dist/adapters/node/index.js";
import { referencesChecker } from "../../../dist/adapters/references/index.js";
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
import { buildIn } from "./build-in.ts";

const ROOT = dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url)))));
const FIXTURES = join(ROOT, "fixtures", "paper-sources");
const TRUTH = "tex-truth.json";
const PAPERS = readdirSync(FIXTURES).filter((d) =>
  existsSync(join(FIXTURES, d, "paper.tex")),
);

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
  mkdtempSync(join(tmpdir(), "paper-sources-truth-")),
);
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

/** A copy of a planted paper in `where`, without its snapshot. */
function copyOf(paper: string, where: string): string {
  const dir = join(where, paper);
  cpSync(join(FIXTURES, paper), dir, { recursive: true });
  rmSync(join(dir, TRUTH), { force: true });
  return dir;
}

/** One program run in `dir`, and its exit code; not judged — TeX's warnings are part of the answer. */
const run = (dir: string, cmd: string, args: readonly string[]): number =>
  spawnSync(cmd, [...args], { cwd: dir, env, encoding: "utf8" }).status ?? -1;

/** One pdflatex pass, with the build's own arguments, and what `-recorder` wrote for it. */
function pass(dir: string, final: boolean): string {
  run(dir, "pdflatex", pdflatexArgs(final));
  return readFileSync(join(dir, `${JOB}.fls`), "utf8");
}

/**
 * The record of a build of `paper`: the loop the build runs — a pass, bibtex when the `.aux` names a
 * database, the passes after it, the last one final — and then `recordSources` over what it left. Run
 * to the end whatever bibtex reported: a paper whose bibtex fails is a paper whose record says so.
 */
function recordOf(paper: string): string {
  const dir = copyOf(paper, scratch);
  const first = pass(dir, false);
  const bibtexExit =
    bibInput(dir).kind === "needed" ? run(dir, "bibtex", [JOB]) : null;
  const rest = [pass(dir, false), pass(dir, true)];
  const recorded = recordSources(
    { files: nodeFiles, listDir: nodeListDir, texOutput },
    dir,
    {
      fls: [first, ...rest],
      bibtexExit,
    },
  );
  if (recorded.kind !== "recorded")
    throw new Error(`${paper}: ${recorded.why}`);
  return serializeSourcesRecord(recorded.record);
}

describe.skipIf(missing("pdflatex and bibtex", hasTex))(
  "what the build records for the planted papers of fixtures/paper-sources",
  () => {
    it.each(PAPERS)("%s: tex-truth.json is TeX's own answer", async (paper) => {
      await expect(recordOf(paper)).toMatchFileSnapshot(
        join(FIXTURES, paper, TRUTH),
      );
    });

    it("nothing in a record names the machine's directories or a time", () => {
      const text = recordOf("p1");
      expect(text).not.toContain(scratch);
      expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    });
  },
);

/** A consumer holding one planted paper under `papers/`, for `paperlint build papers/<paper>`. */
function consumerOf(paper: string): string {
  const work = realpathSync(mkdtempSync(join(scratch, "consumer-")));
  mkdirSync(join(work, "papers"));
  copyOf(paper, join(work, "papers"));
  writeFileSync(
    join(work, "package.json"),
    JSON.stringify({ name: "consumer", private: true }),
  );
  return work;
}

describe.skipIf(missing("pdflatex and bibtex", hasTex))(
  "`paperlint build` writes the record the snapshot holds",
  () => {
    it.each(["v3-declared", "v8-jobname", "p1"])(
      "%s: _build/sources.json is tex-truth.json",
      async (paper) => {
        const work = consumerOf(paper);
        const built = await buildIn(work, [`papers/${paper}`], {
          asked: [],
          checkReferences: referencesChecker({ today: () => "2026-09-27" }),
        });
        expect(built.status, built.out).toBe(0);
        expect(built.out).toMatch(
          /; sources: \d+ files? read → _build\/sources\.json/,
        );
        expect(
          readFileSync(
            join(work, "papers", paper, "_build", "sources.json"),
            "utf8",
          ),
        ).toBe(readFileSync(join(FIXTURES, paper, TRUTH), "utf8"));
      },
    );
  },
);
