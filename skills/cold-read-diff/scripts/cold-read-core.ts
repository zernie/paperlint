/**
 * cold-read-core.ts — what the cold read's readers are given: the paragraphs a paper diff
 * changed, as their LaTeX source. It calls no model; the skill hands this text to two context-free
 * readers (`SKILL.md`, "How to run it").
 *
 * WHY IT SHIPS (#301). A run without it rebuilt the extract by hand every time, and one such
 * extractor turned `--no-verify` into `-no-verify`. Here each changed line is widened to its whole
 * paragraph (a reader handed `+` lines reports artefacts of the cut, not defects of the paper),
 * and working comments, floats and the bibliography are dropped. The paragraph is then handed over
 * as its LaTeX source, unchanged: rebuilding the printed text macro by macro dropped `\num`,
 * `\verb` and math in turn (#460), and only TeX knows what a macro prints (#462). Above 15
 * changed paragraphs it refuses: a read that size is the 35-minute batch #301 records, so the
 * caller narrows `--base` instead.
 *
 * Usage: node cold-read.js <paper.tex> [--base=REV] [--max=N]
 * Exit: 0 — the paragraphs on stdout · 2 — refused (nothing changed, too many, a bad flag).
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { visit } from "@unified-latex/unified-latex-util-visit";
import { latexReader, parseLatex } from "#src/adapters/latex/index";
import type { Passage, Span } from "#src/domain/tex-document";

/** Above this many changed paragraphs the run refuses and asks for a narrower range (#301). */
export const DEFAULT_MAX = 15;

