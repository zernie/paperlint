// Types for bib-authors.mjs, for the exports `src/` imports — the same arrangement as
// `verify-cites.d.mts` beside it. Only what `src/` imports is declared.

/** One entry as `authorEntries` returns it; a field the entry lacks is "". */
export interface BibEntry {
  readonly type: string;
  readonly key: string;
  readonly author: string;
  readonly title: string;
  readonly booktitle: string;
  readonly journal: string;
}

/** A name of a name list, in its parts (`BibName`). */
export interface ReadName {
  readonly lastName?: string;
  readonly firstName?: string;
  readonly prefix?: string;
  readonly suffix?: string;
  readonly name?: string;
}

/** An entry as the bibtex reader reads it (src/domain/paper-sources.ts), as far as this check uses it. */
export interface ReadEntry {
  readonly type: string;
  readonly key: string;
  readonly fields: Readonly<Record<string, string>>;
  readonly names: Readonly<Record<string, readonly ReadName[]>>;
}

/** The entries this check reads, from the bibtex reader's. */
export declare function authorEntries(
  entries: readonly ReadEntry[],
): BibEntry[];

/** True when the author list ends in `and others` — there is nothing complete to compare. */
export declare const truncated: (authorField: string) => boolean;

/** True when the entry names a venue that is not a preprint server. */
export declare function claimsPublished(
  entry: Pick<BibEntry, "booktitle" | "journal">,
): boolean;

/** One DBLP search hit, as `dblpHits` normalises it. */
export interface DblpHit {
  readonly venue: string;
  readonly year: string;
  readonly type: string;
  readonly title: string;
  readonly authors: readonly string[];
}

/** DBLP's hits for a title; throws on a failed request (with `retryable` for a 429). */
export declare function dblpHits(title: string): Promise<DblpHit[]>;

export interface AuthorFinding {
  readonly key: string;
  readonly venue: string;
  readonly missing: readonly string[];
  readonly extra: readonly string[];
  readonly orderDiffers: boolean;
}

export interface KeyWhy {
  readonly key: string;
  readonly why: string;
}

/** The buckets of one comparison; an entry in none of them was a preprint entry. */
export interface AuthorBuckets {
  readonly findings: readonly AuthorFinding[];
  readonly skipped: readonly KeyWhy[];
  readonly unchecked: readonly KeyWhy[];
  readonly matched: readonly string[];
}

export declare function checkAuthors(
  parsed: readonly BibEntry[],
  options?: {
    readonly lookup?: (title: string) => Promise<readonly DblpHit[]>;
    readonly pause?: (ms: number) => Promise<void> | void;
  },
): Promise<AuthorBuckets>;
