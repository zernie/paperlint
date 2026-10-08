/** The files a source pulls in, and the body of a source that is a document of its own. */
import type * as Ast from "@unified-latex/unified-latex-types";
import type { Include } from "../../domain/paper-source.ts";
import type { Span } from "../../domain/tex-document.ts";
import { isDefinition } from "./hidden.ts";
import {
  argumentPieces,
  inPlace,
  isNode,
  macroPlace,
  mandatory,
  placeOf,
  visited,
  type Macro,
  type Node,
} from "./nodes.ts";
import { liveRoot, type ParsedTex } from "./parse.ts";

const INCLUDE_MACROS: ReadonlyMap<string, Include["macro"]> = new Map([
  ["input", "input"],
  ["include", "include"],
  ["subfile", "subfile"],
]);

/**
 * The path an include names: its braced argument read off the tree as TeX reads it (a comment is no
 * part of it; a macro stays as written: nothing here expands one), or — TeX's own form, `\\input name`
 * — the name up to the next space. unified-latex gives the unbraced form an argument of the first
 * token only (`sections` of `sections/a`), so the source is read for that one.
 */
function argumentText(src: string, m: Macro): string | null {
  const arg = mandatory(m)[0];
  const start = arg?.content[0]?.position?.start.offset;
  if (arg === undefined || start === undefined) return null;
  // The parser gives both forms `{` as their open mark; the source says which one was written.
  if (src[start - 1] === "{")
    return argumentPieces(arg.content, null)
      .map((p) => p.text)
      .join("");
  const rest = src.slice(start);
  const stop = rest.search(/[\s{}%]/u);
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
 * comment is a node of its own), not in a macro definition's body, which is read where the macro
 * is used, and nothing here expands macros; not after `\end{document}`, which TeX never reads.
 */
export const includesOf = (t: ParsedTex): readonly Include[] =>
  visited(liveRoot(t), isDefinition)
    .filter(isNode)
    .flatMap((n) => (n.type === "macro" ? includeOf(t.src, n) : []));

const isDocument = (n: Node): n is Readonly<Ast.Environment> =>
  n.type === "environment" && n.env === "document";

/**
 * The span of the `document` environment's body, or null when the source has none. A macro's own
 * position ends at its name, so its place is taken with its arguments: a body ending in
 * `\input{sections/a}` ends at the closing brace.
 */
export const documentBodyOf = (t: ParsedTex): Span | null =>
  (t.root.content.find(isDocument)?.content ?? [])
    .flatMap((n) =>
      inPlace(n.type === "macro" ? macroPlace(n) : placeOf(n), (span) => [
        span,
      ]),
    )
    .reduce<Span | null>(
      (body, span) =>
        body === null ? span : { start: body.start, end: span.end },
      null,
    );
