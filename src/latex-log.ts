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

/** TeX Live's `max_print_line`. A physical log line of exactly this many bytes was broken by TeX. */
export const MAX_PRINT_LINE = 79;

/**
 * Log lines that ask for another pass, or report on references. Each is a documented message,
 * not a guess about wording:
 *   - `rerun-requested`   — any "Rerun to get …" (LaTeX core, natbib, hyperref's outlines, …)
 *   - `labels-changed`    — "LaTeX Warning: Label(s) may have changed."
 *   - `rerunfilecheck`    — "Package rerunfilecheck Warning: File `…' has changed."
 *   - `undefined-references` / `undefined-citations` — the end-of-run summaries. These do NOT
 *     request a rerun by themselves: on a converged document they mean a genuinely undefined key.
 */
export type LogMarker =
  | "rerun-requested"
  | "labels-changed"
  | "rerunfilecheck"
  | "undefined-references"
  | "undefined-citations";

/** Markers that mean "the output of this pass is not final yet". */
export const RERUN_MARKERS: readonly LogMarker[] = [
  "rerun-requested",
  "labels-changed",
  "rerunfilecheck",
];

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
    if (line.includes("There were undefined references"))
      found.add("undefined-references");
    if (line.includes("There were undefined citations"))
      found.add("undefined-citations");
  }
  const order: LogMarker[] = [
    "rerun-requested",
    "labels-changed",
    "rerunfilecheck",
    "undefined-references",
    "undefined-citations",
  ];
  return order.filter((m) => found.has(m));
}

/**
 * Is this the line a TeX error starts on? Two spellings exist and `-file-line-error` produces
 * both: most errors become `./paper.tex:4: Undefined control sequence.`, while some keep the
 * classic `! LaTeX Error: File `x.sty' not found.` (measured on TeX Live 2023). The path part must
 * contain a dot or a slash, so an ordinary warning ending in a number and a colon cannot pass.
 */
export function isErrorLine(line: string): boolean {
  if (line.startsWith("!")) return true;
  const m = /^([^\s:]+):(\d+): /.exec(line);
  return m !== null && /[./]/.test(m[1] ?? "");
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
  for (let i = start; i < lines.length && out.length < MAX_EXCERPT; i++) {
    const line = lines[i] ?? "";
    if (line.trim() === "") continue;
    out.push(line);
    if (isContextLine(line)) {
      const next = lines[i + 1];
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
  const citations = new Set<string>();
  const databases: string[] = [];
  let style: string | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const cite = argOf(line, "citation");
    if (cite !== null) for (const k of list(cite)) citations.add(k);
    const data = argOf(line, "bibdata");
    if (data !== null) databases.push(...list(data));
    const st = argOf(line, "bibstyle");
    if (st !== null) style = st.trim();
    const input = argOf(line, "@input");
    if (input !== null && !seen.has(input)) {
      seen.add(input);
      const nested = readInput(input);
      if (nested !== null) {
        const sub = auxBib(nested, readInput, seen);
        for (const k of sub.citations) citations.add(k);
        databases.push(...sub.databases);
        style ??= sub.style;
      }
    }
  }
  return { citations: [...citations].sort(), databases, style };
}

/**
 * Every overfull box a log reports, with its size. TeX's own two spellings, word for word from
 * TeX Live 2023 logs (2026-09-24):
 *
 *   Overfull \hbox (1.2pt too wide) in paragraph at lines 10--12
 *   Overfull \vbox (1.503pt too high) has occurred while \output is active []
 *
 * Whether a box BREAKS the layout is a judgement and lives with the step that makes it
 * (`breaksLayout` in `balance.ts`); this reads the facts.
 */
export function overfullBoxes(
  lines: readonly string[],
): { box: "hbox" | "vbox"; pt: number }[] {
  const out: { box: "hbox" | "vbox"; pt: number }[] = [];
  for (const line of lines) {
    const m = /^Overfull \\([hv])box \(([\d.]+)pt too (?:wide|high)\)/.exec(
      line,
    );
    if (m) out.push({ box: m[1] === "h" ? "hbox" : "vbox", pt: Number(m[2]) });
  }
  return out;
}

/**
 * balance.sty's warning that `\balance` ran in the second column, where it has no effect:
 *
 *   Package balance Warning: You have called \balance in second column
 *   (balance)                Columns might not be balanced.
 */
export const balanceInSecondColumn = (lines: readonly string[]): boolean =>
  lines.some((l) =>
    l.startsWith(
      "Package balance Warning: You have called \\balance in second column",
    ),
  );
