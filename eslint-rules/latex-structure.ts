/**
 * THE STRUCTURE OF A LaTeX PAPER, READ OFF ITS PARSE TREE — what the venue-conformance rules
 * (`tex/template`, `tex/required-section`, `tex/venue-leftover`, in `src/tex-venue-rules.ts`) ask
 * of a source: its `\documentclass`, its `\section` headings in order and where the back matter
 * starts, and the text a reader sees with the offset of every character.
 *
 * ── WHY THE PARSE TREE AND NOT THE `tex/latex` PROJECTION ────────────────────────
 * The projection (`latex-language.ts`) blanks the preamble, `\documentclass`, `\author` and every
 * other macro in its OPAQUE list, because prose rules must not see markup. These rules are about
 * exactly that markup: the class line, a `\section*` title, an `\institution{…}` in the author
 * block. So they read `sourceCode.raw` through unified-latex — the parser the language already
 * uses — the way `paper/leading-zero` does.
 *
 * ── CITATION KEYS ARE ARGUMENTS, NOT TEXT ────────────────────────────────────────
 * unified-latex attaches arguments only to macros it has a signature for. natbib's and biblatex's
 * citation commands have none, so `\citep{aisec2025}` came back with its key as a separate group
 * — readable as prose (boundary 13 of the language). `KEY_SIGNATURES` declares them, and the other
 * macros whose arguments name a file, a label or a URL rather than say something, so their
 * arguments are attached and `renderedRuns` skips them structurally.
 */
import { getParser } from "@unified-latex/unified-latex-util-parse";
import type { TexArg, TexNode, TexRoot } from "./latex-language.ts";

/** Macros whose arguments are keys, labels, files or URLs — never text a reader sees. */
const KEY_SIGNATURES: Readonly<Record<string, { signature: string }>> = {
  ...Object.fromEntries(
    [
      "cite",
      "citep",
      "citet",
      "citealp",
      "citealt",
      "citeauthor",
      "citeyear",
      "citeyearpar",
      "Citep",
      "Citet",
      "nocite",
      "parencite",
      "textcite",
      "autocite",
      "footcite",
    ].map((m) => [m, { signature: "o o m" }]),
  ),
  ...Object.fromEntries(
    [
      "label",
      "ref",
      "eqref",
      "pageref",
      "autoref",
      "cref",
      "Cref",
      "url",
      "input",
      "include",
      "bibliography",
      "bibliographystyle",
      "addbibresource",
    ].map((m) => [m, { signature: "m" }]),
  ),
  includegraphics: { signature: "s o o m" },
  usepackage: { signature: "o m o" },
  RequirePackage: { signature: "o m o" },
  documentclass: { signature: "o m o" },
};

let parser: ReturnType<typeof getParser> | null = null;
/** A LaTeX source → its tree. One parser for the process: building one compiles its grammar. */
export function parseLatex(src: string): TexRoot {
  parser ??= getParser({ macros: KEY_SIGNATURES });
  return parser.parse(src);
}

/** A span of the source: `[start, end)` offsets. */
export interface Span {
  readonly start: number;
  readonly end: number;
}

const spanOf = (n: TexNode): Span | null =>
  n.position
    ? { start: n.position.start.offset, end: n.position.end.offset }
    : null;

/** The text of a node list with markup dropped: strings, spaces, and what groups hold. */
function textOf(nodes: readonly TexNode[] | undefined): string {
  let out = "";
  for (const n of nodes ?? []) {
    if (n.type === "string") out += n.content;
    else if (n.type === "whitespace" || n.type === "parbreak") out += " ";
    else if (n.type === "group" || n.type === "argument")
      out += textOf(n.content);
  }
  return out;
}

/** Whitespace collapsed to single spaces and trimmed — how a title is compared. */
export const collapse = (s: string): string =>
  s.split(/\s+/u).filter(Boolean).join(" ");

const mandatoryArgs = (args: readonly TexArg[]): TexArg[] =>
  args.filter((a) => a.openMark === "{");

// ── \documentclass ──────────────────────────────────────────────────────────────────

/** A document class and the options it is loaded with, in source order. */
export interface DocumentClass {
  readonly cls: string;
  readonly options: readonly string[];
}

/** The first `\\documentclass` macro at the top of a tree, or null. */
function documentClassNode(
  root: TexRoot,
): (TexNode & { type: "macro" }) | null {
  for (const n of root.content)
    if (n.type === "macro" && n.content === "documentclass") return n;
  return null;
}

/** Where a macro ends with its arguments: past the closing mark of the last one that holds text. */
function argsEnd(args: readonly TexArg[], from: number): number {
  let end = from;
  for (const a of args) {
    const last = a.content?.at(-1)?.position?.end.offset;
    if (last !== undefined) end = last + (a.closeMark ?? "").length;
  }
  return end;
}

/**
 * The first `\\documentclass` of a tree and the span of the whole macro, its arguments included
 * (a node the parser gave no position stands at 0), or null when there is none or it names no class.
 */
export function documentClassOf(
  root: TexRoot,
): (DocumentClass & { readonly span: Span }) | null {
  const node = documentClassNode(root);
  if (node === null) return null;
  const args = node.args ?? [];
  const cls = collapse(textOf(mandatoryArgs(args)[0]?.content));
  const optional = args.find((a) => a.openMark === "[");
  const options = textOf(optional?.content)
    .split(",")
    .map(collapse)
    .filter(Boolean);
  const name = spanOf(node) ?? { start: 0, end: 0 };
  const span = { start: name.start, end: argsEnd(args, name.end) };
  return cls ? { cls, options, span } : null;
}

/**
 * A preset's `template` → the class it names. Two spellings: a whole `\documentclass[…]{…}` line,
 * or a bare class name (`article`), which names no option. Anything else is null — the caller
 * refuses the preset rather than read it as "no template".
 */
export function parseTemplate(text: string): DocumentClass | null {
  const root = parseLatex(text);
  const dc = documentClassOf(root);
  if (dc) return { cls: dc.cls, options: dc.options };
  const [only, ...rest] = root.content.filter((n) => n.type !== "whitespace");
  return only?.type === "string" && rest.length === 0
    ? { cls: only.content, options: [] }
    : null;
}

/** The options of `want` that `got` does not carry — every one, in `want`'s order. */
export const missingOptions = (
  got: DocumentClass,
  want: DocumentClass,
): string[] => want.options.filter((o) => !got.options.includes(o));

/**
 * `src` with its `\\documentclass` set to `want` — unless the one it has already is `want`'s class
 * with every option `want` names (the author's own options stay). A source with no
 * `\\documentclass` is returned as it is. `root` is `src`'s tree.
 */
export function replaceDocumentClass(
  src: string,
  root: TexRoot,
  want: DocumentClass,
): string {
  const got = documentClassOf(root);
  if (got === null) return src;
  if (got.cls === want.cls && missingOptions(got, want).length === 0)
    return src;
  return `${src.slice(0, got.span.start)}${documentClassLine(want)}${src.slice(got.span.end)}`;
}

/** `replaceDocumentClass` over `src`'s own parse. */
export const withDocumentClass = (src: string, want: DocumentClass): string =>
  replaceDocumentClass(src, parseLatex(src), want);

/** A class as a `\documentclass` line, for a message. */
export const documentClassLine = (d: DocumentClass): string =>
  `\\documentclass${d.options.length ? `[${d.options.join(",")}]` : ""}{${d.cls}}`;
