/**
 * THE FILES PAPERLINT OWNS — read off its own config, and made the only thing ESLint may reach.
 *
 * paperlint's blocks name the files they lint (`PIPELINE-STATUS.md`, `paper.tex`, `reviews/*.md`,
 * …). That list is the whole scope of `paperlint lint`, and this module turns it
 * into two things ESLint understands:
 *
 * 1. **A global ignore of everything else** (`scopeToOwned`). Handing ESLint a directory is not
 *    enough: its built-in defaults lint every JavaScript file it finds, whatever our config says.
 *    Measured on a consumer project with vendored code under a paper's `repro/` folder: 1,877
 *    files, 74 errors ("'return' outside of function", "Definition for rule … was not found"),
 *    zero of them on a paper file, exit 1 — and nothing in the settings could turn it off. With
 *    the ignore, a stray script under the papers directory is never enumerated at all, and a file
 *    named on the command line can be asked about (`ESLint#isPathIgnored`) with ESLint's own
 *    matcher instead of a hand-written one.
 *
 * 2. **Each rule scoped to the files it was written for** (`ruleOwners` + `narrowToOwners`).
 *    One plugin NAME is bound to different plugin objects in different blocks: `paper` holds
 *    `stages`/`source`/`author-list` beside `PIPELINE-STATUS.md` and `typography` beside
 *    `paper.tex`. So a consumer block that named `paper/source`
 *    for every file under the papers directory reached `paper.tex`, where `paper` has no `source`
 *    — and ESLint threw `Could not find "source" in plugin "paper"` from inside `lintFiles`,
 *    after paperlint's own validation had (correctly) accepted the id. A block is therefore split
 *    per owner and its `files` ANDed with the owner's (ESLint's nested-array form), so a rule can
 *    only land where its plugin is registered.
 *
 * Both read ONE definition of "the files paperlint lints": `ownedScopes`, each own block's `files`
 * together with its `ignores`. The globs alone are not that definition. The sibling-card block
 * claims every markdown file under `siblings/` EXCEPT the index, and a rule whose plugin is
 * registered for every file (`pdf`) used to keep the consumer block's `files` as they were — so a
 * venue preset's rules reached `siblings/README.md`, a block with no `language` matched it, and
 * ESLint parsed the markdown as JavaScript (#101). Now every generated block narrows to scopes,
 * exceptions included, and a plugin registered everywhere owns exactly what paperlint lints.
 *
 * ESLint's semantics that this leans on, each measured against ESLint 10 before writing it:
 * - a global-ignore pattern that matches a DIRECTORY hides everything inside it, so directories
 *   must be un-ignored (`!` + a pattern ending in a slash) before owned files can be;
 * - that un-ignores `node_modules/` and `.git/` too — ESLint's own defaults — so they are
 *   re-ignored after, or a `paper.tex` inside a dependency would be linted;
 * - later global-ignore patterns win, across blocks, in config order;
 * - `files: [["a", "b"]]` matches a file only when BOTH patterns match.
 */
import { relative, sep } from "node:path";
import type { ConfigBlock, RuleBlock, RuleEntry } from "./rules-config.ts";

/**
 * Which papers' own files paperlint's blocks claim. `any` is the config's SHAPE, for the rule list and
 * the docs: a file in any folder. `papers` is what `paperlint lint` runs on: the real papers, as glob
 * prefixes relative to ESLint's `cwd` ("" for `cwd` itself), so a copy of a paper kept inside one (a
 * review snapshot, a build copy) is claimed by no block (#582).
 */
export type PaperScope =
  | { readonly kind: "any" }
  | {
      readonly kind: "papers";
      readonly cwd: string;
      readonly prefixes: readonly string[];
    };

export const ANY_PAPER: PaperScope = { kind: "any" };

/** The characters a glob reads as syntax, escaped so a folder's name matches only itself. Pure. */
const literalGlob = (path: string): string =>
  path.replace(/[\\*?[\]{}()!+@]/gu, "\\$&");

