/**
 * THE ABSTRACT AS PLAIN TEXT, FROM THE SOURCE — the body of `\begin{abstract}…\end{abstract}`, as
 * `paperlint submission new` sends it. Pure.
 *
 * unified-latex does the TeX: util-macros lists `\newcommand`/`\renewcommand`/`\providecommand` and
 * expands them, util-ligatures turns `--`, ``` `` ```, `~`, `\%`, `\ldots`, accents… into the
 * characters TeX prints. What is ours is the policy: which definition is in force (the last one
 * before the abstract, not inside a group already closed — `\def`, which util-macros does not list,
 * read by hand), what is dropped (citations, labels, line-breaking hints), what reads as its
 * argument (formatting), and what is refused with where it stands: a macro nobody defined, one that
 * takes arguments or expands into itself, math beyond digits and symbols, any other construct.
 */
import type * as Ast from "@unified-latex/unified-latex-types";
import { expandUnicodeLigatures } from "@unified-latex/unified-latex-util-ligatures";
import {
  expandMacros,
  newcommandMacroToName,
  newcommandMacroToSpec,
  newcommandMacroToSubstitutionAst,
  newcommandMatcher,
} from "@unified-latex/unified-latex-util-macros";
import { visit } from "@unified-latex/unified-latex-util-visit";
import { fieldOf } from "../../domain/record.ts";
import { err, ok, type Result } from "../../domain/result.ts";
import type { AbstractProblem } from "../../ports/latex.ts";
import type { Macro, Node } from "./nodes.ts";
import { CITATION_MACROS, parseLatex } from "./parse.ts";

/** What an author's macro stands for: its body, or null when it takes arguments (never expanded). */
interface Definition {
  readonly body: Ast.Node[] | null;
}
type Unreadable = Extract<AbstractProblem, { readonly kind: "unreadable" }>;
type Text = Result<string, Unreadable>;

const DEFS = new Set(["def", "edef"]);
const GLOBAL_DEFS = new Set(["gdef", "xdef"]);
/** Commands that put nothing an abstract's reader sees as text on the page. */
const DROPPED = new Set([
  ...CITATION_MACROS,
  ...["label", "xspace", "noindent", "allowbreak", "nobreak", "nolinebreak"],
  ...["relax", "protect"],
]);
/** What util-ligatures leaves: the forced line break, and the two logos. */
const WORDS = new Map([
  ["\\", " "],
  ["LaTeX", "LaTeX"],
  ["TeX", "TeX"],
]);
/** Formatting commands: they print what their argument says. */
const FORMATTING = new Set([
  ...["emph", "textbf", "textit", "texttt", "textsc", "textsf", "textrm"],
  ...["textup", "textsl", "textmd", "textnormal", "mbox", "text", "underline"],
]);
/** Symbols in math that have one plain-text character. */
const MATH_SYMBOLS = new Map(
  Object.entries({
    "%": "%",
    ",": " ",
    times: "×",
    approx: "≈",
    le: "≤",
    leq: "≤",
    ge: "≥",
    geq: "≥",
    pm: "±",
    sim: "∼",
    cdot: "·",
  }),
);
const PLAIN_MATH = /^[\p{L}\p{N}\s.,:;+\-=<>()/!|']*$/u;
/** Accents: control symbols that take the next letter, across a space (`\\' e` is é). */
const ACCENTS = new Set(["'", '"', "^", "~", ".", "=", "`"]);
/** Rounds of expansion before a macro still standing is taken to expand into itself. */
const DEPTH = 16;

const at = (n: Node): number => n.position?.start.offset ?? -1;
const refuse = (what: string, n: Node): Text =>
  err({ kind: "unreadable", what, at: at(n) });

/** `\def\x{body}` → the name and its body; `\def\x#1{…}` takes arguments. Not util-macros'. */
function defDefinition(m: Macro): readonly [string, Definition][] {
  const [name, body] = m.args ?? [];
  const macro = name?.content.find((n) => n.type === "macro");
  if (macro?.type !== "macro" || body === undefined) return [];
  const hash = body.content.some(
    (n) => n.type === "string" && n.content.includes("#"),
  );
  return [[macro.content, { body: hash ? null : [...body.content] }]];
}

/** `\newcommand` and its kin, through util-macros. */
function newcommandDefinition(m: Ast.Macro): readonly [string, Definition][] {
  const name = (m.args?.length ?? 0) === 0 ? "" : newcommandMacroToName(m);
  if (name === "") return [];
  const plain = newcommandMacroToSpec(m) === "";
  return [[name, { body: plain ? newcommandMacroToSubstitutionAst(m) : null }]];
}

/** The definitions in force where the abstract starts: before it, outside any group closed by then. */
function definitionsAt(
  root: Ast.Root,
  start: number,
): ReadonlyMap<string, Definition> {
  const found: (readonly [string, Definition])[] = [];
  const closed = (p: Ast.Node | Ast.Argument) =>
    (p.type === "group" || p.type === "environment") &&
    (p.position?.end.offset ?? Infinity) <= start;
  visit(root, (node, info) => {
    if (node.type !== "macro" || at(node) >= start) return;
    if (!GLOBAL_DEFS.has(node.content) && info.parents.some(closed)) return;
    if (newcommandMatcher(node)) found.push(...newcommandDefinition(node));
    if (DEFS.has(node.content) || GLOBAL_DEFS.has(node.content))
      found.push(...defDefinition(node));
  });
  return new Map(found);
}

interface Reading {
  readonly src: string;
  readonly defs: ReadonlyMap<string, Definition>;
}

/** Nodes in order, joined; the first refusal stops the reading. */
const joined = (nodes: readonly Node[], one: (n: Node) => Text): Text =>
  nodes.reduce<Text>((acc, n) => {
    if (!acc.ok) return acc;
    const t = one(n);
    return t.ok ? ok(acc.value + t.value) : t;
  }, ok(""));

/** A macro of the author's still standing after expansion: why it is. */
function definedProblem(m: Macro, r: Reading): Text | null {
  const def = r.defs.get(m.content);
  if (def === undefined) return null;
  return refuse(
    `\\${m.content}, which ${def.body === null ? "takes arguments" : "expands into itself"}`,
    m,
  );
}

function macroText(m: Macro, r: Reading): Text {
  if (DROPPED.has(m.content)) return ok("");
  const word = WORDS.get(m.content);
  if (word !== undefined) return ok(word);
  if (FORMATTING.has(m.content))
    return joined(m.args?.at(-1)?.content ?? [], (n) => textNode(n, r));
  return (
    definedProblem(m, r) ??
    refuse(
      `\\${m.content}, which no \\newcommand, \\renewcommand or \\def in the paper defines`,
      m,
    )
  );
}

/** `$…$`: digits, letters and plain symbols, or refused whole. A group in math only groups. */
function mathText(math: Readonly<Ast.InlineMath>, r: Reading): Text {
  const whole = refuse(
    `the math ${r.src.slice(at(math), math.position?.end.offset ?? at(math))}`,
    math,
  );
  const one = (n: Node): Text => {
    if (n.type === "whitespace") return ok(" ");
    if (n.type === "group") return joined(n.content, one);
    if (n.type === "string")
      return PLAIN_MATH.test(n.content) ? ok(n.content) : whole;
    if (n.type !== "macro") return whole;
    const symbol = MATH_SYMBOLS.get(n.content);
    return symbol === undefined ? (definedProblem(n, r) ?? whole) : ok(symbol);
  };
  return joined(math.content, one);
}

/** A math environment's name as the parser gives it: typed a string, a string node at run time. */
const mathEnvName = (n: { readonly env: unknown }): unknown => n.env;

function textNode(n: Node, r: Reading): Text {
  switch (n.type) {
    case "string":
      return ok(n.content);
    case "whitespace":
    case "parbreak":
      return ok(" ");
    case "comment":
      // A comment eats its line's end; the space before the `%`, which the parser folds into it, stays.
      return ok(n.leadingWhitespace === true ? " " : "");
    case "group":
      return joined(n.content, (c) => textNode(c, r));
    case "macro":
      return macroText(n, r);
    case "inlinemath":
      return mathText(n, r);
    case "environment":
      return refuse(`the ${n.env} environment`, n);
    case "mathenv":
      return refuse(
        `the ${String(fieldOf(mathEnvName(n), "content"))} environment`,
        n,
      );
    default:
      return refuse(`the ${n.type}`, n);
  }
}

/** One paragraph: runs of space as one, none before closing punctuation; `\-` (U+00AD) prints nothing. */
const paragraph = (raw: string): string =>
  raw
    .replaceAll("­", "")
    .replace(/\s+/gu, " ")
    .replace(/ ([,.;:!?)])/gu, "$1")
    .trim();

