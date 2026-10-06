/**
 * WHAT A SOURCE DECLARES ABOUT ITS BIBLIOGRAPHY, read from the parse tree: every live
 * `\bibliography{a,b}`, `\nobibliography{…}`, `\addbibresource[…]{…}` (and biblatex's
 * `\addglobalbib`, `\addsectionbib`), every live `filecontents` block, and whether TeX surely reads
 * each one. Decided by `bibliography.ts`.
 *
 * "Live" comes from the tree: a comment is a node of its own and `\iffalse … \fi` is cut at parse
 * (`conditionals.ts`). What TeX may or may not read is marked `conditional`:
 *
 *   - inside a conditional TeX closes with `\fi` (`\ifanon … \else … \fi`; a `\newif` or `\let` names
 *     a conditional and opens none), or in a branch of `\ifthenelse{…}{…}{…}`;
 *   - in a macro's body, read wherever the macro is used.
 *
 * Nothing after `\end{document}` is read: TeX stops there. A name is what TeX writes into `\bibdata`:
 * `\jobname` is the main file's name; any other macro in a name is one this reader does not expand
 * (`unresolved`); `#1` is a parameter of a definition, read where the macro is used.
 *
 * unified-latex reads a `filecontents` environment as verbatim; its option and file name are the
 * first characters of that node, and its body starts on the next line, as LaTeX's own reader starts it.
 */
import type * as Ast from "@unified-latex/unified-latex-types";
import type { Span } from "../../domain/tex-document.ts";
import type { Filecontents } from "../../ports/latex.ts";
import {
  inPlace,
  isNode,
  mandatory,
  optional,
  placeOf,
  visited,
  type Node,
} from "./nodes.ts";
import { DEFINITION_MACROS, type ParsedTex } from "./parse.ts";

const FILECONTENTS: ReadonlySet<string> = new Set([
  "filecontents",
  "filecontents*",
]);

/** `[options]{name}` at the start of a `filecontents` node, and the rest of its first line. */
const BLOCK_HEAD = /^\s*(?:\[([^\]]*)\])?\s*\{([^}]*)\}[^\n]*\n?/;

/** `\jobname` in a name, as TeX expands it: the main file's name. */
const expanded = (name: string, jobname: string): string =>
  name.replaceAll("\\jobname", jobname);

/** One verbatim `filecontents` node as a block: its name, option, and body. */
function blockOf(
  src: string,
  n: Readonly<Ast.VerbatimEnvironment>,
  jobname: string,
): readonly Filecontents[] {
  return inPlace(placeOf(n), (span) => {
    // The node runs from `\begin{env}` to past `\end{env}`.
    const headAt = span.start + `\\begin{${n.env}}`.length;
    const end = span.end - `\\end{${n.env}}`.length;
    const head = BLOCK_HEAD.exec(src.slice(headAt, end));
    if (head === null) return [];
    const [line, options = "", writes] = head;
    const opts = options.split(",").map((o) => o.trim());
    return [
      {
        writes: expanded(String(writes).trim(), jobname),
        overwrite: opts.includes("overwrite") || opts.includes("force"),
        span,
        body: { start: headAt + line.length, end },
      },
    ];
  });
}

const isBlock = (n: Node): n is Readonly<Ast.VerbatimEnvironment> =>
  n.type === "verbatim" && FILECONTENTS.has(n.env);

/** Every live `filecontents` block of a source, in source order (names as written). */
export const filecontentsOf = (t: ParsedTex): readonly Filecontents[] =>
  visited(t.root, () => false)
    .filter(isNode)
    .flatMap((n) => (isBlock(n) ? blockOf(t.src, n, "\\jobname") : []));

/** A declared name: one bibtex can open, or one built by a macro this reader does not expand. */
export type DeclaredName =
  | { readonly kind: "name"; readonly name: string }
  | { readonly kind: "unresolved"; readonly written: string };

/** A declaration of databases, where it stands, and whether TeX surely reads it. */
export interface Declaration {
  /** `bibliography` and `nobibliography` write `\bibdata`; the others are biblatex's resources. */
  readonly macro: string;
  readonly names: readonly DeclaredName[];
  readonly remote: boolean;
  readonly span: Span;
  readonly conditional: boolean;
}

/** A block, and whether TeX surely runs it. */
export interface BlockAt {
  readonly block: Filecontents;
  readonly conditional: boolean;
}

/** What a source holds for the bibliography. */
export interface SourceScan {
  readonly declarations: readonly Declaration[];
  readonly blocks: readonly BlockAt[];
}

const DECLARING: ReadonlySet<string> = new Set([
  "bibliography",
  "nobibliography",
  "addbibresource",
  "addglobalbib",
  "addsectionbib",
]);

/** The source text of an argument's content, or null for an empty one. */
function argumentText(src: string, content: readonly Node[]): string | null {
  const first = content[0]?.position?.start.offset;
  const last = content.at(-1)?.position?.end.offset;
  return first === undefined || last === undefined
    ? null
    : src.slice(first, last);
}

/**
 * The names a declaration's `{…}` holds, or null when it is not a declaration: an empty argument,
 * `*` (`\nobibliography*`), or a parameter (`\bibliography{#1}` in a definition).
 */
function namesOf(
  src: string,
  m: Readonly<Ast.Macro>,
  jobname: string,
): readonly DeclaredName[] | null {
  const text = argumentText(src, mandatory(m)[0]?.content ?? []) ?? "";
  const names = text
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s !== "" && s !== "*");
  if (names.length === 0 || text.includes("#")) return null;
  return names.map((written): DeclaredName => {
    const name = expanded(written, jobname);
    return name.includes("\\")
      ? { kind: "unresolved", written }
      : { kind: "name", name };
  });
}

