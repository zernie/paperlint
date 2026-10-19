/**
 * THE ABSTRACT AS PLAIN TEXT, FROM THE SOURCE — the body of `\begin{abstract}…\end{abstract}`, as
 * `paperlint submission new` sends it. Pure.
 *
 * What TeX would print, for the constructs that have one plain-text reading: the author's own
 * argument-less macros (`\newcommand`, `\renewcommand`, `\providecommand`, `\def` — anywhere in the
 * source it is given, later definitions winning) expanded; `--`/`---` as en and em dashes, ``` `` ```
 * `''` `` ` `` `'` as curly quotes, `~` as a space, as TeX's ligatures make them; formatting commands
 * read as their argument; citations, labels and comments dropped; math only when it is digits,
 * letters and plain symbols. Anything else — a macro nobody defined, one that takes arguments,
 * other math, an environment — is refused with what it is and where it stands. Never guessed.
 */
import { fieldOf } from "../../domain/record.ts";
import { err, ok, type Result } from "../../domain/result.ts";
import type { AbstractProblem } from "../../ports/latex.ts";
import { mandatory, optional, type Macro, type Node } from "./nodes.ts";
import { CITATION_MACROS, parseLatex } from "./parse.ts";

/** What an author's macro stands for: its body, or that it takes arguments (not expanded). */
type Definition =
  | { readonly kind: "plain"; readonly body: readonly Node[] }
  | { readonly kind: "arguments" };

type Unreadable = Extract<AbstractProblem, { readonly kind: "unreadable" }>;
type Text = Result<string, Unreadable>;

const COMMAND_DEFINERS = new Set([
  "newcommand",
  "renewcommand",
  "providecommand",
  "DeclareRobustCommand",
]);
const DEF_DEFINERS = new Set(["def", "gdef", "edef", "xdef"]);

/**
 * Commands that put nothing on the page an abstract's reader sees as text: citations and labels,
 * and the ones that only steer spacing and line breaking (`\allowbreak`, `\-`, `\/`, …).
 */
const DROPPED = new Set([
  ...CITATION_MACROS,
  "label",
  "xspace",
  "noindent",
  "allowbreak",
  "nobreak",
  "nolinebreak",
  "-",
  "/",
  "relax",
  "protect",
]);

/** Commands that print one character or a fixed word. */
const CHARACTERS: ReadonlyMap<string, string> = new Map([
  ["%", "%"],
  ["&", "&"],
  ["$", "$"],
  ["#", "#"],
  ["_", "_"],
  ["{", "{"],
  ["}", "}"],
  [" ", " "],
  ["\\", " "],
  [",", " "],
  ["ldots", "…"],
  ["dots", "…"],
  ["textendash", "–"],
  ["textemdash", "—"],
  ["LaTeX", "LaTeX"],
  ["TeX", "TeX"],
]);

/** Formatting commands: they print what their argument says. */
const FORMATTING = new Set([
  "emph",
  "textbf",
  "textit",
  "texttt",
  "textsc",
  "textsf",
  "textrm",
  "textup",
  "textsl",
  "textmd",
  "textnormal",
  "mbox",
  "text",
  "underline",
]);

/** Symbols in math that have one plain-text character. */
const MATH_SYMBOLS: ReadonlyMap<string, string> = new Map([
  ["%", "%"],
  ["times", "×"],
  ["approx", "≈"],
  ["le", "≤"],
  ["leq", "≤"],
  ["ge", "≥"],
  ["geq", "≥"],
  ["pm", "±"],
  ["sim", "∼"],
  ["cdot", "·"],
  [",", " "],
]);