/**
 * The space after a control symbol (`50\\% of`, `it\\/ and`) is a space in TeX; util-ligatures
 * swallows it with the symbol, as it must for an accent. So it is made a literal space first.
 */
function keepSpaceAfterControlSymbols(tree: Ast.Root): void {
  const symbol = (n: Ast.Node | undefined) =>
    n?.type === "macro" &&
    n.content.length === 1 &&
    !/\p{L}/u.test(n.content) &&
    !ACCENTS.has(n.content);
  visit(
    tree,
    (nodes: Ast.Node[]) => {
      nodes.forEach((n, i) => {
        if (n.type === "whitespace" && symbol(nodes[i - 1]))
          nodes.splice(i, 1, { type: "string", content: " " });
      });
    },
    { includeArrays: true, test: Array.isArray },
  );
}

/** The abstract of `src` as one paragraph of plain text, or what stops it. */
export const abstractText = (src: string): Result<string, AbstractProblem> =>
  abstractOfTree(parseLatex(src).root, src);

/** The same, over a tree already parsed from `src`. */
export function abstractOfTree(
  root: Ast.Root,
  src: string,
): Result<string, AbstractProblem> {
  const envs: Ast.Environment[] = [];
  visit(root, (n) => {
    if (n.type === "environment" && n.env === "abstract") envs.push(n);
  });
  const env = envs[0];
  if (env === undefined) return err({ kind: "none" });
  const defs = definitionsAt(root, at(env));
  const body: Ast.Root = {
    type: "root",
    content: structuredClone(env.content),
  };
  const plain = [...defs].flatMap(([name, d]) =>
    d.body === null ? [] : [{ name, body: d.body }],
  );
  // One level per round; a macro still standing after DEPTH rounds expands into itself.
  Array.from({ length: DEPTH }).forEach(() => {
    expandMacros(body, plain);
  });
  keepSpaceAfterControlSymbols(body);
  expandUnicodeLigatures(body);
  const t = joined(body.content, (n) => textNode(n, { src, defs }));
  return t.ok ? ok(paragraph(t.value)) : t;
}
