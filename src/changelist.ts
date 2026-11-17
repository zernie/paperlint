/**
 * EXPERIMENTAL — the changelist since the approved version: `versions/<cycle>/changes.yaml` declares,
 * for each change the draft made to `versions/<cycle>/approved.tex`, what kind it is, the text it
 * changed and why. This file reads the list and compares the two texts; `src/changes-rule.ts` makes
 * them findings. No model is involved: a declared entry is checked against the texts only by the
 * arithmetic below, never for being true (`type` is declared, not checked).
 *
 * TODO(changes-type-check): `type` is not verified against what the text actually did.
 * TODO(cite-keys): cite keys are read from the source of each citation mark in the body prose with a
 * small pattern; the reader port has no `citeKeys`, and captions, tables and the appendix are not
 * body prose, so a key cited only there is not seen.
 * TODO(changes-schema): the shape is checked by hand here; a JSON schema beside the review-frontmatter
 * one is the proper form.
 */
import { NUMBER } from "./claim-provenance.ts";
import { fieldOf, isRecord } from "./domain/record.ts";
import { err, isOk, ok, type Result } from "./domain/result.ts";
import { runOf } from "./domain/sentences.ts";
import {
  runText,
  type Passage,
  type ProsePiece,
} from "./domain/tex-document.ts";

export const CHANGE_TYPES = [
  "rewrite",
  "add",
  "correct",
  "move",
  "markup",
  "cut",
  "raw",
] as const;
export type ChangeType = (typeof CHANGE_TYPES)[number];

/** One declared change. */
export interface Change {
  readonly type: ChangeType;
  readonly before: string;
  readonly why: string;
  readonly drops: readonly string[];
  readonly readerLoses: string | null;
}

const isType = (v: unknown): v is ChangeType =>
  CHANGE_TYPES.some((t) => t === v);

const text = (v: unknown): v is string =>
  typeof v === "string" && v.trim() !== "";

const strings = (v: unknown): v is readonly string[] =>
  Array.isArray(v) && v.every((d) => typeof d === "string");

/** An entry's fields as a change, or what is wrong with them. */
function fields(
  raw: Readonly<Record<string, unknown>>,
): Result<Change, string> {
  const type = fieldOf(raw, "type");
  const before = fieldOf(raw, "before");
  const why = fieldOf(raw, "why");
  const drops = fieldOf(raw, "drops") ?? [];
  const loses = fieldOf(raw, "reader_loses");
  if (!isType(type))
    return err(`\`type\` is one of ${CHANGE_TYPES.join(" | ")}`);
  if (!text(before) || !text(why))
    return err("`before` and `why` are non-empty strings");
  if (!strings(drops)) return err("`drops` is a list of strings");
  return type === "cut" && !text(loses)
    ? err("a `cut` says what the reader loses (`reader_loses`)")
    : ok({ type, before, why, drops, readerLoses: text(loses) ? loses : null });
}

/** One entry of the list, or what is wrong with it. */
function entry(raw: unknown, i: number): Result<Change, string> {
  const at = `changes.yaml entry ${String(i + 1)}`;
  if (!isRecord(raw)) return err(`${at}: is not a mapping`);
  const r = fields(raw);
  return r.ok ? r : err(`${at}: ${r.error}`);
}

/** The parsed document (a list) as changes, or one problem per bad entry. */
export function parseChanges(
  doc: unknown,
): Result<readonly Change[], readonly string[]> {
  if (!Array.isArray(doc))
    return err(["changes.yaml is a list of entries (- type: …)"]);
  const each = doc.map(entry);
  const bad = each.flatMap((r) => (r.ok ? [] : [r.error]));
  return bad.length > 0 ? err(bad) : ok(each.filter(isOk).map((r) => r.value));
}

const norm = (s: string): string => s.replace(/\s+/g, " ").trim();

/** A paragraph of a text: as a reader sees it, and as it is written. */
export interface Paragraph {
  readonly seen: string;
  readonly written: string;
}

/** What a text holds that a change can remove. */
export interface Facts {
  readonly paragraphs: readonly Paragraph[];
  readonly numbers: ReadonlySet<string>;
  readonly cites: ReadonlySet<string>;
}

const startOfPiece = (p: ProsePiece): number =>
  p.kind === "text" ? p.segment.at : p.span.start;
const endOfPiece = (p: ProsePiece): number =>
  p.kind === "text" ? p.segment.at + p.segment.text.length : p.span.end;

/** The keys a `\cite…{a,b}` mark names: the last brace group of its source. */
const keysOf = (mark: string): readonly string[] =>
  (/^\\\w*cite[^{]*\{([^}]*)\}\s*$/.exec(mark)?.[1] ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter((k) => k !== "");

/** The paragraphs, numbers and cite keys of `src`, from its body prose. */
export function factsOf(src: string, passages: readonly Passage[]): Facts {
  const paragraphs = passages.map((p) => ({
    seen: norm(runText(runOf(p))),
    written: norm(
      src.slice(
        Math.min(...p.pieces.map(startOfPiece)),
        Math.max(...p.pieces.map(endOfPiece)),
      ),
    ),
  }));
  const cites = passages.flatMap((p) =>
    p.pieces.flatMap((x) =>
      x.kind === "owner" ? keysOf(src.slice(x.span.start, x.span.end)) : [],
    ),
  );
  return {
    paragraphs,
    numbers: new Set(
      paragraphs.flatMap((p) =>
        [...p.seen.matchAll(NUMBER)].map((m) => norm(m[0])),
      ),
    ),
    cites: new Set(cites),
  };
}

/** What the approved text had that the draft lacks, and which paragraphs of it are gone. */
export interface Removed {
  readonly tokens: readonly string[];
  readonly paragraphs: readonly Paragraph[];
}

export function removedFrom(approved: Facts, now: Facts): Removed {
  const here = new Set(now.paragraphs.map((p) => p.seen));
  return {
    tokens: [
      ...[...approved.numbers].filter((n) => !now.numbers.has(n)),
      ...[...approved.cites].filter((k) => !now.cites.has(k)),
    ],
    paragraphs: approved.paragraphs.filter((p) => !here.has(p.seen)),
  };
}

/** Tokens a removal does not name in any entry's `drops`. */
export const undeclared = (
  r: Removed,
  changes: readonly Change[],
): readonly string[] => {
  const declared = new Set(changes.flatMap((c) => c.drops.map(norm)));
  return r.tokens.filter((t) => !declared.has(t));
};

/** Whether an entry's `before` covers a paragraph: is inside it, or holds it, as seen or as written. */
export const covers = (c: Change, p: Paragraph): boolean => {
  const b = norm(c.before);
  return [p.seen, p.written].some((t) => t.includes(b) || b.includes(t));
};

/** Paragraphs gone that no entry covers. */
export const uncovered = (
  r: Removed,
  changes: readonly Change[],
): readonly Paragraph[] =>
  r.paragraphs.filter((p) => !changes.some((c) => covers(c, p)));
