/**
 * The online reference checks, as the `CheckReferences` port: `verify-cites` (the cited work
 * exists, the title matches — Crossref, OpenAlex, Semantic Scholar, arXiv) and `bib-authors` (the
 * authors are the published version's — DBLP). Both ship in this package's verify-citations skill;
 * this adapter only runs them, shapes their answers, and serves them from the paper's lookup cache.
 *
 * 🔴 THE CACHE HOLDS ANSWERS, AND ONLY THE CHECKERS' OWN SEAMS TOUCH IT. verify-cites takes a
 * `cache` object keyed per resolver × identifier and stores only successful responses; it is
 * handed the paper's cached responses and whatever it adds is new. bib-authors takes a `lookup`
 * (title → DBLP hits) and a `pause`; the lookup is wrapped to answer from the cache, and the pause
 * is skipped after a cached answer — DBLP's 900 ms pace and its retries run only for titles never
 * answered. Neither checker's logic changes. Verdicts are derived from the answers on every build
 * (`domain/lookup-cache.ts` says why).
 *
 * "Not checked" is decided up front, by one request: when Crossref cannot be reached at all, the
 * checkers would degrade every entry to `unresolvable` / `unchecked`, which reads like a result.
 * Saying `not-checked` with the reason is the honest record. That request is skipped when every
 * question this bibliography would ask is already answered in the cache: a warm build is offline.
 */
import type {
  CheckReferences,
  EntryVerdict,
} from "../../ports/check-references.ts";
import {
  dblpTitleKey,
  type CachedDblp,
  type CachedResponse,
  type DblpHit,
  type LookupCache,
} from "../../domain/lookup-cache.ts";
import { mapLimit } from "./pool.ts";
import { unreachable } from "./reach.io.ts";
import { sleep, todayUtc } from "./clock.io.ts";

/** Citations looked up at once (#107). */
const LOOKUPS_IN_FLIGHT = 6;
// @ts-expect-error — a skill script in .mjs, it has no types
import * as cites from "../../../skills/verify-citations/scripts/verify-cites.mjs";
// @ts-expect-error — a skill script in .mjs, it has no types
import * as authors from "../../../skills/verify-citations/scripts/bib-authors.mjs";

interface CiteResult {
  readonly id: string;
  readonly verdict: "true" | "false" | "unresolvable";
  readonly reason?: string;
}
interface AuthorFinding {
  readonly key: string;
  readonly venue: string;
  readonly missing: readonly string[];
  readonly extra: readonly string[];
  readonly orderDiffers: boolean;
}
interface KeyWhy {
  readonly key: string;
  readonly why: string;
}

const describeAuthors = (f: AuthorFinding): string =>
  [
    f.missing.length ? `missing ${f.missing.join(", ")}` : "",
    f.extra.length ? `extra ${f.extra.join(", ")}` : "",
    f.orderDiffers ? "order differs" : "",
  ]
    .filter(Boolean)
    .join("; ") + ` (DBLP: ${f.venue})`;

interface AuthorBuckets {
  readonly findings: readonly AuthorFinding[];
  readonly skipped: readonly KeyWhy[];
  readonly unchecked: readonly KeyWhy[];
  readonly matched: readonly string[];
}

const authorsOf = (key: string, a: AuthorBuckets): EntryVerdict["authors"] =>
  a.findings.some((f) => f.key === key)
    ? "mismatch"
    : a.unchecked.some((u) => u.key === key)
      ? "unchecked"
      : a.matched.includes(key)
        ? "match"
        : "skipped";

/** One entry's verdict from the two checkers' answers. */
function entryVerdict(
  key: string,
  found: readonly CiteResult[],
  a: AuthorBuckets,
): EntryVerdict {
  const c = found.find((x) => x.id === key);
  const mismatch = a.findings.find((f) => f.key === key);
  const why = [
    c && c.verdict !== "true" ? c.reason : undefined,
    mismatch ? describeAuthors(mismatch) : undefined,
    a.unchecked.find((u) => u.key === key)?.why,
  ]
    .filter(Boolean)
    .join("; ");
  return {
    key,
    exists: c?.verdict ?? "unresolvable",
    authors: authorsOf(key, a),
    ...(why ? { why } : {}),
  };
}

interface BibAuthorsEntry {
  readonly key: string;
  readonly title: string;
  readonly author: string;
}

