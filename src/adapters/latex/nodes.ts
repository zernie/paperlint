/** What the three readers share about unified-latex nodes: places, text, and the walk. */
import type * as Ast from "@unified-latex/unified-latex-types";
import { CONTINUE, SKIP, visit } from "@unified-latex/unified-latex-util-visit";
import type { Place, Span } from "../../domain/tex-document.ts";
import { KEY_SIGNATURES } from "./parse.ts";

export { collapse } from "../../domain/tex-document.ts";

/** unified-latex's node types, read-only: nothing here writes to a tree. */
export type Node = Readonly<Ast.Node>;
export type Macro = Readonly<Ast.Macro>;
export type Argument = Readonly<Ast.Argument>;

/** Anything the parser may have given a position: offsets of its first and past its last character. */
interface Positioned {
  readonly position?: {
    readonly start: { readonly offset: number };
    readonly end: { readonly offset: number };
  };
}

/** Where a node stands, or that it has no position. */
export const placeOf = (n: Positioned): Place =>
  n.position === undefined
    ? { kind: "unplaced" }
    : {
        kind: "at",
        span: { start: n.position.start.offset, end: n.position.end.offset },
      };

/** The first mandatory (`{…}`) and optional (`[…]`) arguments' contents, and the last mandatory one's. */
export const mandatory = (m: Macro): readonly Argument[] =>
  (m.args ?? []).filter((a) => a.openMark === "{");
export const optional = (m: Macro): Argument | undefined =>
  (m.args ?? []).find((a) => a.openMark === "[");

/**
 * Macros whose typeset argument is not their last mandatory one: which mandatory argument it is.
 * `\texorpdfstring{shown}{bookmark}` typesets the first; the second is the PDF bookmark.
 */
const PRINTED_ARGUMENT: ReadonlyMap<string, number> = new Map([
  ["texorpdfstring", 0],
]);

/**
 * The text of a node list with markup dropped: strings, spaces, what groups hold, and the argument a
 * formatting macro typesets — its last mandatory one (`\textbf{Usage}`, `\textcolor{red}{Usage}`,
 * `\href{url}{Usage}` → `Usage`) unless `PRINTED_ARGUMENT` names another. A key macro's arguments
 * (`\label{…}`, `\cite{…}`) are not text.
 */
export const textOf = (nodes: readonly Node[] | undefined): string =>
  (nodes ?? [])
    .map((n) => {
      if (n.type === "string") return n.content;
      if (n.type === "whitespace" || n.type === "parbreak") return " ";
      if (n.type === "group") return textOf(n.content);
      return n.type === "macro" && !(n.content in KEY_SIGNATURES)
        ? textOf(
            mandatory(n).at(PRINTED_ARGUMENT.get(n.content) ?? -1)?.content,
          )
        : "";
    })
    .join("");

/**
 * A macro's place with its arguments: from its name to past the closing mark of the last argument
 * that holds text. unified-latex positions the name and the arguments' contents, never the
 * arguments themselves, so an empty trailing argument is not covered.
 */
export function macroPlace(m: Macro): Place {
  const name = placeOf(m);
  if (name.kind === "unplaced") return name;
  const end = (m.args ?? []).reduce((e, a) => {
    const last = a.content.at(-1)?.position?.end.offset;
    return last === undefined ? e : last + a.closeMark.length;
  }, name.span.end);
  const span: Span = { start: name.span.start, end };
  return { kind: "at", span };
}

/** What visit reaches: a node, an argument, or a node list (a content array, an argument list). */
export type Visited = Readonly<Ast.Ast> | readonly (Node | Argument)[];

/**
 * Everything visit reaches under `tree`, in document order, node lists included; `skip` prunes what
 * it is given (a node or an argument, with the node that holds it) and everything under it. visit
 * reports through a callback and returns nothing, so the one collection point of this adapter is here.
 */
export function visited(
  // eslint-disable-next-line functional/prefer-immutable-types -- visit's own parameter type is mutable
  tree: Ast.Ast,
  skip: (v: Visited, parent: Visited | undefined) => boolean,
): readonly Visited[] {
  // eslint-disable-next-line functional/prefer-immutable-types -- the one accumulator, see above
  const seen: Visited[] = [];
  visit(
    tree,
    (node, info) => {
      // eslint-disable-next-line functional/immutable-data -- visit is callback-only; see above
      seen.push(node);
      return skip(node, info.parents[0]) ? SKIP : CONTINUE;
    },
    { includeArrays: true },
  );
  return seen;
}

/** A node list visit reached. `Array.isArray` alone does not narrow a readonly array. */
export const isList = (v: Visited): v is readonly (Node | Argument)[] =>
  Array.isArray(v);

/** A macro's argument, as visit reports it. */
export const isArgument = (v: Visited): v is Argument =>
  !isList(v) && v.type === "argument";

/** A node, as opposed to a node list or an argument (which visit also reports). */
export const isNode = (v: Visited): v is Node =>
  !isList(v) && v.type !== "argument" && v.type !== "root";
