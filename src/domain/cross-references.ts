/**
 * A LIST OF CROSS-REFERENCES WHOSE LABELS PRINT ONE NUMBER — `Sections~\ref{a}, \ref{b} and~\ref{c}`
 * typeset as "Sections V-A, V-A and V-B" because two of the labels stand in one subsection. TeX is
 * silent: every label is defined once, so neither "undefined references" nor "multiply defined"
 * fires. Only the build's labels say what each reference prints, so this judges the body's prose
 * against them; reading the labels out of TeX's files is the `TexOutput` port's.
 *
 * A LIST is a run of cross-reference marks in one passage that the text between joins as one: only
 * commas, "and", "or", "to", an ampersand or a dash between two marks (`\ref{a}--\ref{b}` is a range).
 * Any other word, a citation, math or a full stop ends it. One `\cref{a,b}` is a list by itself.
 *
 * Two members CLASH when they name different labels that print the same number. A member whose
 * command prints the kind of the place too (`\cref`, `\autoref`: "Figure 1 and table 1") clashes only
 * with a member of the same kind, or with a member whose command prints no kind ("Figure 1 and 1").
 * A command that prints no number (`\pageref`, `\nameref`) is no member, nor is varioref's `\vref`, whose
 * argument the reader does not attach; a label the build does not
 * know is none either — `paper/sources-fresh` and LaTeX's own "undefined references" speak for it.
 */
import type { Passage, ProsePiece, Span } from "./tex-document.ts";
import { collapse } from "./tex-document.ts";

/** What a label prints where it is referenced: its number as typeset, and the kind of place it marks. */
export interface PrintedLabel {
  /** As the reader sees it: `II-A`, `3`, `I`. */
  readonly number: string;
  /** `section`, `subsection`, `figure`, `table`…, or null when the build recorded none. */
  readonly kind: string | null;
}

/** Every label a build defined, by key. */
export type Labels = ReadonlyMap<string, PrintedLabel>;

/** One label a list names: the key, the command that names it, where that command stands. */
export interface ListMember {
  readonly key: string;
  readonly macro: string;
  readonly span: Span;
}

/** Two members of one list that name different labels printing one number. */
export interface Clash {
  readonly first: ListMember;
  readonly second: ListMember;
  readonly number: string;
}

/** The commands that print a label's number. */
const NUMBER_MACROS: ReadonlySet<string> = new Set([
  "ref",
  "eqref",
  "cref",
  "Cref",
  "autoref",
  "Autoref",
]);

/** Of those, the ones that print the kind of the place before its number ("Figure 1", "section 2"). */
const KIND_MACROS: ReadonlySet<string> = new Set([
  "cref",
  "Cref",
  "autoref",
  "Autoref",
]);

/** The words, and the marks, that join two references into one list. */
const JOINERS: ReadonlySet<string> = new Set([
  "and",
  "or",
  "to",
  "&",
  "-",
  "--",
  "–",
  "—",
]);

/** Whether the text between two references joins them: nothing but commas, spaces and joiners. */
export const joins = (between: string): boolean =>
  collapse(between.replaceAll(",", " "))
    .split(" ")
    .filter((w) => w !== "")
    .every((w) => JOINERS.has(w.toLowerCase()));

/** What a walk over a passage has gathered: the lists it closed, the one open, the text since its last mark. */
interface Walk {
  readonly closed: readonly (readonly ListMember[])[];
  readonly open: readonly ListMember[];
  readonly between: string;
}

const START: Walk = { closed: [], open: [], between: "" };

/** The open list closed: kept when it has members. */
const close = (w: Walk): Walk => ({
  closed: w.open.length === 0 ? w.closed : [...w.closed, w.open],
  open: [],
  between: "",
});

/** A cross-reference mark of the prose. */
type ReferencePiece = Extract<ProsePiece, { readonly owner: "reference" }>;

/** The members a reference adds: one per key its command names. */
const membersOf = (p: ReferencePiece): readonly ListMember[] =>
  p.reference.keys.map((key) => ({
    key,
    macro: p.reference.macro,
    span: p.span,
  }));

/** One piece folded into the walk. */
function step(w: Walk, p: ProsePiece): Walk {
  if (p.kind === "text") return { ...w, between: w.between + p.segment.text };
  if (p.kind !== "owner" || p.owner !== "reference") return close(w);
  const members = membersOf(p);
  const joined = w.open.length > 0 && joins(w.between);
  const base = joined ? w : close(w);
  return { ...base, open: [...base.open, ...members], between: "" };
}

/** The reference lists of the body's prose, each with its members in source order. */
export const referenceLists = (
  passages: readonly Passage[],
): readonly (readonly ListMember[])[] =>
  passages.flatMap((p) => close(p.pieces.reduce(step, START)).closed);

/** A member as the list prints it: its label, and whether its command prints the kind too. */
interface Resolved {
  readonly member: ListMember;
  readonly label: PrintedLabel;
}

/** Whether two members print what reads as the same place twice. */
function clashes(a: Resolved, b: Resolved): boolean {
  if (a.member.key === b.member.key) return false;
  if (a.label.number !== b.label.number) return false;
  const bothKinds =
    KIND_MACROS.has(a.member.macro) && KIND_MACROS.has(b.member.macro);
  return !bothKinds || a.label.kind === b.label.kind;
}

/** The members of a list the build resolves to a number, in order. */
const resolved = (
  list: readonly ListMember[],
  labels: Labels,
): readonly Resolved[] =>
  list.flatMap((member) => {
    const label = labels.get(member.key);
    return label === undefined || !NUMBER_MACROS.has(member.macro)
      ? []
      : [{ member, label }];
  });

/** Each member that clashes with an earlier one of its list, paired with the first such. */
function listClashes(list: readonly Resolved[]): readonly Clash[] {
  return list.flatMap((b, i) => {
    const a = list.slice(0, i).find((x) => clashes(x, b));
    return a === undefined
      ? []
      : [{ first: a.member, second: b.member, number: b.label.number }];
  });
}

/** Every clash in the body's reference lists, against the build's labels. */
export const sameNumberClashes = (
  passages: readonly Passage[],
  labels: Labels,
): readonly Clash[] =>
  referenceLists(passages).flatMap((list) =>
    listClashes(resolved(list, labels)),
  );
