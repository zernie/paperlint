/**
 * WHERE A PAPER'S BIBLIOGRAPHY IS — read from the parse tree, decided by TeX's and bibtex's rules.
 * The decision is here, in the latex adapter, because it is TeX's knowledge (finding 9 of the design's
 * refutation, docs/design/paper-sources.md §7); the states it returns are the domain's
 * (`src/domain/paper-sources.ts`).
 *
 *   filecontentsOf     every live `filecontents` block: what it writes, with `[overwrite]` or not
 *   declarationsOf     every live `\bibliography{a,b}` and `\addbibresource[…]{…}`, and whether it
 *                      sits where TeX may not read it (a switch, a macro's body)
 *   decideBibliography the `Bibliography` those make, from committed bytes
 *
 * "Live" comes from the tree: a comment is a node of its own and `\iffalse … \fi` is cut at parse
 * (`conditionals.ts`), so a commented-out block or declaration is none (variant v4 of the design).
 * unified-latex reads a `filecontents` environment as verbatim; its option and file name are the first
 * characters of that node, and its body starts on the next line, as LaTeX's own reader starts it.
 */
import { normalize } from "node:path";
import type * as Ast from "@unified-latex/unified-latex-types";
import type {
  BibText,
  Bibliography,
  Database,
  Declared,
  EmbeddedBib,
} from "../../domain/paper-sources.ts";
import type { AbsolutePath } from "../../domain/paths.ts";
import type { Span } from "../../domain/tex-document.ts";
import type { BibDisk, BibSource, Filecontents } from "../../ports/latex.ts";
import { bibEntries, bibFileText } from "./bibtex.ts";
import {
  inPlace,
  isNode,
  mandatory,
  optional,
  placeOf,
  visited,
  type Node,
} from "./nodes.ts";
import { DEFINITION_MACROS, parseLatex, type ParsedTex } from "./parse.ts";

const FILECONTENTS: ReadonlySet<string> = new Set([
  "filecontents",
  "filecontents*",
]);

/** `[options]{name}` at the start of a `filecontents` node, and the rest of its first line. */
const BLOCK_HEAD = /^\s*(?:\[([^\]]*)\])?\s*\{([^}]*)\}[^\n]*\n?/;

/** One verbatim `filecontents` node as a block: its name, option, and body. */
function blockOf(
  src: string,
  n: Readonly<Ast.VerbatimEnvironment>,
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
        writes: String(writes).trim(),
        overwrite: opts.includes("overwrite") || opts.includes("force"),
        span,
        body: { start: headAt + line.length, end },
      },
    ];
  });
}

/** Every live `filecontents` block of a source, in source order. */
export const filecontentsOf = (t: ParsedTex): readonly Filecontents[] =>
  visited(t.root, () => false)
    .filter(isNode)
    .flatMap((n) =>
      n.type === "verbatim" && FILECONTENTS.has(n.env) ? blockOf(t.src, n) : [],
    );

/** A declaration of databases, where it stands, and whether TeX surely reads it. */
interface Declaration {
  readonly names: readonly string[];
  readonly remote: boolean;
  readonly span: Span;
  /** Behind a switch, or in a macro's body: TeX may or may not read it. */
  readonly conditional: boolean;
}

const DECLARING: ReadonlySet<string> = new Set([
  "bibliography",
  "addbibresource",
]);

/**
 * The names a declaration's `{…}` holds, or null when it is not a declaration: an empty argument,
 * or one holding a macro or a parameter (`\bibliography{#1}` in a redefinition of `\bibliography`,
 * or the next token `\let\x\bibliography` hands it).
 */
function namesOf(
  src: string,
  m: Readonly<Ast.Macro>,
): readonly string[] | null {
  const text = plainText(src, mandatory(m)[0]?.content ?? []);
  const names = (text ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s !== "");
  return names.length > 0 ? names : null;
}

