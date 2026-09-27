/**
 * Checking a paper's references online — shaped by what the build records, not by what DBLP or
 * Crossref answer. The adapter (`adapters/references/`) runs the package's two checkers; a test
 * passes a function.
 */
import type { LookupCache } from "../domain/lookup-cache.ts";

/** What one bibliography entry came to. */
export interface EntryVerdict {
  readonly key: string;
  /**
   * Does the cited work exist, and does its title match? `false` only on a positive disproof (an
   * identifier that resolves to nothing or to another work); a work that simply was not found is
   * `unresolvable`, never `false`.
   */
  readonly exists: "true" | "false" | "unresolvable";
  /** Are the authors those of the version cited (not the preprint's)? */
  readonly authors: "match" | "mismatch" | "skipped" | "unchecked";
  /** Why, in one line, when either is not a plain pass. */
  readonly why?: string;
}

export type ReferencesCheck =
  | { readonly kind: "checked"; readonly entries: readonly EntryVerdict[] }
  /** Nothing could be asked — no network, every service down. Never a pass. */
  | { readonly kind: "not-checked"; readonly why: string };

/** A check's verdicts, and the lookup cache grown by whatever it had to fetch. */
export interface ReferencesRun {
  readonly check: ReferencesCheck;
  /** The cache passed in, plus every new successful answer; the same object when nothing was fetched. */
  readonly cache: LookupCache;
}

/**
 * The bibliography's text (BibTeX) and the paper's lookup cache → the verdicts, derived afresh from
 * cached and newly fetched answers. Never throws: a failure is `not-checked`.
 */
export type CheckReferences = (
  bib: string,
  cache: LookupCache,
) => Promise<ReferencesRun>;
