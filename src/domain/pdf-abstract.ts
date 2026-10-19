/**
 * THE ABSTRACT AS THE PDF SHOWS IT — read from the build's facts (`pages_text`, pdf.js's text of each
 * page), so every macro is already what TeX made of it. What `paperlint submission new` sends as the
 * abstract. Pure.
 *
 * Where it starts: the first line of the first two pages that begins with «Abstract» (acmart's
 * «ABSTRACT» heading on its own line, IEEEtran's «Abstract—…», LLNCS's «Abstract.»). Where it ends:
 * the first later line that begins one of the blocks the classes set after it — «CCS Concepts»,
 * «Keywords», «Index Terms», «ACM Reference Format», or the first section («1 Introduction»,
 * «I. INTRODUCTION»). No such start or end is a refusal naming what was looked for, never a guess.
 *
 * Lines are joined with a space, except where TeX hyphenated a word across them: a line ending in a
 * hyphen whose next line starts with a lower-case letter is one word — unless the paper's own
 * source spells the two halves with a hyphen (`agent-based`), which is a compound kept as written.
 */
import { err, ok, type Result } from "./result.ts";

const START = /^\s*abstract\b\s*[-—–:.]?\s*/iu;
const END =
  /^\s*(ccs\s+concepts|keywords|key\s+words|index\s+terms|acm\s+reference\s+format|(1|i)\.?\s+introduction)\b/iu;

/** The word a line ends on, with the hyphen glued to it: the ASCII one or the Unicode hyphen. */
const GLUED_HYPHEN = /[\p{L}\p{N}]+[-\u2010]$/u;
/** The lower-case word a line starts with. */
const LOWER_START = /^\p{Ll}+/u;

/**
 * Two lines as one text. A hyphen glued to its word: before a lower-case word, a hyphenated word
 * rejoined (or a compound the source spells with a hyphen, kept); before anything else (`GPT-` and
 * `4`), kept with no space. A soft hyphen is always a break. Anything else: a space.
 */
function joinLines(source: string): (acc: string, line: string) => string {
  const lowerSource = source.toLowerCase();
  return (acc, line) => {
    if (acc === "") return line;
    if (acc.endsWith("\u00ad")) return `${acc.slice(0, -1)}${line}`;
    const left = GLUED_HYPHEN.exec(acc);
    if (left === null) return `${acc} ${line}`;
    const right = LOWER_START.exec(line);
    if (right === null) return `${acc}${line}`;
    const compound = `${left[0].slice(0, -1)}-${right[0]}`.toLowerCase();
    const stem = acc.slice(0, -1);
    return lowerSource.includes(compound)
      ? `${stem}-${line}`
      : `${stem}${line}`;
  };
}

/** The first two pages' lines, trimmed: where an abstract and the block after it stand. */
const linesOf = (pages: readonly string[]): readonly string[] =>
  pages
    .slice(0, 2)
    .join("\n")
    .split("\n")
    .map((l) => l.trim());

/**
 * The abstract in the text of a PDF's pages, as one paragraph of plain text; `source` is the paper's
 * LaTeX, read only to tell a compound from a hyphenated word. Or why it cannot be found.
 */
export function abstractOfPages(
  pages: readonly string[],
  source: string,
): Result<string, string> {
  const lines = linesOf(pages);
  const start = lines.findIndex((l) => START.test(l));
  if (start < 0)
    return err(
      "the PDF's first two pages have no line beginning with «Abstract»",
    );
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => END.test(l));
  if (end < 0)
    return err(
      "the PDF's abstract has no end paperlint knows: no «CCS Concepts», «Keywords», «Index Terms», «ACM Reference Format» or first section after it on the first two pages",
    );
  const text = lines
    .slice(start, start + 1 + end)
    .map((l, i) => (i === 0 ? l.replace(START, "") : l))
    .filter((l) => l !== "")
    .reduce(joinLines(source), "")
    .replace(/\s+/gu, " ")
    .trim();
  return text === ""
    ? err("the PDF's abstract is empty between its heading and the next block")
    : ok(text);
}
