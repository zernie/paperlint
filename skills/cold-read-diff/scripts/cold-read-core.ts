/**
 * cold-read-core.ts — what the cold read's readers are given: the paragraphs a paper diff
 * changed, as plain text, and the command around it. It calls no model.
 *
 * WHY IT SHIPS (#301). A run without it rebuilt the extract by hand every time, and one such
 * extractor turned `--no-verify` into `-no-verify`. Here each changed line is widened to its whole
 * paragraph (a reader handed `+` lines reports artefacts of the cut, not defects of the paper),
 * working comments, floats and the bibliography are dropped, `{{placeholders}}` are expanded, and
 * every dash is left as written. Above 15 changed paragraphs it refuses: a read that size is the
 * 35-minute batch #301 records, so the caller narrows `--base` instead.
 *
 * Usage:
 *   node cold-read.js <paper.tex> [--venue=NAME] [--base=REV] [--macros=FILE.json] [--max=N]
 *     prints the two readers' prompts, the changed paragraphs inside them;
 *   node cold-read.js report <paper.tex> --engineer=FILE|none --reviewer=FILE|none [--out=PATH] [same flags]
 *     writes the report under the paper's reviews/ and prints the short table (cold-read-report.ts).
 * Exit: 0 — done · 2 — refused (nothing changed, too many paragraphs, a bad flag, no answer file).
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { z } from "zod";
import { visit } from "@unified-latex/unified-latex-util-visit";
import { latexReader, parseLatex } from "#src/adapters/latex/index";
import type { Passage, Span } from "#src/domain/tex-document";
import { passageText } from "#src/paper-prose";
import {
  answerOf,
  prompts,
  READERS,
  reportOf,
  summary,
  type Answer,
  type Reader,
} from "./cold-read-report.ts";

/** Above this many changed paragraphs the run refuses and asks for a narrower range (#301). */
export const DEFAULT_MAX = 15;

/** A changed paragraph as a reader gets it. */
export interface Paragraph {
  readonly start: number;
  readonly end: number;
  readonly text: string;
  readonly unexpanded: readonly string[];
}

const MacrosSchema = z.record(z.string(), z.union([z.string(), z.number()]));
type Macros = z.infer<typeof MacrosSchema>;

/**
 * The 1-based line numbers of the NEW file that a `git diff -U0` adds or changes, read off each
 * hunk header `@@ -a,b +c,d @@`: lines c to c+d-1 (`d` absent is 1, `d` of 0 is a pure deletion).
 */
export const changedLines = (diff: string): number[] =>
  diff
    .split("\n")
    .filter((line) => line.startsWith("@@ "))
    .flatMap((line) => {
      const added = line.split(" ")[2] ?? "";
      if (!added.startsWith("+")) return [];
      const [start, count = "1"] = added.slice(1).split(",");
      return Array.from({ length: Number(count) }, (_, i) => Number(start) + i);
    });

/** A `{{placeholder}}` a build fills in: where it stands in the source, its name, how it is written. */
interface Placeholder {
  readonly start: number;
  readonly end: number;
  readonly name: string;
  readonly written: string;
}

/**
 * The `{{placeholders}}` of `src`, read off its parse: a group that holds exactly one group, which
 * holds only text. `{x}` is one group and `{{a}{b}}` holds two, so neither is a placeholder.
 */
const placeholdersOf = (src: string): Placeholder[] => {
  const found: Placeholder[] = [];
  visit(parseLatex(src).root, (node) => {
    if (node.type !== "group" || node.content.length !== 1) return;
    const [inner] = node.content;
    const start = node.position?.start.offset;
    const end = node.position?.end.offset;
    if (
      inner?.type !== "group" ||
      start === undefined ||
      end === undefined ||
      !inner.content.every(
        (n) => n.type === "string" || n.type === "whitespace",
      )
    )
      return;
    found.push({
      start,
      end,
      name: src.slice(start + 2, end - 2).trim(),
      written: src.slice(start, end),
    });
  });
  return found;
};

/** `src` with each placeholder `macros` has a value for written in, the last first so offsets hold. */
const filled = (
  src: string,
  places: readonly Placeholder[],
  macros: Macros,
): string =>
  [...places]
    .sort((a, b) => b.start - a.start)
    .reduce((text, p) => {
      const value = macros[p.name];
      return value === undefined
        ? text
        : `${text.slice(0, p.start)}${String(value).replaceAll("\n", " ")}${text.slice(p.end)}`;
    }, src);

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
 * The changed paragraphs of `tex`: every body passage (`bodyProse`: the parse of the paper, without
 * comments, headings, floats, code or the back matter) that a changed line falls in, whole, as the
 * text a reader sees (`passageText`). `{{placeholders}}` are filled from `macros` before the parse;
 * `unexpanded` lists the ones it had no value for.
 */
