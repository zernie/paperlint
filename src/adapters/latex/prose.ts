/**
 * The body's prose as passages a sentence cannot cross — for a rule that judges SENTENCES, where the
 * rendered runs (`rendered.ts`) are too fine: a run ends at every macro, so one sentence around a
 * `\cite` or an `\emph{…}` is several runs there and one passage here.
 *
 * Kept: the text a reader sees, from the start of the document (the abstract included) to the
 * appendix or the bibliography; the marks that say where a claim comes from — a citation, a link, a
 * cross-reference — where they stand; math, as its source.
 *
 * Left out: headings, captions and list-item labels (each also ends a passage), the title block,
 * floats and tables, code, comments, macro definitions, the groups that follow a macro the parser
 * gave no signature (`\institution{…}`), and everything from the back matter on. A footnote is its
 * own passage; one that cites or links leaves a citation mark in the sentence it hangs from.
 */
import type * as Ast from "@unified-latex/unified-latex-types";
import { hasAtLeast, sortBy } from "remeda";
import type { Owner, Passage, ProsePiece } from "../../domain/tex-document.ts";
import {
  inPlace,
  macroPlace,
  mandatory,
  placeOf,
  stringText,
  type Macro,
  type Node,
} from "./nodes.ts";
import { CITATION_MACROS, DEFINITION_MACROS, type ParsedTex } from "./parse.ts";

/** What the walk yields: a piece, the end of a passage, the start of the back matter, a footnote. */
type Event =
  | { readonly kind: "piece"; readonly piece: ProsePiece }
  | { readonly kind: "break" }
  | { readonly kind: "end" }
  | { readonly kind: "aside"; readonly events: readonly Event[] };

const BREAK: Event = { kind: "break" };
const END: Event = { kind: "end" };

/** Environments whose body is not running prose: floats, tables, algorithms, drawings, code. */
const SKIPPED_ENVS: ReadonlySet<string> = new Set([
  "figure",
  "figure*",
  "table",
  "table*",
  "tabular",
  "tabular*",
  "tabularx",
  "longtable",
  "wrapfigure",
  "wraptable",
  "subfigure",
  "subtable",
  "algorithm",
  "algorithm*",
  "algorithmic",
  "tikzpicture",
  "lstlisting",
  "verbatim",
  "Verbatim",
  "minted",
  "comment",
  "CCSXML",
]);

/** Macros that start the back matter: nothing after them is the body. */
const BACK_MATTER: ReadonlySet<string> = new Set([
  "appendix",
  "bibliography",
  "printbibliography",
]);

/** Macros that point at a numbered place in the paper. */
const REFERENCE_MACROS: ReadonlySet<string> = new Set([
  "ref",
  "cref",
  "Cref",
  "autoref",
  "Autoref",
  "eqref",
  "pageref",
  "nameref",
  "vref",
  "Vref",
  "cpageref",
]);

/** Macros that name a source outside the paper: a citation (`\nocite` prints nothing), or a link. */
const SOURCE_MACROS: ReadonlySet<string> = new Set([
  ...[...CITATION_MACROS].filter((m) => m !== "nocite"),
  "url",
]);

/** Macros that end a passage and whose arguments are not prose: headings, captions, items, the title block. */
const BREAK_MACROS: ReadonlySet<string> = new Set([
  "part",
  "chapter",
  "section",
  "subsection",
  "subsubsection",
  "paragraph",
  "subparagraph",
  "caption",
  "captionof",
  "item",
  "bibitem",
  "maketitle",
  "title",
  "subtitle",
  "author",
  "date",
  "newpage",
  "clearpage",
]);

/** Formatting macros whose last mandatory argument is prose, read where it stands. */
const INLINE_MACROS: ReadonlySet<string> = new Set([
  "emph",
  "textbf",
  "textit",
  "texttt",
  "textsc",
  "textsf",
  "textrm",
  "textsl",
  "textup",
  "textmd",
  "textnormal",
  "underline",
  "uline",
  "mbox",
  "hbox",
  "text",
  "enquote",
  "textcolor",
  "colorbox",
  "fbox",
  "textsuperscript",
  "textsubscript",
]);

