/**
 * The schema of a venue corpus's `papers.json` (docs/design/venue-corpus.md, decision 1): a record
 * parses to itself with a paper row's extra fields kept, and every way a file can fail to be one is
 * refused with the zod path of each problem.
 */
import { describe, expect, it } from "vitest";
import type { Paper, VenueCorpus } from "../../domain/venue-corpus.ts";
import { venueCorpusCodec } from "./index.ts";

const parse = venueCorpusCodec.parse;

const LICENCE = {
  id: "CC-BY-4.0",
  read_from: "https://api.crossref.org/works/10.1145/3786167.3788430",
  read_on: "2026-11-03",
} as const;

const COPY = {
  version: "published",
  url: "https://doi.org/10.1145/3786167.3788430",
  licence: LICENCE,
  fetched_from: "https://dl.acm.org/doi/pdf/10.1145/3786167.3788430",
  stored: ["text", "pdf"],
} as const;

const PAPER = {
  key: "2026-01",
  edition: 2026,
  group: "accepted",
  title: "A Catalogue of Evaluation Metrics",
  authors: ["Ingrid Lima", "Paulo Maia"],
  abstract: "LLM-based Multi-Agent frameworks …",
  ids: { doi: "10.1145/3786167.3788430" },
  copies: [COPY],
} as const;

const EDITION = {
  edition: 2026,
  listed_from: "https://conf.researchr.org/home/icse-2026/agent-2026",
  read_on: "2026-11-03",
  accepted: 27,
} as const;

const RECORD = { venue: "agent", editions: [EDITION], papers: [PAPER] };

const text = (v: unknown): string => JSON.stringify(v);
/** The record with its one paper replaced by `paper`. */
const withPaper = (paper: Readonly<Record<string, unknown>>): string =>
  text({ ...RECORD, papers: [paper] });
/** The record with its one paper's one copy replaced by `copy`. */
const withCopy = (copy: Readonly<Record<string, unknown>>): string =>
  withPaper({ ...PAPER, copies: [copy] });

describe("parsing a papers.json", () => {
  it("🔴 the design note's record parses to itself", () => {
    // Guards: a valid record comes back whole, nothing dropped or added.
    expect(parse(text(RECORD))).toEqual({ ok: true, corpus: RECORD });
  });

  it("🔴 a paper row's extra fields are kept, whatever they hold", () => {
    const row = { ...PAPER, award: "distinguished", pages: 8, found_at: null };
    // Guards: a row is loose — the consumer's own fields survive the parse.
    expect(parse(withPaper(row))).toEqual({
      ok: true,
      corpus: { ...RECORD, papers: [row] },
    });
  });

  it("a sister paper names its venue, year and where it was found; an unknown copy stores under NOASSERTION", () => {
    const { edition, ...rest } = PAPER;
    const sister: Paper = {
      ...rest,
      group: "sister",
      venue: "nlbse",
      year: 2025,
      listed_from: "https://nlbse.github.io/2025/",
      ids: { url: "https://nlbse.github.io/2025/papers/7" },
      copies: [
        {
          version: "unknown",
          licence: { id: "NOASSERTION" },
          fetched_from: "https://example.org/7.pdf",
          stored: ["pdf"],
        },
      ],
    };
    const record: VenueCorpus = { ...RECORD, papers: [sister] };
    // Guards: the sister shape and the unknown-origin copy are both representable.
    expect([edition, parse(text(record))]).toEqual([
      2026,
      { ok: true, corpus: record },
    ]);
  });

  it("an unlisted licence id parses: the table, not the parser, judges it", () => {
    const copy = { ...COPY, licence: { ...LICENCE, id: "CC-BY-3.0" } };
    // Guards: one unlisted id does not make the whole record unreadable.
    expect(parse(withCopy(copy))).toEqual({
      ok: true,
      corpus: { ...RECORD, papers: [{ ...PAPER, copies: [copy] }] },
    });
  });
});

describe("a copy whose licence was never read", () => {
  it("🔴 a known copy under NOASSERTION, storing nothing, parses: the record is not the licence check", () => {
    const copy = {
      version: "preprint",
      url: "https://arxiv.org/abs/2601.00001",
      licence: { id: "NOASSERTION" },
      stored: [],
    };
    // Guards: a corpus migrated before its licences were read still validates.
    expect(parse(withCopy(copy))).toEqual({
      ok: true,
      corpus: { ...RECORD, papers: [{ ...PAPER, copies: [copy] }] },
    });
  });
});

