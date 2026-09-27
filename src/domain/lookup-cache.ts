/**
 * THE LOOKUP CACHE — `<paper>/repro/references-cache.json`: what the citation services ANSWERED,
 * kept so that a build asks each question once, not once per build (#107).
 *
 *   { "schema": 1,
 *     "citations": { "<resolver>:<identifier>": { "fetched": "YYYY-MM-DD", "response": {…} } },
 *     "dblp":      { "<title key>":             { "fetched": "YYYY-MM-DD", "title": "…", "hits": […] } } }
 *
 * `citations` holds verify-cites' per-resolver responses (Crossref, OpenAlex, Semantic Scholar,
 * arXiv, doi.org, NVD), under verify-cites' own cache keys. `dblp` holds the hits DBLP returned for
 * a title, under `dblpTitleKey`. Only successful answers are ever stored: a failed request is not an
 * answer, so the next build asks again.
 *
 * 🔴 RESPONSES, NEVER VERDICTS. The verdicts (`_build/references.json`) are DERIVED from these
 * responses on every build, by the current version of the checkers. A cached verdict would freeze
 * whatever the checker believed the day it ran — a bug fixed in the comparison would never reach a
 * paper whose entries are cached. A cached response is evidence: it cannot be made up, only
 * refetched. The precedent is `extract-ref-facts.mjs`'s `repro/refs-cache.json` ("the cache is
 * evidence, not a second declaration").
 *
 * 🔴 COMMITTED, so CI and every other clone start warm: a build whose entries are all here makes no
 * network request at all, not even the reachability probe. It lives in `repro/`, beside the paper,
 * not in `_build/`, which is build output and gitignored.
 *
 * WHAT INVALIDATES AN ENTRY: its key. Editing a bib entry's DOI, arXiv id or title changes the keys
 * it is looked up under, so only that entry is asked again; nothing expires by date. To refresh an
 * answer, delete its entry, or the file. `fetched` records when each answer was obtained.
 *
 * Parsed here, once, at the boundary: a file that does not match is refused with a named reason,
 * never read as empty.
 */
import { err, ok, type Result } from "./result.ts";
import { sha256Hex } from "./sha256.ts";

export const LOOKUP_CACHE_SCHEMA = 1;

type Json = Readonly<Record<string, unknown>>;

/** One resolver's successful answer, as verify-cites shapes it (`{ transport: "ok", … }`). */
export interface CachedResponse {
  /** When it was fetched, YYYY-MM-DD. */
  readonly fetched: string;
  readonly response: Json;
}

/** One DBLP hit, as bib-authors' `dblpHits` shapes it. */
export interface DblpHit {
  readonly venue: string;
  readonly year: string;
  readonly type: string;
  readonly title: string;
  readonly authors: readonly string[];
}

export interface CachedDblp {
  readonly fetched: string;
  /** The title as it was asked — for a human reading the file; the key is `dblpTitleKey(title)`. */
  readonly title: string;
  readonly hits: readonly DblpHit[];
}

export interface LookupCache {
  readonly citations: ReadonlyMap<string, CachedResponse>;
  readonly dblp: ReadonlyMap<string, CachedDblp>;
}

export const EMPTY_LOOKUP_CACHE: LookupCache = {
  citations: new Map(),
  dblp: new Map(),
};

/**
 * The key a DBLP answer is stored under: the title with case, accents, BibTeX braces and runs of
 * whitespace normalized, hashed. A re-cased or re-braced title in the .bib keeps its answer.
 * Punctuation stays: `C` and `C++` are different works, and a shared key would serve one's
 * answer for the other. A title that differs only in punctuation costs one extra lookup.
 */
export const dblpTitleKey = (title: string): string =>
  sha256Hex(
    new TextEncoder().encode(
      title
        .toLowerCase()
        .normalize("NFKD")
        .replace(/\p{M}+/gu, "")
        .replace(/[{}]/g, "")
        .replace(/\s+/g, " ")
        .trim(),
    ),
  ).slice(0, 16);

