/**
 * THE ABSTRACT AS PLAIN TEXT, FROM THE SOURCE — the body of `\begin{abstract}…\end{abstract}`, as
 * `paperlint submission new` sends it. Pure.
 *
 * unified-latex does the TeX: util-macros reads `\newcommand`/`\renewcommand`/`\providecommand` and
 * expands them, util-ligatures turns `--`, ``` `` ```, `~`, `\%`, `\ldots`, accents… into the
 * characters TeX prints. The macro categories are the adapter's shared sets (parse.ts, headings.ts).
 * What is ours is the policy. A macro the source defines once, before the abstract, is expanded (`\def`, which
 * util-macros does not read, by hand). One it defines more than once is refused with every
 * definition's place: which one TeX uses depends on order, groups and the definer
 * (`\providecommand` keeps an earlier one), and paperlint does not reimplement that. Refused too, with
 * where it stands: a macro nobody defined, one that takes arguments or expands into itself, math
 * beyond digits and symbols, any other construct. Never guessed.
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
import { replaceNode } from "@unified-latex/unified-latex-util-replace";
import { fieldOf } from "../../domain/record.ts";
import { err, ok, type Result } from "../../domain/result.ts";
import type { AbstractProblem } from "../../ports/latex.ts";
import { INVISIBLE, LINE_BREAKS, TRANSPARENT } from "./headings.ts";
import {
  argumentsOf,
  isNode,
  visited,
  type Macro,
  type Node,
} from "./nodes.ts";
import {
  ACCENT_SYMBOLS,
  CITATION_MACROS,
  DEF_MACROS,
  liveRoot,
  LOGO_MACROS,
  MATH_CHARACTERS,
  parseLatex,
  SET_APART_MACROS,
  SILENT_MACROS,
} from "./parse.ts";

/** What an author's macro stands for: its body (null: it takes arguments), and where each definition stands. */
interface Definition {
  readonly body: readonly Node[] | null;
  readonly at: readonly number[];
  /** Where this body's own definition stands: the last one read. */
  readonly own: number;
}
type Text = Result<string, Exclude<AbstractProblem, { readonly kind: "none" }>>;

const PLAIN_MATH = /^[\p{L}\p{N}\s.,:;+\-=<>()/!|']*$/u;
/** Rounds of expansion before a macro still standing is taken to expand into itself. */
const DEPTH = 16;

const at = (n: Node): number => n.position?.start.offset ?? -1;
const end = (n: Node): number => n.position?.end.offset ?? at(n);
const refuse = (what: string, n: Node): Text =>
  err({ kind: "unreadable", what, at: at(n) });

/** `\def\x{body}` → its body; `\def\x#1{…}` takes arguments. util-macros does not read `\def`. */
function defDefinition(m: Macro): readonly [string, Definition["body"]][] {
  const [name, body] = argumentsOf(m);
  const macro = name?.content.find((n) => n.type === "macro");
  if (macro?.type !== "macro" || body === undefined) return [];
  const hash = body.content.some(
    (n) => n.type === "string" && n.content.includes("#"),
  );
  return [[macro.content, hash ? null : body.content]];
}

/** `\newcommand` and its kin, read by util-macros. */
function definitionOf(m: Macro): readonly [string, Definition["body"]][] {
  if (DEF_MACROS.has(m.content)) return defDefinition(m);
  // A \newcommand the parser gave no name has none here either: util-macros answers "".
  const name = newcommandMatcher(m) ? newcommandMacroToName(m) : "";
  if (name === "") return [];
  const plain = newcommandMacroToSpec(m) === "";
  return [[name, plain ? newcommandMacroToSubstitutionAst(m) : null]];
}

/** Every macro the source defines, with each of its definitions' places. */
function definitionsIn(
  nodes: readonly Node[],
): ReadonlyMap<string, Definition> {
  const found = nodes.flatMap((n) =>
    n.type === "macro"
      ? definitionOf(n).map(([name, body]) => ({ name, body, at: at(n) }))
      : [],
  );
  return new Map(
    found.map((d) => [
      d.name,
      {
        body: d.body,
        at: found.filter((e) => e.name === d.name).map((e) => e.at),
        own: d.at,
      },
    ]),
  );
}

/** Nodes in order, joined; the first refusal stops the reading. */
const joined = (nodes: readonly Node[], one: (n: Node) => Text): Text =>
  nodes.reduce<Text>((acc, n) => {
    if (!acc.ok) return acc;
    const t = one(n);
    return t.ok ? ok(acc.value + t.value) : t;
  }, ok(""));

interface Reading {
  /** Where `\\begin{abstract}` stands: a definition from here on is not applied backwards. */
  readonly start: number;
  readonly src: string;
  readonly defs: ReadonlyMap<string, Definition>;
}

/** A macro of the author's still standing after expansion: why it is. */
function definedProblem(m: Macro, r: Reading): Text | null {
  const def = r.defs.get(m.content);
  if (def === undefined) return null;
  if (def.at.length > 1)
    return err({ kind: "redefined", name: m.content, at: def.at });
  if (def.own >= r.start)
    return err({
      kind: "unreadable",
      what: `\\${m.content}, which the paper defines only after the abstract begins`,
      at: def.own,
    });
  const why = def.body === null ? "takes arguments" : "expands into itself";
  return refuse(`\\${m.content}, which ${why}`, m);
}

/** What a macro of the shared sets prints regardless of its arguments; null for any other. */
function fixedText(name: string): string | null {
  if (CITATION_MACROS.has(name) || INVISIBLE.has(name)) return "";
  if (SILENT_MACROS.has(name)) return "";
  if (LINE_BREAKS.has(name)) return " ";
  return LOGO_MACROS.get(name) ?? null;
}

function macroText(m: Macro, r: Reading): Text {
  const name = m.content;
  const fixed = fixedText(name);
  if (fixed !== null) return ok(fixed);
  if (TRANSPARENT.has(name) || SET_APART_MACROS.has(name))
    return joined(m.args?.at(-1)?.content ?? [], (n) => textNode(n, r));
  return (
    definedProblem(m, r) ??
    refuse(
      `\\${name}, which no \\newcommand, \\renewcommand or \\def in the paper defines`,
      m,
    )
  );
}

/** `$…$`: digits, letters and plain symbols, or refused whole. A group in math only groups. */
function mathText(math: Readonly<Ast.InlineMath>, r: Reading): Text {
  const whole = refuse(`the math ${r.src.slice(at(math), end(math))}`, math);
  const one = (n: Node): Text => {
    if (n.type === "whitespace") return ok(" ");
    if (n.type === "group") return joined(n.content, one);
    if (n.type === "string")
      return PLAIN_MATH.test(n.content) ? ok(n.content) : whole;
    if (n.type !== "macro") return whole;
    const symbol = MATH_CHARACTERS.get(n.content);
    return symbol === undefined ? (definedProblem(n, r) ?? whole) : ok(symbol);
  };
  return joined(math.content, one);
}

/** A math environment's name as the parser gives it: typed a string, a string node at run time. */
const mathEnvName = (n: { readonly env: unknown }): unknown => n.env;

/** A node that holds no text of its own to read: a comment, or a construct with no plain reading. */
function leafText(n: Node): Text {
  if (n.type === "whitespace" || n.type === "parbreak") return ok(" ");
  if (n.type === "comment")
    // A comment eats its line's end; the space before the `%`, which the parser folds into it, stays.
    return ok(n.leadingWhitespace === true ? " " : "");
  if (n.type === "environment") return refuse(`the ${n.env} environment`, n);
  if (n.type === "mathenv") {
    const env = String(fieldOf(mathEnvName(n), "content"));
    return refuse(`the ${env} environment`, n);
  }
  return refuse(`the ${n.type}`, n);
}

function textNode(n: Node, r: Reading): Text {
  if (n.type === "string") return ok(n.content);
  if (n.type === "group") return joined(n.content, (c) => textNode(c, r));
  if (n.type === "macro") return macroText(n, r);
  if (n.type === "inlinemath") return mathText(n, r);
  return leafText(n);
}

/** A control symbol that is no accent: TeX keeps the space after it (`50\% of`, `it\/ and`). */
const keepsSpace = (
  n: Readonly<Ast.Node | Ast.Argument> | undefined,
): boolean =>
  n?.type === "macro" &&
  n.content.length === 1 &&
  !/\p{L}/u.test(n.content) &&
  !ACCENT_SYMBOLS.has(n.content);

/** One paragraph: runs of space as one, none before closing punctuation; `\-` (U+00AD) prints nothing. */
const paragraph = (raw: string): string =>
  raw
    .replaceAll("­", "")
    .replace(/\s+/gu, " ")
    .replace(/ ([,.;:!?)])/gu, "$1")
    .trim();