/** A file that is no record, and the reasons it is refused with. */
const REFUSED: readonly (readonly [string, string, string])[] = [
  [
    "🔴 a misspelt key in a copy",
    withCopy({ ...COPY, licence: undefined, lisence: LICENCE }),
    'papers.0.copies.0.licence: Invalid input: expected object, received undefined; papers.0.copies.0: Unrecognized key: "lisence"',
  ],
  [
    "🔴 a copy without its licence object",
    withCopy({ ...COPY, licence: undefined }),
    "papers.0.copies.0.licence: Invalid input: expected object, received undefined",
  ],
  [
    "🔴 a key two papers share",
    text({ ...RECORD, papers: [PAPER, { ...PAPER, title: "Other" }] }),
    'papers.1.key: "2026-01" is the key of papers.0 too',
  ],
  [
    "a misspelt key at the top level",
    text({ ...RECORD, edtions: [] }),
    '(top): Unrecognized key: "edtions"',
  ],
  [
    "a misspelt key in a licence",
    withCopy({ ...COPY, licence: { ...LICENCE, read_form: "x" } }),
    'papers.0.copies.0.licence: Unrecognized key: "read_form"',
  ],
  [
    "a licence read from nowhere",
    withCopy({ ...COPY, licence: { id: "CC-BY-4.0" } }),
    "papers.0.copies.0.licence.read_from: a licence other than NOASSERTION names where it was read; papers.0.copies.0.licence.read_on: a licence other than NOASSERTION names when it was read",
  ],
  [
    "NOASSERTION with a source: a licence read is not NOASSERTION",
    withCopy({ ...COPY, licence: { ...LICENCE, id: "NOASSERTION" } }),
    "papers.0.copies.0.licence.read_from: NOASSERTION means the licence was not read; papers.0.copies.0.licence.read_on: NOASSERTION means the licence was not read",
  ],
  [
    "a licence id that is no SPDX id",
    withCopy({ ...COPY, licence: { ...LICENCE, id: "CC BY 4.0" } }),
    "papers.0.copies.0.licence.id: an SPDX license id or a LicenseRef-",
  ],
  [
    "a copy of unknown origin under a licence",
    withCopy({ ...COPY, version: "unknown" }),
    'papers.0.copies.0.licence.id: Invalid input: expected "NOASSERTION"; papers.0.copies.0.licence: Unrecognized keys: "read_from", "read_on"; papers.0.copies.0: Unrecognized key: "url"',
  ],
  [
    "a stored copy that does not say where its bytes came from",
    withCopy({ ...COPY, fetched_from: undefined }),
    "papers.0.copies.0.fetched_from: a copy that stores a file names where it was fetched from",
  ],
  [
    "a kind stored twice by one copy",
    withCopy({ ...COPY, stored: ["pdf", "pdf"] }),
    'papers.0.copies.0.stored: "pdf" is listed twice',
  ],
  [
    "a paper of an edition the record does not list",
    withPaper({ ...PAPER, edition: 2025 }),
    "papers.0.edition: 2025 is not one of editions[].edition (2026)",
  ],
  [
    "an edition listed twice",
    text({ ...RECORD, editions: [EDITION, EDITION] }),
    "editions.1.edition: 2026 is listed twice",
  ],
  [
    "a paper with no id",
    withPaper({ ...PAPER, ids: {} }),
    "papers.0.ids: at least one of doi, arxiv, dblp, s2, url",
  ],
  [
    "a misspelt id",
    withPaper({ ...PAPER, ids: { dio: "10.1/x" } }),
    'papers.0.ids: Unrecognized key: "dio"; papers.0.ids: at least one of doi, arxiv, dblp, s2, url',
  ],
  [
    "a key that cannot name a file",
    withPaper({ ...PAPER, key: "../x" }),
    "papers.0.key: a letter or digit, then letters, digits, '_' or '-'",
  ],
  [
    // Guards: text/<key>.<variant>.txt splits at the first dot, so a dotted key would read as a variant.
    "a key with a dot",
    withPaper({ ...PAPER, key: "2501.15919" }),
    "papers.0.key: a letter or digit, then letters, digits, '_' or '-'",
  ],
];

describe("refusing what is not a papers.json", () => {
  it("text that is not JSON", () => {
    // Guards: a broken file is named as such, not parsed as an empty record.
    expect(parse("{ venue: agent")).toEqual({
      ok: false,
      why: "papers.json is not JSON",
    });
  });

  it.each(REFUSED)("%s", (_name, file, why) => {
    // Guards: the record is refused, and the reason names the path of every problem.
    expect(parse(file)).toEqual({ ok: false, why: `papers.json: ${why}` });
  });
});
