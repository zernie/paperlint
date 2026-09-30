/**
 * The body's prose as passages a sentence cannot cross — for a rule that judges SENTENCES, where the
 * rendered runs (`rendered.ts`) are too fine: a run ends at every macro, so one sentence around a
 * `\cite` or an `\emph{…}` is several runs there and one passage here.
 *
 * Kept: the text a reader sees, from the start of the document (the abstract included) to the
 * appendix or the bibliography; the marks that say where a claim comes from — a citation, a link, a
 * cross-reference — where they stand; math, as its source.
 *
 * Left out: headings — a run-in one too, a bold or italic phrase ending in `.` or `:` that opens a
 * paragraph or an item (`\textbf{Threats.} …`) — captions and list-item labels (each also ends a passage), the title block,
 * floats and tables, code, comments, macro definitions, the groups that follow a macro the parser
 * gave no signature (`\institution{…}`), and everything from the back matter on. A footnote is its
 * own passage; one that cites or links leaves a citation mark in the sentence it hangs from.
 */
import type * as Ast from "@unified-latex/unified-latex-types";
import { hasAtLeast, mapWithFeedback, sortBy } from "remeda";
import type {
  Emphasis,
  EmphasisStyle,
  Owner,
  Passage,
  Place,
  ProsePiece,
} from "../../domain/tex-document.ts";
import {
  argumentsOf,
  collapse,
  inPlace,
  macroPlace,
  mandatory,
  placeOf,
  stringText,
  type Macro,
  type Node,
} from "./nodes.ts";
import { CITATION_MACROS, DEFINITION_MACROS, type ParsedTex } from "./parse.ts";

/**
 * What the walk yields: a piece, the end of a passage, the start of the back matter, a footnote, and
 * an emphasised phrase — which stands beside the pieces it typesets, and makes no passage of its own.
 */
type Event =
  | { readonly kind: "piece"; readonly piece: ProsePiece }
  | { readonly kind: "break" }
  | { readonly kind: "end" }
  | { readonly kind: "aside"; readonly events: readonly Event[] }
  | { readonly kind: "emphasis"; readonly emphasis: Emphasis };

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

/** Macros that end a passage and whose arguments are not prose: headings, captions, the title block. */
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

/**
 * What a list item typesets: the parser hands an `\item` its text as the last argument (the
 * `[label]` before it is not prose).
 */
const itemBody = (m: Macro): readonly Node[] =>
  argumentsOf(m)
    .slice(-1)
    .flatMap((a) => a.content);

/** A footnote: its own passage, and a citation mark in the host sentence when it cites or links. */
function footnote(t: ParsedTex, m: Macro): readonly Event[] {
  const inside = walkList(t, lastArgument(m));
  const aside: Event = { kind: "aside", events: inside };
  return cites(inside) ? [...mark(m, "citation"), aside] : [aside];
}

/**
 * Macros with events of their own: `\href{url}{text}` is a link whose text is prose; a footnote is a
 * passage of its own; a list item ends a passage and opens the next with its text.
 */
const OWN_EVENTS: ReadonlyMap<
  string,
  (t: ParsedTex, m: Macro) => readonly Event[]
> = new Map([
  [
    "href",
    (t: ParsedTex, m: Macro) => [
      ...mark(m, "citation"),
      ...walkList(t, lastArgument(m)),
    ],
  ],
  ["footnote", footnote],
  [
    "item",
    (t: ParsedTex, m: Macro) => [BREAK, ...walkList(t, itemBody(m), true)],
  ],
]);

/** Formatting macros that set their argument apart from the running text, and how. */
const EMPHASIS_MACROS: ReadonlyMap<string, EmphasisStyle> = new Map([
  ["textbf", "bold"],
  ["emph", "italic"],
  ["textit", "italic"],
  ["textsl", "italic"],
  ["underline", "underline"],
  ["uline", "underline"],
]);

/**
 * Declarations that set the rest of their group apart — `{\bfseries …}`, `{\em …}` — and how. The
 * group is the phrase.
 */
const EMPHASIS_DECLARATIONS: ReadonlyMap<string, EmphasisStyle> = new Map([
  ["bfseries", "bold"],
  ["bf", "bold"],
  ["em", "italic"],
  ["itshape", "italic"],
  ["it", "italic"],
  ["slshape", "italic"],
]);

/** An emphasised phrase over `place`, typesetting what `inner` typesets; nothing when it has no place or no text. */
const emphasisOf = (
  style: EmphasisStyle,
  place: Place,
  inner: readonly Event[],
): readonly Event[] =>
  inPlace(place, (span) => {
    const text = collapse(typeset(inner));
    return text === ""
      ? []
      : [
          {
            kind: "emphasis",
            emphasis: { style, place: "inline", text, span },
          },
        ];
  });

