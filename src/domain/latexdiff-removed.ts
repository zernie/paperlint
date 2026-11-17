/**
 * What `latexdiff` marked as deleted. Its output wraps each removed stretch in `\DIFdel{…}`; reading
 * those groups is how `paperlint versions diff` lists what the approved text had that the draft no
 * longer has. A sentence latexdiff cannot mark (a changed figure, a macro) is not listed. Pure.
 */

/** The index of the `}` that closes a group opened just before `from`, or -1. */
function closing(s: string, from: number, depth = 1): number {
  const open = s.indexOf("{", from);
  const close = s.indexOf("}", from);
  if (close < 0) return -1;
  if (open >= 0 && open < close) return closing(s, open + 1, depth + 1);
  return depth === 1 ? close : closing(s, close + 1, depth - 1);
}

const MARK = "\\DIFdel{";

/** The text of every `\DIFdel{…}` group in latexdiff's output, in order. */
export function deletedGroups(diff: string): readonly string[] {
  const at = diff.indexOf(MARK);
  if (at < 0) return [];
  const start = at + MARK.length;
  const end = closing(diff, start);
  return end < 0
    ? []
    : [diff.slice(start, end), ...deletedGroups(diff.slice(end + 1))];
}

/** A deleted group as one line, or null when no prose is left in it (a bare command). */
export function removedSentence(group: string): string | null {
  const flat = group.replace(/\s+/g, " ").trim();
  return flat.replace(/\\[A-Za-z]+\*?|[{}[\]%~&]/g, "").trim() === ""
    ? null
    : flat;
}

/** Every removed sentence of latexdiff's output, in order. */
export const removedSentences = (diff: string): readonly string[] =>
  deletedGroups(diff).flatMap((g) => {
    const s = removedSentence(g);
    return s === null ? [] : [s];
  });
