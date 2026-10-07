/**
 * A LaTeX source → its unified-latex tree, as one `ParsedTex` that keeps the two together.
 *
 * ── CITATION KEYS ARE ARGUMENTS, NOT TEXT ────────────────────────────────────────
 * unified-latex attaches arguments only to macros it has a signature for. natbib's and biblatex's
 * citation commands have none, so `\citep{aisec2025}` came back with its key as a separate group —
 * readable as prose. `KEY_SIGNATURES` declares them, and the other macros whose arguments name a
 * file, a label or a URL rather than say something, so their arguments are attached and the
 * rendered text skips them structurally. `\href` says something in one argument and names a URL in
 * the other, so it is signed too, and `KEY_ARGUMENT` says which of its arguments is not text.
 */
import type * as Ast from "@unified-latex/unified-latex-types";
import { getParser } from "@unified-latex/unified-latex-util-parse";
import { once } from "remeda";
import { withoutFalseBranches } from "./conditionals.ts";

const signed = (
  names: readonly string[],
  signature: string,
): readonly (readonly [string, { readonly signature: string }])[] =>
  names.map((m) => [m, { signature }] as const);

/** Citation commands: their `{…}` argument is a key, their `[…]` ones are notes the reader sees. */
export const CITATION_MACROS: ReadonlySet<string> = new Set([
  "cite",
  "citep",
  "citet",
  "citealp",
  "citealt",
  "citeauthor",
  "citeyear",
  "citeyearpar",
  "Citep",
  "Citet",
  "nocite",
  "parencite",
  "textcite",
  "autocite",
  "footcite",
]);

/** Macros whose arguments are keys, labels, files or URLs — never text a reader sees. */
export const KEY_SIGNATURES: Readonly<
  Record<string, { readonly signature: string }>
> = Object.fromEntries([
  ...signed([...CITATION_MACROS], "o o m"),
  ...signed(
    [
      "label",
      "ref",
      "eqref",
      "pageref",
      "autoref",
      "cref",
      "Cref",
      "url",
      "input",
      "include",
      "subfile",
      "bibliography",
      "bibliographystyle",
    ],
    "m",
  ),
  // biblatex's resources take options (`[location=remote]`) before the name.
  ...signed(["addbibresource", "addglobalbib", "addsectionbib"], "o m"),
  // bibentry's: writes `\bibdata` as `\bibliography` does, and typesets nothing.
  ...signed(["nobibliography"], "m"),
  ...signed(["includegraphics"], "s o o m"),
  ...signed(["usepackage", "RequirePackage", "documentclass"], "o m o"),
]);

/**
 * Macros that print some arguments and not others: the index of the one argument that is a key or
 * a URL. A citation (`o o m`) prints its `[…]` notes, not its `{…}` key; `\href` (`m m`) prints its
 * link text, not its URL.
 */
export const KEY_ARGUMENT: ReadonlyMap<string, number> = new Map([
  ...[...CITATION_MACROS].map((m) => [m, 2] as const),
  ["href", 0],
]);

const LINK_SIGNATURES = Object.fromEntries(signed(["href"], "m m"));

/**
 * Declarations unified-latex has no signature for: signed so their arguments (sizes, not text)
 * attach to them instead of standing beside them as groups a reader would seem to see.
 */
const DECLARATION_SIGNATURES = Object.fromEntries([
  ...signed(["fontsize"], "m m"),
  // The layout commands `format/layout-override` reads: a spacing factor, geometry's key list.
  ...signed(["linespread", "geometry", "newgeometry"], "m"),
]);

/**
 * Macros that define other macros or environments. A heading in a body is no section where it is
 * written, so the outline skips these; the rendered text reads a body as written, since nothing here
 * expands macros. `\def` and its kin get a signature so the name and the body attach to them; a
 * parameter text (`\def\x#1{…}`) is not modelled.
 */