/** `to` relative to `from`, `/`-separated. Pure. */
const posixRelative = (from: string, to: string): string =>
  relative(from, to).split(sep).join("/");

/** The papers `dirs` under ESLint's `cwd`: the scope `paperlint lint` lints. Pure. */
export const papersScope = (
  dirs: readonly string[],
  cwd: string,
): PaperScope => ({
  kind: "papers",
  cwd,
  prefixes: dirs.map((d) => literalGlob(posixRelative(cwd, d))),
});

/** A glob of a paper's own file (`paper.tex`, `reviews/*.md`) in each paper of `scope`. Pure. */
export const paperFiles = (
  scope: PaperScope,
  glob: string,
): readonly string[] =>
  scope.kind === "any"
    ? [`**/${glob}`]
    : scope.prefixes.map((p) => (p === "" ? glob : `${p}/${glob}`));

/**
 * A glob relative to `cwd`, as the block whose `basePath` is `base` must write it — ESLint reads a
 * block's patterns from its `basePath`, and a paper's own settings carry the paper's folder. None
 * when the glob names files outside `base`: that block can never reach them. A glob that starts with
 * `**` matches at any depth and is kept as it is. Pure.
 */
export const rebaseGlob = (
  glob: string,
  cwd: string,
  base: string,
): readonly string[] => {
  if (glob.startsWith("**")) return [glob];
  const up = posixRelative(base, cwd);
  if (!up.startsWith(".."))
    return [up === "" ? glob : `${literalGlob(up)}/${glob}`];
  const down = `${literalGlob(posixRelative(cwd, base))}/`;
  return glob.startsWith(down) ? [glob.slice(down.length)] : [];
};

/**
 * A set of files paperlint lints: an own block's globs and the exceptions that block makes. A file is
 * in it when it matches one of `files` and none of `ignores`.
 */
export interface OwnedScope {
  readonly files: readonly string[];
  readonly ignores: readonly string[];
}

/** A `files` entry: one glob, or several that must ALL match. */
export type FilesEntry = string | readonly string[];

/** A consumer block after narrowing: its `files` may carry ANDed pairs. */
export interface ScopedBlock {
  readonly basePath: string;
  readonly files?: readonly FilesEntry[];
  readonly ignores?: readonly string[];
  readonly rules: Readonly<Record<string, RuleEntry>>;
}

/** A block's `files`, the string globs only. */
const globsOf = (files: readonly unknown[]): string[] =>
  files.filter((f): f is string => typeof f === "string");

const stringsOf = (xs: readonly unknown[] | undefined): string[] =>
  (xs ?? []).filter((x): x is string => typeof x === "string");

/**
 * Scopes with the same exceptions, merged into one: their globs united, once, in order. Keeps a
 * generated block per distinct set of exceptions rather than one per own block.
 */
const merged = (scopes: readonly OwnedScope[]): OwnedScope[] => {
  const byIgnores = new Map<string, OwnedScope>();
  for (const s of scopes) {
    const key = JSON.stringify(s.ignores);
    const had = byIgnores.get(key);
    byIgnores.set(key, {
      files: [...new Set([...(had?.files ?? []), ...s.files])],
      ignores: s.ignores,
    });
  }
  return [...byIgnores.values()];
};

/**
 * THE FILES PAPERLINT LINTS: every own block that names `files`, with its `ignores`. A block without
 * `files` (a global ignore, or the block registering `pdf` for every file) claims nothing.
 */
export function ownedScopes(own: readonly ConfigBlock[]): OwnedScope[] {
  return merged(
    own.flatMap((b) =>
      b.files === undefined
        ? []
        : [{ files: globsOf(b.files), ignores: stringsOf(b.ignores) }],
    ),
  );
}

/** Every glob paperlint's own blocks lint, once, in config order. */
export function ownedPatterns(own: readonly ConfigBlock[]): string[] {
  return [...new Set(ownedScopes(own).flatMap((s) => s.files))];
}

/** ESLint's default ignores, re-applied after directories are un-ignored. */
const ESLINT_DEFAULT_IGNORES = ["**/node_modules/", "**/.git/"];

