/** The paper's `\documentclass`, a preset's template, and setting a class in a source. */
import {
  documentClassLine,
  missingOptions,
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

/**
 * The first `\documentclass` at the top of the tree: missing; empty (`\documentclass{}`); or the
 * class with each of its options, whitespace collapsed. Its place spans the macro and its arguments.
 */
export function documentClassOf(t: ParsedTex): ClassLine {
  const node = t.root.content.find(isDocumentClass);
  if (node === undefined) return { kind: "missing" };
  const place = macroPlace(node);
  const cls = collapse(textOf(mandatory(node)[0]?.content));
  if (cls === "") return { kind: "empty", place };
  const options = textOf(optional(node)?.content)
    .split(",")
    .map(collapse)
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
 * The source with its `\documentclass` set to `want`. The right class keeps the author's own
 * options and gains the ones `want` names that it lacks (unchanged when none is missing); another
 * class is replaced by `want` whole. A source with no class, an empty one, or one the parser gave
 * no position is returned as it is.
 */
export function replaceDocumentClass(
  t: ParsedTex,
  want: DocumentClass,
): string {
  const line = documentClassOf(t);
  if (line.kind !== "class" || line.place.kind === "unplaced") return t.src;
  const missing = missingOptions(line, want);
  if (line.cls === want.cls && missing.length === 0) return t.src;
  const next: DocumentClass =
    line.cls === want.cls
      ? { cls: line.cls, options: [...line.options, ...missing] }
      : want;
  const { start, end } = line.place.span;
  return `${t.src.slice(0, start)}${documentClassLine(next)}${t.src.slice(end)}`;
}
