/**
 * THE REFERENCES A BUILD CHECKED — `<paper>/_build/references.json`, written by `paperlint build`
 * and read, offline, by the lint rules in `reference-rules.ts`.
 *
 * The package ships two online checks: `verify-cites` (the cited work exists and its title
 * matches) and `bib-authors` (the authors are those of the version cited, not the preprint's).
 * Until 3.0.0 lint could only ask whether someone had run them — by finding the word
 * "bib-authors" in a scorecard table, or a command the project configured. Now the build runs
 * them and records the result as data, beside the facts it already writes about the PDF:
 *
 *   { "schema": 1,
 *     "bib": { "source": "paper.tex", "sha256": "…" },       the bibliography that was checked
 *     "status": "checked" | "not-checked", "why": "…",       not-checked: nothing could be asked
 *     "entries": [ { "key", "exists", "authors", "why" } ] }
 *
 * A sibling file, not a new field of `paper.facts.json`: those facts are about ONE PDF and are
 * stale when it changes (`pdf_sha256`); these are about the bibliography and are stale when IT
 * changes (`bib.sha256`). One staleness key per file, the way `pdf/fresh` already works.
 *
 * 🔴 WHAT THE CHECKERS ANSWERED IS KEPT, COMMITTED, IN `<paper>/repro/references-cache.json`
 * (`domain/lookup-cache.ts`). Loaded before the check and saved after it — only when something new
 * was fetched, a refreshed answer included — so a build asks each question at most once every
 * MAX_AGE_DAYS, not once per build (#107: 217 s for 27 references, every build). The verdicts above are NOT cached: they are derived from the cached
 * answers on every build, so a fix to the checkers reaches every paper at once.
 *
 * 🔴 THE STEP NEVER FAILS THE BUILD. A build without network still builds the PDF; the reference
 * step records `not-checked` and the lint rule says so, as a warning. Recording "not checked" as
 * a pass would be the counter that counts what it never looked at.
 */
import { join } from "node:path";
import type { AbsolutePath } from "./domain/paths.ts";
import { sha256Hex } from "./domain/sha256.ts";
import type { Files } from "./ports/files.ts";
import {
  EMPTY_LOOKUP_CACHE,
  parseLookupCache,
  serializeLookupCache,
  type LookupCache,
} from "./domain/lookup-cache.ts";
import { ok, type Result } from "./domain/result.ts";
import type {
  CheckReferences,
  EntryVerdict,
  ReferencesCheck,
  ReferencesRun,
} from "./ports/check-references.ts";
import { bibRange } from "#eslint-rules/paper-typography";

export const REFERENCES_SCHEMA = 1;
export const REFERENCES_FILE = "references.json";

/** The lookup cache's place in a paper: committed, beside the paper's other reproduction files. */
export const LOOKUP_CACHE_FILE = "repro/references-cache.json";

export const lookupCachePath = (paperDir: string): string =>
  join(paperDir, LOOKUP_CACHE_FILE);

/** Where a paper's reference verdicts live — beside `paper.facts.json`. */
export const referencesPath = (paperDir: string): string =>
  join(paperDir, "_build", REFERENCES_FILE);

const at = (p: string): AbsolutePath => p as AbsolutePath;
const text = (files: Files, p: string): string | null => {
  const b = files.readBytes(at(p));
  return b === null ? null : new TextDecoder().decode(b);
};

/** The bibliography a paper carries: inside `paper.tex` (`filecontents`), else `refs.bib`. */
export interface Bibliography {
  readonly source: "paper.tex" | "refs.bib";
  readonly text: string;
  /** Where `text` starts in the source file — so a finding can point at an entry. */
  readonly offset: number;
}

export function bibliographyOf(
  files: Files,
  paperDir: string,
): Bibliography | null {
  const tex = text(files, join(paperDir, "paper.tex"));
  const inline = tex === null ? null : bibRange(tex);
  if (inline)
    return { source: "paper.tex", text: inline.body, offset: inline.bodyStart };
  const bib = text(files, join(paperDir, "refs.bib"));
  return bib === null ? null : { source: "refs.bib", text: bib, offset: 0 };
}

export const bibHash = (b: Bibliography): string =>
  sha256Hex(new TextEncoder().encode(b.text));

/** What `_build/references.json` holds. */
export interface ReferencesDocument {
  readonly schema: number;
  readonly bib: { readonly source: string; readonly sha256: string };
  readonly status: "checked" | "not-checked";
  readonly why?: string;
  readonly entries: readonly EntryVerdict[];
}

