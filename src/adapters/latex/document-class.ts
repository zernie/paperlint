/** The paper's `\documentclass`, a preset's template, and setting a class in a source. */
import {
  documentClassLine,
  optionsInEffect,
  readWhole,
  venueClass,
  type ClassCandidate,
  type ClassLine,
  type DocumentClass,
  type PackageLoad,
  type PassedOptions,
  type StylePackage,
} from "../../domain/tex-document.ts";
import { documentBodyOf, includesOf } from "./includes.ts";
import {
  collapse,
  isNode,
  macroPlace,
  mandatory,
  optional,
  textOf,
  visited,
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

/** A node at the top of the tree, with its index there: what stands before what. */
interface AtTop {
  readonly node: Macro;
  readonly index: number;
}

/** Every `\documentclass` at the top of the tree, in source order. */
const classNodes = (t: ParsedTex): readonly AtTop[] =>
  t.root.content.flatMap((node, index) =>
    isDocumentClass(node) ? [{ node, index }] : [],
  );

/** Whether nodes hold a macro, inside braces too: what TeX reads there is the macro's expansion. */
const holdsMacro = (nodes: readonly Node[]): boolean =>
  nodes.some(
    (n) => n.type === "macro" || (n.type === "group" && holdsMacro(n.content)),
  );

/** A list of options (`a, b={c,d}`), each as written, and the ones of them built by a macro. */
function optionList(
  src: string,
  nodes: readonly Node[],
): Pick<PassedOptions, "options" | "unread"> {
  const parts = splitWhere(nodes, isComma)
    .map((part) => ({ text: optionText(src, part), unread: holdsMacro(part) }))
    .filter((o) => o.text !== "");
  return {
    options: parts.map((o) => o.text),
    unread: parts.filter((o) => o.unread).map((o) => o.text),
  };
}

/** One `\PassOptionsToClass{options}{class}`: the class it names, its options, its index at the top. */
interface Passed extends PassedOptions {
  readonly cls: string;
  readonly index: number;
}

/**
 * Every `\PassOptionsToClass` at the top of the tree: the options it gives a class count for a
 * `\documentclass` of that class after it, as LaTeX reads them. One missing an argument passes
 * nothing to any class.
 */
const passedOf = (t: ParsedTex): readonly Passed[] =>
  t.root.content.flatMap((n, index) => {
    if (n.type !== "macro" || n.content !== "PassOptionsToClass") return [];
    const [opts, cls] = mandatory(n);
    if (opts === undefined || cls === undefined) return [];
    const list = optionList(t.src, opts.content);
    const name = collapse(textOf(cls.content));
    return [{ ...list, cls: name, place: macroPlace(n), index }];
  });

/**
 * A `\documentclass` node as a class line: empty; a class built by a macro, unread; or the class
 * with its options as read, and the options `passed` to that class before the line.
 */
function classLine(
  src: string,
  { node, index }: AtTop,
  passed: readonly Passed[],
): ClassCandidate {
  const place = macroPlace(node);
  const name = mandatory(node)[0]?.content;
  if (name !== undefined && holdsMacro(name)) return { kind: "unread", place };
  const cls = collapse(textOf(name));
  if (cls === "") return { kind: "empty", place };
  const before = passed
    .filter((p) => p.cls === cls && p.index < index)
    .map(({ options, unread, place: where }) => ({
      options,
      unread,
      place: where,
    }));
  const own = optionList(src, optional(node)?.content ?? []);
  return { kind: "class", cls, ...own, passed: before, place };
}

/** A `\documentclass` anywhere in the tree: in another macro's argument, a definition's body. */
const classAnywhere = (t: ParsedTex): boolean =>
  visited(t.root, () => false).some((v) => isNode(v) && isDocumentClass(v));

/** An `\input` or `\include` in the preamble, left as written: a file this reader was not given. */
function includesInPreamble(t: ParsedTex): boolean {
  const body = documentBodyOf(t)?.start ?? Number.POSITIVE_INFINITY;
  return includesOf(t).some((i) => i.span.start < body);
}

/**
 * The `\documentclass` at the top of the tree: missing; unseen, when there is none at the top but
 * one may stand where this reader does not look (`classAnywhere`, `includesInPreamble`); empty
 * (`\documentclass{}`); unread (`\documentclass{\cls}`); the class with each of its options as
 * written (`foo={a,b}` stays one option, braces kept), whitespace collapsed, its place spanning the
 * macro and its arguments; or, when there are several (behind a TeX switch), each of them as a
 * candidate.
 */
export function documentClassOf(t: ParsedTex): ClassLine {
  const passed = passedOf(t);
  const lines = classNodes(t).map((n) => classLine(t.src, n, passed));
  const [first, second, ...rest] = lines;
  if (first === undefined)
    return classAnywhere(t) || includesInPreamble(t)
      ? { kind: "unseen" }
      : { kind: "missing" };
  return second === undefined
    ? first
    : { kind: "ambiguous", candidates: [first, second, ...rest] };
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

const isPackageLine = (n: Node): n is Macro =>
  n.type === "macro" &&
  (n.content === "usepackage" || n.content === "RequirePackage");

/** A comma list of names (`a, b`), each whitespace-collapsed, empty ones left out. */
const namesIn = (nodes: readonly Node[] | undefined): readonly string[] =>
  splitWhere(nodes ?? [], isComma)
    .map((part) => collapse(textOf(part)))
    .filter(Boolean);

/** A comma list of options as written, empty ones left out. */
const optionsIn = (src: string, nodes: readonly Node[]): readonly string[] =>
  splitWhere(nodes, isComma)
    .map((part) => optionText(src, part))
    .filter(Boolean);

/** One `\PassOptionsToPackage{options}{packages}`: the packages it names, its options, its index. */
interface PassedToPackage {
  readonly packages: readonly string[];
  readonly options: readonly string[];
  readonly index: number;
}

/**
 * Every `\PassOptionsToPackage` at the top of the tree: its options count for a load of one of its
 * packages after it, as LaTeX reads them. One missing an argument passes nothing.
 */
const passedToPackagesOf = (t: ParsedTex): readonly PassedToPackage[] =>
  t.root.content.flatMap((n, index) => {
    if (n.type !== "macro" || n.content !== "PassOptionsToPackage") return [];
    const [opts, pkgs] = mandatory(n);
    if (opts === undefined || pkgs === undefined) return [];
    const options = optionsIn(t.src, opts.content);
    return [{ packages: namesIn(pkgs.content), options, index }];
  });

/** One package line, at `index` at the top: each package it names, with the line's options, those passed before it, and its place. */
function packageLoads(
  src: string,
  { node, index }: AtTop,
  passed: readonly PassedToPackage[],
): readonly PackageLoad[] {
  const place = macroPlace(node);
  const own = optionsIn(src, optional(node)?.content ?? []);
  const before = (name: string): readonly string[] =>
    passed
      .filter((p) => p.index < index && p.packages.includes(name))
      .flatMap((p) => p.options);
  return namesIn(mandatory(node)[0]?.content).map((name) => ({
    name,
    options: [...own, ...before(name)],
    place,
  }));
}

/**
 * Every package the `\usepackage` and `\RequirePackage` lines at the top of the tree load, in source
 * order: the preamble's, as the class line is read, each with the options its line names and the
 * ones `\PassOptionsToPackage` gave it before the line. A comment is not a line; several lines behind
 * a TeX switch are each read.
 */
export function packagesOf(t: ParsedTex): readonly PackageLoad[] {
  const passed = passedToPackagesOf(t);
  return t.root.content
    .flatMap((node, index) => (isPackageLine(node) ? [{ node, index }] : []))
    .flatMap((at) => packageLoads(t.src, at, passed));
}

/**
 * A preset's `template_style` → the package it names and the options it requires: one whole
 * `\usepackage[…]{…}` line naming one package. Anything else is null.
 */
export function parseTemplateStyle(text: string): StylePackage | null {
  const t = parseLatex(text);
  const nodes = t.root.content.filter(
    (n) => n.type !== "whitespace" && n.type !== "comment",
  );
  const [only, ...rest] = nodes;
  if (only === undefined || rest.length > 0 || !isPackageLine(only))
    return null;
  const loads = packageLoads(t.src, { node: only, index: 0 }, []);
  const [load, ...more] = loads;
  return load === undefined || more.length > 0
    ? null
    : { name: load.name, options: load.options };
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
 * source whose class already satisfies `want`, that has no class line the parser could place, or
 * that has several, is returned as it is.
 */
export function replaceDocumentClass(
  t: ParsedTex,
  want: DocumentClass,
): string {
  // Several lines behind a switch: which one builds is not known, so none is rewritten.
  const [top, ...others] = classNodes(t);
  if (top === undefined || others.length > 0) return t.src;
  const { node } = top;
  const line = classLine(t.src, top, passedOf(t));
  if (line.kind !== "class" || line.place.kind === "unplaced") return t.src;
  // A line with an option built by a macro: what it lacks is not known, so it is not rewritten.
  if (!readWhole(line)) return t.src;
  const { start, end } = line.place.span;
  const change = venueClass(optionsInEffect(line), want);
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
