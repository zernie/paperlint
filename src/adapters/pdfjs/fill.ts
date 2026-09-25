/**
 * pdf.js's half of the page layout — PURE. pdf.js's text content carries no colour and no
 * orientation flag, so two facts about each text item are recovered from what pdf.js exports:
 * whether its transform draws it upright, and which fill its characters were drawn with (walked
 * from the operator list). `pdf-facts.ts` reads the PDF and calls these; the result is the domain's
 * `PageLayout` (`domain/page-layout.ts`). Split out of the banal XML writer (#75): this is what
 * would change if pdf.js did — not banal.
 */
import type { Fill } from "../../domain/page-layout.ts";

/** A transform `[a, b, c, d, e, f]` that draws text upright: no rotation and no skew. */
export function isUpright(m: readonly number[]): boolean {
  const eps = 1e-6;
  return Math.abs(m[1] ?? 0) < eps && Math.abs(m[2] ?? 0) < eps;
}

/** The operator codes the colour walk reads — pdf.js's `OPS`, reduced to what is used. */
export interface ColourOps {
  readonly save: number;
  readonly restore: number;
  readonly setFillRGBColor: number;
  readonly setTextRenderingMode: number;
  readonly showText: number;
  readonly showSpacedText: number;
}

/** pdf.js's operator list: parallel arrays of operator codes and their arguments. */
export interface OperatorList {
  readonly fnArray: readonly number[];
  readonly argsArray: readonly unknown[];
}

/** Text as the walk compares it: normalised, with no whitespace (items and glyphs split spaces differently). */
const squeeze = (s: string): string => s.normalize("NFKC").replace(/\s+/g, "");

/** `setFillRGBColor`'s argument: a `#rrggbb` string in current pdf.js, three 0-255 numbers in older ones. */
export function hexOf(args: unknown): string {
  const a = Array.isArray(args) ? (args as unknown[]) : [];
  if (typeof a[0] === "string") return a[0].toLowerCase();
  const byte = (v: unknown): string =>
    Math.round(typeof v === "number" ? v : 0)
      .toString(16)
      .padStart(2, "0");
  return `#${byte(a[0])}${byte(a[1])}${byte(a[2])}`;
}

/** The characters a show-text operator draws, from its glyph objects. */
function glyphText(args: unknown): string {
  const a = Array.isArray(args) ? (args as unknown[]) : [];
  const glyphs = Array.isArray(a[0]) ? (a[0] as unknown[]) : [];
  return glyphs
    .map((g) =>
      typeof g === "object" && g !== null && "unicode" in g
        ? String((g as { unicode: unknown }).unicode ?? "")
        : "",
    )
    .join("");
}

/** The graphics state the walk tracks. */
interface State {
  fill: Fill;
  mode: number;
}

/** Apply one state operator; false when `fn` is not one. */
function applyState(
  ops: ColourOps,
  fn: number,
  args: unknown,
  s: { cur: State; stack: State[] },
): boolean {
  if (fn === ops.save) s.stack.push({ ...s.cur });
  else if (fn === ops.restore)
    s.cur = s.stack.pop() ?? { fill: { kind: "unknown" }, mode: 0 };
  else if (fn === ops.setFillRGBColor)
    s.cur.fill = { kind: "rgb", hex: hexOf(args) };
  else if (fn === ops.setTextRenderingMode)
    s.cur.mode = Number((args as unknown[] | undefined)?.[0] ?? 0);
  else return false;
  return true;
}

/** Every drawn character, in content order, with the fill it was drawn in. */
export function drawnCharacters(
  ops: ColourOps,
  list: OperatorList,
): { chars: string[]; fills: Fill[] } {
  const s = { cur: { fill: { kind: "unknown" } as Fill, mode: 0 }, stack: [] };
  const chars: string[] = [];
  const fills: Fill[] = [];
  list.fnArray.forEach((fn, i) => {
    const args = list.argsArray[i];
    if (applyState(ops, fn, args, s)) return;
    if (fn !== ops.showText && fn !== ops.showSpacedText) return;
    const fill: Fill = s.cur.mode === 3 ? { kind: "invisible" } : s.cur.fill;
    for (const ch of squeeze(glyphText(args))) {
      chars.push(ch);
      fills.push(fill);
    }
  });
  return { chars, fills };
}

/** How far ahead the walk looks for an item it cannot find where it expects it. */
export const LOOKAHEAD = 4000;

/** The position at or after `from` where `want` starts in `chars`, or -1 within the look-ahead. */
function findRun(
  chars: readonly string[],
  want: readonly string[],
  from: number,
): number {
  const limit = Math.min(chars.length, from + LOOKAHEAD);
  for (let q = from; q < limit; q++)
    if (want.every((ch, k) => chars[q + k] === ch)) return q;
  return -1;
}

/**
 * The fill of each text item. pdf.js's text content carries no colour, so the operator list is
 * walked for the characters each show-text operator draws, and the items — in the same content
 * order — are matched against them. An item that cannot be matched gets `unknown` (drawn as black):
 * a missed match can keep light text, never drop dark text.
 */
export function fillsOf(
  ops: ColourOps,
  list: OperatorList,
  items: readonly string[],
): Fill[] {
  const { chars, fills } = drawnCharacters(ops, list);
  let at = 0;
  return items.map((text): Fill => {
    const want = [...squeeze(text)];
    if (want.length === 0) return { kind: "unknown" };
    const q = findRun(chars, want, at);
    if (q < 0) return { kind: "unknown" };
    at = q + want.length;
    return fills[q] ?? { kind: "unknown" };
  });
}
