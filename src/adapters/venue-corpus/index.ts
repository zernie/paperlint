/**
 * The schema of a venue corpus's `papers.json` — the one place its shape is checked
 * (docs/design/venue-corpus.md, decision 1). The text is parsed once, here, into the domain's
 * `VenueCorpus`; whatever reads a record after it never re-validates. The study registry's pattern
 * (`src/adapters/study-registry/`).
 *
 * The top level, an edition, a copy, a licence and a paper's ids are strict, so a misspelt key is an
 * error. A paper row is loose: a consumer's scripts read their own fields from it. A licence id is
 * checked for its shape only: whether the id permits anything is `src/domain/licence.ts`'s table, so
 * one unlisted id does not make the record unreadable.
 */
import { z } from "zod";
import {
  isLicenceId,
  NOASSERTION,
  STORED_KINDS,
} from "../../domain/licence.ts";
import {
  CORPUS_RECORD,
  KEY_PATTERN,
  KNOWN_VERSIONS,
  PAPER_ID_KINDS,
  type Copy,
  type Edition,
  type Licence,
  type ParsedCorpus,
  type Paper,
  type PaperIds,
  type VenueCorpus,
} from "../../domain/venue-corpus.ts";
import type { VenueCorpusCodec } from "../../ports/venue-corpus-codec.ts";

const words = z.string().min(1);
const date = z.iso.date();

/** The index of each value that occurs earlier in `values`, with the index of its first. */
const repeats = (
  values: readonly unknown[],
): readonly (readonly [number, number])[] =>
  values.flatMap((v, i) => {
    const first = values.indexOf(v);
    return first === i ? [] : [[i, first] as const];
  });

const licenceId = z
  .string()
  .refine(isLicenceId, "an SPDX license id or a LicenseRef-");

const notRead = z.strictObject({ id: z.literal(NOASSERTION) });

/** A licence: NOASSERTION alone, or any other id with where and when it was read. */
const licence = z
  .strictObject({
    id: licenceId,
    read_from: z.url().optional(),
    read_on: date.optional(),
  })
  .transform((l, ctx): Licence => {
    const fields = ["read_from", "read_on"] as const;
    const noneRead = l.id === NOASSERTION;
    const wrong = fields.filter((f) => (l[f] === undefined) !== noneRead);
    wrong.forEach((f) => {
      ctx.addIssue({
        code: "custom",
        path: [f],
        message: noneRead
          ? "NOASSERTION means the licence was not read"
          : `a licence other than NOASSERTION names ${f === "read_from" ? "where" : "when"} it was read`,
      });
    });
    return l.read_from === undefined || l.read_on === undefined
      ? { id: NOASSERTION }
      : { id: l.id, read_from: l.read_from, read_on: l.read_on };
  });

const storage = {
  stored: z.array(z.enum(STORED_KINDS)),
  fetched_from: z.url().optional(),
};

/** Each kind at most once, and a stored copy names where its bytes came from. */
const stores = (
  c: Readonly<{ stored: readonly string[]; fetched_from?: string | undefined }>,
  ctx: Readonly<z.core.$RefinementCtx>,
): void => {
  repeats(c.stored).forEach(([i]) => {
    ctx.addIssue({
      code: "custom",
      path: ["stored"],
      message: `"${String(c.stored[i])}" is listed twice`,
    });
  });
  if (c.stored.length > 0 && c.fetched_from === undefined)
    ctx.addIssue({
      code: "custom",
      path: ["fetched_from"],
      message: "a copy that stores a file names where it was fetched from",
    });
};

const copy = z.discriminatedUnion("version", [
  z
    .strictObject({
      version: z.enum(KNOWN_VERSIONS),
      url: z.url(),
      licence,
      ...storage,
    })
    .superRefine(stores),
  z
    .strictObject({
      version: z.literal("unknown"),
      licence: notRead,
      ...storage,
    })
    .superRefine(stores),
]);

const ids = z
  .strictObject({
    doi: words.optional(),
    arxiv: words.optional(),
    dblp: words.optional(),
    s2: words.optional(),
    url: z.url().optional(),
  })
  .refine(
    (i) => Object.values(i).some((v) => v !== undefined),
    `at least one of ${PAPER_ID_KINDS.join(", ")}`,
  );

