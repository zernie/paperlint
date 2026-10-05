/**
 * `\iffalse … \fi`: text TeX never reads. Authors park old titles, sections and paragraphs there,
 * and every reader of the tree — the outline, the rendered text, the headings the case judge reads,
 * the includes — would otherwise take them for the paper. So the branch is cut out of the tree once,
 * when the source is parsed (`parseLatex`), rather than pruned per walk like `hidden.ts` prunes: a
 * walk can skip a node, but the rendered text reads the strings of a node list directly, and they
 * would come back.
 *
 * What is cut: from `\iffalse` to its matching `\fi`, both included, counting the conditionals
 * nested in between. An `\else` at the same depth ends the dead part: what follows it is read, and
 * the matching `\fi` is cut. A conditional is a macro whose name starts with `if`, except
 * `\ifthenelse` (the `ifthen` package's command, which takes arguments and has no `\fi`). An
 * `\iffalse` with no `\fi` cuts to the end of its list, as TeX would read to the end of the file.
 *
 * Only `\iffalse` is decided. `\iftrue`, `\if\venue1` and every switch made with `\newif` depend on
 * a value this reader does not compute, so both of their branches stay.
 */
import type * as Ast from "@unified-latex/unified-latex-types";

type Node = Readonly<Ast.Node>;

/** Where the scan of one node list stands: reading, inside a dead branch, or in its `\else`. */
type Mode =
  | { readonly kind: "live" }
  | { readonly kind: "dead"; readonly depth: number }
  | { readonly kind: "else"; readonly depth: number };

/** One node against the mode before it: the mode after it, and whether the node is kept. */
interface Step {
  readonly mode: Mode;
  readonly keep: boolean;
}

const LIVE: Mode = { kind: "live" };

const isMacro = (n: Node, name: string): boolean =>
  n.type === "macro" && n.content === name;

/** A macro that opens a conditional TeX closes with `\fi`. */
const opensConditional = (n: Node): boolean =>
  n.type === "macro" &&
  n.content.startsWith("if") &&
  n.content !== "ifthenelse";

/** Inside the dead branch: everything is cut; nesting is counted, `\else` at depth 1 ends it. */
function stepDead(depth: number, n: Node): Step {
  if (opensConditional(n))
    return { mode: { kind: "dead", depth: depth + 1 }, keep: false };
  if (isMacro(n, "fi"))
    return {
      mode: depth === 1 ? LIVE : { kind: "dead", depth: depth - 1 },
      keep: false,
    };
  if (isMacro(n, "else") && depth === 1)
    return { mode: { kind: "else", depth }, keep: false };
  return { mode: { kind: "dead", depth }, keep: false };
}

/** In the `\else` branch: everything is kept but the `\fi` that closes the `\iffalse`. */
function stepElse(depth: number, n: Node): Step {
  if (opensConditional(n))
    return { mode: { kind: "else", depth: depth + 1 }, keep: true };
  if (isMacro(n, "fi"))
    return depth === 1
      ? { mode: LIVE, keep: false }
      : { mode: { kind: "else", depth: depth - 1 }, keep: true };
  return { mode: { kind: "else", depth }, keep: true };
}

function step(mode: Mode, n: Node): Step {
  switch (mode.kind) {
    case "live":
      return isMacro(n, "iffalse")
        ? { mode: { kind: "dead", depth: 1 }, keep: false }
        : { mode, keep: true };
    case "dead":
      return stepDead(mode.depth, n);
    case "else":
      return stepElse(mode.depth, n);
  }
}

/** A node list without its `\iffalse` branches, each kept node cleaned the same way. */
// eslint-disable-next-line functional/prefer-immutable-types -- the tree's own content type is a mutable array
function liveList(nodes: readonly Node[]): Ast.Node[] {
  const { kept } = nodes.reduce<{
    readonly mode: Mode;
    readonly kept: readonly Ast.Node[];
  }>(
    (acc, n) => {
      const next = step(acc.mode, n);
      return {
        mode: next.mode,
        kept: next.keep ? [...acc.kept, liveNode(n)] : acc.kept,
      };
    },
    { mode: LIVE, kept: [] },
  );
  return [...kept];
}

// eslint-disable-next-line functional/prefer-immutable-types -- the tree's own argument type is mutable
const liveArgs = (args: readonly Readonly<Ast.Argument>[]): Ast.Argument[] =>
  args.map((a) => ({ ...a, content: liveList(a.content) }));

/** A node with its content and its arguments' content cleaned; a node with neither, as it is. */
// eslint-disable-next-line functional/prefer-immutable-types -- the tree's own node type is mutable
function liveNode(n: Node): Ast.Node {
  if (n.type === "macro")
    return n.args === undefined ? n : { ...n, args: liveArgs(n.args) };
  if (n.type === "environment" || n.type === "mathenv")
    return {
      ...n,
      content: liveList(n.content),
      ...(n.args === undefined ? {} : { args: liveArgs(n.args) }),
    };
  if (n.type === "group" || n.type === "inlinemath" || n.type === "displaymath")
    return { ...n, content: liveList(n.content) };
  return n;
}

/** The tree without what `\iffalse … \fi` hides; the same tree when the source has no `\iffalse`. */
export const withoutFalseBranches = (
  src: string,
  root: Readonly<Ast.Root>,
  // eslint-disable-next-line functional/prefer-immutable-types -- `ParsedTex.root` is the tree's own mutable type
): Ast.Root =>
  src.includes("\\iffalse")
    ? { ...root, content: liveList(root.content) }
    : root;
