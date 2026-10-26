/**
 * Reading what pdflatex and bibtex leave behind — PURE functions, text in, data out.
 *
 * `latex-loop.ts` decides what to run next; this module turns the files a pass wrote into the
 * facts that decision needs. Nothing here touches the disk: the caller reads the file and hands
 * over its text, so every function below is testable on a string.
 *
 * 🔴 WHY LINE MATCHING IS LEGITIMATE HERE. A `.log` has no grammar a parser could give us: it is
 * the terminal transcript of a TeX run. What it does have is a small set of DOCUMENTED marker
 * lines that LaTeX and its packages print word for word, and that every build tool (latexmk,
 * arara, texlab) keys on. Those markers are the interface. The `.aux` is similar: TeX writes one
 * command per line, and the three we read (`\citation`, `\bibdata`, `\bibstyle`) always start a
 * line. Neither file is prose-with-structure that a parser would read better.
 *
 * 🔴 THE 79-COLUMN WRAP. TeX breaks every line it writes to the log at `max_print_line` (79 in
 * TeX Live), counting BYTES. A marker that happens to straddle the break — "Rerun to get
 * cross-references right." is the usual victim, since it closes a long warning — is not on any
 * one physical line. `unwrapLog` rejoins a line of exactly 79 bytes with the next one. The caller
 * must therefore read the log as `latin1`, so one character is one byte and `length` counts what
 * TeX counted.
 */
import { filter, map, pipe, range, unique } from "remeda";

/** TeX Live's `max_print_line`. A physical log line of exactly this many bytes was broken by TeX. */
export const MAX_PRINT_LINE = 79;

/**
 * Log lines that ask for another pass. Each is a documented message, not a guess about wording:
 *   - `rerun-requested`   — any "Rerun to get …" (LaTeX core, natbib, hyperref's outlines, …)
 *   - `labels-changed`    — "LaTeX Warning: Label(s) may have changed."
 *   - `rerunfilecheck`    — "Package rerunfilecheck Warning: File `…' has changed."
 * The end-of-run summaries about references are not markers: they fail the build (`FAILING_WARNINGS`).
 */
export type LogMarker = "rerun-requested" | "labels-changed" | "rerunfilecheck";

/**
 * Rejoin the lines TeX broke at column 79. A line of exactly 79 bytes continues on the next one.
 *
 * ⚠️ A line that is 79 bytes long BY ITSELF gets joined too — TeX gives no way to tell the two
 * apart. The cost is one false join, which can only merge two lines, never split a marker; for
 * the substring checks below that is harmless.
 */
export function unwrapLog(text: string): string[] {
  const physical = text.split(/\r?\n/);
  const out: string[] = [];
  let carry = "";
  for (const line of physical) {
    if (line.length === MAX_PRINT_LINE) {
      carry += line;
      continue;
    }
    out.push(carry + line);
    carry = "";
  }
  if (carry) out.push(carry);
  return out;
}

/** Which markers a log carries, in a fixed order, each at most once. */
export function logMarkers(lines: readonly string[]): LogMarker[] {
  const found = new Set<LogMarker>();
  for (const line of lines) {
    if (line.includes("Rerun to get")) found.add("rerun-requested");
    if (line.startsWith("LaTeX Warning: Label(s) may have changed"))
      found.add("labels-changed");
    if (line.startsWith("Package rerunfilecheck Warning:"))
      found.add("rerunfilecheck");
  }
  const order: LogMarker[] = [
    "rerun-requested",
    "labels-changed",
    "rerunfilecheck",
  ];
  return order.filter((m) => found.has(m));
}

/** A log warning that fails the build: what it is called, why it fails, and the lines that carry it. */
export interface FailingWarning {
  readonly id: string;
  /** One line a human reads before the quoted log lines. */
  readonly reason: string;
  /** Whether this logical line (after `unwrapLog`) carries it. */
  readonly matches: (line: string) => boolean;
}

/**
 * Does `prefix` start one of the PHYSICAL lines this logical line was joined from? `unwrapLog` joins
 * only lines of exactly 79 bytes, so every physical line starts at a multiple of 79. That keeps a
 * marker found after unwrapLog's false join (a 79-byte line by itself, then the marker) and still
 * ignores the same words in the middle of a line — an overfull box quoting the text it set.
 */
const startsPhysicalLine = (line: string, prefix: string): boolean =>
  range(0, Math.floor(line.length / MAX_PRINT_LINE) + 1).some((k) =>
    line.startsWith(prefix, k * MAX_PRINT_LINE),
  );