const paperFields = {
  key: z
    .string()
    .regex(KEY_PATTERN, "a letter or digit, then letters, digits, '_' or '-'"),
  title: words,
  authors: z.array(words).optional(),
  abstract: z.string().optional(),
  ids,
  copies: z.array(copy),
};

const year = z.number().int().positive();

const paper = z.discriminatedUnion("group", [
  z.looseObject({
    ...paperFields,
    group: z.enum(["accepted", "award"]),
    edition: year,
  }),
  z.looseObject({
    ...paperFields,
    group: z.literal("sister"),
    venue: words,
    year,
    listed_from: z.url(),
  }),
]);

const edition = z.strictObject({
  edition: year,
  listed_from: z.url(),
  read_on: date,
  accepted: z.number().int().nonnegative().optional(),
});

/** Keys unique, editions unique, and every paper of this venue of a listed edition. */
const consistent = (
  r: Readonly<{ editions: readonly Edition[]; papers: readonly Paper[] }>,
  ctx: Readonly<z.core.$RefinementCtx>,
): void => {
  const years = r.editions.map((e) => e.edition);
  repeats(years).forEach(([i]) => {
    ctx.addIssue({
      code: "custom",
      path: ["editions", i, "edition"],
      message: `${String(years[i])} is listed twice`,
    });
  });
  const keys = r.papers.map((p) => p.key);
  repeats(keys).forEach(([i, first]) => {
    ctx.addIssue({
      code: "custom",
      path: ["papers", i, "key"],
      message: `"${String(keys[i])}" is the key of papers.${String(first)} too`,
    });
  });
  r.papers.forEach((p, i) => {
    if (p.group !== "sister" && !years.includes(p.edition))
      ctx.addIssue({
        code: "custom",
        path: ["papers", i, "edition"],
        message: `${String(p.edition)} is not one of editions[].edition (${years.join(", ")})`,
      });
  });
};

const record = z
  .strictObject({
    venue: words,
    editions: z.array(edition),
    papers: z.array(paper),
  })
  .superRefine(consistent);

// ── the schemas ARE the domain's types (as in the study registry's adapter) ──────────────────

/** `T`, readonly all the way down: zod's outputs are mutable, the domain's are not. */
type Frozen<T> = T extends readonly (infer U)[]
  ? readonly Frozen<U>[]
  : T extends object
    ? { readonly [K in keyof T]: Frozen<T[K]> }
    : T;

/** True when `A` and `B`, both made readonly all the way down, are one type. */
type Same<A, B> =
  (<T>() => T extends Frozen<A> ? readonly [T] : 2) extends <
    T,
  >() => T extends Frozen<B> ? readonly [T] : 2
    ? true
    : false;

/** Compiles only when every schema's output is its domain type. */
export type SchemasAreTheDomain = [
  Same<z.output<typeof record>, VenueCorpus>,
  Same<z.output<typeof edition>, Edition>,
  Same<z.output<typeof paper>, Paper>,
  Same<z.output<typeof copy>, Copy>,
  Same<z.output<typeof licence>, Licence>,
  Same<z.output<typeof ids>, PaperIds>,
] extends true[]
  ? true
  : never;

/** The proof is used, so the build checks it. */
export const SCHEMAS_ARE_THE_DOMAIN: SchemasAreTheDomain = true;

/** The JSON `text` holds, or undefined when it is not JSON. */
function jsonOf(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** A `papers.json`'s text, parsed once at the boundary: the record, or every reason it is not one. */
export function parseVenueCorpus(text: string): ParsedCorpus {
  const json = jsonOf(text);
  if (json === undefined)
    return { ok: false, why: `${CORPUS_RECORD} is not JSON` };
  const parsed = record.safeParse(json);
  if (parsed.success) return { ok: true, corpus: parsed.data };
  const reasons = parsed.error.issues.map(
    (i) => `${i.path.length === 0 ? "(top)" : i.path.join(".")}: ${i.message}`,
  );
  return { ok: false, why: `${CORPUS_RECORD}: ${reasons.join("; ")}` };
}

export const venueCorpusCodec: VenueCorpusCodec = { parse: parseVenueCorpus };