/** Macros that typeset one character or a space. */
const CHARACTER_MACROS: ReadonlyMap<string, string> = new Map([
  ["%", "%"],
  ["&", "&"],
  ["$", "$"],
  ["#", "#"],
  ["_", "_"],
  ["{", "{"],
  ["}", "}"],
  ["S", "§"],
  ["P", "¶"],
  ["textpercent", "%"],
  ["ldots", "…"],
  ["dots", "…"],
  ["textellipsis", "…"],
  ["textendash", "–"],
  ["textemdash", "—"],
  ...[
    ",",
    " ",
    ";",
    ":",
    "quad",
    "qquad",
    "enspace",
    "thinspace",
    "\\",
    "newline",
  ].map((m) => [m, " "] as const),
]);

const piece = (p: ProsePiece): Event => ({ kind: "piece", piece: p });

/** `s`, typeset where `n` starts. */
const textAt = (n: Node, s: string): readonly Event[] =>
  inPlace(placeOf(n), (span) => [
    piece({ kind: "text", segment: { text: s, at: span.start } }),
  ]);

/**
 * The character a macro typesets, placed at the macro's LAST source character: a sentence that ends
 * on `\%` then spans the whole macro, not its backslash.
 */
const characterAt = (m: Macro, ch: string): readonly Event[] =>
  inPlace(placeOf(m), (span) => [
    piece({ kind: "text", segment: { text: ch, at: span.end - 1 } }),
  ]);

/** A mark over a macro and its arguments. */
const mark = (m: Macro, owner: Owner): readonly Event[] =>
  inPlace(macroPlace(m), (span) => [piece({ kind: "owner", owner, span })]);

/** Math, as its source, where it stands. */
const math = (t: ParsedTex, n: Node): readonly Event[] =>
  inPlace(placeOf(n), (span) => [
    piece({ kind: "math", tex: t.src.slice(span.start, span.end), span }),
  ]);

/** The content of a macro's last mandatory argument: what a formatting macro or a footnote typesets. */
const lastArgument = (m: Macro): readonly Node[] =>
  mandatory(m).at(-1)?.content ?? [];

/**
 * Whether a walk yielded a citation or a link. A footnote nested inside that cites has already left
 * its own citation mark among these events, so the top level is enough.
 */
const cites = (events: readonly Event[]): boolean =>
  events.some(
    (e) =>
      e.kind === "piece" &&
      e.piece.kind === "owner" &&
      e.piece.owner === "citation",
  );

/** A footnote: its own passage, and a citation mark in the host sentence when it cites or links. */
function footnote(t: ParsedTex, m: Macro): readonly Event[] {
  const inside = walkList(t, lastArgument(m));
  const aside: Event = { kind: "aside", events: inside };
  return cites(inside) ? [...mark(m, "citation"), aside] : [aside];
}

function macroEvents(t: ParsedTex, m: Macro): readonly Event[] {
  const name = m.content;
  if (DEFINITION_MACROS.has(name)) return [];
  if (BACK_MATTER.has(name)) return [END];
  if (REFERENCE_MACROS.has(name)) return mark(m, "reference");
  if (SOURCE_MACROS.has(name)) return mark(m, "citation");
  // `\href{url}{text}` is a link, and its text is prose.
  if (name === "href")
    return [...mark(m, "citation"), ...walkList(t, lastArgument(m))];
  if (name === "footnote") return footnote(t, m);
  if (BREAK_MACROS.has(name)) return [BREAK];
  if (INLINE_MACROS.has(name)) return walkList(t, lastArgument(m));
  const ch = CHARACTER_MACROS.get(name);
  return ch === undefined ? [] : characterAt(m, ch);
}

function environmentEvents(
  t: ParsedTex,
  e: Readonly<Ast.Environment>,
): readonly Event[] {
  if (e.type === "mathenv") return math(t, e);
  if (e.env === "thebibliography") return [END];
  if (SKIPPED_ENVS.has(e.env)) return [BREAK];
  return [BREAK, ...walkList(t, e.content), BREAK];
}

type NodeOf<K extends Node["type"]> = Extract<Node, { readonly type: K }>;

/**
 * Inline and display math (an equation environment is typed as an environment, and read there),
 * what ends a passage, and what holds no prose.
 */
const isMath = (n: Node): n is NodeOf<"inlinemath" | "displaymath"> =>
  n.type === "inlinemath" || n.type === "displaymath";
const isBreak = (n: Node): n is NodeOf<"parbreak" | "verbatim"> =>
  n.type === "parbreak" || n.type === "verbatim";
const isSilent = (n: Node): n is NodeOf<"comment" | "verb" | "root"> =>
  n.type === "comment" || n.type === "verb" || n.type === "root";

