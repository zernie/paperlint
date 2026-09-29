/**
 * THE PAPER, NOT ITS MAIN FILE — what every rule over the LaTeX parse tree reads, and how it reports.
 *
 * `readPaper` gives a rule `paper.tex` with every `\input`, `\include` and `\subfile` spliced in, the
 * way TeX reads it (`assemblePaper`, src/domain/paper-source.ts). `reportInPaper` puts each finding
 * back where its text came from: a finding in `paper.tex` at its own place; a finding in an included
 * file at the include in `paper.tex` that brought it in — the one place ESLint can point to in this
 * file — with the included file, line and column at the front of the message.
 *
 * An include is looked for where the build tells TeX to look (`texSearchPath`): the paper's own
 * directory, then paperlint's inputs. `bodyFiles` names the files of the paper's BODY the author
 * wrote — what the rules over ESLint's own LaTeX text read one by one, each at its own path.
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
import type { AbsolutePath } from "./domain/paths.ts";
import { texSearchPath } from "./package-dirs.ts";
import type { Located, TexRuleContext } from "./tex-venue-rules.ts";

/** What reading a paper needs: the disk, and the LaTeX reader. */
export interface PaperDeps {
  readonly files: Files;
  readonly latex: LatexReader;
}

/** The paper whose main file is `filename` with the text `src`, its includes spliced. */
export function readPaper(
  filename: string,
  src: string,
  deps: PaperDeps,
): PaperSource {
  const dir = dirname(filename);
  return assemblePaper(basename(filename), src, {
    includes: deps.latex.includes,
    documentBody: deps.latex.documentBody,
    read: (rel) => {
      const at = located(dir, rel, deps.files);
      const b = at === null ? null : deps.files.readBytes(at);
      return b === null ? null : new TextDecoder().decode(b);
    },
  });
}

/** `rel` in the first directory of the paper's TeX search path that holds it, or null. */
const located = (dir: string, rel: string, files: Files): AbsolutePath | null =>
  texSearchPath(dir)
    .map((d) => callerPath(join(d, rel)))
    .find((p) => files.isFile(p)) ?? null;

/** An include that resolved nowhere: the file that wrote it, and the path as written. */
export interface Unread {
  readonly file: string;
  readonly target: string;
}

/**
 * The files of the body of the paper whose main file is `filename`: every file an include inside its
 * `document` environment brings in, nested ones too, found in the paper's own directory. Not a
 * preamble include (macros are not the body), and not a file found only in paperlint's inputs (not
 * the author's text). `missing` is every include, anywhere, that resolved nowhere.
 */
export function bodyFiles(
  filename: string,
  src: string,
  deps: PaperDeps,
): {
  readonly files: readonly AbsolutePath[];
  readonly missing: readonly Unread[];
} {
  const dir = dirname(filename);
  const paper = readPaper(filename, src, deps);
  const body = deps.latex.documentBody(src);
  const inBody = (via: Span | null): boolean =>
    via !== null &&
    (body === null || (via.start >= body.start && via.end <= body.end));
  const own = (rel: string): AbsolutePath | null => {
    const at = located(dir, rel, deps.files);
    return at === callerPath(join(dir, rel)) ? at : null;
  };
  return {
    files: [
      ...new Set(
        paper.segments
          .filter((s) => s.file !== paper.main && inBody(s.via))
          .map((s) => own(s.file))
          .filter((f): f is AbsolutePath => f !== null),
      ),
    ],
    missing: paper.missing.map(({ file, target }) => ({ file, target })),
  };
}

/** Line and column (1-based) of an offset in a text. */
function lineColumn(text: string, at: number): string {
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