export const documentOf = (
  bib: Bibliography,
  check: ReferencesCheck,
): ReferencesDocument => ({
  schema: REFERENCES_SCHEMA,
  bib: { source: bib.source, sha256: bibHash(bib) },
  ...(check.kind === "checked"
    ? { status: "checked" as const, entries: check.entries }
    : { status: "not-checked" as const, why: check.why, entries: [] }),
});

/** A parsed `references.json` of this schema, its entries a list. */
const isReferencesDocument = (d: unknown): d is ReferencesDocument =>
  typeof d === "object" &&
  d !== null &&
  "schema" in d &&
  d.schema === REFERENCES_SCHEMA &&
  "entries" in d &&
  Array.isArray(d.entries);

/** The recorded verdicts, or null when there are none or they do not parse. */
export function readReferences(
  files: Files,
  paperDir: string,
): ReferencesDocument | null {
  const raw = text(files, referencesPath(paperDir));
  if (raw === null) return null;
  try {
    const d: unknown = JSON.parse(raw);
    return isReferencesDocument(d) ? d : null;
  } catch {
    return null;
  }
}

/** The paper's lookup cache: empty when there is none, or why the file on disk cannot be read. */
export function readLookupCache(
  files: Files,
  paperDir: string,
): Result<LookupCache, string> {
  const raw = text(files, lookupCachePath(paperDir));
  return raw === null ? ok(EMPTY_LOOKUP_CACHE) : parseLookupCache(raw);
}

/**
 * How many answers the run fetched: entries of `after` that are not the very object `before` held
 * under that key. The checker keeps every answer it did not fetch as the same object, so this counts
 * both new keys and answers asked again past MAX_AGE_DAYS under an existing key — which a count of
 * keys would miss, leaving the refreshed answer unwritten and asked again on every build.
 */
const newAnswers = (before: LookupCache, after: LookupCache): number => {
  const changed = <V>(b: ReadonlyMap<string, V>, a: ReadonlyMap<string, V>) =>
    [...a].filter(([k, v]) => b.get(k) !== v).length;
  return (
    changed(before.citations, after.citations) +
    changed(before.dblp, after.dblp)
  );
};

/** Run the checker; a throw is `not-checked`, with the cache as it was. */
async function run(
  check: CheckReferences,
  bib: string,
  cache: LookupCache,
): Promise<ReferencesRun> {
  try {
    return await check(bib, cache);
  } catch (e) {
    return { check: { kind: "not-checked", why: (e as Error).message }, cache };
  }
}

/**
 * The build step's work: check the bibliography, serving what it can from the paper's lookup
 * cache, and record the verdicts. Returns the one-line note the build prints. A checker that
 * throws, or a cache that does not parse, is recorded as `not-checked` — the step reports, it
 * never refuses. A cache that does not parse is left as it is, and named.
 */
export async function recordReferences(
  files: Files,
  paperDir: string,
  check: CheckReferences,
): Promise<string> {
  const bib = bibliographyOf(files, paperDir);
  if (bib === null) return "no bibliography — nothing to check";
  const record = (c: ReferencesCheck): ReferencesDocument => {
    const doc = documentOf(bib, c);
    files.writeAtomic(
      at(referencesPath(paperDir)),
      new TextEncoder().encode(`${JSON.stringify(doc, null, 2)}\n`),
    );
    return doc;
  };
  const notChecked = (why: string): string => {
    record({ kind: "not-checked", why });
    return `references NOT checked — ${why}; lint will say so`;
  };
  const cache = readLookupCache(files, paperDir);
  if (!cache.ok)
    return notChecked(
      `${LOOKUP_CACHE_FILE} cannot be read (${cache.error}) — fix it, or delete it to ask every question again`,
    );
  const result = await run(check, bib.text, cache.value);
  if (result.check.kind === "not-checked") return notChecked(result.check.why);
  const doc = record(result.check);
  const fetched = newAnswers(cache.value, result.cache);
  if (fetched > 0)
    files.writeAtomic(
      at(lookupCachePath(paperDir)),
      new TextEncoder().encode(serializeLookupCache(result.cache)),
    );
  const bad = doc.entries.filter(
    (e) => e.exists === "false" || e.authors === "mismatch",
  ).length;
  return (
    `references: ${String(doc.entries.length)} checked, ${String(bad)} failing → _build/${REFERENCES_FILE}; ` +
    (fetched > 0
      ? `${String(fetched)} new answer${fetched === 1 ? "" : "s"} → ${LOOKUP_CACHE_FILE}`
      : "nothing fetched")
  );
}
