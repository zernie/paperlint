/**
 * pdflatex's `-recorder` file (`paper.fls`): one line per file TeX opened — `INPUT <path>` to read
 * it, `OUTPUT <path>` to write it — in the order TeX opened them, and a `PWD <dir>` line first. The
 * format has no quoting: a path is the rest of its line.
 */
import type { Fls, FlsLine } from "../../domain/tex-run.ts";

const OPS = ["INPUT", "OUTPUT"] as const;

/** `INPUT a.tex` → the line; anything else (`PWD …`, a blank, a word with no path) → none. */
function lineOf(raw: string): readonly FlsLine[] {
  const op = OPS.find((o) => raw.startsWith(`${o} `));
  const path = op === undefined ? "" : raw.slice(op.length + 1).trimEnd();
  return op === undefined || path === "" ? [] : [{ op, path }];
}

export function parseFls(text: string): Fls {
  const rows = text.split(/\r?\n/);
  const pwd = rows.find((r) => r.startsWith("PWD "));
  return {
    pwd: pwd === undefined ? null : pwd.slice("PWD ".length).trimEnd(),
    lines: rows.flatMap(lineOf),
  };
}
