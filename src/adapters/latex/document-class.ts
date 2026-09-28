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
 * One option as written, whitespace collapsed. A line comment inside it is not part of it: the
 * option is the source around the comment, never one slice across it — a `%` kept in a rebuilt
 * line would comment out the rest of that line.
 */
const optionText = (src: string, part: readonly Node[]): string =>
  collapse(
    splitWhere(part, (n) => n.type === "comment")
      .map((run) => sourceOf(src, run))
      .join(" "),
  );

/**
 * The first `\documentclass` at the top of the tree: missing; empty (`\documentclass{}`); or the
 * class with each of its options as written (`foo={a,b}` stays one option, braces kept), whitespace
 * collapsed. Its place spans the macro and its arguments.
 */
export function documentClassOf(t: ParsedTex): ClassLine {
  const node = t.root.content.find(isDocumentClass);
  if (node === undefined) return { kind: "missing" };
  const place = macroPlace(node);
  const cls = collapse(textOf(mandatory(node)[0]?.content));
  if (cls === "") return { kind: "empty", place };
  const options = splitWhere(optional(node)?.content ?? [], isComma)
    .map((part) => optionText(t.src, part))
    .filter(Boolean);
  return { kind: "class", cls, options, place };
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

/**
 * The source with its `\documentclass` line rewritten to satisfy `want` (see `venueClass`). A source
 * whose class already does, or that has no class line the parser could place, is returned as it is.
 */
export function replaceDocumentClass(
  t: ParsedTex,
  want: DocumentClass,
): string {
  const line = documentClassOf(t);
  if (line.kind !== "class" || line.place.kind === "unplaced") return t.src;
  const next = venueClass(line, want);
  if (next === null) return t.src;
  const { start, end } = line.place.span;
  return t.src.slice(0, start) + documentClassLine(next) + t.src.slice(end);
}