/** Plain math text: letters, digits, spaces and the symbols that read as themselves. */
const PLAIN_MATH = /^[\p{L}\p{N}\s.,:;+\-=<>()/!|']*$/u;

const at = (n: Node): number => n.position?.start.offset ?? -1;

const contentOf = (nodes: readonly Node[] | undefined): readonly Node[] =>
  nodes ?? [];

const nameIn = (nodes: readonly Node[]): string | null => {
  const first = nodes.find((n) => n.type === "macro");
  return first?.type === "macro" ? first.content : null;
};

/** `\newcommand{\x}[n]{body}` and its kin → the name and what it stands for. */
function commandDefinition(m: Macro): readonly [string, Definition][] {
  const [name, ...rest] = mandatory(m);
  const body = rest.at(-1);
  const macro = nameIn(contentOf(name?.content));
  if (macro === null || body === undefined) return [];
  const takesArguments = contentOf(optional(m)?.content).length > 0;
  return [
    [
      macro,
      takesArguments
        ? { kind: "arguments" }
        : { kind: "plain", body: body.content },
    ],
  ];
}

/** `\def\x{body}` (or `\def\x#1{…}`, which takes arguments) → the name and what it stands for. */
function defDefinition(m: Macro): readonly [string, Definition][] {
  const [name, body] = m.args ?? [];
  const macro = nameIn(contentOf(name?.content));
  if (macro === null || body === undefined) return [];
  const takesArguments = body.content.some(
    (n) => n.type === "string" && n.content.includes("#"),
  );
  return [
    [
      macro,
      takesArguments
        ? { kind: "arguments" }
        : { kind: "plain", body: body.content },
    ],
  ];
}

/** A node's children: its content and, for a macro, its arguments' contents. */
const children = (n: Node): readonly Node[] => [
  ...("content" in n && Array.isArray(n.content) ? n.content : []),
  ...(n.type === "macro" ? (n.args ?? []).flatMap((a) => a.content) : []),
];

/** Every node under `n`, in document order. */
const descendants = (n: Node): readonly Node[] =>
  children(n).flatMap((c) => [c, ...descendants(c)]);

/** What the author's macros stand for, a later definition over an earlier one. */
const definitionsIn = (all: readonly Node[]): ReadonlyMap<string, Definition> =>
  new Map(
    all.flatMap((n) => {
      if (n.type !== "macro") return [];
      if (COMMAND_DEFINERS.has(n.content)) return commandDefinition(n);
      return DEF_DEFINERS.has(n.content) ? defDefinition(n) : [];
    }),
  );

/** The first `abstract` environment's body, or null when the source has none. */
function abstractIn(all: readonly Node[]): readonly Node[] | null {
  const env = all.find((n) => n.type === "environment" && n.env === "abstract");
  return env?.type === "environment" ? env.content : null;
}

interface Reading {
  readonly src: string;
  readonly defs: ReadonlyMap<string, Definition>;
  /** The author's macros being expanded, outermost first: one met again expands into itself. */
  readonly expanding: readonly string[];
}

const refuse = (what: string, n: Node): Text =>
  err({ kind: "unreadable", what, at: at(n) });

/** Nodes in order, joined; the first refusal stops the reading. */
const joined = (nodes: readonly Node[], one: (n: Node) => Text): Text =>
  nodes.reduce<Text>((acc, n) => {
    if (!acc.ok) return acc;
    const t = one(n);
    return t.ok ? ok(acc.value + t.value) : t;
  }, ok(""));

/** An author's macro: its body read in its place, unless it takes arguments or expands into itself. */
function expanded(m: Macro, r: Reading, inMath: boolean): Text | null {
  const def = r.defs.get(m.content);
  if (def === undefined) return null;
  if (def.kind === "arguments")
    return refuse(`\\${m.content}, which takes arguments`, m);
  if (r.expanding.includes(m.content))
    return refuse(`\\${m.content}, which expands into itself`, m);
  const inner = { ...r, expanding: [...r.expanding, m.content] };
  return joined(def.body, (n) =>
    inMath ? mathNode(n, inner, m) : textNode(n, inner),
  );
}

function macroText(m: Macro, r: Reading): Text {
  if (DROPPED.has(m.content)) return ok("");
  const ch = CHARACTERS.get(m.content);
  if (ch !== undefined) return ok(ch);
  if (FORMATTING.has(m.content))
    return joined(contentOf(mandatory(m).at(-1)?.content), (n) =>
      textNode(n, r),
    );
  return (
    expanded(m, r, false) ??
    refuse(
      `\\${m.content}, which no \\newcommand, \\renewcommand or \\def in the paper defines`,
      m,
    )
  );
}

/** One node inside `$…$`: plain text, a symbol with one character, or an author's macro. */
function mathNode(n: Node, r: Reading, math: Node): Text {
  const whole = (): Text =>
    refuse(
      `the math ${r.src.slice(at(math), math.position?.end.offset ?? at(math))}`,
      math,
    );
  if (n.type === "whitespace") return ok(" ");
  // A group in math only groups: `{\sim}`, `{,}` read as what they hold.
  if (n.type === "group") return joined(n.content, (c) => mathNode(c, r, math));
  if (n.type === "string")
    return PLAIN_MATH.test(n.content) ? ok(n.content) : whole();
  if (n.type !== "macro") return whole();
  const symbol = MATH_SYMBOLS.get(n.content);
  return symbol === undefined ? (expanded(n, r, true) ?? whole()) : ok(symbol);
}

/** A math environment's name as the parser gives it: typed a string, a string node at run time. */
const mathEnvName = (n: { readonly env: unknown }): unknown => n.env;

/** A node that holds no other: text, space, a comment — or a construct with no plain reading. */
function leafText(n: Node): Text {
  if (n.type === "string") return ok(n.content);
  if (n.type === "whitespace" || n.type === "parbreak") return ok(" ");
  if (n.type === "comment")
    // A comment eats its line's end; the space before the `%`, which the parser folds into it, stays.
    return ok(n.leadingWhitespace === true ? " " : "");
  if (n.type === "environment") return refuse(`the ${n.env} environment`, n);
  if (n.type === "mathenv")
    // A math environment's name is a string node of its own (`{ type: "string", content: "equation" }`).
    return refuse(
      `the ${String(fieldOf(mathEnvName(n), "content"))} environment`,
      n,
    );
  return refuse(`the ${n.type}`, n);
}

function textNode(n: Node, r: Reading): Text {
  if (n.type === "group") return joined(n.content, (c) => textNode(c, r));
  if (n.type === "macro") return macroText(n, r);
  if (n.type === "inlinemath")
    return joined(n.content, (c) => mathNode(c, r, n));
  return leafText(n);
}

/** TeX's ligatures and spacing, applied to the text as read. */
const typeset = (raw: string): string =>
  raw
    .replaceAll("---", "—")
    .replaceAll("--", "–")
    .replaceAll("``", "“")
    .replaceAll("''", "”")
    .replaceAll("`", "‘")
    .replaceAll("'", "’")
    .replaceAll("~", " ")
    .replace(/\s+/gu, " ")
    .replace(/ ([,.;:!?)])/gu, "$1")
    .trim();

/** The abstract of `src` as one paragraph of plain text, or what stops it. */
export const abstractText = (src: string): Result<string, AbstractProblem> =>
  abstractOfTree(parseLatex(src).root, src);

/** The same, over a tree already parsed from `src`. */
export function abstractOfTree(
  root: Node,
  src: string,
): Result<string, AbstractProblem> {
  const all = descendants(root);
  const body = abstractIn(all);
  if (body === null) return err({ kind: "none" });
  const reading: Reading = { src, defs: definitionsIn(all), expanding: [] };
  const t = joined(body, (n) => textNode(n, reading));
  return t.ok ? ok(typeset(t.value)) : t;
}
