/** The captions of a document: the text a reader sees under a figure or a table. */
import { hasAtLeast } from "remeda";
import type { Caption } from "../../domain/tex-document.ts";
import { isDefinition, isUnrendered } from "./hidden.ts";
import {
  inPlace,
  isNode,
  macroPlace,
  mandatory,
  visited,
  type Macro,
  type Node,
} from "./nodes.ts";
import type { ParsedTex } from "./parse.ts";
import { proseOfNodes } from "./prose.ts";

const isCaption = (n: Node): n is Macro =>
  n.type === "macro" && n.content === "caption";

/**
 * Every `\caption` a reader sees, in document order, as prose read the way the body is (a citation
 * or a formula is a mark, so one word) with the span of the `\caption` and its arguments. Its last mandatory
 * argument, whatever optional argument (`\caption[Short]{…}`), star or space comes before it;
 * nothing commented out, in code or in a macro's definition; a caption with no word in it is left out.
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