/** The source text of an argument made only of strings and spaces, or null (a macro, a parameter). */
function plainText(src: string, content: readonly Node[]): string | null {
  const plain = content.every(
    (c) => c.type === "string" || c.type === "whitespace",
  );
  const first = content[0]?.position?.start.offset;
  const last = content.at(-1)?.position?.end.offset;
  return plain && first !== undefined && last !== undefined
    ? src.slice(first, last)
    : null;
}

/** `\addbibresource[location=remote]{…}`: a URL biber fetches. */
const isRemote = (src: string, m: Readonly<Ast.Macro>): boolean => {
  const o = optional(m)?.content ?? [];
  const from = o[0]?.position?.start.offset;
  const to = o.at(-1)?.position?.end.offset;
  return (
    from !== undefined &&
    to !== undefined &&
    /\blocation\s*=\s*remote\b/.test(src.slice(from, to))
  );
};

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

/** Where a scan of one node list stands: open conditionals, and macros still to read as names. */
interface ListScan {
  readonly depth: number;
  readonly names: number;
  readonly found: readonly Declaration[];
}

/** `s` with what `lists` declare added, read as conditional when `s` is inside a conditional. */
const adding = (
  src: string,
  conditional: boolean,
  s: ListScan,
  lists: readonly (readonly Node[])[],
): ListScan => ({
  ...s,
  found: [
    ...s.found,
    ...declarationsIn(src, lists, conditional || s.depth > 0),
  ],
});

/** One node of a list: what it declares, given the conditionals open around it. */
function stepList(
  src: string,
  conditional: boolean,
  s: ListScan,
  n: Node,
): ListScan {
  if (n.type !== "macro") return adding(src, conditional, s, inner(n));
  // A name is not a command; the parser may still have handed it the next token as an argument.
  const args = (n.args ?? []).map((a) => a.content);
  if (s.names > 0)
    return { ...adding(src, conditional, s, args), names: s.names - 1 };
  const named = NAMING.get(n.content);
  if (named !== undefined) return { ...s, names: named };
  if (opensConditional(n)) return { ...s, depth: s.depth + 1 };
  if (n.content === "fi") return { ...s, depth: Math.max(0, s.depth - 1) };
  return {
    ...s,
    found: [
      ...s.found,
      ...macroDeclarations(src, n, conditional || s.depth > 0),
    ],
  };
}

/** The node lists inside a node that is not a macro: an environment's or a group's content. */
const inner = (n: Node): readonly (readonly Node[])[] =>
  n.type === "environment" || n.type === "mathenv"
    ? [n.content, ...(n.args ?? []).map((a) => a.content)]
    : n.type === "group"
      ? [n.content]
      : [];

/** A macro: a declaration itself, and whatever its arguments declare (a definition's: conditionally). */
function macroDeclarations(
  src: string,
  m: Readonly<Ast.Macro>,
  conditional: boolean,
): readonly Declaration[] {
  const names = DECLARING.has(m.content) ? namesOf(src, m) : null;
  const pos = m.position;
  const own: readonly Declaration[] =
    names === null || pos === undefined
      ? []
      : [
          {
            names,
            remote: m.content === "addbibresource" && isRemote(src, m),
            span: { start: pos.start.offset, end: pos.end.offset },
            conditional,
          },
        ];
  const inBody = conditional || DEFINITION_MACROS.has(m.content);
  return [
    ...own,
    ...declarationsIn(
      src,
      (m.args ?? []).map((a) => a.content),
      inBody,
    ),
  ];
}

/** The declarations in some node lists, each list scanned for its own conditionals. */
function declarationsIn(
  src: string,
  lists: readonly (readonly Node[])[],
  conditional: boolean,
): readonly Declaration[] {
  return lists.flatMap(
    (list) =>
      list.reduce<ListScan>((s, n) => stepList(src, conditional, s, n), {
        depth: 0,
        names: 0,
        found: [],
      }).found,
  );
}

/** Every live declaration of databases in a source, in source order. */
export const declarationsOf = (t: ParsedTex): readonly Declaration[] =>
  declarationsIn(t.src, [t.root.content], false);