/**
 * 🔴 THE WARNINGS THAT FAIL THE BUILD — like an ESLint rule at "error". pdflatex exits 0 on each of
 * them and writes a PDF that is wrong: a character missing, `??` or `[?]` in the text, a reference
 * that may point at the wrong place. Only the log of the FINAL pass is judged (`latex-loop.ts`):
 * before the rerun every reference is undefined by construction.
 *
 * WHY THESE FOUR. Each makes the PDF wrong for a reader, and turning all four on was measured on four
 * real papers (their final logs of 2026-10-26): 0 hits each, so no correct paper turns red. Left out: overfull boxes (cosmetic,
 * nearly every paper has some, and the pdf/* rules check the margins), font shape substitution
 * (usually harmless), "Rerun to get" (the loop already reruns). Those never fail a build.
 *
 * Adding one is one entry here, plus its row of cases in `latex-log.harness.ts` (the harness does
 * not type-check without it).
 *
 * `lost-character`: TeX prints "Missing character: There is no X in font F!" when
 * `\tracinglostchars` > 0; LaTeX's format sets it to 2 (TeX Live 2026, `latex.ltx`), and pdflatex
 * still exits 0. A paper that sets it to 0 silences the line, and this check with it. At 3 or more
 * TeX makes it an error, and the build fails on the exit code instead.
 */
export const FAILING_WARNINGS = [
  {
    id: "lost-character",
    reason:
      "the font has no glyph for this character, so pdflatex left it out of the PDF",
    matches: (l: string) =>
      startsPhysicalLine(l, "Missing character: There is no "),
  },
  {
    id: "undefined-references",
    reason:
      "a \\ref — or, without natbib, a \\cite — names what no pass defined, so the PDF prints ?? or [?] in its place",
    matches: (l: string) => l.includes("There were undefined references"),
  },
  {
    id: "undefined-citations",
    reason:
      "a \\cite names a key the bibliography does not hold, so the PDF prints [?] in its place (natbib's summary)",
    matches: (l: string) => l.includes("There were undefined citations"),
  },
  {
    id: "multiply-defined-labels",
    reason: "two \\label share a name, so a \\ref may point at the wrong one",
    matches: (l: string) => l.includes("There were multiply-defined labels"),
  },
] as const satisfies readonly FailingWarning[];

export type FailingWarningId = (typeof FAILING_WARNINGS)[number]["id"];

/** One distinct log line, quoted as TeX wrote it, and how many times the log carries it. */
export interface Quote {
  readonly text: string;
  readonly times: number;
}

/** A failing warning the log carries, with the lines that carry it. */
export interface FailingHit {
  readonly id: FailingWarningId;
  readonly reason: string;
  readonly quotes: readonly Quote[];
}

const quotesOf = (matched: readonly string[]): readonly Quote[] =>
  map(unique(matched), (text) => ({
    text,
    times: matched.filter((l) => l === text).length,
  }));

/** Which of `FAILING_WARNINGS` the log carries, in table order, each line quoted once with a count. */
export const failingWarnings = (
  lines: readonly string[],
): readonly FailingHit[] =>
  pipe(
    FAILING_WARNINGS,
    map((w) => ({
      id: w.id,
      reason: w.reason,
      quotes: quotesOf(lines.filter((l) => w.matches(l))),
    })),
    filter((h) => h.quotes.length > 0),
  );

/**
 * Is this the line a TeX error starts on? Two spellings exist and `-file-line-error` produces
 * both: most errors become `./paper.tex:4: Undefined control sequence.`, while some keep the
 * classic `! LaTeX Error: File `x.sty' not found.` (measured on TeX Live 2023). The path part must
 * contain a dot or a slash, so an ordinary warning ending in a number and a colon cannot pass.
 */
export function isErrorLine(line: string): boolean {
  // `<path>:<line>: `, where the path (no space, no colon) holds at least one dot or slash.
  return line.startsWith("!") || /^[^\s:]*[./][^\s:]*:\d+: /.test(line);
}

/** The `l.NNN …` line TeX prints to show where in the source it stopped. */
export const isContextLine = (line: string): boolean => /^l\.\d+/.test(line);

/** At most this many lines are quoted from a log: enough for the error and its context. */
export const MAX_EXCERPT = 12;

/**
 * The first error of a pass and the source context after it: the error line, the lines up to
 * and including `l.NNN`, and the one line after it (TeX splits the source line at the point of
 * the error, so the rest of it sits on the next line). Blank lines are dropped. Empty when the
 * log carries no error line — the caller then says so rather than printing nothing.
 */
export function errorExcerpt(lines: readonly string[]): string[] {
  const start = lines.findIndex(isErrorLine);
  if (start < 0) return [];
  const out: string[] = [];
  const rest = lines.slice(start);
  for (const [i, line] of rest.entries()) {
    if (out.length >= MAX_EXCERPT) break;
    if (line.trim() === "") continue;
    out.push(line);
    if (isContextLine(line)) {
      const next = rest[i + 1];
      if (next !== undefined && next.trim() !== "") out.push(next);
      break;
    }
  }
  return out;
}

