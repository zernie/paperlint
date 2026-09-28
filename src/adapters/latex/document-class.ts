/** The paper's `\documentclass`, a preset's template, and setting a class in a source. */
import {
  documentClassLine,
  venueClass,
  type ClassLine,
  type DocumentClass,
} from "../../domain/tex-document.ts";
import {
  collapse,
  macroPlace,
  mandatory,
  optional,
  textOf,
  type Node,
  type Macro,
} from "./nodes.ts";
import { parseLatex, type ParsedTex } from "./parse.ts";

const isDocumentClass = (n: Node): n is Macro =>
  n.type === "macro" && n.content === "documentclass";

const isComma = (n: Node): boolean => n.type === "string" && n.content === ",";

/** Nodes split wherever `at` holds, the separators dropped: a comma inside braces is its group's. */
function splitWhere(
  nodes: readonly Node[],
  at: (n: Node) => boolean,
): readonly (readonly Node[])[] {
  const cuts = nodes.flatMap((n, i) => (at(n) ? [i] : []));
  return [-1, ...cuts].map((from, k) =>
    nodes.slice(from + 1, cuts[k] ?? nodes.length),
  );
}

/** The source text a run of nodes spans; its markup-free text if unplaced. */
function sourceOf(src: string, nodes: readonly Node[]): string {
  const start = nodes[0]?.position?.start.offset;
  const end = nodes.at(-1)?.position?.end.offset;
  return start === undefined || end === undefined
    ? textOf(nodes)
    : src.slice(start, end);
}

/**
 * One option as TeX reads it, whitespace collapsed. A line comment is not part of it, and it joins
 * its two sides with no space: `foo=bar% note⏎baz` is `foo=barbaz`.
 */
const optionText = (src: string, part: readonly Node[]): string =>
  collapse(
    splitWhere(part, (n) => n.type === "comment")
      .map((run) => sourceOf(src, run))
      .join(""),
  );

const classNode = (t: ParsedTex): Macro | undefined =>
  t.root.content.find(isDocumentClass);

/** A `\documentclass` node as a class line: empty, or the class with its options as read. */
function classLine(src: string, node: Macro): ClassLine {
  const place = macroPlace(node);
  const cls = collapse(textOf(mandatory(node)[0]?.content));
  if (cls === "") return { kind: "empty", place };
  const options = splitWhere(optional(node)?.content ?? [], isComma)
    .map((part) => optionText(src, part))
    .filter(Boolean);
  return { kind: "class", cls, options, place };
}

/**
 * The first `\documentclass` at the top of the tree: missing; empty (`\documentclass{}`); or the
 * class with each of its options as written (`foo={a,b}` stays one option, braces kept), whitespace
 * collapsed. Its place spans the macro and its arguments.
 */
export function documentClassOf(t: ParsedTex): ClassLine {
  const node = classNode(t);
  return node === undefined ? { kind: "missing" } : classLine(t.src, node);
}

/**
 * A preset's `template` → the class it names: a whole `\documentclass[…]{…}` line, or a bare class
 * name (`article`), which names no option. Anything else is null.
 */
export function parseTemplate(text: string): DocumentClass | null {
  const t = parseLatex(text);
  const [only, ...rest] = t.root.content.filter(
    (n) => n.type !== "whitespace" && n.type !== "comment",
  );
  if (only === undefined || rest.length > 0) return null;
  const line = documentClassOf(t);
  if (line.kind === "class") return { cls: line.cls, options: line.options };
  return only.type === "string" ? { cls: only.content, options: [] } : null;
}

/** `src` with `text` in place of `[from, to)`. */
const splice = (src: string, from: number, to: number, text: string): string =>
  src.slice(0, from) + text + src.slice(to);

/**
 * `options` written into the class line's own source: before the `]` of its `[…]` — right after the
 * last node inside, or right after the `[` when there is none — or as a new `[…]` after the name.
 * The bytes between `[` and `]` stay as the author wrote them, comments and braces included.
 */
function addOptions(
  src: string,
  node: Macro,
  line: { readonly start: number; readonly empty: boolean },
  options: readonly string[],
): string {
  const list = options.join(",");
  const nameEnd = line.start + 1 + node.content.length; // `\` and the macro's name
  const opt = optional(node);
  if (opt === undefined) return splice(src, nameEnd, nameEnd, `[${list}]`);
  const close =
    opt.content.at(-1)?.position?.end.offset ?? src.indexOf("[", nameEnd) + 1;
  return splice(src, close, close, line.empty ? list : `,${list}`);
}

/**
 * The source with its `\documentclass` line changed to satisfy `want` (see `venueClass`): another
 * class is replaced by the template's line; the same class gains the options it lacks in place. A
 * source whose class already satisfies `want`, or that has no class line the parser could place, is
 * returned as it is.
 */
export function replaceDocumentClass(
  t: ParsedTex,
  want: DocumentClass,
): string {
  const node = classNode(t);
  if (node === undefined) return t.src;
  const line = classLine(t.src, node);
  if (line.kind !== "class" || line.place.kind === "unplaced") return t.src;
  const { start, end } = line.place.span;
  const change = venueClass(line, want);
  switch (change.kind) {
    case "keep":
      return t.src;
    case "replace":
      return splice(t.src, start, end, documentClassLine(change.by));
    case "add":
      return addOptions(
        t.src,
        node,
        { start, empty: line.options.length === 0 },
        change.options,
      );
  }
}
