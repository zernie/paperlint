/**
 * headings-core.ts — every heading of a paper, in order, as one list: what argument-arc's
 * "headings as a set" step reads (`SKILL.md`, step 2a). Not a gate: whether a heading names a thing
 * is judgement. What was missing was cheaper — nobody had seen the headings AS A SET: two headings a
 * reader called vague survived six passes because every pass read only the section it edited.
 *
 * The paper is `paper.tex` with the files its last build recorded spliced in (`readPaper`); the
 * headings are its `\section` to `\subparagraph` titles, not `\title`, read by `LatexReader.headings`.
 *
 * Usage: node headings.js <paper.tex>
 * Exit: 0 — the list on stdout · 2 — no file named, or none readable there.
 */
import { resolve } from "node:path";
import { runText } from "#src/domain/tex-document";
import { callerPath } from "#src/caller-path";
import { readPaper, decoded, type ProseDeps } from "#src/tex-paper";

/** The paper's headings, in order, as a reader sees their titles. */
export const headingsOf = (
  file: string,
  src: string,
  deps: ProseDeps,
): readonly string[] =>
  deps.latex
    .headings(readPaper(file, src, deps).text)
    .filter((h) => h.command.kind === "heading" && h.argument === "title")
    .map((h) => runText(h.title).replace(/\s+/gu, " ").trim());

/** What the command prints for the headings of `name`. */
export const listing = (name: string, headings: readonly string[]): string =>
  [
    `=== ${name} — every heading, in order ===`,
    ...headings.map((h, i) => `${String(i + 1).padStart(3)}. ${h}`),
    "",
    "Read these as a stranger who will read nothing else. Each should name a thing:",
    'a linter, a configuration, a repository, a rule — not "answers", "kinds", "moves".',
    "",
  ].join("\n");

/** Where the command writes: the list, and what stops it. */
export interface Output {
  readonly out: (s: string) => void;
  readonly err: (s: string) => void;
}

/** Run the command on `argv`; the exit code. */
export function main(
  argv: readonly string[],
  deps: ProseDeps,
  { out, err }: Output,
): number {
  const [arg] = argv;
  if (arg === undefined) {
    err("usage: node headings.js <paper.tex>\n");
    return 2;
  }
  const file = resolve(arg);
  const src = decoded(deps.files.readBytes(callerPath(file)));
  if (src === null) {
    err(`headings: no file at ${file}\n`);
    return 2;
  }
  out(listing(arg, headingsOf(file, src, deps)));
  return 0;
}
