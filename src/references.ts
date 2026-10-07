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
 *   { "schema": 3,
 *     "bib": { "sources": ["paper.tex"], "sha256": "…" },    the bibliography that was checked: the
 *                                                            files TeX reads it from (`paperSources`)
 *     "bibtex": { "databases": ["refs.bib"],                 what the build's bibtex read: the
 *                 "bibitems": ["key", …] },                  `paper.blg` and `paper.bbl` it left
 *     "status": "checked" | "not-checked", "why": "…",       not-checked: nothing could be asked
 *     "entries": [ { "key", "exists", "authors", "why" } ] }
 *                                                            one per entry checked, in its order
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
 * ── WHAT BIBTEX READ, AGAINST WHAT PAPERLINT READ ─────────────────────────────────────
 * The bibliography checked is the one paperlint reads before a build: `paperSources`' decision, and
 * the one bibtex reader. bibtex itself reads differently in two places — it has no comment syntax,
 * so an entry behind `%` or inside `@comment{…}` is one it typesets, and TeX may take a database
 * the static decision does not name. So the step also records what the build's bibtex read, and
 * `paper/refs-checked` names whatever of it paperlint did not see (`unseenBy`). A malformed `.bib`
 * never gets here: bibtex fails on it, and the build fails with bibtex's own lines.
 *
 * 🔴 THE STEP NEVER FAILS THE BUILD. A build without network still builds the PDF; the reference
 * step records `not-checked` and the lint rule says so, as a warning. Recording "not checked" as
 * a pass would be the counter that counts what it never looked at.
 */
import { join, relative, resolve } from "node:path";
import { bibtexRead, type BibtexRead } from "./latex-log.ts";
import { callerPath } from "./caller-path.ts";
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
import { messageOf } from "./domain/text.ts";
import {
  bibTexts,
  databasesOf,
  entriesOf,
  texReads,
  type FoundEntry,
  type BibText,
  type Bibliography,
  type Database,
  type PaperSources,
} from "./domain/paper-sources.ts";
import type { SourcesUnread } from "./paper-sources.ts";

/** 3 since the record holds what the build's bibtex read; an older record reads as none. */
export const REFERENCES_SCHEMA = 3;
export const REFERENCES_FILE = "references.json";

/** The lookup cache's place in a paper: committed, beside the paper's other reproduction files. */
export const LOOKUP_CACHE_FILE = "repro/references-cache.json";

export const lookupCachePath = (paperDir: string): string =>
  join(paperDir, LOOKUP_CACHE_FILE);

/** Where a paper's reference verdicts live — beside `paper.facts.json`. */
export const referencesPath = (paperDir: string): string =>
  join(paperDir, "_build", REFERENCES_FILE);

const text = (files: Files, p: string): string | null => {
  const b = files.readBytes(callerPath(p));
  return b === null ? null : new TextDecoder().decode(b);
};

/**
 * The bibliography the build checks: every text TeX reads for it (`paperSources`, as the build's
 * bibtex observed it — `observed`), and their entries, as the bibtex reader read them. The verdicts are recorded one
 * per entry, in this order: a verdict is about an entry, not about its key.
 */
export interface CheckedBibliography {
  readonly texts: readonly [BibText, ...BibText[]];
  readonly entries: readonly FoundEntry[];
}

/** What a build's bibtex read that paperlint's reading of the paper does not have. */
export interface Unseen {
  /** Databases bibtex opened that the bibliography does not name (for `undecided`: no candidate). */
  readonly databases: readonly string[];
  /** Entries bibtex typeset that the bibtex reader did not read from those databases. */
  readonly keys: readonly string[];
}

/** What a build that ran no bibtex read: nothing — every candidate stays one. */
export const NOTHING_READ: BibtexRead = { databases: [], bibitems: [] };

/**
 * The bibliography as the build observed it. For an `undecided` one, the candidates whose database
 * bibtex opened (`paper.blg`) and paperlint can read: the build's observation decides what the
 * static reading could not, so after a build the entries checked, their verdicts and the post-build
 * comparison are about those databases, not every candidate. When bibtex opened none of them (it did
 * not run), every candidate.
 */
export function observed(s: PaperSources, read: BibtexRead): Bibliography {
  const b = s.bibliography;
  if (b.kind !== "undecided") return b;
  const opened = (d: Database): boolean =>
    read.databases.some(
      (n) => resolve(s.dir, n) === resolve(s.dir, `${d.name}.bib`),
    );
  const [first, ...rest] = b.databases.filter(
    (d) => texReads(d) !== null && opened(d),
  );
  return first === undefined
    ? b
    : { kind: "undecided", databases: [first, ...rest] };
}

