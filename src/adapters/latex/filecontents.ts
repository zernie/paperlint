/**
 * THE `filecontents` BLOCKS OF A SOURCE — where a `.bib` TeX wrote stands in the text that wrote it.
 * Read from the parse tree, never decided: which file a block writes, and whether TeX ran it, is
 * TeX's answer (`written` in `_build/sources.json`); this reader only says where each block's text
 * is, so a finding about an entry TeX read can be shown at the block that holds it
 * (docs/design/paper-sources.md §1).
 *
 * unified-latex reads a `filecontents` environment as verbatim; its option and file name are the
 * first things in that node, white space between them — a line break too: `\begin{filecontents*}` with
 * `{refs.bib}` on the next line writes `refs.bib` (measured with pdflatex) — and its body starts on the
 * line after the name, as LaTeX's own reader starts it.
 * A block is live when the tree keeps it: a comment is a node of its own, `\iffalse … \fi` is cut at
 * parse (`conditionals.ts`), and nothing after `\end{document}` is read (`liveRoot`).
 */
import type * as Ast from "@unified-latex/unified-latex-types";
import type { Filecontents } from "../../ports/latex.ts";
import {
  argumentPieces,
  inPlace,
  isNode,
  placeOf,
  visited,
  type ArgumentPiece,
  type Node,
} from "./nodes.ts";
import { liveRoot, parseLatex, type ParsedTex } from "./parse.ts";

const FILECONTENTS: ReadonlySet<string> = new Set([
  "filecontents",
  "filecontents*",
]);

/** Names and options as TeX reads them: off the tree, a comma between two names. */
type Name = readonly ArgumentPiece[];

/** What a name or an option is written as: its pieces joined, white space trimmed off. */
export const written = (name: Name): string =>
  name
    .map((p) => p.text)
    .join("")
    .trim();

/** What may stand before the name: nothing, or one `[options]` — anything else is a block with no name. */
const OPTION = /^(?:\[[^\]]*\])?$/;

/** A block's head: its name's group, and its options. */
interface Head {
  readonly name: Node;
  readonly options: readonly string[];
}

/** The head of a block whose text is `text`: the first group, with only white space and an option before it. */
function headOf(text: string): Head | null {
  const nodes = parseLatex(text).root.content;
  const at = nodes.findIndex((x) => x.type === "group");
  const option = written(argumentPieces(nodes.slice(0, Math.max(at, 0)), null));
  const name = nodes[at];
  if (name === undefined || !OPTION.test(option)) return null;
  return {
    name,
    options: option
      .replace(/^\[|\]$/g, "")
      .split(",")
      .map((o) => o.trim()),
  };
}

/**
 * One verbatim `filecontents` node as a block: its name, option, and body. unified-latex reads the
 * whole environment as verbatim, so its text is parsed on its own and the name read off that tree like
 * a declaration's (`headOf`). The body starts on the line after the one the name ends on; what TeX
 * ignores after the name on that line is no body.
 */
export function blockOf(
  src: string,
  n: Readonly<Ast.VerbatimEnvironment>,
  jobname: string,
): readonly Filecontents[] {
  return inPlace(placeOf(n), (span) => {
    // The node runs from `\begin{env}` to past `\end{env}`.
    const headAt = span.start + `\\begin{${n.env}}`.length;
    const end = span.end - `\\end{${n.env}}`.length;
    const head = headOf(src.slice(headAt, end));
    if (head === null) return [];
    return inPlace(placeOf(head.name), (named) => {
      const after = headAt + named.end;
      // What TeX ignores after the name, up to the end of its line.
      const rest = src.slice(after, end).split("\n", 1).join("");
      return [
        {
          writes: written(argumentPieces([head.name], jobname)),
          overwrite: head.options.some(
            (o) => o === "overwrite" || o === "force",
          ),
          span,
          body: { start: Math.min(after + rest.length + 1, end), end },
        },
      ];
    });
  });
}

const isBlock = (n: Node): n is Readonly<Ast.VerbatimEnvironment> =>
  n.type === "verbatim" && FILECONTENTS.has(n.env);

/** Every live `filecontents` block of a source whose main file's name is `jobname`, in source order. */
export const filecontentsOf = (
  t: ParsedTex,
  jobname: string,
): readonly Filecontents[] =>
  visited(liveRoot(t), () => false)
    .filter(isNode)
    .filter(isBlock)
    .flatMap((n) => blockOf(t.src, n, jobname));
