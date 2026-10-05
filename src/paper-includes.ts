/**
 * THE FILES OF A PAPER'S BODY, handed to ESLint — so the rules over ESLint's LaTeX text read a paper
 * whose body is in `sections/*.tex`, and report each finding at its own file and line (#144).
 *
 * The set is what TeX reads, resolved by the reader the parse-tree rules use (`bodyFiles`,
 * src/tex-paper.ts): `paper.tex` and every file an include in its document body brings in, found in
 * the paper's directory. Not a glob over every `.tex`: a frozen version under `versions/`, a macro
 * file the preamble includes and a scratch file nothing includes are not the paper.
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
 * An include may resolve to a file of another extension: `\input{paper.bbl}` in a paper that ships
 * bibtex's output instead of a `.bib`, a plot exported as `.pgf`. Handed to ESLint, such a file got
 * no language — the fragment block claims `.tex` only — and the JavaScript parser stopped at its
 * first `%`. It is not given the LaTeX language either: the fragment rules judge and `--fix` the
 * prose an author writes in that file, and a file of another extension is in practice a tool's
 * output, whose words are someone else's (the titles of cited works) and whose fix the next run of
 * the tool overwrites. TeX still reads it, and so does `readPaper`: the rules over the whole paper
 * see it spliced into `paper.tex`, where TeX typesets it.
 */
import { extname, join, relative } from "node:path";
import { PAPERLINT_SETTINGS } from "#eslint-rules/paper-context";
import { callerPath } from "./caller-path.ts";
import type { AbsolutePath } from "./domain/paths.ts";
import type { ConfigBlock } from "./rules-config.ts";
import { bodyFiles, type PaperDeps, type Unread } from "./tex-paper.ts";

/** The files the fragment block (`buildConfig`) claims: the only body files ESLint is handed. */
export const FRAGMENT_FILES: readonly string[] = ["**/*.tex"];

/** Whether a body file is one the fragment block claims — the extension its glob names. */
const isFragment = (file: string): boolean => extname(file) === ".tex";

/** One paper's main file and body files, and the includes that resolved nowhere. */
export interface PaperBody {
  readonly dir: string;
  readonly main: AbsolutePath;
  /** The body files ESLint lints, each as a fragment: the `.tex` ones. */
  readonly files: readonly AbsolutePath[];
  readonly missing: readonly Unread[];
}

/** The body of each paper directory in `dirs` that has a `paper.tex`. */
export function paperBodies(
  dirs: readonly string[],
  deps: PaperDeps,
): readonly PaperBody[] {
  return dirs.flatMap((dir) => {
    const main = callerPath(join(dir, "paper.tex"));
    const bytes = deps.files.readBytes(main);
    if (bytes === null) return [];
    const body = bodyFiles(main, new TextDecoder().decode(bytes), deps);
    const files = body.files.filter(isFragment);
    return [{ dir, main, files, missing: body.missing }];
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

/** One line per include that resolved nowhere: which text lint did not read, and why. */
export const unreadLines = (
  bodies: readonly PaperBody[],
  shown: (path: string) => string,
): readonly string[] =>
  bodies.flatMap((b) =>
    b.missing.map(
      (m) =>
        `${shown(b.main)}: lint did not read \`${m.target}\` (included by ${m.file}): ` +
        "no such file in the paper's directory or paperlint's inputs",
    ),
  );
