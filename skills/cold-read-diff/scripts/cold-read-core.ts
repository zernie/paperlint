/**
 * cold-read-core.ts — what the cold read's readers are given: the paragraphs a paper diff
 * changed, as plain text. It calls no model; the skill hands this text to two context-free
 * readers (`SKILL.md`, "How to run it").
 *
 * WHY IT SHIPS (#301). A run without it rebuilt the extract by hand every time, and one such
 * extractor turned `--no-verify` into `-no-verify`. Here each changed line is widened to its whole
 * paragraph (a reader handed `+` lines reports artefacts of the cut, not defects of the paper),
 * working comments, floats and the bibliography are dropped, `{{placeholders}}` are expanded, and
 * every dash is left as written. Above 15 changed paragraphs it refuses: a read that size is the
 * 35-minute batch #301 records, so the caller narrows `--base` instead.
 *
 * Usage: node cold-read.js <paper.tex> [--base=REV] [--macros=FILE.json] [--max=N]
 * Exit: 0 — the paragraphs on stdout · 2 — refused (nothing changed, too many, a bad flag).
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { z } from "zod";

/** Above this many changed paragraphs the run refuses and asks for a narrower range (#301). */
export const DEFAULT_MAX = 15;

/** A blank-line separated block of the paper, 1-based lines. */
export interface Block {
  readonly start: number;
  readonly end: number;
  readonly lines: readonly string[];
}

/** A changed paragraph as a reader gets it. */
export interface Paragraph {
  readonly start: number;
  readonly end: number;
  readonly text: string;
  readonly unexpanded: readonly string[];
}

const MacrosSchema = z.record(z.string(), z.union([z.string(), z.number()]));
type Macros = z.infer<typeof MacrosSchema>;

/** The 1-based line numbers of the NEW file that a `git diff -U0` adds or changes. */
export const changedLines = (diff: string): number[] =>
  [...diff.matchAll(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm)].flatMap(
    (m) => {
      const start = Number(m[1]);
      const count = m[2] === undefined ? 1 : Number(m[2]);
      return Array.from({ length: count }, (_, i) => start + i);
    },
  );

/** Blank-line separated blocks of `tex`, each with its 1-based first and last line. */
export const paragraphsOf = (tex: string): Block[] =>
  tex
    .split("\n")
    .reduce<readonly (Block | null)[]>(
      (blocks, line, i) => {
        const last = blocks.at(-1);
        if (line.trim() === "") return [...blocks, null];
        return last
          ? [
              ...blocks.slice(0, -1),
              { ...last, end: i + 1, lines: [...last.lines, line] },
            ]
          : [...blocks, { start: i + 1, end: i + 1, lines: [line] }];
      },
      [null],
    )
    .filter((b): b is Block => b !== null);

/** A block that is not prose a reader should judge: a float, a table, the bibliography. */
const NOT_PROSE =
  /\\begin\{(table|figure|tabular|thebibliography|lstlisting|verbatim|equation|align)\*?\}|\\bibliography\{/;

/** A line that is only a command (`\section{…}`, `\label{…}`, `\begin{document}`): no prose on it. */
const COMMAND_ONLY = /^\s*\\[A-Za-z]+\*?(\[[^\]]*\])?(\{[^{}]*\})*\s*$/;

/** A `{{placeholder}}` a build fills in. */
const PLACEHOLDER = /\{\{\s*([\w.-]+)\s*\}\}/g;

/**
 * One block as the plain text a reader gets: working comments dropped, `{{macros}}` expanded,
 * light markup removed. Dashes are left exactly as written — `--no-verify` stays `--no-verify`.
 * `unexpanded` lists the placeholders `macros` had no value for.
 */
