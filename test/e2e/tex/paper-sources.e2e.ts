/**
 * TeX's own answer for the planted papers of `fixtures/paper-sources/`, recorded beside each one as
 * `tex-truth.json` — so the values the module's tests compare against (`src/paper-sources.test.ts`)
 * were written by TeX, not by the hand that writes the module (docs/design/paper-sources.md §5).
 *
 * Each paper is copied to a scratch directory and built the way a person builds it by hand:
 * `pdflatex -recorder`, `bibtex`, then two more `pdflatex -recorder` passes. Read from the run:
 *
 *   inputs     the `.tex` files inside the paper directory that pdflatex opened (`.fls` INPUT, every pass)
 *   written    the `.bib` files pdflatex wrote — a `filecontents` block TeX did write (`.fls` OUTPUT)
 *   databases  what bibtex read (`.blg`, `Database file #n:`)
 *   citations  what the paper cites (`.aux`, `\citation{…}`)
 *   bibitems   the entries bibtex found for them (`.bbl`, `\bibitem{…}`)
 *
 * The recorded file is compared byte for byte (`toMatchFileSnapshot`): a TeX that answers
 * differently fails here, and `vitest -u` on a machine with TeX writes the new answer.
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
import { cacheRoot, cachedTree } from "../../../dist/toolchain.js";
import { missing } from "../need.ts";

const ROOT = dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url)))));
const FIXTURES = join(ROOT, "fixtures", "paper-sources");
const PAPERS = readdirSync(FIXTURES).filter((d) =>
  existsSync(join(FIXTURES, d, "paper.tex")),
);

/** paperlint's TeX Live when it is installed, else whatever `pdflatex` is on PATH. */
const tree = cachedTree(cacheRoot(process.env));
const env = {
  ...process.env,
  PATH: [tree?.bin, process.env.PATH].filter(Boolean).join(delimiter),
};
const hasTex =
  spawnSync("pdflatex", ["--version"], { env }).status === 0 &&
  spawnSync("bibtex", ["--version"], { env }).status === 0;

const scratch = realpathSync(
  mkdtempSync(join(tmpdir(), "paper-sources-truth-")),
);
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

/** One program run in `dir`; its status is not judged — TeX's warnings are part of the answer. */
const run = (dir: string, cmd: string, args: readonly string[]): void => {
  spawnSync(cmd, [...args], { cwd: dir, env, encoding: "utf8" });
};

/** A recorded file's lines of one kind, paths as TeX wrote them, minus a leading `./`. */
const flsLines = (fls: string, kind: "INPUT" | "OUTPUT"): string[] =>
  fls
    .split("\n")
    .filter((l) => l.startsWith(`${kind} `))
    .map((l) => l.slice(kind.length + 1).replace(/^\.\//, ""));

/** Distinct, in first-seen order. */
const distinct = (xs: readonly string[]): string[] => [...new Set(xs)];

/** Every capture of `re` (one group) in `text`, in order. */
const captures = (text: string, re: RegExp): string[] =>
  [...text.matchAll(re)].map((m) => m[1] ?? "");

/** Build a copy of `paper` and read TeX's answer off the files the run left. */
function truthOf(paper: string): Record<string, readonly string[]> {
  const dir = join(scratch, paper);
  cpSync(join(FIXTURES, paper), dir, { recursive: true });
  const pass = (): string => {
    run(dir, "pdflatex", [
      "-recorder",
      "-interaction=nonstopmode",
      "paper.tex",
    ]);
    return readFileSync(join(dir, "paper.fls"), "utf8");
  };
  const first = pass();
  run(dir, "bibtex", ["paper"]);
  const fls = [first, pass(), pass()].join("\n");
  // A file the run did not write (no \bibdata: bibtex writes no .bbl) reads as empty.
  const read = (name: string): string =>
    existsSync(join(dir, name)) ? readFileSync(join(dir, name), "utf8") : "";
  return {
    inputs: distinct(
      flsLines(fls, "INPUT").filter(
        (p) => p.endsWith(".tex") && !p.startsWith("/"),
      ),
    ),
    written: distinct(
      flsLines(fls, "OUTPUT").filter((p) => p.endsWith(".bib")),
    ),
    databases: captures(read("paper.blg"), /^Database file #\d+: (.+)$/gm),
    citations: distinct(captures(read("paper.aux"), /^\\citation\{(.+)\}$/gm)),
    bibitems: captures(read("paper.bbl"), /\\bibitem\{([^}]+)\}/g),
  };
}

describe.skipIf(missing("pdflatex and bibtex", hasTex))(
  "what TeX reads for the planted papers of fixtures/paper-sources",
  () => {
    it.each(PAPERS)("%s: tex-truth.json is TeX's own answer", async (paper) => {
      const recorded = `${JSON.stringify(truthOf(paper), null, 2)}\n`;
      await expect(recorded).toMatchFileSnapshot(
        join(FIXTURES, paper, "tex-truth.json"),
      );
    });
  },
);
