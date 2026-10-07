/**
 * THE `filecontents` BLOCKS OF A SOURCE — where a `.bib` TeX wrote stands in the text that wrote it.
 * Read from the parse tree, never decided: which file a block writes, and whether TeX ran it, is
 * TeX's answer (`written` in `_build/sources.json`); this reader only says where each block's text
 * is, so a finding about an entry TeX read can be shown at the block that holds it
 * (docs/design/paper-sources.md §1).
 *
 * unified-latex reads a `filecontents` environment as verbatim; its option and file name are the
 * first characters of that node, and its body starts on the next line, as LaTeX's own reader starts it.
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

/**
 * One verbatim `filecontents` node as a block: its name, option, and body. unified-latex reads the
 * whole environment as verbatim, so its first line — `[options]{name}` and what TeX ignores after
 * it — is parsed on its own, and the name read off that tree like a declaration's.
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
    const line = src.slice(headAt, end).split("\n", 1).join("");
    const nodes = parseLatex(line).root.content;
    const at = nodes.findIndex((x) => x.type === "group");
    if (at < 0) return [];
    const options = written(argumentPieces(nodes.slice(0, at), null))
      .replace(/^\[|\]$/g, "")
      .split(",")
      .map((o) => o.trim());
    return [
      {
        writes: written(argumentPieces(nodes.slice(at, at + 1), jobname)),
        overwrite: options.includes("overwrite") || options.includes("force"),
        span,
        body: { start: Math.min(headAt + line.length + 1, end), end },
      },
    ];
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