/** The lines bibtex prints before it has anything to say; never an explanation of a failure. */
const BIBTEX_PREAMBLE = [
  "This is BibTeX",
  "Capacity:",
  "The top-level auxiliary file:",
  "The style file:",
  "Database file #",
];

/** What bibtex said beyond its banner — the explanation of a failed run. */
export function bibtexExcerpt(stdout: string): string[] {
  return stdout
    .split(/\r?\n/)
    .filter(
      (l) => l.trim() !== "" && !BIBTEX_PREAMBLE.some((p) => l.startsWith(p)),
    )
    .slice(0, MAX_EXCERPT);
}

/** What a bibtex run read: the databases its `.blg` names, the entries its `.bbl` holds. */
export interface BibtexRead {
  readonly databases: readonly string[];
  readonly bibitems: readonly string[];
}

/** `\bibitem{key}`, `\bibitem[label]{key}` — a label may hold one level of braces (natbib's `[{A}(2020)]`). */
const BIBITEM = /\\bibitem\s*(?:\[(?:[^[\]{}]|\{[^{}]*\})*\])?\s*\{([^}]+)\}/g;

/**
 * What a bibtex run read, from the files it left: `Database file #n: name` in its `.blg` (the name
 * as the `.aux` gave it, relative to where bibtex ran), and every key its `.bbl` typesets.
 */
export const bibtexRead = (blg: string, bbl: string): BibtexRead => ({
  databases: [...blg.matchAll(/^Database file #\d+: (.+)$/gm)].flatMap((m) =>
    m.slice(1, 2),
  ),
  bibitems: [...bbl.matchAll(BIBITEM)].flatMap((m) => m.slice(1, 2)),
});

/** What the `.aux` tells bibtex: the cited keys, the databases and the style. */
export interface AuxBib {
  /** Sorted, unique. `*` (`\nocite{*}`) is a key like any other. */
  readonly citations: readonly string[];
  /** The names in `\bibdata{…}`, as written — without `.bib`. */
  readonly databases: readonly string[];
  readonly style: string | null;
}

/** The argument of `\name{…}` when a line is exactly that command, else null. */
function argOf(line: string, name: string): string | null {
  const open = `\\${name}{`;
  if (!line.startsWith(open) || !line.endsWith("}")) return null;
  return line.slice(open.length, -1);
}

const list = (arg: string): string[] =>
  arg
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

/** What one walk over an `.aux` tree has gathered so far. Lines are read IN ORDER: see below. */
interface AuxAcc {
  readonly citations: Set<string>;
  readonly databases: string[];
  style: string | null;
}

/** How a walk reaches nested aux files, and which it has already followed (a cycle ends there). */
interface AuxWalk {
  readonly readInput: (name: string) => string | null;
  readonly seen: Set<string>;
}

/**
 * Fold one aux line into the walk. Order is load-bearing: a nested aux's databases land where
 * its `\@input` stands, and its style counts only while no `\bibstyle` has been read yet — a
 * later one in the parent still overrides it.
 */
function readAuxLine(line: string, acc: AuxAcc, walk: AuxWalk): void {
  for (const k of list(argOf(line, "citation") ?? "")) acc.citations.add(k);
  acc.databases.push(...list(argOf(line, "bibdata") ?? ""));
  const st = argOf(line, "bibstyle");
  if (st !== null) acc.style = st.trim();
  followInput(argOf(line, "@input"), acc, walk);
}

/** Merge an `\@input` aux into the walk — once per name, and only when it exists. */
function followInput(input: string | null, acc: AuxAcc, walk: AuxWalk): void {
  if (input === null || walk.seen.has(input)) return;
  walk.seen.add(input);
  const nested = walk.readInput(input);
  if (nested === null) return;
  const sub = auxBib(nested, walk.readInput, walk.seen);
  for (const k of sub.citations) acc.citations.add(k);
  acc.databases.push(...sub.databases);
  acc.style ??= sub.style;
}

/**
 * Read `\citation`, `\bibdata` and `\bibstyle` out of an `.aux`, following `\@input{sub.aux}` —
 * `\include` writes each chapter's citations into its own aux file, and bibtex follows them too.
 * `readInput` returns the text of a nested aux, or null when it does not exist.
 */
export function auxBib(
  text: string,
  readInput: (name: string) => string | null = () => null,
  seen: Set<string> = new Set(),
): AuxBib {
  const acc: AuxAcc = { citations: new Set(), databases: [], style: null };
  for (const raw of text.split(/\r?\n/))
    readAuxLine(raw.trim(), acc, { readInput, seen });
  return {
    citations: [...acc.citations].sort(),
    databases: acc.databases,
    style: acc.style,
  };
}