/** `\addbibresource[location=remote]{…}`: a URL biber fetches. */
const isRemote = (src: string, m: Readonly<Ast.Macro>): boolean =>
  /\blocation\s*=\s*remote\b/.test(
    argumentText(src, optional(m)?.content ?? []) ?? "",
  );

/** A macro that opens a TeX conditional closed by `\fi` (`\ifthenelse` takes arguments instead). */
const opensConditional = (n: Node): boolean =>
  n.type === "macro" &&
  n.content.startsWith("if") &&
  n.content !== "ifthenelse";

/** How many following macros a macro makes NAMES, not commands: `\newif\ifx`, `\let\a\b`. */
const NAMING: ReadonlyMap<string, number> = new Map([
  ["newif", 1],
  ["let", 2],
]);

/** What the scan of one source carries down. */
interface Context {
  readonly src: string;
  readonly jobname: string;
}

/**
 * Where a scan of one node list stands: open conditionals, macros still to read as names, groups
 * still to read as `\ifthenelse` branches, and what it found.
 */
interface ListScan extends SourceScan {
  readonly depth: number;
  readonly names: number;
  readonly branches: number;
}

const EMPTY: SourceScan = { declarations: [], blocks: [] };

const joined = (a: SourceScan, b: SourceScan): SourceScan => ({
  declarations: [...a.declarations, ...b.declarations],
  blocks: [...a.blocks, ...b.blocks],
});

/** `s` with what `lists` hold added, read as conditional when `conditional`. */
const adding = (
  ctx: Context,
  s: ListScan,
  lists: readonly (readonly Node[])[],
  conditional: boolean,
): ListScan => ({ ...s, ...joined(s, scanLists(ctx, lists, conditional)) });

/** A node that is not a macro: a block, an `\ifthenelse` branch, or what it holds. */
function stepNode(
  ctx: Context,
  conditional: boolean,
  s: ListScan,
  n: Node,
): ListScan {
  if (isBlock(n))
    return {
      ...s,
      blocks: [
        ...s.blocks,
        ...blockOf(ctx.src, n, ctx.jobname).map((block) => ({
          block,
          conditional,
        })),
      ],
    };
  if (n.type === "group" && s.branches > 0)
    return { ...adding(ctx, s, inner(n), true), branches: s.branches - 1 };
  return adding(ctx, s, inner(n), conditional);
}

/** One node of a list, given the conditionals open around it. */
function stepList(
  ctx: Context,
  outer: boolean,
  s: ListScan,
  n: Node,
): ListScan {
  const conditional = outer || s.depth > 0;
  if (n.type !== "macro") return stepNode(ctx, conditional, s, n);
  // A name is not a command; the parser may still have handed it the next token as an argument.
  const args = (n.args ?? []).map((a) => a.content);
  if (s.names > 0)
    return { ...adding(ctx, s, args, conditional), names: s.names - 1 };
  const named = NAMING.get(n.content);
  if (named !== undefined) return { ...s, names: named };
  if (n.content === "ifthenelse") return { ...s, branches: 3 };
  if (opensConditional(n)) return { ...s, depth: s.depth + 1 };
  if (n.content === "fi") return { ...s, depth: Math.max(0, s.depth - 1) };
  return { ...s, ...joined(s, macroScan(ctx, n, conditional)) };
}

/** The node lists inside a node that is not a macro: an environment's or a group's content. */
const inner = (n: Node): readonly (readonly Node[])[] =>
  n.type === "environment" || n.type === "mathenv"
    ? [n.content, ...(n.args ?? []).map((a) => a.content)]
    : n.type === "group"
      ? [n.content]
      : [];

/** A macro: a declaration itself, and whatever its arguments hold (a definition's: conditionally). */
function macroScan(
  ctx: Context,
  m: Readonly<Ast.Macro>,
  conditional: boolean,
): SourceScan {
  const names = DECLARING.has(m.content)
    ? namesOf(ctx.src, m, ctx.jobname)
    : null;
  const own: readonly Declaration[] =
    names === null
      ? []
      : inPlace(placeOf(m), (span) => [
          {
            macro: m.content,
            names,
            remote: m.content !== "bibliography" && isRemote(ctx.src, m),
            span,
            conditional,
          },
        ]);
  const inBody = conditional || DEFINITION_MACROS.has(m.content);
  return joined(
    { declarations: own, blocks: [] },
    scanLists(
      ctx,
      (m.args ?? []).map((a) => a.content),
      inBody,
    ),
  );
}

/** What some node lists hold, each list scanned for its own conditionals. */
function scanLists(
  ctx: Context,
  lists: readonly (readonly Node[])[],
  conditional: boolean,
): SourceScan {
  return lists
    .map((list) =>
      list.reduce<ListScan>((s, n) => stepList(ctx, conditional, s, n), {
        ...EMPTY,
        depth: 0,
        names: 0,
        branches: 0,
      }),
    )
    .reduce<SourceScan>(
      (acc, s) =>
        joined(acc, { declarations: s.declarations, blocks: s.blocks }),
      EMPTY,
    );
}

/** The top level TeX reads: up to and with the `document` environment, nothing after it. */
const readTopLevel = (t: ParsedTex): readonly Node[] => {
  const end = t.root.content.findIndex(
    (n) => n.type === "environment" && n.env === "document",
  );
  return end < 0 ? t.root.content : t.root.content.slice(0, end + 1);
};

/** Every live declaration and block of a source whose main file's name is `jobname`. */
export const scanSource = (t: ParsedTex, jobname: string): SourceScan =>
  scanLists({ src: t.src, jobname }, [readTopLevel(t)], false);
