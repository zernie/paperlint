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
 *     "bib": { "sources": ["refs.bib"], "sha256": "…" },     the databases that were checked, as
 *                                                            bibtex names them, and a hash of their text
 *     "status": "checked" | "not-checked", "why": "…",       not-checked: nothing could be asked
 *     "entries": [ { "key", "exists", "authors", "why" } ] }
 *                                                            one per entry checked, in its order
 *
 * A sibling file, not a new field of `paper.facts.json`: those facts are about ONE PDF and are
 * stale when it changes (`pdf_sha256`); these are about the databases and are stale when THEY
 * change (`bib.sha256`). One staleness key per file, the way `pdf/fresh` already works.
 *
 * 🔴 WHAT THE CHECKERS ANSWERED IS KEPT, COMMITTED, IN `<paper>/repro/references-cache.json`
 * (`domain/lookup-cache.ts`). Loaded before the check and saved after it — only when something new
 * was fetched, a refreshed answer included — so a build asks each question at most once every
 * MAX_AGE_DAYS, not once per build (#107: 217 s for 27 references, every build). The verdicts above are NOT cached: they are derived from the cached
 * answers on every build, so a fix to the checkers reaches every paper at once.
 *
 * ── WHICH DATABASES, AND WHAT BIBTEX TYPESET ───────────────────────────────────────────
 * The databases checked are the ones the build's bibtex OPENED (`_build/sources.json`, written by
 * `sources-record.ts` from TeX's own files; docs/design/paper-sources.md §1) — nothing here reads
 * TeX source to decide which. Their entries are read by the one bibtex reader. bibtex reads
 * differently from it in one place: it has no comment syntax, so an entry behind `%` or inside
 * `@comment{…}` is one it typesets and the reader does not see. The record holds the keys bibtex
 * typeset, so `paper/refs-checked` names the ones no entry of those databases has (`unseenKeys`).
 * A malformed `.bib` never gets here: bibtex fails on it, and the build fails with bibtex's own lines.
 *
 * Without a record of the build, or with one the paper has changed since, there is no answer to
 * "which databases": the step checks nothing, and the rules are silent — `paper/sources-fresh` speaks.
 *
 * 🔴 THE STEP NEVER FAILS THE BUILD. A build without network still builds the PDF; the reference
 * step records `not-checked` and the lint rule says so, as a warning. Recording "not checked" as
 * a pass would be the counter that counts what it never looked at.
 */
import { join, resolve } from "node:path";
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
import type { BibEntry, BibText } from "./domain/paper-sources.ts";
import { describeChanges } from "./domain/sources-record.ts";
import {
  openedDatabases,
  paperRecord,
  type PaperRecord,
  type RecordReadDeps,
} from "./paper-record.ts";
import type { BibReader } from "./ports/bib-reader.ts";

/** 3: the record of what bibtex read lives in `_build/sources.json`; an older one reads as none. */
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

/** `xs` without the elements whose `key` an earlier one has, in order. */
const distinctBy = <T>(xs: readonly T[], key: (x: T) => string): readonly T[] =>
  xs.filter((x, i) => xs.findIndex((o) => key(o) === key(x)) === i);

/** A database the build's bibtex opened, read as the bibtex reader reads it. */
export interface CheckedDatabase {
  /** As bibtex names it: `refs.bib`, `bibs/x.bib`. */
  readonly name: string;
  /** A `.bib` TeX wrote (a `filecontents` block), not one the author keeps. */
  readonly written: boolean;
  readonly bib: BibText;
}

/** One entry of a checked database: where it was read, and the entry. */
export interface CheckedEntry {
  readonly database: CheckedDatabase;
  readonly entry: BibEntry;
}

/**
 * The bibliography the build checks: the databases bibtex opened, in the order it opened them, and
 * their entries as the bibtex reader read them. The verdicts are recorded one per entry, in this
 * order: a verdict is about an entry, not about its key.
 */
export interface CheckedBibliography {
  readonly databases: readonly [CheckedDatabase, ...CheckedDatabase[]];
  readonly entries: readonly CheckedEntry[];
  /** The keys bibtex typeset, in the order it did: the `.bbl`'s `\bibitem`s. */
  readonly typeset: readonly string[];
}

/** What reading the bibliography takes: the record's readers, and the bibtex reader. */
export interface BibliographyDeps extends RecordReadDeps {
  readonly bib: BibReader;
}

/** What a paper's record comes to for the references. */
export type BibliographyRead =
  | { readonly kind: "read"; readonly bibliography: CheckedBibliography }
  /** No record of the build, an unreadable one, or one the paper has changed since. */
  | {
      readonly kind: "no-record";
      readonly record: Exclude<PaperRecord, { readonly kind: "fresh" }>;
    }
  /** bibtex opened no database: the build ran none, or the paper names none. */
  | { readonly kind: "nothing" }
  /** Databases bibtex opened that are not on disk now (a `.bib` TeX wrote and a clean removed). */
  | { readonly kind: "unread"; readonly databases: readonly string[] }
  /** The build was not given a reader. */
  | { readonly kind: "not-wired" };

/**
 * The bibliography the build recorded for the paper in `dir`: the databases bibtex opened, read by
 * the bibtex reader. Only a fresh record answers (`paperRecord`).
 */
export function readBibliography(
  dir: string,
  deps: BibliographyDeps,
): BibliographyRead {
  const rec = paperRecord(dir, deps);
  if (rec.kind !== "fresh") return { kind: "no-record", record: rec };
  const opened = distinctBy(openedDatabases(dir, rec.record, deps), (d) =>
    resolve(dir, d.name),
  );
  const databases = opened.flatMap((d) =>
    d.bib === null ? [] : [{ name: d.name, written: d.written, bib: d.bib }],
  );
  if (databases.length < opened.length)
    return {
      kind: "unread",
      databases: opened.filter((d) => d.bib === null).map((d) => d.name),
    };
  const [first, ...rest] = databases;
  const bibtex = rec.record.bibtex;
  if (first === undefined || !bibtex.ran) return { kind: "nothing" };
  return {
    kind: "read",
    bibliography: {
      databases: [first, ...rest],
      entries: databases.flatMap((database) =>
        database.bib.entries.map((entry) => ({ database, entry })),
      ),
      typeset: bibtex.keys,
    },
  };
}

/** A paper's bibliography by its directory — what the build's steps are handed by the composition root. */
export type ReadBibliography = (dir: string) => BibliographyRead;

/** `readBibliography` over `deps`, as a `ReadBibliography`. */
export const bibliographyReader =
  (deps: BibliographyDeps): ReadBibliography =>
  (dir) =>
    readBibliography(dir, deps);

/** No reader: the build was not given one. Never "no bibliography" — it says so. */
export const notWiredBibliography: ReadBibliography = () => ({
  kind: "not-wired",
});

/**
 * The keys bibtex typeset that no entry the reader read has — an entry behind `%` or inside
 * `@comment{…}`, which bibtex reads and the reader does not. In the order bibtex typeset them, each
 * once. bibtex's keys are case-insensitive (`\cite{SMITH}` typesets `\bibitem{SMITH}` from an entry
 * `smith`, measured), so they are compared so.
 */
export function unseenKeys(b: CheckedBibliography): readonly string[] {
  const read = new Set(b.entries.map((e) => e.entry.key.toLowerCase()));
  return distinctBy(
    b.typeset.filter((k) => !read.has(k.toLowerCase())),
    (k) => k.toLowerCase(),
  );
}

/** The bytes of the databases checked, in order: what a later lint compares to see the verdicts are current. */
export const bibHash = (b: CheckedBibliography): string =>
  sha256Hex(
    new TextEncoder().encode(
      b.databases
        .map((d) => d.bib.text.slice(d.bib.body.start, d.bib.body.end))
        .join("\n"),
    ),
  );

/** What `_build/references.json` holds. */
export interface ReferencesDocument {
  readonly schema: number;
  readonly bib: {
    readonly sources: readonly string[];
    readonly sha256: string;
  };
  readonly status: "checked" | "not-checked";
  readonly why?: string;
  readonly entries: readonly EntryVerdict[];
}

export const documentOf = (
  bib: CheckedBibliography,
  check: ReferencesCheck,
): ReferencesDocument => ({
  schema: REFERENCES_SCHEMA,
  bib: {
    sources: bib.databases.map((d) => d.name),
    sha256: bibHash(bib),
  },
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

/** Why the build's record cannot say which databases were read, in the words a note carries. */
function noRecord(
  r: Extract<BibliographyRead, { readonly kind: "no-record" }>["record"],
): string {
  switch (r.kind) {
    case "none":
      return r.unreadable === null
        ? "the build recorded no sources (_build/sources.json was not written)"
        : `_build/sources.json cannot be used (${r.unreadable})`;
    case "stale":
      return `the paper changed since the build recorded it (${describeChanges(r.changed)})`;
  }
}

/** The note for a paper whose bibliography was not read. */
function unreadNote(
  read: Exclude<BibliographyRead, { readonly kind: "read" }>,
): string {
  switch (read.kind) {
    case "no-record":
      return `references NOT checked — ${noRecord(read.record)}; lint will say so`;
    case "nothing":
      return "no bibliography database — bibtex opened none, nothing to check";
    case "unread":
      return `references NOT checked — ${read.databases.join(", ")}, which bibtex opened, is not on disk; lint will say so`;
    case "not-wired":
      return "references NOT checked — no bibliography reader was wired into this build; lint will say so";
  }
}

/**
 * The build step's work: check the bibliography the build recorded, serving what it can from the
 * paper's lookup cache, and record the verdicts. Returns the one-line note the build prints. A
 * checker that throws, or a cache that does not parse, is recorded as `not-checked` — the step
 * reports, it never refuses. A cache that does not parse is left as it is, and named.
 */
export async function recordReferences(
  files: Files,
  paperDir: string,
  read: BibliographyRead,
  check: CheckReferences,
): Promise<string> {
  if (read.kind !== "read") return unreadNote(read);
  const bib = read.bibliography;
  const record = (c: ReferencesCheck): ReferencesDocument => {
    const doc = documentOf(bib, c);
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
