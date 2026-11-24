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
  KEY_PATTERN,
  KNOWN_VERSIONS,
  PAPER_ID_KINDS,
  type Copy,
  type Edition,
  type Licence,
  type ParsedCorpus,
  type Paper,
  type PaperIds,
  type CorpusProblem,
  type StrongAcceptProxy,
  type VenueCorpus,
} from "../../domain/venue-corpus.ts";
import type { VenueCorpusCodec } from "../../ports/venue-corpus-codec.ts";

const words = z.string().min(1);
const date = z.iso.date();
/** Where a page or a file was read: a web address, never a local path or another scheme. */
const webUrl = z.url({
  protocol: /^https?$/u,
  error: "an http or https address",
});

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
    read_from: webUrl.optional(),
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
  fetched_from: webUrl.optional(),
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
      url: webUrl,
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
    url: webUrl.optional(),
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
  abstract: z.string().nullable().optional(),
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
    listed_from: webUrl,
  }),
]);

const count = z.number().int().nonnegative();

const proxy = z.strictObject({ what: words, papers: count });

// `capped` and `proxy` are required, and "none" is null: a fact left out is not a fact recorded.
const edition = z.strictObject({
  edition: year,
  listed_from: webUrl,
  read_on: date,
  accepted: count.optional(),
  capped: words.nullable(),
  proxy: proxy.nullable(),
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
    rebuild: z.array(words),
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
  Same<z.output<typeof proxy>, StrongAcceptProxy>,
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

/**
 * One zod issue as a problem. A misspelt key's path ends at the key (the first, when there are
 * several), so a reader of the file lands on it rather than on the object holding it.
 */
const problemOf = (i: z.core.$ZodIssue): CorpusProblem => ({
  path: [
    ...i.path.filter((s) => typeof s !== "symbol"),
    ...(i.code === "unrecognized_keys" ? i.keys.slice(0, 1) : []),
  ],
  message: i.message,
});

/** A `papers.json`'s text, parsed once at the boundary: the record, or every reason it is not one. */
export function parseVenueCorpus(text: string): ParsedCorpus {
  const json = jsonOf(text);
  if (json === undefined)
    return { ok: false, problems: [{ path: [], message: "not JSON" }] };
  const parsed = record.safeParse(json);
  return parsed.success
    ? { ok: true, corpus: parsed.data }
    : { ok: false, problems: parsed.error.issues.map(problemOf) };
}

export const venueCorpusCodec: VenueCorpusCodec = { parse: parseVenueCorpus };

/** Where the shipped JSON Schema of the record sits, below the package root: in the skill that writes it. */
export const SCHEMA_FILE = "skills/study-accepted-papers/papers.schema.json";

/**
 * The JSON Schema of a `papers.json`, generated from the parser's own shape: the fields a skill (or
 * an editor) reads instead of a hand-written table. Shipped as `SCHEMA_FILE`; a test holds the file
 * to this. A schema cannot say that a key is unique, that a paper's edition is a listed one, or that
 * a stored copy names where it was fetched from: `corpus-licences.js` checks those and names the
 * field's path.
 */
export const venueCorpusJsonSchema = (): unknown => ({
  ...z.toJSONSchema(record, { io: "input", unrepresentable: "any" }),
  title: "A venue corpus's papers.json",
  description:
    "The record of a venue corpus, papers.json: one row per paper, every copy with its licence. This schema lists the fields; it cannot express that a key is unique, that a paper's edition is one of editions[].edition, or that a copy that stores a file names where it was fetched from. `node ${CLAUDE_SKILL_DIR}/scripts/corpus-licences.js <venue>` checks those and refuses a wrong record with the path of the field.",
});

/** The shipped file's text: the schema, indented, with a closing newline. */
export const venueCorpusSchemaText = (): string =>
  `${JSON.stringify(venueCorpusJsonSchema(), null, 2)}\n`;
