/** The files a source pulls in, and the body of a source that is a document of its own. */
import type * as Ast from "@unified-latex/unified-latex-types";
import type { Include } from "../../domain/paper-source.ts";
import type { Span } from "../../domain/tex-document.ts";
import { isDefinition } from "./hidden.ts";
import {
  inPlace,
  isNode,
  macroPlace,
  mandatory,
  placeOf,
  visited,
  type Macro,
  type Node,
} from "./nodes.ts";
import type { ParsedTex } from "./parse.ts";

const INCLUDE_MACROS: ReadonlyMap<string, Include["macro"]> = new Map([
  ["input", "input"],
  ["include", "include"],
  ["subfile", "subfile"],
]);

/**
 * The path an include names, as written: its braced argument, or — TeX's own form, `\input name` —
 * the name up to the next space. unified-latex gives the unbraced form an argument of the first
 * token only (`sections` of `sections/a`), so the source is read for it.
 */
function argumentText(src: string, m: Macro): string | null {
  const start = mandatory(m)[0]?.content[0]?.position?.start.offset;
  if (start === undefined) return null;
  const rest = src.slice(start);
  const stop = rest.search(src[start - 1] === "{" ? /\}/u : /[\s{}%]/u);
  return stop < 0 ? rest : rest.slice(0, stop);
}

/** One include macro as an `Include`, or nothing when it names no file or has no place. */
function includeOf(src: string, m: Macro): readonly Include[] {
  const macro = INCLUDE_MACROS.get(m.content);
  const target = argumentText(src, m);
  if (macro === undefined || target === null || target.trim() === "") return [];
  return inPlace(macroPlace(m), (span) => [{ macro, target, span }]);
}

/**
 * Every `\input`, `\include` and `\subfile` of the source, in source order — not in a comment (a
 * comment is a node of its own) and not in a macro definition's body, which is read where the macro
 * is used, and nothing here expands macros.
 */
export const includesOf = (t: ParsedTex): readonly Include[] =>
  visited(t.root, isDefinition)
    .filter(isNode)
    .flatMap((n) => (n.type === "macro" ? includeOf(t.src, n) : []));

const isDocument = (n: Node): n is Readonly<Ast.Environment> =>
  n.type === "environment" && n.env === "document";

/** The span of the `document` environment's body, or null when the source has none. */
export const documentBodyOf = (t: ParsedTex): Span | null =>
  (t.root.content.find(isDocument)?.content ?? [])
    .flatMap((n) => inPlace(placeOf(n), (span) => [span]))
    .reduce<Span | null>(
      (body, span) =>
        body === null ? span : { start: body.start, end: span.end },
      null,
    );