/** A global-ignore block that leaves ESLint nothing to lint but `owned`. */
export function scopeToOwned(owned: readonly string[]): {
  readonly ignores: string[];
} {
  return {
    ignores: [
      "**/*",
      "!**/*/",
      ...owned.map((p) => `!${p}`),
      ...ESLINT_DEFAULT_IGNORES,
    ],
  };
}

/** Every `<plugin>/<rule>` a block registers. */
const ruleIdsOf = (b: ConfigBlock): string[] =>
  Object.entries(b.plugins ?? {}).flatMap(([name, plugin]) =>
    Object.keys(plugin.rules ?? {}).map((rule) => `${name}/${rule}`),
  );

/**
 * Rule id → the scopes of the blocks that register its plugin with that rule. A plugin registered
 * for every file (a block without `files`) owns every scope — everything paperlint lints, and not
 * one file more.
 */
export function ruleOwners(
  own: readonly ConfigBlock[],
): Map<string, readonly OwnedScope[]> {
  const all = ownedScopes(own);
  const found = new Map<string, OwnedScope[]>();
  for (const b of own) {
    const scopes =
      b.files === undefined
        ? all
        : [{ files: globsOf(b.files), ignores: stringsOf(b.ignores) }];
    for (const id of ruleIdsOf(b))
      found.set(id, [...(found.get(id) ?? []), ...scopes]);
  }
  return new Map([...found].map(([id, scopes]) => [id, merged(scopes)]));
}

/**
 * One consumer block → one block per owner scope, each carrying only that owner's rules, its `files`
 * ANDed with the scope's globs and its `ignores` joined by the scope's exceptions. A rule no block
 * of this config registers (the LaTeX block is absent when its parser did not load) gets no block:
 * it has no file to reach in this run, and naming it to ESLint would only crash.
 */
export function narrowToOwners(
  block: RuleBlock,
  owners: ReadonlyMap<string, readonly OwnedScope[]>,
  papers: PaperScope = ANY_PAPER,
): ScopedBlock[] {
  // Keyed by the owner's JSON, so rules with equal owners share one group of blocks.
  const groups = new Map<string, Record<string, RuleEntry>>();
  const ownerOf = new Map<string, readonly OwnedScope[]>();
  for (const [id, entry] of Object.entries(block.rules)) {
    const owner = owners.get(id);
    if (owner === undefined) continue;
    const key = JSON.stringify(owner);
    groups.set(key, { ...groups.get(key), [id]: entry });
    ownerOf.set(key, owner);
  }
  return [...ownerOf].flatMap(([key, owner]) =>
    owner.flatMap((scope) =>
      within(block, rebased(scope, papers, block.basePath), {
        ...groups.get(key),
      }),
    ),
  );
}

/**
 * `scope` as the block with `basePath` `base` must write it. The scope's globs are relative to ESLint's
 * `cwd`; a paper's own settings are read from the paper's folder (#582).
 */
function rebased(
  scope: OwnedScope,
  papers: PaperScope,
  base: string,
): OwnedScope {
  if (papers.kind === "any") return scope;
  const onto = (globs: readonly string[]): readonly string[] =>
    globs.flatMap((g) => rebaseGlob(g, papers.cwd, base));
  return { files: onto(scope.files), ignores: onto(scope.ignores) };
}

/**
 * `block`'s rules over the files both it and `scope` claim, minus both sets of exceptions; none when
 * the scope claims no file the block can reach (ESLint refuses an empty `files`).
 */
function within(
  block: RuleBlock,
  scope: OwnedScope,
  rules: Readonly<Record<string, RuleEntry>>,
): readonly ScopedBlock[] {
  if (scope.files.length === 0) return [];
  const files: readonly FilesEntry[] = block.files
    ? block.files.flatMap((f) => scope.files.map((o) => [f, o]))
    : scope.files;
  const ignores = [...(block.ignores ?? []), ...scope.ignores];
  return [
    {
      basePath: block.basePath,
      files,
      ...(ignores.length ? { ignores } : {}),
      rules,
    },
  ];
}