/** A formatting macro's events: what it typesets, and — for an emphasising one — the phrase. */
function formattingEvents(t: ParsedTex, m: Macro): readonly Event[] {
  const inner = walkList(t, lastArgument(m));
  const style = EMPHASIS_MACROS.get(m.content);
  return style === undefined
    ? inner
    : [...emphasisOf(style, macroPlace(m), inner), ...inner];
}

/** The style a group's opening declaration sets, when it opens with one (`{\bfseries …}`). */
function declaredStyle(list: readonly Node[]): EmphasisStyle | undefined {
  const first = list.find(
    (n) => n.type !== "whitespace" && n.type !== "comment",
  );
  return first?.type === "macro"
    ? EMPHASIS_DECLARATIONS.get(first.content)
    : undefined;
}

/** A group's events: what it typesets, and — when it opens with an emphasis declaration — the phrase. */
function groupEvents(t: ParsedTex, g: NodeOf<"group">): readonly Event[] {
  const inner = walkList(t, g.content);
  const style = declaredStyle(g.content);
  return style === undefined
    ? inner
    : [...emphasisOf(style, placeOf(g), inner), ...inner];
}

function macroEvents(t: ParsedTex, m: Macro): readonly Event[] {
  const name = m.content;
  if (DEFINITION_MACROS.has(name)) return [];
  if (BACK_MATTER.has(name)) return [END];
  if (REFERENCE_MACROS.has(name)) return mark(m, "reference");
  if (SOURCE_MACROS.has(name)) return mark(m, "citation");
  const own = OWN_EVENTS.get(name);
  if (own !== undefined) return own(t, m);
  if (BREAK_MACROS.has(name)) return [BREAK];
  if (INLINE_MACROS.has(name)) return formattingEvents(t, m);
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
  return [BREAK, ...walkList(t, e.content, true), BREAK];
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
      return groupEvents(t, n);
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

/** A `{…}` group, or digits glued to the macro (`\if\conference1`): an argument it takes. */
const isMandatoryArgument = (n: Node): boolean =>
  n.type === "group" || (n.type === "string" && /^\d+$/u.test(n.content));

/** One node's step: whether it is skipped as an argument, and the state after it. */
function step(
  state: ArgumentState,
  n: Node,
): { readonly skip: boolean; readonly state: ArgumentState } {
  if (state === "optional")
    return { skip: true, state: isString(n, "]") ? "arguments" : "optional" };
  if (state === "arguments" && isMandatoryArgument(n))
    return { skip: true, state: "arguments" };
  if (state === "arguments" && isString(n, "["))
    return { skip: true, state: "optional" };
  return { skip: false, state: isUnsignedMacro(n) ? "arguments" : "prose" };
}

/**
 * The nodes of a list that are prose: without the `{…}`, `[…]` and glued digits right after a
 * macro the parser gave no signature — `\institution{…}`, `\ccsdesc[500]{…}`, `\tool{}`,
 * `\if\conference1` — which are its arguments, not text. A formatting macro's group (`\enquote{…}` without csquotes' signature) stays prose.
 */
const proseNodes = (list: readonly Node[]): readonly Node[] => {
  // Each node's step, fed the state the one before left: a scan, linear in the list.
  const start: ReturnType<typeof step> = { skip: false, state: "prose" };
  const steps = mapWithFeedback(list, (prev, n) => step(prev.state, n), start);
  return list.filter((_, i) => steps[i]?.skip === false);
};

/** Formatting macros a run-in heading is set in: `\textbf{Correctness gate.} Each task…`. */
const RUN_IN_MACROS: ReadonlySet<string> = new Set([
  "textbf",
  "textit",
  "emph",
  "textsc",
  "underline",
]);

/** The text a list of events typesets, marks and math left out. */
const typeset = (events: readonly Event[]): string =>
  events
    .map((e) =>
      e.kind === "piece" && e.piece.kind === "text" ? e.piece.segment.text : "",
    )
    .join("");

/** The one node a group holds besides spaces and comments — `{\textbf{…}}` → the `\textbf` — or null. */
const soleChild = (n: Node): Node | null => {
  if (n.type !== "group") return null;
  const kept = n.content.filter(
    (c) => c.type !== "whitespace" && c.type !== "comment",
  );
  return kept.length === 1 ? (kept[0] ?? null) : null;
};

/** A node with the groups around it taken off: `{{\textbf{…}}}` → the `\textbf`. */
const unwrapped = (n: Node): Node => {
  const inner = soleChild(n);
  return inner === null ? n : unwrapped(inner);
};

/**
 * A formatting macro whose phrase ends in `.` or `:` — a run-in heading, when it opens a paragraph.
 * Braces around it change nothing on the page, so `{\textbf{Threats:}}` is one too.
 */
const isRunInHeading = (t: ParsedTex, node: Node): boolean => {
  const n = unwrapped(node);
  return (
    n.type === "macro" &&
    RUN_IN_MACROS.has(n.content) &&
    /[.:]$/u.test(typeset(walkList(t, lastArgument(n))).trim())
  );
};

/** Macros that typeset no text, and so leave a paragraph's opening where it was. */
const SILENT_AT_OPENING: ReadonlySet<string> = new Set([
  "noindent",
  "label",
  "vspace",
  "smallskip",
  "medskip",
  "bigskip",
  "phantomsection",
]);

/** Nodes that leave a paragraph's opening where it was: spaces, comments, macros that typeset nothing. */
const keepsOpening = (n: Node): boolean =>
  n.type === "whitespace" ||
  n.type === "comment" ||
  (n.type === "macro" && SILENT_AT_OPENING.has(n.content));

/** Nodes after which a paragraph opens: a paragraph break, and a macro that ends a passage (a heading). */
const opensAfter = (n: Node): boolean =>
  n.type === "parbreak" || (n.type === "macro" && BREAK_MACROS.has(n.content));

/**
 * An emphasising node's events when it opens a paragraph: its own phrase — the first event — is a
 * label, not inline; braces around it change nothing on the page (`{\textbf{…}}.`). Any other node
 * (an environment, a footnote) is left as it is: what it holds opens nothing here.
 */
const asOpening = (node: Node, events: readonly Event[]): readonly Event[] => {
  const [own, ...rest] = events;
  const n = unwrapped(node);
  const emphasises =
    (n.type === "macro" && EMPHASIS_MACROS.has(n.content)) ||
    (n.type === "group" && declaredStyle(n.content) !== undefined);
  return emphasises && own?.kind === "emphasis"
    ? [
        { kind: "emphasis", emphasis: { ...own.emphasis, place: "opening" } },
        ...rest,
      ]
    : events;
};

/**
 * A list's events. `opens` says the list starts a paragraph (the body, an environment's content);
 * a run-in heading that opens a paragraph ends the passage before it and is left out, like a heading,
 * and a phrase emphasised there is a label (`opening`).
 */
function walkList(
  t: ParsedTex,
  list: readonly Node[],
  opens = false,
): readonly Event[] {
  const nodes = proseNodes(list);
  // Whether a paragraph is open AFTER each node: a scan, so the walk stays linear in the list.
  const after = mapWithFeedback(
    nodes,
    (opening, n) => opensAfter(n) || (opening && keepsOpening(n)),
    opens,
  );
  return nodes.flatMap((n, i) => {
    const opening = i === 0 ? opens : after[i - 1] === true;
    if (!opening) return nodeEvents(t, n);
    return isRunInHeading(t, n) ? [BREAK] : asOpening(n, nodeEvents(t, n));
  });
}

/** The events before the back matter starts. */
const untilEnd = (events: readonly Event[]): readonly Event[] => {
  const end = events.findIndex((e) => e.kind === "end");
  return end < 0 ? events : events.slice(0, end);
};

/** Events → passages: pieces between breaks, each footnote a passage of its own. */
function passagesOf(events: readonly Event[]): readonly Passage[] {
  // Where each passage ends: at every break, and at the end. Slicing between them keeps this
  // linear in the events — a paragraph of thousands of words is one slice, not a copy per word.
  const ends = [
    ...events.flatMap((e, i) => (e.kind === "break" ? [i] : [])),
    events.length,
  ];
  const own = ends.flatMap((end, k) => {
    const pieces = events
      .slice(k === 0 ? 0 : (ends[k - 1] ?? 0) + 1, end)
      .flatMap((e) => (e.kind === "piece" ? [e.piece] : []));
    return hasAtLeast(pieces, 1) ? [{ pieces }] : [];
  });
  const asides = events.flatMap((e) =>
    e.kind === "aside" ? passagesOf(untilEnd(e.events)) : [],
  );
  return [...own, ...asides];
}

/** Every emphasised phrase among events, a footnote's included, up to the back matter. */
const emphasesOf = (events: readonly Event[]): readonly Emphasis[] =>
  untilEnd(events).flatMap((e) =>
    e.kind === "emphasis"
      ? [e.emphasis]
      : e.kind === "aside"
        ? emphasesOf(e.events)
        : [],
  );

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
  return sortBy(passagesOf(untilEnd(bodyEvents(t))).filter(hasProse), startOf);
}

/** The walk of the body: the content of the `document` environment, or the whole source when there is none. */
const bodyEvents = (t: ParsedTex): readonly Event[] =>
  walkList(t, t.root.content.find(isDocument)?.content ?? t.root.content, true);

/**
 * The phrases set in bold, italics or underline inside the body's prose, in document order: what
 * `bodyProse` reads, so never a heading, a run-in heading, a caption, a float or a table.
 */
export function bodyEmphasis(t: ParsedTex): readonly Emphasis[] {
  return sortBy(emphasesOf(bodyEvents(t)), (e) => e.span.start);
}
