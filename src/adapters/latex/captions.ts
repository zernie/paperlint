/** The captions of a document: the text a reader sees under a figure or a table. */
import { hasAtLeast, isDefined } from "remeda";
import type { Caption } from "../../domain/tex-document.ts";
import { isDefinition, isUnrendered } from "./hidden.ts";
import {
  collapse,
  inPlace,
  isNode,
  macroPlace,
  mandatory,
  textOf,
  visited,
  type Macro,
  type Node,
} from "./nodes.ts";
import type { ParsedTex } from "./parse.ts";
import { proseOfNodes } from "./prose.ts";

const isCaption = (n: Node): n is Macro =>
  n.type === "macro" && n.content === "caption";

/** Math a reader sees as symbols: it counts as one word, and says nothing else. */
const MATH_NODES: ReadonlySet<Node["type"]> = new Set<Node["type"]>([
  "inlinemath",
  "displaymath",
  "mathenv",
]);
const MATH_WORD = "math";

/** The escapes of a character LaTeX sets for itself: `\%` is a percent sign the reader sees. */
const ESCAPED: ReadonlySet<string> = new Set(["%", "&", "#", "$", "_"]);

/** What a reader sees of a caption's nodes: its words, its escapes, and one word for each formula. */
const captionText = (nodes: readonly Node[]): string =>
  nodes
    .map((n) => {
      if (MATH_NODES.has(n.type)) return MATH_WORD;
      if (n.type === "macro" && ESCAPED.has(n.content)) return n.content;
      return n.type === "group" ? captionText(n.content) : textOf([n]);
    })
    .join("");

/**
 * The text of every `\caption` in document order: its last mandatory argument, whatever optional
 * argument (`\caption[Short]{…}`), star or whitespace comes before it. What a reader never sees is
 * pruned (`isUnrendered`: comments, code), and so is a macro definition's body, where the caption
 * is written but not set. A caption with no word in it is left out.
 */
export function captionsOf(t: ParsedTex): readonly string[] {
  return visited(
    t.root,
    (v, parent) => isUnrendered(v, parent) || isDefinition(v),
  )
    .filter(isNode)
    .filter(isCaption)
    .map((m) => mandatory(m).at(-1))
    .filter(isDefined)
    .map((a) => collapse(captionText(a.content)).trim())
    .filter((text) => text !== "");
}

/**
 * Every `\caption` a reader sees, in document order, as prose read the way the body is (a citation
 * or a formula is a mark, so one word) with the span of the `\caption` and its arguments. The same
 * captions as `captionsOf`: its last mandatory argument, nothing commented out, in code or in a
 * macro's definition; a caption with no word in it is left out.
 */
export function captionProse(t: ParsedTex): readonly Caption[] {
  return visited(
    t.root,
    (v, parent) => isUnrendered(v, parent) || isDefinition(v),
  )
    .filter(isNode)
    .filter(isCaption)
    .flatMap((m) => {
      const passages = proseOfNodes(t, mandatory(m).at(-1)?.content ?? []);
      return hasAtLeast(passages, 1)
        ? inPlace(macroPlace(m), (span) => [{ passages, span }])
        : [];
    });
}