export const extract = (
  tex: string,
  lines: readonly number[],
  macros: Macros = {},
): Paragraph[] => {
  const places = placeholdersOf(tex);
  const missing = places.filter((p) => macros[p.name] === undefined);
  const src = filled(tex, places, macros);
  return latexReader
    .bodyProse(src)
    .map((p) => ({ p, span: spanOf(p) }))
    .map(({ p, span }) => {
      const start = lineAt(src, span.start);
      const end = lineAt(src, span.end - 1);
      return {
        start,
        end,
        text: passageText(p),
        unexpanded: missing
          .filter(
            (m) => lineAt(tex, m.start) >= start && lineAt(tex, m.start) <= end,
          )
          .map((m) => m.written),
      };
    })
    .filter(
      (b) => b.text !== "" && lines.some((n) => n >= b.start && n <= b.end),
    );
};

/** The flags a run reads. */
interface Options {
  readonly paper: string;
  readonly base: string;
  readonly macros: string | undefined;
  readonly max: number;
  readonly venue: string;
  readonly flags: ReadonlyMap<string, string>;
}

/** A refusal: printed as one line, exit 2. */
class Refusal extends Error {}

const KNOWN = ["base", "macros", "max", "venue"];
const REPORT_ONLY = ["engineer", "reviewer", "out"];

/** The `--name=value` flags of `argv`, or a refusal naming the ones `known` does not hold. */
const flagsOf = (
  argv: readonly string[],
  known: readonly string[],
): ReadonlyMap<string, string> => {
  const pairs = argv
    .filter((a) => a.startsWith("--"))
    .map((a): [string, string] => {
      const at = a.indexOf("=");
      return at < 0 ? [a.slice(2), ""] : [a.slice(2, at), a.slice(at + 1)];
    });
  const unknown = pairs.filter(([k]) => !known.includes(k)).map(([k]) => k);
  if (unknown.length)
    throw new Refusal(`unknown flag(s) --${unknown.join(", --")}`);
  return new Map(pairs);
};

/** The command line as options, or a refusal naming what is wrong with it. */
export const optionsOf = (
  argv: readonly string[],
  reporting = false,
): Options => {
  const flags = flagsOf(argv, reporting ? [...KNOWN, ...REPORT_ONLY] : KNOWN);
  const [paper, ...extra] = argv.filter((a) => !a.startsWith("--"));
  if (paper === undefined || extra.length > 0)
    throw new Refusal("name exactly one paper .tex file");
  const max = Number(flags.get("max") ?? DEFAULT_MAX);
  if (!Number.isInteger(max) || max < 1)
    throw new Refusal("--max takes a positive integer");
  return {
    paper,
    base: flags.get("base") || "HEAD",
    macros: flags.get("macros"),
    max,
    venue: flags.get("venue") ?? "",
    flags,
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

/** A reader's answer file, `none` for a reader that did not answer in time. */
const answerFile = (o: Options, reader: Reader): Answer => {
  const named = o.flags.get(reader);
  if (named === undefined || named === "")
    throw new Refusal(`report needs --${reader}=FILE, or --${reader}=none`);
  if (named === "none") return answerOf(null);
  if (!existsSync(resolve(named)))
    throw new Refusal(`--${reader}: ${named} does not exist`);
  return answerOf(readFileSync(resolve(named), "utf8"));
};

const stamp = (d: Date): string =>
  d.toISOString().slice(0, 19).replaceAll(":", "").replace("T", "-");

/** Write the report and print the short table. */
const report = (o: Options, paragraphs: Paragraph[]): number => {
  const answers = {
    engineer: answerFile(o, "engineer"),
    reviewer: answerFile(o, "reviewer"),
  };
  const paper = resolve(o.paper);
  const out =
    o.flags.get("out") ||
    join(dirname(paper), "reviews", `${stamp(new Date())}-cold-read-diff.md`);
  mkdirSync(dirname(resolve(out)), { recursive: true });
  writeFileSync(
    resolve(out),
    reportOf({ ...o, paper: basename(paper), paragraphs, answers }),
  );
  process.stdout.write(`${summary(answers, paragraphs.length, out)}\n`);
  return 0;
};

/** The two prompts, each under a line naming its reader. */
const printPrompts = (o: Options, paragraphs: Paragraph[]): number => {
  const asked = prompts(paragraphs, o.venue);
  process.stdout.write(
    `${READERS.map((r) => `=== ${r} ===\n${asked[r]}`).join("\n\n")}\n`,
  );
  return 0;
};

/** The command. Returns its exit code; a refusal is one line on stderr and exit 2. */
export function main(argv: readonly string[]): number {
  try {
    const reporting = argv[0] === "report";
    const o = optionsOf(reporting ? argv.slice(1) : argv, reporting);
    const found = paragraphsFor(o);
    return reporting ? report(o, found) : printPrompts(o, found);
  } catch (e) {
    if (!(e instanceof Refusal)) throw e;
    process.stderr.write(`cold read: ${e.message}\n`);
    return 2;
  }
}
