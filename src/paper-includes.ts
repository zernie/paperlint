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
 */
import { join, relative } from "node:path";
import { PAPERLINT_SETTINGS } from "#eslint-rules/paper-context";
import { callerPath } from "./caller-path.ts";
import type { AbsolutePath } from "./domain/paths.ts";
import type { ConfigBlock } from "./rules-config.ts";
import { bodyFiles, type PaperDeps, type Unread } from "./tex-paper.ts";

/** One paper's main file and body files, and the includes that resolved nowhere. */
export interface PaperBody {
  readonly dir: string;
  readonly main: AbsolutePath;
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
    return [{ dir, main, files: body.files, missing: body.missing }];
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
