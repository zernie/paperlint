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
const KEY_MACROS = new Set(Object.keys(KEY_SIGNATURES));

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

// ── headings ────────────────────────────────────────────────────────────────────────

/** One `\\section` or `\\section*` of the document, its span covering the title. */
export interface Heading extends Span {
  /** The title's text, whitespace collapsed. */
  readonly title: string;
}

/** The document's sections in order, where its back matter begins, and where it ends. */
export interface Outline {
  readonly sections: readonly Heading[];
  /** The first `\\appendix` or bibliography, or null: sections from here on are not body. */
  readonly backMatter: number | null;
  /** Where `\\end{document}` stands, or null when there is no (positioned) document environment. */
  readonly end: number | null;
}

/** Macros and the environment that start the back matter: the appendix and the bibliography. */
const BACK_MATTER_MACROS = new Set([
  "appendix",
  "bibliography",
  "printbibliography",
]);

const isBackMatter = (n: TexNode): boolean =>
  (n.type === "macro" && BACK_MATTER_MACROS.has(n.content)) ||
  (n.type === "environment" && n.env === "thebibliography");

/** The node lists inside a node, in source order: each argument's, then its content. */
function childLists(n: TexNode): (readonly TexNode[])[] {
  const lists = (("args" in n && n.args) || []).map((a) => a.content ?? []);
  if ("content" in n && Array.isArray(n.content)) lists.push(n.content);
  return lists;
}

/** Every node of a list, depth first in source order, through arguments and contents. */
function forEachDeep(nodes: readonly TexNode[], f: (n: TexNode) => void): void {
  for (const n of nodes) {
    f(n);
    for (const list of childLists(n)) forEachDeep(list, f);
  }
}

function headingOf(n: TexNode & { type: "macro" }, name: Span): Heading {
  const args = n.args ?? [];
  return {
    start: name.start,
    end: argsEnd(args, name.end),
    title: collapse(textOf(mandatoryArgs(args).at(-1)?.content)),
  };
}

/**
 * The document body's `\\section`s (starred or not), the start of the back matter, and the end of
 * the document. A source with no `document` environment is read whole, as a fragment.
 */
export function outlineOf(root: TexRoot): Outline {
  const doc = root.content.find(
    (n) => n.type === "environment" && n.env === "document",
  );
  const body = doc?.type === "environment" ? (doc.content ?? []) : root.content;
  const sections: Heading[] = [];
  let backMatter: number | null = null;
  forEachDeep(body, (n) => {
    const at = spanOf(n);
    if (at === null) return;
    if (n.type === "macro" && n.content === "section")
      sections.push(headingOf(n, at));
    else if (backMatter === null && isBackMatter(n)) backMatter = at.start;
  });
  const docSpan = doc ? spanOf(doc) : null;
  return { sections, backMatter, end: docSpan ? docSpan.end - 1 : null };
}

// ── the text a reader sees ──────────────────────────────────────────────────────────

/** A run of rendered text; `offs[i]` is the source offset of `text[i]`. */
export interface TextRun {
  readonly text: string;
  readonly offs: readonly number[];
}

/** The source span of `run.text.slice(from, to)`, `to > from`. */
export function spanIn(run: TextRun, from: number, to: number): Span {
  let start = 0;
  let end = 0;
  run.offs.forEach((o, i) => {
    if (i === from) start = o;
    if (i === to - 1) end = o + 1;
  });
  return { start, end };
}

/** Environments whose body is not text a reader sees as prose: code and the bibliography. */
const HIDDEN_ENVS = new Set([
  "thebibliography",
  "verbatim",
  "Verbatim",
  "lstlisting",
  "minted",
  "comment",
]);

/** Node types a reader does not see as prose: comments, code, math. */
const HIDDEN_TYPES = new Set<TexNode["type"]>([
  "comment",
  "verbatim",
  "verb",
  "inlinemath",
  "displaymath",
  "mathenv",
]);

const isHidden = (n: TexNode): boolean =>
  HIDDEN_TYPES.has(n.type) ||
  (n.type === "environment" &&
    typeof n.env === "string" &&
    HIDDEN_ENVS.has(n.env)) ||
  (n.type === "macro" && KEY_MACROS.has(n.content));

/** A node's contribution to the run in progress: its characters and their offsets, or null. */
function runPart(n: TexNode): { text: string; at: number } | null {
  const at = n.position?.start.offset;
  if (at === undefined) return null;
  if (n.type === "whitespace" || n.type === "parbreak")
    return { text: " ", at };
  if (n.type !== "string") return null;
  // A tie (`~`) is a space the reader sees.
  return { text: n.content === "~" ? " " : n.content, at };
}

/**
 * Runs of rendered text: stretches of sibling strings and spaces. Anything else ends a run and is
 * entered — a group's text, a macro's arguments — except what a reader never sees: comments,
 * math, code, the bibliography, and the arguments of `KEY_SIGNATURES`' macros.
 */
export function renderedRuns(root: TexRoot): TextRun[] {
  const out: TextRun[] = [];
  const walk = (nodes: readonly TexNode[]): void => {
    let run: { text: string; offs: number[] } = { text: "", offs: [] };
    const flush = () => {
      if (run.text.trim()) out.push(run);
      run = { text: "", offs: [] };
    };
    for (const n of nodes) {
      const part = runPart(n);
      if (part) {
        run.text += part.text;
        for (let i = 0; i < part.text.length; i++) run.offs.push(part.at + i);
        continue;
      }
      flush();
      if (isHidden(n)) continue;
      for (const list of childLists(n)) walk(list);
    }
    flush();
  };
  walk(root.content);
  return out;
}
