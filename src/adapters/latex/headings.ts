/**
 * The titles of the document's headings as the case judge reads them: each as one run of text, every
 * character with the source offset it came from.
 *
 * What a title says is its strings and spaces, and the words a formatting command wraps
 * (`\emph{very}` says "very"). A label, a footnote or an index entry says nothing in the title and
 * is left out. Anything else — math, `\texttt`, `\cite`, `\textsc`, an accent, an environment — is
 * something the reader sees and the judge does not read, so it stands as `OPAQUE`, one character,
 * where it is: the judge then knows a word is first or last only when nothing stands before or
 * after it, and never reads a word that touches one.
 */
import { hasAtLeast } from "remeda";
import type {
  HeadingLevel,
  Segment,
  TitleArgument,
  TitledHeading,
} from "../../domain/tex-document.ts";
import { OPAQUE } from "../../domain/tex-document.ts";
import { isDefinition, isUnrendered } from "./hidden.ts";
import {
  inPlace,
  isNode,
  mandatory,
  optional,
  placeOf,
  stringText,
  visited,
  type Macro,
  type Node,
} from "./nodes.ts";
import type { ParsedTex } from "./parse.ts";

const LEVELS: ReadonlyMap<string, HeadingLevel> = new Map<string, HeadingLevel>(
  [
    ["section", "section"],
    ["subsection", "subsection"],
    ["subsubsection", "subsubsection"],
    ["paragraph", "paragraph"],
  ],
);

/** Formatting commands: they say what their argument says. */
const TRANSPARENT: ReadonlySet<string> = new Set([
  "emph",
  "textit",
  "textbf",
  "textsl",
  "textup",
  "textmd",
  "textnormal",
  "textsf",
  "textrm",
]);

/** Commands that put nothing in the title's words: a label, a footnote, an index entry. */
const INVISIBLE: ReadonlySet<string> = new Set([
  "label",
  "footnote",
  "thanks",
  "index",
]);

/** The heading level a macro names: none for any other command. */
const levelOf = (m: Macro): readonly HeadingLevel[] => {
  const level = LEVELS.get(m.content);
  return level === undefined ? [] : [level];
};

/** A macro that is neither left out of the title nor read as the words it wraps. */
const isOpaqueMacro = (m: Macro): boolean =>
  !INVISIBLE.has(m.content) && !TRANSPARENT.has(m.content);

/** What one macro says in a title. */
function macroSegments(m: Macro): readonly Segment[] {
  if (INVISIBLE.has(m.content)) return [];
  if (TRANSPARENT.has(m.content))
    return segmentsOf(mandatory(m).at(-1)?.content);
  return textAt(m, OPAQUE);
}

/** A piece of text at the start of a node. */
const textAt = (n: Node, text: string): readonly Segment[] =>
  inPlace(placeOf(n), (s) => [{ text, at: s.start }]);

/** What one node says in a title: text as itself, a formatting command's words, anything else opaque. */
function nodeSegments(n: Node): readonly Segment[] {
  if (n.type === "string") return textAt(n, stringText(n.content));
  if (n.type === "whitespace" || n.type === "parbreak") return textAt(n, " ");
  if (n.type === "comment") return [];
  if (n.type === "group") return segmentsOf(n.content);
  if (n.type === "macro") return macroSegments(n);
  return textAt(n, OPAQUE);
}

/**
 * A group that is the very next node after a command the parser has no signature for (`\ours{…}`, a macro of the
 * author's own): the parser leaves such a group beside the macro, but TeX hands it to the macro as an
 * argument, so it is part of what the macro prints and not words of the title. A chain of groups
 * (`\findingdes{label}{a sentence}`) is all argument.
 */
function isArgumentGroup(nodes: readonly Node[], n: Node, i: number): boolean {
  const prev = nodes[i - 1];
  if (prev === undefined || n.type !== "group") return false;
  return prev.type === "macro"
    ? isOpaqueMacro(prev)
    : isArgumentGroup(nodes, prev, i - 1);
}

const segmentsOf = (nodes: readonly Node[] | undefined): readonly Segment[] => {
  const list = nodes ?? [];
  return list.flatMap((n, i) =>
    isArgumentGroup(list, n, i) ? [] : nodeSegments(n),
  );
};

/** One argument's contents → the heading it makes, or none when it says nothing. */
function titled(
  level: HeadingLevel,
  argument: TitleArgument,
  nodes: readonly Node[] | undefined,
): readonly TitledHeading[] {
  const segments = segmentsOf(nodes);
  return hasAtLeast(segments, 1)
    ? [{ level, argument, title: { segments } }]
    : [];
}

/** One heading command → the short title (`[…]`) and the title (the last `{…}`), each a heading. */
const headingsOfMacro = (m: Macro): readonly TitledHeading[] =>
  levelOf(m).flatMap((level) => [
    ...titled(level, "short", optional(m)?.content),
    ...titled(level, "title", mandatory(m).at(-1)?.content),
  ]);

/**
 * Every `\section`, `\subsection`, `\subsubsection` and `\paragraph`, starred or not, in document
 * order. What the PDF never shows is pruned (`isUnrendered`), and so is a macro definition's body: a
 * heading in a comment environment or in a definition is not a heading where it is written.
 */
export const headingsOf = (t: ParsedTex): readonly TitledHeading[] =>
  visited(t.root, (v, parent) => isUnrendered(v, parent) || isDefinition(v))
    .filter(isNode)
    .flatMap((n) => (n.type === "macro" ? headingsOfMacro(n) : []));