/** Whether bib-authors will ask DBLP about this entry — the filter its `checkAuthors` applies. */
const asksDblp = (e: BibAuthorsEntry): boolean =>
  Boolean(e.title && e.author) &&
  (authors.claimsPublished(e) as boolean) &&
  !(authors.truncated(e.author) as boolean);

/** Is every question this bibliography would ask already answered in `cache`? */
function fullyCached(
  citations: readonly object[],
  entries: readonly BibAuthorsEntry[],
  cache: LookupCache,
): boolean {
  return (
    citations.every((c) =>
      (cites.cacheKeysFor(c) as string[]).every((k) => cache.citations.has(k)),
    ) &&
    entries.filter(asksDblp).every((e) => cache.dblp.has(dblpTitleKey(e.title)))
  );
}

export interface ReferencesCheckerOptions {
  /** The day a new answer is stamped with, YYYY-MM-DD. */
  readonly today: () => string;
}

/**
 * bib-authors' `lookup` and `pause`, answering from the cached DBLP hits first. The pause after a
 * cached answer is skipped: DBLP's pace protects DBLP, and a cached answer did not ask it.
 */
function cachedDblp(cache: LookupCache, today: () => string) {
  const dblp = new Map<string, CachedDblp>(cache.dblp);
  let lastWasCached = false;
  return {
    dblp,
    lookup: async (title: string): Promise<readonly DblpHit[]> => {
      const hit = dblp.get(dblpTitleKey(title));
      lastWasCached = hit !== undefined;
      if (hit) return hit.hits;
      const hits = (await authors.dblpHits(title)) as DblpHit[];
      dblp.set(dblpTitleKey(title), { fetched: today(), title, hits });
      return hits;
    },
    pause: (ms: number): Promise<void> =>
      lastWasCached ? Promise.resolve() : sleep(ms),
  };
}

/**
 * The cache after a run: the old answers plus every new one, dated today — or the very object
 * passed in when nothing was fetched, so the caller can tell there is nothing to write.
 */
function grown(
  cache: LookupCache,
  store: Readonly<Record<string, unknown>>,
  dblp: ReadonlyMap<string, CachedDblp>,
  today: () => string,
): LookupCache {
  const fresh = Object.entries(store).filter(([k]) => !cache.citations.has(k));
  if (fresh.length === 0 && dblp.size === cache.dblp.size) return cache;
  const dated = fresh.map(([k, response]): [string, CachedResponse] => [
    k,
    { fetched: today(), response: response as CachedResponse["response"] },
  ]);
  return { citations: new Map([...cache.citations, ...dated]), dblp };
}

/** The checker, with its clock injected; `onlineReferences` is the one the CLI wires. */
export const referencesChecker =
  ({ today }: ReferencesCheckerOptions): CheckReferences =>
  async (bib, cache) => {
    const citations = (cites.parseBib(bib) as { id?: string }[]).filter(
      (c) => c.id,
    );
    const parsed = authors.parseBib(bib) as BibAuthorsEntry[];
    if (!fullyCached(citations, parsed, cache)) {
      const why = await unreachable();
      if (why !== null) return { check: { kind: "not-checked", why }, cache };
    }
    // 🔴 #107: the lookups run LOOKUPS_IN_FLIGHT at a time, and the DBLP author pass runs beside
    // them. Each citation's own requests go to four different services one after another, so a
    // pool of 6 is at most 6 requests to any one of them. The store is shared: two citations with
    // the same identifier may both miss it and ask twice — an extra request, never a different
    // answer.
    const store: Record<string, unknown> = Object.fromEntries(
      [...cache.citations].map(([k, v]) => [k, v.response]),
    );
    const d = cachedDblp(cache, today);
    const [found, a] = await Promise.all([
      mapLimit(
        citations,
        LOOKUPS_IN_FLIGHT,
        (c) =>
          cites.verifyCitationLive(c, { cache: store }) as Promise<CiteResult>,
      ),
      authors.checkAuthors(parsed, {
        lookup: d.lookup,
        pause: d.pause,
      }) as Promise<AuthorBuckets>,
    ]);
    const keys = new Set([
      ...found.map((c) => c.id),
      ...a.findings.map((f) => f.key),
    ]);
    const entries = [...keys].map((key) => entryVerdict(key, found, a));
    return {
      check: { kind: "checked", entries },
      cache: grown(cache, store, d.dblp, today),
    };
  };

/** The checker the CLI wires: the real clock. */
export const onlineReferences: CheckReferences = referencesChecker({
  today: todayUtc,
});