const isObject = (v: unknown): v is Json =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const unknownField = (o: Json, known: readonly string[]): string | undefined =>
  Object.keys(o).find((k) => !known.includes(k));
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const isDate = (v: unknown): v is string =>
  typeof v === "string" && DATE.test(v);

/** Parse every value of `section` with `one`, or the first named reason. */
function sectionOf<T>(
  name: string,
  section: unknown,
  known: readonly string[],
  one: (o: Json, at: string) => Result<T, string>,
): Result<Map<string, T>, string> {
  if (!isObject(section)) return err(`\`${name}\`: expected an object`);
  const out = new Map<string, T>();
  for (const [key, v] of Object.entries(section)) {
    const at = `\`${name}.${key}`;
    if (!isObject(v)) return err(`${at}\`: expected an object`);
    const extra = unknownField(v, known);
    if (extra !== undefined) return err(`${at}\`: unknown field \`${extra}\``);
    if (!isDate(v["fetched"]))
      return err(`${at}.fetched\`: expected a date, YYYY-MM-DD`);
    const r = one(v, at);
    if (!r.ok) return r;
    out.set(key, r.value);
  }
  return ok(out);
}

const cachedResponse = (o: Json, at: string): Result<CachedResponse, string> =>
  isObject(o["response"]) && o["response"]["transport"] === "ok"
    ? ok({ fetched: o["fetched"] as string, response: o["response"] })
    : err(
        `${at}.response\`: expected a successful response ({"transport": "ok", …})`,
      );

const isHit = (h: unknown): h is DblpHit =>
  isObject(h) &&
  ["venue", "year", "type", "title"].every((k) => typeof h[k] === "string") &&
  Array.isArray(h["authors"]) &&
  h["authors"].every((a) => typeof a === "string");

function cachedDblp(o: Json, at: string): Result<CachedDblp, string> {
  const { title, hits } = o;
  if (typeof title !== "string") return err(`${at}.title\`: expected a string`);
  if (!Array.isArray(hits)) return err(`${at}.hits\`: expected an array`);
  const bad = hits.findIndex((h) => !isHit(h));
  if (bad !== -1)
    return err(
      `${at}.hits[${String(bad)}]\`: expected {venue, year, type, title: string; authors: string[]}`,
    );
  return ok({
    fetched: o["fetched"] as string,
    title,
    hits: hits as DblpHit[],
  });
}

/** The cache in `text`, or why it cannot be read. */
export function parseLookupCache(text: string): Result<LookupCache, string> {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (e) {
    return err(`not JSON: ${(e as Error).message}`);
  }
  if (!isObject(json))
    return err("expected an object with `schema`, `citations` and `dblp`");
  if (json["schema"] !== LOOKUP_CACHE_SCHEMA)
    return err(
      `schema ${String(json["schema"])}: this paperlint reads schema ${String(LOOKUP_CACHE_SCHEMA)}`,
    );
  const extra = unknownField(json, ["schema", "citations", "dblp"]);
  if (extra !== undefined) return err(`unknown field \`${extra}\``);
  const citations = sectionOf(
    "citations",
    json["citations"],
    ["fetched", "response"],
    cachedResponse,
  );
  if (!citations.ok) return citations;
  const dblp = sectionOf(
    "dblp",
    json["dblp"],
    ["fetched", "title", "hits"],
    cachedDblp,
  );
  if (!dblp.ok) return dblp;
  return ok({ citations: citations.value, dblp: dblp.value });
}

const sorted = <T>(m: ReadonlyMap<string, T>): Record<string, T> =>
  Object.fromEntries([...m.keys()].sort().map((k) => [k, m.get(k) as T]));

/** The cache as the file holds it: keys sorted, so one new answer is a small diff. */
export const serializeLookupCache = (c: LookupCache): string =>
  `${JSON.stringify(
    {
      schema: LOOKUP_CACHE_SCHEMA,
      citations: sorted(c.citations),
      dblp: sorted(c.dblp),
    },
    null,
    2,
  )}\n`;
