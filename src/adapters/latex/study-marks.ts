/**
 * The `% study: <id>` comments of a source: the link from a paragraph to the study its numbers come
 * from (src/domain/study-claims.ts). Read off the tree — a comment is a node of its own — in the live
 * document only: not after `\end{document}`, not inside a macro definition.
 */
import type { StudyMark } from "../../domain/study-claims.ts";
import { isDefinition } from "./hidden.ts";
import { inPlace, isNode, placeOf, visited } from "./nodes.ts";
import { liveRoot, type ParsedTex } from "./parse.ts";

/** `study:` and the ids after it, separated by commas or spaces. */
const MARK = /^\s*study:\s*(.*)$/u;

export const studyMarksOf = (t: ParsedTex): readonly StudyMark[] =>
  visited(liveRoot(t), isDefinition)
    .filter(isNode)
    .flatMap((n) => {
      const m = n.type === "comment" ? MARK.exec(n.content) : null;
      if (m === null) return [];
      const ids = String(m[1])
        .split(/[\s,]+/u)
        .filter((id) => id !== "");
      return inPlace(placeOf(n), (span) =>
        ids.map((id) => ({ id, at: span.start })),
      );
    });