export const DEFINITION_MACROS: ReadonlySet<string> = new Set([
  "newcommand",
  "renewcommand",
  "providecommand",
  "DeclareRobustCommand",
  "newenvironment",
  "renewenvironment",
  "def",
  "gdef",
  "edef",
  "xdef",
]);

const DEF_SIGNATURES = Object.fromEntries(
  signed(["def", "gdef", "edef", "xdef"], "m m"),
);

// Not exported: a `ParsedTex` carries this property, and the one way to write it is `parseLatex`.
const PARSED = Symbol("ParsedTex");

/** A source and ITS tree: only `parseLatex` makes one, so a tree cannot be paired with another source. */
export interface ParsedTex {
  readonly src: string;
  readonly root: Ast.Root;
  readonly [PARSED]: true;
}

/** One parser for the process, made on first use: building one compiles its grammar. */
const parser = once(() =>
  getParser({
    macros: {
      ...KEY_SIGNATURES,
      ...LINK_SIGNATURES,
      ...DECLARATION_SIGNATURES,
      ...DEF_SIGNATURES,
    },
  }),
);

/**
 * The trees parsed last, by their source: a tree is a pure function of its text, and one lint of a
 * paper asks for the same texts many times — every rule that reads the paper (`readPaper`,
 * `paperSources`) parses `paper.tex`, its includes and the assembled whole again. Measured 2026-10-06
 * on the accepted ACM paper of the corpus: 0.9 s per `paperSources`, seven of them per lint,
 * 50–76 ms with the memo.
 *
 * Bounded by the SOURCE TEXT it holds (UTF-16 units, about bytes for TeX), least recently used out. A count bound is wrong both ways:
 * 64 trees held 64 versions of one file in an editor (186 MiB for a 48 KiB paper, design doc §9,
 * finding 5), and 8 trees thrashed on a paper with ten includes — the rules read them in a cycle, so
 * every read missed and the corpus lint timed out. `MEMO_BYTES` holds the largest paper of the corpus
 * (150 KB of sources, and the assembled whole) and about ten versions of a 48 KiB file.
 */
const MEMO_BYTES = 512 * 1024;
const memo = new Map<string, ParsedTex>();

/** The texts to evict, least recent first, so that `adding` more fits under `MEMO_BYTES`. */
const evicted = (adding: number): readonly string[] => {
  const keys = [...memo.keys()];
  const total = keys.reduce((n, k) => n + k.length, adding);
  const { out } = keys.reduce<{
    readonly left: number;
    readonly out: readonly string[];
  }>(
    (acc, k) =>
      acc.left > MEMO_BYTES
        ? { left: acc.left - k.length, out: [...acc.out, k] }
        : acc,
    { left: total, out: [] },
  );
  return out;
};

/** A LaTeX source → its tree, without the branches `\iffalse … \fi` hides (`conditionals.ts`). */
export function parseLatex(src: string): ParsedTex {
  const hit = memo.get(src);
  const parsed: ParsedTex = hit ?? {
    src,
    root: withoutFalseBranches(src, parser().parse(src)),
    [PARSED]: true,
  };
  // Most recent last: a hit moves to the end, and the first keys are the ones used least recently.
  // eslint-disable-next-line functional/immutable-data -- the bounded memo, see above
  memo.delete(src);
  // eslint-disable-next-line functional/immutable-data -- the bounded memo, see above
  evicted(src.length).forEach((k) => memo.delete(k));
  // eslint-disable-next-line functional/immutable-data -- the bounded memo, see above
  memo.set(src, parsed);
  return parsed;
}

/**
 * The part of a source's tree TeX reads: everything up to and with the `document` environment.
 * TeX stops at `\end{document}`, so a `\bibliography`, a `thebibliography`, a block or an `\input`
 * parked after it is never read. A source with no `document` environment is read whole.
 */
export function liveRoot(t: ParsedTex): Readonly<Ast.Root> {
  const end = t.root.content.findIndex(
    (n) => n.type === "environment" && n.env === "document",
  );
  return end < 0
    ? t.root
    : { ...t.root, content: t.root.content.slice(0, end + 1) };
}
