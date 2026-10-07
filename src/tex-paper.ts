/**
 * THE PAPER, NOT ITS MAIN FILE — what every rule over the LaTeX parse tree reads, and how it reports.
 *
 * `readPaper` gives a rule `paper.tex` with every `\input`, `\include` and `\subfile` spliced in, the
 * way TeX reads it (`assemblePaper`, src/domain/paper-source.ts). `reportInPaper` puts each finding
 * back where its text came from: a finding in `paper.tex` at its own place; a finding in an included
 * file at the include in `paper.tex` that brought it in — the one place ESLint can point to in this
 * file — with the included file, line and column at the front of the message.
 *
 * 🔴 WHICH FILES ARE THE PAPER'S IS TEX'S ANSWER, NOT THIS MODULE'S (docs/design/paper-sources.md §1).
 * `readPaper` splices only the files the build's record lists (`_build/sources.json`, `paperRecord`):
 * the files of the paper directory TeX read. An include of a file the record does not list — behind
 * `\iffalse`, never reached — contributes nothing, as it did to TeX. With no
 * record, or a stale one, the paper is `paper.tex` alone, and `paper/sources-fresh` says the files it
 * includes went unlinted. Where an include stands in the text is the only thing read from the text:
 * whether the file it names is part of the paper is the record's to say, never the disk's.
 */
import { basename, dirname, join } from "node:path";
import {
  assemblePaper,
  originOf,
  type PaperSource,
} from "./domain/paper-source.ts";
import type { Span } from "./domain/tex-document.ts";
import type { LatexReader } from "./ports/latex.ts";
import type { Files } from "./ports/files.ts";
import { callerPath } from "./caller-path.ts";
import { paperRecord, type RecordReadDeps } from "./paper-record.ts";
import type { Located, TexRuleContext } from "./tex-venue-rules.ts";

/** What reading a paper needs: the disk, and the LaTeX reader. */
export interface PaperDeps {
  readonly files: Files;
  readonly latex: LatexReader;
}

/** What `readPaper` needs: the disk, the LaTeX reader (where an include stands), and the record's schema. */
export interface ProseDeps extends PaperDeps, RecordReadDeps {}

const decoded = (b: Uint8Array | null): string | null =>
  b === null ? null : new TextDecoder().decode(b);

/**
 * The paper whose main file is `filename` with the text `src`: the files the last build's record lists
 * spliced where their includes stand. No record, or one the paper has outgrown, is `src` alone.
 */
export function readPaper(
  filename: string,
  src: string,
  deps: ProseDeps,
): PaperSource {
  const dir = dirname(filename);
  const record = paperRecord(dir, deps);
  const listed =
    record.kind === "fresh"
      ? new Set(record.record.inputs.map((i) => i.path))
      : null;
  return assemblePaper(basename(filename), src, {
    // No record: no include is looked at, so there is nothing to splice.
    includes: listed === null ? () => [] : deps.latex.includes,
    documentBody: deps.latex.documentBody,
    read: (rel) =>
      listed?.has(rel) === true
        ? decoded(deps.files.readBytes(callerPath(join(dir, rel))))
        : null,
  });
}

/** Line and column (1-based) of an offset in a text. */
export function lineColumn(text: string, at: number): string {
  const line = text.slice(0, at).split("\n").length;
  const column = at - text.lastIndexOf("\n", at - 1);
  return `${String(line)}:${String(column)}`;
}

/** A message template with its data filled in, the way ESLint fills it. */
const filled = (
  template: string,
  data: Readonly<Record<string, string | number>> = {},
): string =>
  Object.entries(data).reduce(
    (m, [k, v]) => m.replaceAll(`{{${k}}}`, String(v)),
    template,
  );

/** Where a finding stands in the main file, and — when its text came from another file — which. */
interface Placed {
  readonly at: Span | null;
  readonly from: string | null;
}

/** A finding's span of the assembled text, as a place in the main file. */
function placed(paper: PaperSource, at: Span | null): Placed {
  const origin = at === null ? null : originOf(paper, at);
  if (origin === null) return { at: null, from: null };
  if (origin.file === paper.main) return { at: origin.span, from: null };
  return {
    at: origin.via,
    from: `${origin.file}:${lineColumn(origin.source, origin.span.start)}`,
  };
}

/**
 * Each finding reported in the main file: at its own place, or at the include that brought its text
 * in, named in the message (`sections/results.tex:12:3: …`). Offsets are the assembled text's.
 */
export function reportInPaper(
  context: TexRuleContext,
  messages: Readonly<Record<string, string>>,
  paper: PaperSource,
  findings: readonly Located[],
): void {
  const loc = (i: number) => context.sourceCode.getLocFromIndex(i);
  findings.forEach((f) => {
    const p = placed(paper, f.at);
    const where = {
      start: loc(p.at?.start ?? 0),
      end: loc(p.at?.end ?? 0),
    };
    if (p.from === null)
      context.report({ loc: where, messageId: f.messageId, data: f.data });
    else
      context.report({
        loc: where,
        // A message id the rule does not define is printed as itself rather than dropped.
        message: `${p.from}: ${filled(messages[f.messageId] ?? f.messageId, f.data)}`,
      });
  });
}