/**
 * What `read` — one build's bibtex — has that `s` does not: each database the paper does not name,
 * compared as the file bibtex opens from the paper's directory, and each entry bibtex typeset that
 * the reader did not read from the databases it opened (`observed`).
 */
export function unseenBy(s: PaperSources, read: BibtexRead): Unseen {
  const named = databasesOf(s.bibliography).map((d) =>
    resolve(s.dir, `${d.name}.bib`),
  );
  const keys = new Set(entriesOf(observed(s, read)).map((f) => f.entry.key));
  return {
    databases: read.databases.filter((n) => !named.includes(resolve(s.dir, n))),
    keys: read.bibitems.filter((k) => !keys.has(k)),
  };
}

/**
 * The bibliography a build checks, as its bibtex observed it (`observed`), or null when TeX reads no
 * database for this paper.
 */
export function checkedBibliography(
  s: PaperSources,
  read: BibtexRead,
): CheckedBibliography | null {
  const b = observed(s, read);
  const [first, ...rest] = bibTexts(b);
  if (first === undefined) return null;
  const texts: readonly [BibText, ...BibText[]] = [first, ...rest];
  return { texts, entries: entriesOf(b) };
}

/** The bytes of the databases checked, in order: what a later lint compares to see the record is current. */
export const bibHash = (b: CheckedBibliography): string =>
  sha256Hex(
    new TextEncoder().encode(
      b.texts.map((t) => t.text.slice(t.body.start, t.body.end)).join("\n"),
    ),
  );

/** Why a paper's references are not checked: there is no database TeX reads. */
function nothingToCheck(b: Bibliography): string {
  switch (b.kind) {
    case "none":
      return "no bibliography — nothing to check";
    case "thebibliography":
      return "the bibliography is written by hand (thebibliography) — no database to check";
    case "databases":
    case "undecided":
      return `no bibliography database on disk (${databasesOf(b)
        .map((d) => `${d.name}: ${d.kind}`)
        .join(", ")}) — nothing to check`;
  }
}

/** What `_build/references.json` holds. */
export interface ReferencesDocument {
  readonly schema: number;
  readonly bib: {
    readonly sources: readonly string[];
    readonly sha256: string;
  };
  readonly bibtex: BibtexRead;
  readonly status: "checked" | "not-checked";
  readonly why?: string;
  readonly entries: readonly EntryVerdict[];
}

export const documentOf = (
  paperDir: string,
  bib: CheckedBibliography,
  bibtex: BibtexRead,
  check: ReferencesCheck,
): ReferencesDocument => ({
  schema: REFERENCES_SCHEMA,
  bib: {
    sources: [...new Set(bib.texts.map((t) => relative(paperDir, t.path)))],
    sha256: bibHash(bib),
  },
  bibtex,
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

/** Run the checker over the bibliography's entries; a throw is `not-checked`, with the cache as it was. */
async function run(
  check: CheckReferences,
  bib: CheckedBibliography,
  cache: LookupCache,
): Promise<ReferencesRun> {
  try {
    return await check(
      bib.entries.map((f) => f.entry),
      cache,
    );
  } catch (e) {
    return { check: { kind: "not-checked", why: messageOf(e) }, cache };
  }
}

/** Why there was no paper to read the bibliography of. */
function unread(e: SourcesUnread): string {
  switch (e.kind) {
    case "no-main":
      return "no paper.tex — nothing to check";
    case "not-wired":
      return "references NOT checked — no paper reader was wired into this build; lint will say so";
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
  sources: Result<PaperSources, SourcesUnread>,
  check: CheckReferences,
): Promise<string> {
  if (!sources.ok) return unread(sources.error);
  const paperDir = sources.value.dir;
  const bibtex = bibtexRead(
    text(files, join(paperDir, "paper.blg")) ?? "",
    text(files, join(paperDir, "paper.bbl")) ?? "",
  );
  const bib = checkedBibliography(sources.value, bibtex);
  if (bib === null) return nothingToCheck(sources.value.bibliography);
  const record = (c: ReferencesCheck): ReferencesDocument => {
    const doc = documentOf(paperDir, bib, bibtex, c);
    files.writeAtomic(
      callerPath(referencesPath(paperDir)),
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
  const result = await run(check, bib, cache.value);
  if (result.check.kind === "not-checked") return notChecked(result.check.why);
  const doc = record(result.check);
  const fetched = newAnswers(cache.value, result.cache);
  if (fetched > 0)
    files.writeAtomic(
      callerPath(lookupCachePath(paperDir)),
      new TextEncoder().encode(serializeLookupCache(result.cache)),
    );
  return summary(doc, fetched);
}

/** The note a checked run prints: how many entries, how many failing, what was fetched. */
function summary(doc: ReferencesDocument, fetched: number): string {
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
