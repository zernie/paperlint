/**
 * A LaTeX source → its unified-latex tree, as one `ParsedTex` that keeps the two together.
 *
 * ── CITATION KEYS ARE ARGUMENTS, NOT TEXT ────────────────────────────────────────
 * unified-latex attaches arguments only to macros it has a signature for. natbib's and biblatex's
 * citation commands have none, so `\citep{aisec2025}` came back with its key as a separate group —
 * readable as prose. `KEY_SIGNATURES` declares them, and the other macros whose arguments name a
 * file, a label or a URL rather than say something, so their arguments are attached and the
 * rendered text skips them structurally.
 */
import type * as Ast from "@unified-latex/unified-latex-types";
import { getParser } from "@unified-latex/unified-latex-util-parse";
import { once } from "remeda";

const signed = (
  names: readonly string[],
  signature: string,
): readonly (readonly [string, { readonly signature: string }])[] =>
  names.map((m) => [m, { signature }] as const);

/** Macros whose arguments are keys, labels, files or URLs — never text a reader sees. */
export const KEY_SIGNATURES: Readonly<
  Record<string, { readonly signature: string }>
> = Object.fromEntries([
  ...signed(
    [
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
    ],
    "o o m",
  ),
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
      "bibliography",
      "bibliographystyle",
      "addbibresource",
    ],
    "m",
  ),
  ...signed(["includegraphics"], "s o o m"),
  ...signed(["usepackage", "RequirePackage", "documentclass"], "o m o"),
]);

// Not exported: a `ParsedTex` carries this property, and the one way to write it is `parseLatex`.
const PARSED = Symbol("ParsedTex");

/** A source and ITS tree: only `parseLatex` makes one, so a tree cannot be paired with another source. */
export interface ParsedTex {
  readonly src: string;
  readonly root: Ast.Root;
  readonly [PARSED]: true;
}

/** One parser for the process, made on first use: building one compiles its grammar. */
const parser = once(() => getParser({ macros: { ...KEY_SIGNATURES } }));

/** A LaTeX source → its tree. */
export const parseLatex = (src: string): ParsedTex => ({
  src,
  root: parser().parse(src),
  [PARSED]: true,
});