/** The first live `thebibliography` environment's span, or null. */
const theBibliographyOf = (t: ParsedTex): Span | null => {
  const env = visited(t.root, () => false)
    .filter(isNode)
    .find((n) => n.type === "environment" && n.env === "thebibliography");
  const pos = env?.position;
  return pos === undefined
    ? null
    : { start: pos.start.offset, end: pos.end.offset };
};

/** A database's file name: as declared, with `.bib` when it has none; its name without. */
const fileNameOf = (name: string): string =>
  normalize(name.endsWith(".bib") ? name : `${name}.bib`);
const shownName = (name: string): string =>
  name.endsWith(".bib") ? name.slice(0, -".bib".length) : name;

/** An entry's identity for comparing two texts: key and bytes, whitespace runs folded (TeX drops trailing spaces). */
const identities = (b: BibText): readonly string[] =>
  b.entries.map((e) =>
    b.text.slice(e.span.start, e.span.end).replace(/\s+/g, " "),
  );

const sameEntries = (a: BibText, b: BibText): boolean => {
  const x = identities(a);
  const y = identities(b);
  return x.length === y.length && x.every((v, i) => v === y[i]);
};

/** What one source of the paper holds for the decision. */
interface Parsed {
  readonly path: AbsolutePath;
  readonly declarations: readonly Declaration[];
  readonly blocks: readonly EmbeddedBib[];
  readonly theBibliography: Span | null;
}

function parsedSource(s: BibSource): Parsed {
  const t = parseLatex(s.text);
  return {
    path: s.path,
    declarations: declarationsOf(t),
    blocks: filecontentsOf(t)
      .filter((b) => b.writes.endsWith(".bib"))
      .map((b) => ({
        writes: b.writes,
        overwrite: b.overwrite,
        span: b.span,
        bib: {
          path: s.path,
          text: s.text,
          body: b.body,
          entries: bibEntries(s.text, b.body),
        },
      })),
    theBibliography: theBibliographyOf(t),
  };
}

/** One declared name, decided. */
function decided(
  name: string,
  declared: Declared,
  blocks: readonly EmbeddedBib[],
  disk: BibDisk,
): Database {
  const fileName = fileNameOf(name);
  const shown = shownName(name);
  const block = blocks.find((b) => normalize(b.writes) === fileName);
  const found = disk.bib(fileName);
  const file = found === null ? null : bibFileText(found.path, found.text);
  if (
    block !== undefined &&
    file !== null &&
    disk.committed(file.path) &&
    !sameEntries(block.bib, file)
  )
    return { kind: "conflict", name: shown, declared, block, file };
  if (block !== undefined)
    return { kind: "embedded", name: shown, declared, block };
  if (file !== null) return { kind: "file", name: shown, declared, file };
  return { kind: "missing", name: shown, declared };
}

/**
 * The bibliography of a paper whose sources (the main file first, then its own includes) are
 * `sources`. A `.bib` is looked up in the paper's directory, where bibtex runs (`disk.bib`); a file
 * there counts against a block only when it is committed (`disk.committed`) — see the domain module.
 */
export function decideBibliography(
  sources: readonly BibSource[],
  disk: BibDisk,
): Bibliography {
  const parsed = sources.map(parsedSource);
  const blocks = parsed.flatMap((p) => p.blocks);
  const declared = parsed.flatMap((p) =>
    p.declarations.map((d) => ({ d, at: { file: p.path, span: d.span } })),
  );
  const databases = declared.flatMap(({ d, at }) =>
    d.names.map((name): Database =>
      d.remote
        ? { kind: "remote", name, declared: at }
        : decided(name, at, blocks, disk),
    ),
  );
  const [first, ...rest] = databases;
  if (first !== undefined)
    return {
      kind: declared.some(({ d }) => d.conditional) ? "undecided" : "databases",
      databases: [first, ...rest],
    };
  const thb = parsed.find((p) => p.theBibliography !== null);
  return thb?.theBibliography == null
    ? { kind: "none" }
    : {
        kind: "thebibliography",
        declared: { file: thb.path, span: thb.theBibliography },
      };
}