export const plainText = (
  lines: readonly string[],
  macros: Macros = {},
): { text: string; unexpanded: string[] } => {
  const text = lines
    .map((l) => l.replace(/(^|[^\\])%.*$/, "$1"))
    .filter((l) => l.trim() !== "" && !COMMAND_ONLY.test(l))
    .join(" ")
    .replace(PLACEHOLDER, (m, k: string) => String(macros[k] ?? m))
    .replace(/\\(?:emph|textbf|textit|texttt|textsc|mbox)\{([^{}]*)\}/g, "$1")
    .replace(
      /\\(?:cite[tp]?|citeauthor)\*?(?:\[[^\]]*\])?\{[^}]*\}/g,
      "[citation]",
    )
    .replace(/\\(?:ref|cref|Cref|autoref)\{[^}]*\}/g, "[ref]")
    .replace(/\\([%&#_$])/g, "$1")
    .replace(/~/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return { text, unexpanded: [...text.matchAll(PLACEHOLDER)].map((m) => m[0]) };
};

/** The changed paragraphs of `tex`, widened to whole blocks and made plain. */
export const extract = (
  tex: string,
  lines: readonly number[],
  macros: Macros = {},
): Paragraph[] =>
  paragraphsOf(tex)
    .filter((b) => lines.some((n) => n >= b.start && n <= b.end))
    .filter((b) => !NOT_PROSE.test(b.lines.join("\n")))
    .map((b) => ({
      start: b.start,
      end: b.end,
      ...plainText(b.lines, macros),
    }))
    .filter((p) => p.text !== "");

/** The flags a run reads. */
interface Options {
  readonly paper: string;
  readonly base: string;
  readonly macros: string | undefined;
  readonly max: number;
}

/** A refusal: printed as one line, exit 2. */
class Refusal extends Error {}

const KNOWN = ["base", "macros", "max"];

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
  const files = argv.filter((a) => !a.startsWith("--"));
  if (files.length !== 1) throw new Refusal("name exactly one paper .tex file");
  const flags = new Map(pairs);
  const max = Number(flags.get("max") ?? DEFAULT_MAX);
  if (!Number.isInteger(max) || max < 1)
    throw new Refusal("--max takes a positive integer");
  return {
    paper: files[0] ?? "",
    base: flags.get("base") || "HEAD",
    macros: flags.get("macros"),
    max,
  };
};

/** The changed paragraphs `o` names, or a refusal saying why there is nothing to read. */
const paragraphsFor = (o: Options): Paragraph[] => {
  const paper = resolve(o.paper);
  if (!existsSync(paper)) throw new Refusal(`${o.paper} does not exist`);
  const macros = o.macros
    ? MacrosSchema.parse(JSON.parse(readFileSync(resolve(o.macros), "utf8")))
    : {};
  const diff = execFileSync(
    "git",
    ["diff", "-U0", "--no-color", o.base, "--", basename(paper)],
    { cwd: dirname(paper), encoding: "utf8" },
  );
  return checked(
    o,
    extract(readFileSync(paper, "utf8"), changedLines(diff), macros),
  );
};

/** `found`, unless it is empty or above the cap; warns of placeholders left unexpanded. */
const checked = (o: Options, found: Paragraph[]): Paragraph[] => {
  if (!found.length)
    throw new Refusal(`no changed prose in ${o.paper} since ${o.base}`);
  if (found.length > o.max)
    throw new Refusal(
      `${String(found.length)} changed paragraphs since ${o.base}, above the cap of ${String(o.max)}: ` +
        `narrow --base to fewer commits, or raise --max knowingly`,
    );
  found
    .flatMap((p) => p.unexpanded)
    .forEach((m) => {
      process.stderr.write(
        `cold read: warning — ${m} has no value; pass --macros\n`,
      );
    });
  return found;
};

/** The paragraphs as a reader gets them: numbered, one blank line apart, nothing else. */
export const numbered = (paragraphs: readonly Paragraph[]): string =>
  paragraphs.map((p, i) => `[${String(i + 1)}] ${p.text}`).join("\n\n");

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
