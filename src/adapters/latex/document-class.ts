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

/** Nodes split at the top-level commas: a comma inside braces belongs to its group node. */
const splitAtCommas = (nodes: readonly Node[]): readonly (readonly Node[])[] =>
  nodes.reduce<readonly (readonly Node[])[]>(
    (parts, n) =>
      isComma(n)
        ? [...parts, []]
        : [...parts.slice(0, -1), [...(parts.at(-1) ?? []), n]],
    [[]],
  );

/** The source text a run of nodes spans, whitespace collapsed; its markup-free text if unplaced. */
function sourceOf(src: string, nodes: readonly Node[]): string {
  const start = nodes[0]?.position?.start.offset;
  const end = nodes.at(-1)?.position?.end.offset;
  return collapse(
    start === undefined || end === undefined
      ? textOf(nodes)
      : src.slice(start, end),
  );
}

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
  const options = splitAtCommas(optional(node)?.content ?? [])
    .map((part) => sourceOf(t.src, part))
    .filter(Boolean);
  return { kind: "class", cls, options, place };
}

/**
 * A preset's `template` → the class it names: a whole `\documentclass[…]{…}` line, or a bare class
 * name (`article`), which names no option. Anything else is null.
 */
export function parseTemplate(text: string): DocumentClass | null {
  const t = parseLatex(text);
  const line = documentClassOf(t);
  if (line.kind === "class") return { cls: line.cls, options: line.options };
  if (line.kind === "empty") return null;
  const [only, ...rest] = t.root.content.filter((n) => n.type !== "whitespace");
  return only?.type === "string" && rest.length === 0
    ? { cls: only.content, options: [] }
    : null;
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
