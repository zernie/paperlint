/** The document's sections, where its back matter starts, and where it ends. */
import type * as Ast from "@unified-latex/unified-latex-types";
import { isDefined } from "remeda";
import type { Heading, Outline } from "../../domain/tex-document.ts";
import {
  collapse,
  isNode,
  macroPlace,
  mandatory,
  textOf,
  visited,
  type Macro,
  type Node,
} from "./nodes.ts";
import type { ParsedTex } from "./parse.ts";

/** Macros and the environment that start the back matter: the appendix and the bibliography. */
const BACK_MATTER_MACROS: ReadonlySet<string> = new Set([
  "appendix",
  "bibliography",
  "printbibliography",
]);

const isBackMatter = (n: Node): boolean =>
  (n.type === "macro" && BACK_MATTER_MACROS.has(n.content)) ||
  (n.type === "environment" && n.env === "thebibliography");

const isSection = (n: Node): n is Macro =>
  n.type === "macro" && n.content === "section";

const isDocument = (n: Node): n is Readonly<Ast.Environment> =>
  n.type === "environment" && n.env === "document";

/** One `\section`/`\section*`: the last mandatory argument is its title. */
const headingOf = (m: Macro): Heading => ({
  title: collapse(textOf(mandatory(m).at(-1)?.content)),
  place: macroPlace(m),
});

/**
 * The body's `\section`s (starred or not) in document order, the first back-matter node, and the
 * end of the document. A source with no `document` environment is read whole, as a fragment.
 */
export function outlineOf(t: ParsedTex): Outline {
  const doc = t.root.content.find(isDocument);
  const nodes = visited(doc?.content ?? t.root.content, () => false).filter(
    isNode,
  );
  const backMatter =
    nodes
      .filter(isBackMatter)
      .map((n) => n.position?.start.offset)
      .filter(isDefined)[0] ?? null;
  const docEnd = doc?.position?.end.offset;
  return {
    sections: nodes.filter(isSection).map(headingOf),
    backMatter,
    end: docEnd === undefined ? null : docEnd - 1,
  };
}