/** A changed paragraph as a reader gets it. */
export interface Paragraph {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

/** Each hunk header's new-file side `+c,d` of a `git diff -U0`, as numbers; `d` absent is 1. */
const hunks = (diff: string): { start: number; count: number }[] =>
  diff
    .split("\n")
    .filter((line) => line.startsWith("@@ "))
    .flatMap((line) => {
      const added = line.split(" ")[2] ?? "";
      if (!added.startsWith("+")) return [];
      const [start, count = "1"] = added.slice(1).split(",");
      return [{ start: Number(start), count: Number(count) }];
    });

/**
 * The 1-based line numbers of the NEW file that a `git diff -U0` adds or changes, read off each
 * hunk header `@@ -a,b +c,d @@`: lines c to c+d-1.
 */
export const changedLines = (diff: string): number[] =>
  hunks(diff).flatMap(({ start, count }) =>
    Array.from({ length: count }, (_, i) => start + i),
  );

/**
 * Where a hunk only deleted: `+c,0` means lines were removed after new line c. A paragraph that
 * holds both c and c+1 lost a sentence and is changed; one that holds only one of them is a
 * neighbour of a deleted paragraph, and is not.
 */
export const deletionPoints = (diff: string): number[] =>
  hunks(diff)
    .filter((h) => h.count === 0)
    .map((h) => h.start);

/** Where a passage's visible text stands in the source: its first to its last non-blank piece. */
const spanOf = (p: Passage): Span => {
  const spans = p.pieces.flatMap((x) =>
    x.kind !== "text"
      ? [x.span]
      : x.segment.text.trim() === ""
        ? []
        : [{ start: x.segment.at, end: x.segment.at + x.segment.text.length }],
  );
  return {
    start: Math.min(...spans.map((x) => x.start)),
    end: Math.max(...spans.map((x) => x.end)),
  };
};

/** The 1-based line a source offset stands on. */
const lineAt = (src: string, offset: number): number =>
  src.slice(0, offset).split("\n").length;

/**
 * A paragraph's source as the reader gets it: its whole lines, `first` to `last`, exactly as written,
 * without its `%` notes — a whole-line note or one trailing a sentence, found on the parse, so `\%`
 * stays. A reader grades a note as prose, and a note can explain what the printed text does not
 * (SKILL.md "Strip working comments"). Whole lines, not the span of its printed pieces: a piece of
 * `\texttt{x}` starts inside the braces, so a cut there hands the reader broken LaTeX.
 */
const sourceOf = (src: string, first: number, last: number): string => {
  const lines = src
    .split("\n")
    .slice(first - 1, last)
    .join("\n");
  const notes: Span[] = [];
  visit(parseLatex(lines).root, (node) => {
    const at = node.position;
    if (node.type === "comment" && at)
      notes.push({ start: at.start.offset, end: at.end.offset });
  });
  return notes
    .reduceRight(
      (text, n) => `${text.slice(0, n.start)}\n${text.slice(n.end)}`,
      lines,
    )
    .trim();
};

/** A line that is only a `%` note. */
const isNote = (line: string): boolean => line.trimStart().startsWith("%");

/** Line ranges, overlapping ones merged: a footnote is its own passage on its host's lines. */
const merged = (
  ranges: readonly { readonly start: number; readonly end: number }[],
): { start: number; end: number }[] =>
  [...ranges]
    .sort((a, b) => a.start - b.start)
    .reduce<{ start: number; end: number }[]>((out, r) => {
      const last = out.at(-1);
      return last !== undefined && r.start <= last.end
        ? [
            ...out.slice(0, -1),
            { start: last.start, end: Math.max(last.end, r.end) },
          ]
        : [...out, { start: r.start, end: r.end }];
    }, []);

/** Whether a changed line falls in `b`, or `b` holds both sides of a deletion point. */
const touched = (
  b: { readonly start: number; readonly end: number },
  lines: readonly number[],
  deletions: readonly number[],
): boolean =>
  lines.some((n) => n >= b.start && n <= b.end) ||
  deletions.some((d) => d >= b.start && d + 1 <= b.end);

/**
 * The changed paragraphs of `src`: every body passage (`bodyProse`: the parse of the paper, without
 * comments, headings, floats, code or the back matter) that a changed line falls in, whole, and
 * every passage that holds both sides of a `deletions` point. The parse only finds the paragraph;
 * its text is the source as written, so no macro is rendered, dropped or guessed at. A changed line
 * that is only a `%` note changes no prose, so it selects nothing.
 */
export const extract = (
  src: string,
  lines: readonly number[],
  deletions: readonly number[] = [],
): Paragraph[] => {
  const notes = new Set(
    src.split("\n").flatMap((line, i) => (isNote(line) ? [i + 1] : [])),
  );
  const prose = lines.filter((n) => !notes.has(n));
  return merged(
    latexReader.bodyProse(src).map((p) => {
      const span = spanOf(p);
      return { start: lineAt(src, span.start), end: lineAt(src, span.end - 1) };
    }),
  )
    .filter((b) => touched(b, prose, deletions))
    .map((b) => ({ ...b, text: sourceOf(src, b.start, b.end) }));
};

/** The flags a run reads. */
interface Options {
  readonly paper: string;
  readonly base: string;
  readonly max: number;
}

/** A refusal: printed as one line, exit 2. */
class Refusal extends Error {}

const KNOWN = ["base", "max"];

/** The command line as options, or a refusal naming what is wrong with it. */
export const optionsOf = (argv: readonly string[]): Options => {
  const pairs = argv
    .filter((a) => a.startsWith("--"))
    .map((a): [string, string] => {
      const at = a.indexOf("=");
      return at < 0 ? [a.slice(2), ""] : [a.slice(2, at), a.slice(at + 1)];
    });
  const unknown = pairs.filter(([k]) => !KNOWN.includes(k)).map(([k]) => k);
  if (unknown.length)
    throw new Refusal(`unknown flag(s) --${unknown.join(", --")}`);
  const [paper, ...extra] = argv.filter((a) => !a.startsWith("--"));
  if (paper === undefined || extra.length > 0)
    throw new Refusal("name exactly one paper .tex file");
  const flags = new Map(pairs);
  const max = Number(flags.get("max") ?? DEFAULT_MAX);
  if (!Number.isInteger(max) || max < 1)
    throw new Refusal("--max takes a positive integer");
  return {
    paper,
    base: flags.get("base") || "HEAD",
    max,
  };
};

/** The changed paragraphs `o` names, or a refusal saying why there is nothing to read. */
const paragraphsFor = (o: Options): Paragraph[] => {
  const paper = resolve(o.paper);
  if (!existsSync(paper)) throw new Refusal(`${o.paper} does not exist`);
  const diff = execFileSync(
    "git",
    ["diff", "-U0", "--no-color", o.base, "--", basename(paper)],
    { cwd: dirname(paper), encoding: "utf8" },
  );
  return checked(
    o,
    extract(
      readFileSync(paper, "utf8"),
      changedLines(diff),
      deletionPoints(diff),
    ),
  );
};

/** `found`, unless it is empty or above the cap. */
const checked = (o: Options, found: Paragraph[]): Paragraph[] => {
  if (!found.length)
    throw new Refusal(`no changed prose in ${o.paper} since ${o.base}`);
  if (found.length > o.max)
    throw new Refusal(
      `${String(found.length)} changed paragraphs since ${o.base}, above the cap of ${String(o.max)}: ` +
        `narrow --base to fewer commits, or raise --max knowingly`,
    );
  return found;
};

/** The paragraphs as a reader gets them: numbered, one blank line apart, nothing else. */
export const numbered = (paragraphs: readonly Paragraph[]): string =>
  paragraphs.map((p, i) => `¶${String(i + 1)} ${p.text}`).join("\n\n");

/** The command. Returns its exit code; a refusal is one line on stderr and exit 2. */
export function main(argv: readonly string[]): number {
  try {
    const o = optionsOf(argv);
    const found = paragraphsFor(o);
    process.stdout.write(`${numbered(found)}\n`);
    return 0;
  } catch (e) {
    if (!(e instanceof Refusal)) throw e;
    process.stderr.write(`cold read: ${e.message}\n`);
    return 2;
  }
}
