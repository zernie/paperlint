/**
 * Where the project's papers are, and where a path sits among them: the one reader of the
 * `papersDir` setting, for `paperlint lint` and for the hooks that ask which paper a write lands in.
 *
 * ── WHY ONE MODULE ───────────────────────────────────────────────────────────────
 * The hooks shipped as standalone programs could import nothing but `vigiles/hook`, so each read the
 * setting again and tidied its spelling with regular expressions; `"./papers"`, `"x/../papers"` and a
 * list of directories each slipped past a different copy (#326). Here the setting is read once, every
 * directory is made absolute with `path.resolve`, and a path is placed by `path.relative`, so every
 * spelling the project root resolves the same way is the same directory, by construction.
 */
import { isAbsolute, relative, resolve, sep } from "node:path";
import { DEFAULT_PAPERS_ROOT } from "#lib/paper-config";
import { CORPORA_DIR } from "./domain/corpus-record.ts";

/** The papers directory field of the settings, read by its one declared name; the default when absent. */
export function papersDirOf(opts: { readonly papersDir?: unknown }): unknown {
  const declared = opts.papersDir;
  return declared === undefined ? DEFAULT_PAPERS_ROOT : declared;
}

/** The papers directory may be one directory or several; both spellings normalise to a list. */
export function toPaths(papers: unknown): readonly string[] {
  if (typeof papers === "string") return papers.trim() ? [papers.trim()] : [];
  if (Array.isArray(papers))
    return papers.filter(
      (x): x is string => typeof x === "string" && x.trim() !== "",
    );
  return [];
}

/** The papers directories of a read config, absolute: each relative to the project root. */
export const papersRoots = (cfg: {
  readonly opts: { readonly papersDir?: unknown };
  readonly root: string;
}): readonly string[] =>
  toPaths(papersDirOf(cfg.opts)).map((rel) => resolve(cfg.root, rel));

/**
 * The segments of `file` below the first of `roots` that holds it, the paper's folder first; null
 * when it is under none of them. `file` must be absolute; so must the roots (`papersRoots`).
 */
export function segmentsUnder(
  file: string,
  roots: readonly string[],
): readonly string[] | null {
  const below = roots
    .map((root) => relative(root, file))
    .find(
      (rel) =>
        rel !== "" &&
        rel !== ".." &&
        !rel.startsWith(`..${sep}`) &&
        !isAbsolute(rel),
    );
  return below === undefined ? null : below.split(sep);
}

/**
 * Whether the absolute folder `dir` is a venue corpus of one of `roots`, or inside one:
 * `<root>/venues/<venue>/` and below. A paper found there is an accepted paper's source kept in the
 * corpus, not one of the project's papers (#215), so no paper rule judges it.
 */
export function inCorpus(dir: string, roots: readonly string[]): boolean {
  // Each root on its own: roots may overlap (`.` and `papers`), and the first that holds `dir` need
  // not be the one whose `venues/` it is in.
  return roots.some((root) => {
    const [first, venue] = segmentsUnder(dir, [root]) ?? [];
    return first === CORPORA_DIR && venue !== undefined;
  });
}
