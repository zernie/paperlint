/**
 * The errors in bibtex's log (`paper.blg`). bibtex ends an error with the place it was reading —
 * `---line 4 of file refs.bib`, or `---while reading file paper.aux` when it names no line — and a
 * warning with a single dash (`--line 1 of file x.bib`), so the three dashes are the whole grammar.
 * The message is what stands before them on the line, or, when they start the line, the line before.
 */
import type { BibtexError } from "../../domain/sources-record.ts";

const PLACE = /^(.*?)---(?:line (\d+) of file|while reading file) (.+)$/;
const LINE_NUMBER = /---line (\d+) of file/;

export function parseBlgErrors(blg: string): readonly BibtexError[] {
  const rows = blg.split(/\r?\n/);
  return rows.flatMap((row, i): readonly BibtexError[] => {
    const m = PLACE.exec(row);
    if (m === null) return [];
    const [, before = "", , file = ""] = m;
    const line = LINE_NUMBER.exec(row)?.[1];
    return [
      {
        message: (before === "" ? (rows[i - 1] ?? "") : before).trim(),
        file: file.trim(),
        line: line === undefined ? null : Number(line),
      },
    ];
  });
}
