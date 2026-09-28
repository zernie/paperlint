/**
 * What a reader of the PDF never sees, as a walk over the tree prunes it: comments, math and code,
 * the bibliography's body, a macro definition's body, and the arguments that are keys, labels,
 * files or URLs. The rendered text and the outline both prune with it, so a name in a URL is no
 * more a leftover than a heading in a definition is a section.
 */
import {
  isArgument,
  isNode,
  type Argument,
  type Node,
  type Visited,
} from "./nodes.ts";
import { DEFINITION_MACROS, KEY_ARGUMENT, KEY_SIGNATURES } from "./parse.ts";

/** Environments whose body is not text a reader sees as prose: code, the bibliography, comments. */
const HIDDEN_ENVS: ReadonlySet<string> = new Set([
  "thebibliography",
  "verbatim",
  "Verbatim",
  "lstlisting",
  "minted",
  "comment",
]);

/** Node types a reader does not see as prose: comments, code, math. */
const HIDDEN_TYPES: ReadonlySet<Node["type"]> = new Set<Node["type"]>([
  "comment",
  "verbatim",
  "verb",
  "inlinemath",
  "displaymath",
  "mathenv",
]);

const KEY_MACROS: ReadonlySet<string> = new Set(Object.keys(KEY_SIGNATURES));

/** A macro whose arguments a reader never sees: a definition, or a key macro that prints none. */
const isHiddenMacro = (name: string): boolean =>
  DEFINITION_MACROS.has(name) ||
  (KEY_MACROS.has(name) && !KEY_ARGUMENT.has(name));

const isHiddenNode = (n: Node): boolean =>
  HIDDEN_TYPES.has(n.type) ||
  (n.type === "environment" && HIDDEN_ENVS.has(n.env)) ||
  (n.type === "macro" && isHiddenMacro(n.content));

/**
 * The one argument of a partly printed macro (`KEY_ARGUMENT`) that is a key or a URL. What holds an
 * argument is a macro or an environment; the first three tests only narrow the type.
 */
const isKeyArgument = (a: Argument, parent: Visited | undefined): boolean =>
  parent !== undefined &&
  isNode(parent) &&
  parent.type === "macro" &&
  parent.args?.indexOf(a) === KEY_ARGUMENT.get(parent.content);

/** Whether the walk prunes `v` (given the node that holds it): see the module comment. */
export const isUnrendered = (
  v: Visited,
  parent: Visited | undefined,
): boolean =>
  isArgument(v) ? isKeyArgument(v, parent) : isNode(v) && isHiddenNode(v);