function nodeEvents(t: ParsedTex, n: Node): readonly Event[] {
  if (isMath(n)) return math(t, n);
  if (isBreak(n)) return [BREAK];
  if (isSilent(n)) return [];
  switch (n.type) {
    case "string":
      return textAt(n, stringText(n.content));
    case "whitespace":
      return textAt(n, " ");
    case "group":
      return walkList(t, n.content);
    case "environment":
    case "mathenv":
      return environmentEvents(t, n);
    case "macro":
      return macroEvents(t, n);
  }
}

/**
 * Where a node list stands with respect to a macro the parser attached no arguments to: in prose,
 * in that macro's arguments, or inside one of its `[…]` arguments.
 */
type ArgumentState = "prose" | "arguments" | "optional";

/** A macro whose `{…}` and `[…]` after it are its arguments, unattached: not a formatting or a character macro. */
const isUnsignedMacro = (n: Node): boolean =>
  n.type === "macro" &&
  n.args === undefined &&
  !INLINE_MACROS.has(n.content) &&
  !CHARACTER_MACROS.has(n.content);

const isString = (n: Node, s: string): boolean =>
  n.type === "string" && n.content === s;

/** One node's step: whether it is skipped as an argument, and the state after it. */
function step(
  state: ArgumentState,
  n: Node,
): { readonly skip: boolean; readonly state: ArgumentState } {
  if (state === "optional")
    return { skip: true, state: isString(n, "]") ? "arguments" : "optional" };
  if (state === "arguments" && n.type === "group")
    return { skip: true, state: "arguments" };
  if (state === "arguments" && isString(n, "["))
    return { skip: true, state: "optional" };
  return { skip: false, state: isUnsignedMacro(n) ? "arguments" : "prose" };
}

/**
 * The nodes of a list that are prose: without the `{…}` and `[…]` right after a macro the parser
 * gave no signature — `\institution{…}`, `\ccsdesc[500]{…}`, `\tool{}` — which are its arguments,
 * not text. A formatting macro's group (`\enquote{…}` without csquotes' signature) stays prose.
 */
const proseNodes = (list: readonly Node[]): readonly Node[] =>
  list.reduce<{
    readonly kept: readonly Node[];
    readonly state: ArgumentState;
  }>(
    (acc, n) => {
      const next = step(acc.state, n);
      return {
        kept: next.skip ? acc.kept : [...acc.kept, n],
        state: next.state,
      };
    },
    { kept: [], state: "prose" },
  ).kept;

function walkList(t: ParsedTex, list: readonly Node[]): readonly Event[] {
  return proseNodes(list).flatMap((n) => nodeEvents(t, n));
}

/** The events before the back matter starts. */
const untilEnd = (events: readonly Event[]): readonly Event[] => {
  const end = events.findIndex((e) => e.kind === "end");
  return end < 0 ? events : events.slice(0, end);
};

/** Events → passages: pieces between breaks, each footnote a passage of its own. */
function passagesOf(events: readonly Event[]): readonly Passage[] {
  const { done, current } = events.reduce<{
    readonly done: readonly (readonly ProsePiece[])[];
    readonly current: readonly ProsePiece[];
  }>(
    (acc, e) =>
      e.kind === "piece"
        ? { done: acc.done, current: [...acc.current, e.piece] }
        : e.kind === "break"
          ? { done: [...acc.done, acc.current], current: [] }
          : acc,
    { done: [], current: [] },
  );
  const asides = events.flatMap((e) =>
    e.kind === "aside" ? passagesOf(untilEnd(e.events)) : [],
  );
  const own = [...done, current].flatMap((pieces) =>
    hasAtLeast(pieces, 1) ? [{ pieces }] : [],
  );
  return [...own, ...asides];
}

const isDocument = (n: Node): n is Readonly<Ast.Environment> =>
  n.type === "environment" && n.env === "document";

/** A passage with something in it besides spaces. */
const hasProse = (p: Passage): boolean =>
  p.pieces.some((x) => x.kind !== "text" || x.segment.text.trim() !== "");

/** Where a passage starts in the source. */
const startOf = (p: Passage): number => {
  const first = p.pieces[0];
  return first.kind === "text" ? first.segment.at : first.span.start;
};

/**
 * The body's prose, in document order: the content of the `document` environment (the whole
 * source when there is none), up to the first back-matter node.
 */
export function bodyProse(t: ParsedTex): readonly Passage[] {
  const body = t.root.content.find(isDocument)?.content ?? t.root.content;
  return sortBy(
    passagesOf(untilEnd(walkList(t, body))).filter(hasProse),
    startOf,
  );
}
