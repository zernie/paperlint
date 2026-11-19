/**
 * Where a source states its venue — the input `tex/venue-leftover` judges a name by: inside one of
 * these commands any other venue's name is a leftover, with or without a year; in prose, only beside
 * a recent year. Read from the parse tree, never the text: a command in a comment is not a command.
 */
import type { Place } from "../../domain/tex-document.ts";
import { isList, macroPlace, visited } from "./nodes.ts";
import { VENUE_LINE_SIGNATURES, type ParsedTex } from "./parse.ts";

/** Each venue-stating command of the source, with its arguments, in source order. */
export function venueLinesOf(t: ParsedTex): readonly Place[] {
  return visited(t.root, () => false)
    .filter(isList)
    .flatMap((list) =>
      list.flatMap((n) =>
        n.type === "macro" && n.content in VENUE_LINE_SIGNATURES
          ? [macroPlace(n)]
          : [],
      ),
    );
}
