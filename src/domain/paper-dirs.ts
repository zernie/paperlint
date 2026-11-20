/**
 * Which papers a path given to `paperlint lint` reaches (#582). One owner for the question, so the
 * claimed scope, the papers' own settings and the record checks cannot disagree about it.
 *
 * The rule, every case of which is a row in `paper-dirs.test.ts`:
 *   - a paper is a folder with `paper.tex` or `PIPELINE-STATUS.md` at its top. `paperlint.json` alone
 *     is the project's settings, not a paper;
 *   - a path inside a paper (the paper itself, a review card, its `reviews/`) reaches the nearest
 *     paper at or above it, looking only up, so a snapshot kept beside the card never stands in for
 *     the paper the card belongs to;
 *   - any other folder (the project root, a papers directory, an archive) reaches the papers below
 *     it, at any depth; the walk stops at each paper, so a copy kept inside one is never a paper;
 *   - nothing under a folder named `extra/` is a paper, the same reach as lint's own ignore.
 */
import { unique } from "remeda";
import { dirname, join, sep } from "node:path";
import { STATUS_FILE } from "./paper-folder.ts";
import { ESCAPE_HATCH } from "./paper-layout.ts";
import { MAIN_FILE } from "./paper-sources.ts";
import { absolutePath } from "./paths.ts";
import type { IsFile } from "./paper-folder.ts";

/** The two questions the rule asks of the disk. */
export interface PaperTree extends IsFile {
  /** The folders a walk enters below `dir`: not hidden, not installed packages, not `extra/`. */
  subfolders(dir: string): readonly string[];
}

/** The files that make a folder a paper. */
export const PAPER_MARKERS: readonly string[] = [MAIN_FILE, STATUS_FILE];

const underExtra = (dir: string): boolean =>
  dir.split(sep).includes(ESCAPE_HATCH);

export const isPaper = (dir: string, tree: IsFile): boolean =>
  !underExtra(dir) &&
  PAPER_MARKERS.some((m) => tree.isFile(absolutePath(join(dir, m))));

/** The nearest paper at or above `dir`; null when there is none. */
export const paperOwning = (dir: string, tree: IsFile): string | null => {
  if (isPaper(dir, tree)) return dir;
  const parent = dirname(dir);
  return parent === dir ? null : paperOwning(parent, tree);
};

/** The papers below `dir`, at any depth, not looking inside any paper it finds. */
export const papersBelow = (dir: string, tree: PaperTree): readonly string[] =>
  tree
    .subfolders(dir)
    .flatMap((d) => (isPaper(d, tree) ? [d] : papersBelow(d, tree)));

/** The papers the absolute folders `dirs` reach, each once, in the order they were reached. */
export const papersReached = (
  dirs: readonly string[],
  tree: PaperTree,
): readonly string[] =>
  unique(
    dirs.flatMap((d) => {
      const owner = paperOwning(d, tree);
      return owner === null ? papersBelow(d, tree) : [owner];
    }),
  );
