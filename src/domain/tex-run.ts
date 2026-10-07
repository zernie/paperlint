/**
 * WHICH FILES A BUILD'S TeX PASSES READ — decided from the lines of each pass's `.fls` (pdflatex
 * `-recorder`), not from any TeX source (docs/design/paper-sources.md §1).
 *
 *   inputs   the files of the paper directory the LAST pass read, in the order it first read them,
 *            each a `preamble` or `body` file: before or after TeX opened `<jobname>.aux` for writing,
 *            which `\begin{document}` does (measured). The main file, read first, is `body`.
 *   written  the `.bib` files ANY pass wrote — a `filecontents` block.
 *
 * 🔴 WHY THE LAST PASS FOR INPUTS AND EVERY PASS FOR WHAT WAS WRITTEN. A block without `[overwrite]`
 * writes its file on the first pass only; the later passes find it there and read it (measured on TeX
 * Live 2026: pass 1 `OUTPUT refs.bib`, passes 2 and 3 `INPUT refs.bib`, no OUTPUT). The last pass alone
 * would list TeX's own copy as a file of the paper. And the first pass reads no `.aux`, `.toc` or `.out`
 * yet, so only a later pass lists what the paper reads and the passes after it write.
 *
 * Files TeX wrote are not inputs: its `.aux` and `.out`, a block's `.bib`, whatever a pass writes and
 * the next reads. `generated` names the files other programs wrote from them (the `.bbl`, when bibtex
 * ran): the same.
 */
import { isAbsolute, posix } from "node:path";
import type { RecordedInput } from "./sources-record.ts";

/** One line of an `.fls`: TeX opened a file to read it, or to write it. */
export interface FlsLine {
  readonly op: "INPUT" | "OUTPUT";
  /** As TeX named the file: `./a.tex` and `a.tex` for one file, an absolute path for the TeX tree's. */
  readonly path: string;
}

/** A pdflatex `-recorder` file: where it ran, and every file it opened, in order. */
export interface Fls {
  /** The directory pdflatex ran in, or null when the file names none. */
  readonly pwd: string | null;
  readonly lines: readonly FlsLine[];
}

export interface RunFiles {
  readonly inputs: readonly RecordedInput[];
  readonly written: readonly string[];
}

/**
 * `path` as TeX named it → relative to the paper directory with forward slashes, or null when the file
 * is not in it: the TeX tree's, a file of a sibling directory, an absolute path outside `pwd`.
 */
function inPaperDir(path: string, pwd: string | null): string | null {
  const rel = isAbsolute(path)
    ? pwd === null
      ? null
      : posix.relative(pwd, path)
    : posix.normalize(path);
  // `..` or `../x`: a file of a sibling directory. (`..x` is a file of this one.)
  return rel === null || rel.split("/")[0] === ".." ? null : rel;
}

const distinct = <T>(xs: readonly T[]): readonly T[] => [...new Set(xs)];

type Opened = FlsLine & { readonly rel: string };

/** The files of the paper directory a pass opened, with the op, in order. */
const opened = (pass: Fls): readonly Opened[] =>
  pass.lines.flatMap((l) => {
    const rel = inPaperDir(l.path, pass.pwd);
    return rel === null ? [] : [{ ...l, rel }];
  });

export interface RunOptions {
  /** The job name: `<jobname>.aux` is the file whose opening marks `\begin{document}`. */
  readonly jobname: string;
  /** Files other programs wrote from TeX's own output, relative to the paper directory (`paper.bbl`). */
  readonly generated: readonly string[];
}

/** One read of a file of the paper, and whether it came after `\begin{document}`. */
interface Read {
  readonly path: string;
  readonly afterBegin: boolean;
}

/**
 * The reads of the last pass: INPUT lines of files nothing wrote, each with its place against the
 * line that opens `<jobname>.aux` — `\begin{document}`. No such line (the run stopped first): none
 * is after it.
 */
function readsOf(
  last: readonly Opened[],
  outputs: ReadonlySet<string>,
  { jobname, generated }: RunOptions,
): readonly Read[] {
  const boundary = last.findIndex(
    (l) => l.op === "OUTPUT" && l.rel === `${jobname}.aux`,
  );
  return last.flatMap((l, i) =>
    l.op === "INPUT" && !outputs.has(l.rel) && !generated.includes(l.rel)
      ? [{ path: l.rel, afterBegin: boundary >= 0 && i > boundary }]
      : [],
  );
}

export function filesOfRun(
  passes: readonly Fls[],
  options: RunOptions,
): RunFiles {
  const everyPass = passes.flatMap(opened);
  const wrote = (l: Opened): boolean => l.op === "OUTPUT";
  const outputs = new Set(everyPass.filter(wrote).map((l) => l.rel));
  const last = passes.at(-1);
  const reads = readsOf(
    last === undefined ? [] : opened(last),
    outputs,
    options,
  );
  // The main file holds `\begin{document}` itself, so it is body wherever TeX opened it.
  const body = (path: string): boolean =>
    path === reads[0]?.path ||
    reads.some((r) => r.path === path && r.afterBegin);
  return {
    inputs: distinct(reads.map((r) => r.path)).map((path): RecordedInput => ({
      path,
      role: body(path) ? "body" : "preamble",
    })),
    written: distinct(
      everyPass
        .filter((l) => wrote(l) && l.rel.endsWith(".bib"))
        .map((l) => l.rel),
    ),
  };
}
