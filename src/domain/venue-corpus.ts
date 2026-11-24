/**
 * A VENUE CORPUS'S RECORD — `<papers-root>/venues/<venue>/papers.json` (docs/design/venue-corpus.md,
 * decision 1; docs/venues.md): the papers a venue accepted and, for each, every copy we know of with
 * its licence. Codes and measurements stay in `measurements.json`, keyed by a paper's `key`; prose
 * stays in `MANIFEST.md`.
 *
 * The text of the file is checked once, where it enters: `VenueCorpusCodec`
 * (`src/ports/venue-corpus-codec.ts`), whose adapter holds the zod schema of this shape. The domain
 * holds the value. The top level, an edition, a copy, its licence and a paper's ids are strict; a paper
 * row keeps any further field as it is, because a consumer's own scripts read them.
 *
 * 🔴 A licence belongs to a copy, not to a paper (decision 2): the same paper is often CC BY in the
 * proceedings and under arXiv's licence as a preprint, and a stored file is a copy of one version. What
 * a licence permits is `src/domain/licence.ts`'s table.
 */
import type { NOASSERTION, StoredKind } from "./licence.ts";

export const CORPUS_RECORD = "papers.json";

/** `accepted` and `award` are this venue's; `sister`, a paper of another venue (corpus 2). */
export const PAPER_GROUPS = ["accepted", "award", "sister"] as const;
export type PaperGroup = (typeof PAPER_GROUPS)[number];

/** OpenAlex's `publishedVersion` / `acceptedVersion` / `submittedVersion`. */
export const KNOWN_VERSIONS = ["published", "accepted", "preprint"] as const;
export type KnownVersion = (typeof KNOWN_VERSIONS)[number];

/** The ids a paper may carry; `url` is its page on the listing, when nothing else identifies it. */
export const PAPER_ID_KINDS = ["doi", "arxiv", "dblp", "s2", "url"] as const;

/** A key names the stored files (`pdf/<key>.pdf`) and the measurement rows: one path segment. */
export const KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;

/** One edition of this venue the corpus covers. */
export interface Edition {
  readonly edition: number;
  /** The page that lists what the edition accepted. */
  readonly listed_from: string;
  readonly read_on: string;
  /** How many it accepted, when the page says. */
  readonly accepted?: number | undefined;
}

/** A licence read from a source, or `NOASSERTION`: none was read. */
export type Licence =
  | { readonly id: typeof NOASSERTION }
  | {
      /** An SPDX id or a `LicenseRef-`. */
      readonly id: string;
      /** The page or API response it was read from, never inferred. */
      readonly read_from: string;
      readonly read_on: string;
    };

/** What of a copy is in the corpus, and where its bytes came from. */
interface Storage {
  /** Each kind at most once; `text` covers every text variant of the paper. */
  readonly stored: readonly StoredKind[];
  /** Present whenever `stored` is not empty. */
  readonly fetched_from?: string | undefined;
}

/**
 * One copy of a paper. A copy whose origin nobody recorded is `unknown`, and its licence is
 * `NOASSERTION`, so it permits nothing.
 */
export type Copy =
  | (Storage & {
      readonly version: KnownVersion;
      readonly url: string;
      readonly licence: Licence;
    })
  | (Storage & {
      readonly version: "unknown";
      readonly licence: { readonly id: typeof NOASSERTION };
    });

export interface PaperIds {
  readonly doi?: string | undefined;
  readonly arxiv?: string | undefined;
  readonly dblp?: string | undefined;
  readonly s2?: string | undefined;
  readonly url?: string | undefined;
}

interface PaperFields {
  /** Unique in the file. */
  readonly key: string;
  readonly title: string;
  readonly authors?: readonly string[] | undefined;
  /** Kept as metadata whatever the copies' licences. */
  readonly abstract?: string | undefined;
  /** At least one. */
  readonly ids: PaperIds;
  readonly copies: readonly Copy[];
  readonly [extra: string]: unknown;
}

export type Paper =
  | (PaperFields & {
      readonly group: "accepted" | "award";
      /** One of the record's `editions[].edition`. */
      readonly edition: number;
    })
  | (PaperFields & {
      readonly group: "sister";
      readonly venue: string;
      readonly year: number;
      readonly listed_from: string;
    });

export interface VenueCorpus {
  /** The corpus folder's name: the venue preset's series. */
  readonly venue: string;
  readonly editions: readonly Edition[];
  readonly papers: readonly Paper[];
}

/** A `papers.json`'s text, parsed: the record, or every reason it is not one. */
export type ParsedCorpus =
  | { readonly ok: true; readonly corpus: VenueCorpus }
  | { readonly ok: false; readonly why: string };
