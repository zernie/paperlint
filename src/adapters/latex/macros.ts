/**
 * The author's own macros, read off the parse tree for `artifact/upload-current`: the value each
 * argument-less one is defined to (`\newcommand`, `\newcommand*`, `\renewcommand`, `\providecommand`,
 * `\def` and its kin), and the names a source uses. Pure.
 *
 * A value is the definition's body as written (`41.2\%`), not what TeX prints: two definitions that
 * print alike but are written differently are two values. A name defined twice keeps its last value.
 * A use is any occurrence of the name that is not its own definition, wherever it stands (a
 * definition's body included): the name in `\newcommand{\x}` is not a use of `\x`.
 */
import { printRaw } from "@unified-latex/unified-latex-util-print-raw";
import { countBy } from "remeda";
import type { MacroValue } from "../../ports/latex.ts";
import { definitionOf } from "./abstract.ts";
import { isNode, visited, type Macro } from "./nodes.ts";
import { parseLatex } from "./parse.ts";

/** Every macro node of the source, in document order. */
const macrosIn = (src: string): readonly Macro[] =>
  visited(parseLatex(src).root, () => false).flatMap((v) =>
    isNode(v) && v.type === "macro" ? [v] : [],
  );

/** Each name `src` defines without arguments, and its body as written, in source order. */
export const macroValuesOf = (src: string): readonly MacroValue[] =>
  macrosIn(src).flatMap((m) =>
    definitionOf(m).flatMap(([name, body]) =>
      body === null ? [] : [{ name, value: printRaw([...body]).trim() }],
    ),
  );

/** The names `src` uses: occurring more often than it defines them. */
export const macrosUsedOf = (src: string): readonly string[] => {
  const macros = macrosIn(src);
  const seen = countBy(macros, (m) => m.content);
  const defined = countBy(
    macros.flatMap((m) => definitionOf(m).map(([name]) => name)),
    (n) => n,
  );
  return Object.entries(seen).flatMap(([n, c]) =>
    c > (defined[n] ?? 0) ? [n] : [],
  );
};
