/**
 * THE FILES OF A PAPER'S BODY, handed to ESLint — so the rules over ESLint's LaTeX text read a paper
 * whose body is in `sections/*.tex`, and report each finding at its own file and line (#144).
 *
 * The set is what TeX read, as the last build recorded it (`_build/sources.json`, `paperRecord` in
 * src/paper-record.ts): `paper.tex` and the `.tex` files of the paper directory TeX read after
 * `\\begin{document}`. Nothing here reads TeX source or looks for an include on disk. Not a glob over
 * every `.tex`: a frozen version under `versions/`, a macro file the preamble includes and a scratch
 * file nothing includes are not the paper. A paper with no record, or one it has changed since, is
 * `paper.tex` alone — `paper/sources-fresh` (src/sources-rules.ts) says the rest went unlinted.
 *
 * Two blocks per paper, both relative to the paper's directory (`basePath`):
 *
 * 1. a global un-ignore of each body file by name. paperlint's scope ignores every file it does not
 *    claim (src/paper-files.ts); the fragment block (`buildConfig`) claims every `.tex` but
 *    `paper.tex`, so only the files named here are ever enumerated;
 * 2. `settings.paperlint.paper` for `paper.tex` and its body files: the main file and the whole set,
 *    for the rules whose verdict is the paper's (eslint-rules/paper-context.ts).
 *
 * ── ONLY `.tex` FILES ARE HANDED TO ESLint (#153) ────────────────────────────────
 * TeX may read a body file of another extension: `\\input{paper.bbl}` in a paper that ships bibtex's
 * output instead of a `.bib`, a plot exported as `.pgf`. Handed to ESLint, such a file got no
 * language — the fragment block claims `.tex` only — and the JavaScript parser stopped at its first
 * `%`. It is not given the LaTeX language either: the fragment rules judge and `--fix` the prose an
 * author writes in that file, and a file of another extension is in practice a tool's output, whose
 * words are someone else's (the titles of cited works) and whose fix the next run of the tool
 * overwrites. TeX still reads it, and so does `readPaper`: the rules over the whole paper see it
 * spliced into `paper.tex`, where TeX typesets it.
 *
 * ── NOR IS A `.tex` TeX WROTE ────────────────────────────────────────────────────
 * A `filecontents` block may write a `.tex` the body `\\input`s (the record lists it as an input and
 * as written, src/domain/tex-run.ts). Its words are the block's, which the author edits in the file
 * holding the block; a fix made in the written copy is overwritten by an `[overwrite]` block on the next
 * build, and splits the copy from the block without one. So it is read the way TeX reads it — spliced by
 * `readPaper`, for the rules over the whole paper — and is not handed to ESLint as a file of its own.
 */
import { extname, join, relative } from "node:path";
import { PAPERLINT_SETTINGS } from "#eslint-rules/paper-context";
import { callerPath } from "./caller-path.ts";
import type { AbsolutePath } from "./domain/paths.ts";
import {
  paperRecord,
  recordedFiles,
  type RecordReadDeps,
} from "./paper-record.ts";
import type { ConfigBlock } from "./rules-config.ts";

/** The files the fragment block (`buildConfig`) claims: the only body files ESLint is handed. */
export const FRAGMENT_FILES: readonly string[] = ["**/*.tex"];

/** Whether a body file is one the fragment block claims — the extension its glob names. */
const isFragment = (file: string): boolean => extname(file) === ".tex";

/** One paper's main file and the body files of its last build. */
export interface PaperBody {
  readonly dir: string;
  readonly main: AbsolutePath;
  /** The body files ESLint lints, each as a fragment: the `.tex` ones TeX did not write. None without a fresh record. */
  readonly files: readonly AbsolutePath[];
}

/** The body of each paper directory in `dirs` that has a `paper.tex`. */
export function paperBodies(
  dirs: readonly string[],
  deps: RecordReadDeps,
): readonly PaperBody[] {
  return dirs.flatMap((dir) => {
    const main = callerPath(join(dir, "paper.tex"));
    if (!deps.files.isFile(main)) return [];
    const record = paperRecord(dir, deps);
    if (record.kind !== "fresh") return [{ dir, main, files: [] }];
    const written = new Set(
      record.record.written.map((w) => callerPath(join(dir, w))),
    );
    const files = recordedFiles(dir, record.record, "body").filter(
      (f) => f !== main && isFragment(f) && !written.has(f),
    );
    return [{ dir, main, files }];
  });
}

/** The config blocks that hand ESLint each paper's body files, and the paper to every one of them. */
export const includeBlocks = (
  bodies: readonly PaperBody[],
): readonly ConfigBlock[] =>
  bodies.flatMap((b) => {
    const rel = b.files.map((f) => relative(b.dir, f));
    const paper = { main: b.main, files: [b.main, ...b.files] };
    return [
      ...(rel.length > 0
        ? [{ basePath: b.dir, ignores: rel.map((r) => `!${r}`) }]
        : []),
      {
        basePath: b.dir,
        files: ["paper.tex", ...rel],
        settings: { [PAPERLINT_SETTINGS]: { paper } },
      },
    ];
  });