/**
 * The abstract's nodes as TeX would set them, as a new tree: each macro defined once expanded, one
 * level per round (a macro still standing after DEPTH rounds expands into itself), then ligatures.
 */
function typeset(
  content: readonly Node[],
  defs: ReadonlyMap<string, Definition>,
  start: number,
): Readonly<Ast.Root> {
  // Expanded: a macro with one definition, standing before the abstract.
  const plain = [...defs].flatMap(([name, d]) =>
    d.body === null || d.at.length > 1 || d.own >= start
      ? []
      : [{ name, body: structuredClone([...d.body]) }],
  );
  // eslint-disable-next-line functional/prefer-immutable-types -- a clone the three library calls below rewrite in place
  const body: Ast.Root = {
    type: "root",
    content: structuredClone([...content]),
  };
  Array.from({ length: DEPTH }).forEach(() => {
    expandMacros(body, plain);
  });
  // util-ligatures swallows the space after a control symbol, as it must after an accent.
  replaceNode(body, (n, info) =>
    n.type === "whitespace" &&
    keepsSpace(info.containingArray?.slice(0, info.index).at(-1))
      ? { type: "string", content: " " }
      : undefined,
  );
  expandUnicodeLigatures(body);
  return body;
}

/** The abstract of `src` as one paragraph of plain text, or what stops it; nothing after `\\end{document}` is read. */
export const abstractText = (src: string): Result<string, AbstractProblem> =>
  abstractOfTree(liveRoot(parseLatex(src)), src);

/** The same, over a tree already parsed from `src`. */
export function abstractOfTree(
  root: Readonly<Ast.Root>,
  src: string,
): Result<string, AbstractProblem> {
  const nodes = visited(root, () => false).filter(isNode);
  const env = nodes.find(
    (n) => n.type === "environment" && n.env === "abstract",
  );
  if (env?.type !== "environment") return err({ kind: "none" });
  const defs = definitionsIn(nodes);
  const start = at(env);
  const body = typeset(env.content, defs, start);
  const t = joined(body.content, (n) => textNode(n, { src, defs, start }));
  return t.ok ? ok(paragraph(t.value)) : t;
}
