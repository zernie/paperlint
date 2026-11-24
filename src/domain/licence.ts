/**
 * THE LICENCE TABLE — what a copy's licence permits a venue corpus to store (docs/design/venue-corpus.md,
 * decision 3). A corpus keeps third-party papers; each stored file is a copy of one version, judged by
 * that copy's licence (`papers.json`, `src/domain/venue-corpus.ts`).
 *
 * Any SPDX id or `LicenseRef-…` is a licence id where the record is parsed; this table decides what
 * one permits. An id it does not list permits nothing and is its own result, naming the id, so one
 * `CC-BY-3.0` does not hide the rest of a record and a typo is still loud. `NOASSERTION` (the licence
 * was not read) permits nothing, as its own result. A non-commercial licence permits storing only in a
 * project that declares itself non-commercial: paperlint does not assume it.
 *
 * A version of a CC licence other than 4.0 gets its row when a corpus meets it.
 */

/** What a corpus stores of a copy: its extracted text (every variant), or the PDF. */
export const STORED_KINDS = ["text", "pdf"] as const;
export type StoredKind = (typeof STORED_KINDS)[number];

/** SPDX's own id for "no licence information was given": here, the licence was not read. */
export const NOASSERTION = "NOASSERTION";

/** The project's one setting the table reads: it declares itself non-commercial. */
export interface LicenceSettings {
  readonly nonCommercial: boolean;
}

/** What a licence permits for one kind: storing it, or the one reason it may not be stored. */
export type Permission =
  | { readonly kind: "permitted" }
  | { readonly kind: "forbidden"; readonly why: string }
  /** A non-commercial licence, in a project that has not declared itself non-commercial. */
  | { readonly kind: "non-commercial-only" }
  /** `NOASSERTION`: no licence was read for the copy. */
  | { readonly kind: "not-read" }
  /** An id the table does not list. */
  | { readonly kind: "unlisted"; readonly id: string };

/** One kind's grant: always, never (with why), or only in a non-commercial project. */
type Grant = "yes" | { readonly no: string } | "non-commercial";

interface Row {
  readonly text: Grant;
  readonly pdf: Grant;
}

const ND = {
  no: "ND permits reproduction in unmodified form; whether an extracted text is an adaptation is unsettled",
} as const;

const ARXIV = {
  no: 'it grants arXiv alone the right to distribute: "We are thus unable to grant others the right to distribute arXiv articles"',
} as const;

const PUBLISHER = {
  no: "the publisher grants no right to third parties",
} as const;

/** The table: an id → what it grants for text and for the PDF. */
const TABLE: ReadonlyMap<string, Row> = new Map<string, Row>([
  ["CC0-1.0", { text: "yes", pdf: "yes" }],
  ["CC-BY-4.0", { text: "yes", pdf: "yes" }],
  ["CC-BY-SA-4.0", { text: "yes", pdf: "yes" }],
  ["CC-BY-NC-4.0", { text: "non-commercial", pdf: "non-commercial" }],
  ["CC-BY-NC-SA-4.0", { text: "non-commercial", pdf: "non-commercial" }],
  ["CC-BY-ND-4.0", { text: ND, pdf: "yes" }],
  ["CC-BY-NC-ND-4.0", { text: ND, pdf: "non-commercial" }],
  ["LicenseRef-arxiv-nonexclusive-1.0", { text: ARXIV, pdf: ARXIV }],
  ["LicenseRef-publisher", { text: PUBLISHER, pdf: PUBLISHER }],
]);

/**
 * True for an SPDX license id's shape (letters, digits, `-` and `.`, and the deprecated `+` suffix)
 * or a `LicenseRef-` of SPDX and REUSE; listed or not. An expression (`MIT OR Apache-2.0`), a phrase
 * or a URL is not an id.
 */
export const isLicenceId = (id: string): boolean =>
  /^(?:LicenseRef-[A-Za-z0-9.-]+|[A-Za-z0-9][A-Za-z0-9.-]*\+?)$/u.test(id);

/** Whether a copy under licence `id` may be stored as `kind`, in a project of `settings`. */
export function permits(
  id: string,
  kind: StoredKind,
  settings: Readonly<LicenceSettings>,
): Permission {
  if (id === NOASSERTION) return { kind: "not-read" };
  const row = TABLE.get(id);
  if (row === undefined) return { kind: "unlisted", id };
  const grant = row[kind];
  if (grant === "yes") return { kind: "permitted" };
  if (grant === "non-commercial")
    return settings.nonCommercial
      ? { kind: "permitted" }
      : { kind: "non-commercial-only" };
  return { kind: "forbidden", why: grant.no };
}
