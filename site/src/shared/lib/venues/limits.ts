// An edition's page limits in plain English, from the kinds of presets/catalog.json, as a venue's
// popover on paperlint.dev says them. Pure.

import * as R from "remeda";
import type { CatalogKind } from "./catalog.ts";

/** The pages a kind is measured by: the body when the preset sets one, else the whole paper. */
const pagesOf = (k: CatalogKind): number | null => k.bodyPagesMax ?? k.pagesMax;

/**
 * What follows the page count: the references and the total, which only a body limit has.
 * `refs` says the reference pages: «, + 2 pages of references» after a list, « + 5 of references»
 * after one kind.
 */
const tailOf = (k: CatalogKind, refs: (n: string) => string): string =>
  k.bodyPagesMax === null
    ? ""
    : (k.refPagesMax === null
        ? ", references not counted"
        : refs(String(k.refPagesMax))) +
      (k.pagesMax === null ? "" : `, ${String(k.pagesMax)} in all`);

const sharedRefs = (n: string): string => `, + ${n} pages of references`;
const ownRefs = (n: string): string => ` + ${n} of references`;

/** One kind on its own: «research 13 pages + 5 of references, 18 in all». */
const clause = (k: CatalogKind): string => {
  const pages = pagesOf(k);
  return pages === null
    ? `${k.kind} page limit not checked`
    : `${k.kind} ${String(pages)} pages${tailOf(k, ownRefs)}`;
};

/**
 * «short 5, full 10 pages, + 2 pages of references.» when every kind has a limit of the same
 * shape; each kind spelled out, by «;», when they differ; «The format only; page limits not checked.» for a
 * preset with no kinds.
 */
export const limitsText = (kinds: readonly CatalogKind[]): string => {
  const first = kinds[0];
  if (first === undefined) return "The format only; page limits not checked.";
  if (kinds.every((k) => pagesOf(k) === null))
    return `${kinds.map((k) => k.kind).join(", ")}: page limits not checked.`;
  const tails = R.unique(kinds.map((k) => tailOf(k, sharedRefs)));
  return kinds.every((k) => pagesOf(k) !== null) && tails.length === 1
    ? `${kinds.map((k) => `${k.kind} ${String(pagesOf(k))}`).join(", ")} pages${tailOf(first, sharedRefs)}.`
    : `${kinds.map(clause).join("; ")}.`;
};

/** «Double-blind review.» when the preset says the venue reviews double-blind; null otherwise. */
export const reviewText = (blind: boolean): string | null =>
  blind ? "Double-blind review." : null;
