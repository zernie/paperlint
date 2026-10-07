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
  freshPart,
  type CachedDblp,
  type CachedResponse,
  type DblpHit,
  type LookupCache,
} from "../../domain/lookup-cache.ts";
import { sha256Hex } from "../../domain/sha256.ts";
import { mapLimit } from "./pool.ts";
import { unreachable } from "./reach.io.ts";
import { sleep, todayUtc } from "./clock.io.ts";

/** Citations looked up at once (#107). */
const LOOKUPS_IN_FLIGHT = 6;
import * as cites from "../../../skills/verify-citations/scripts/verify-cites.mjs";
import type { CiteVerdict } from "../../../skills/verify-citations/scripts/verify-cites.mjs";
import * as authors from "../../../skills/verify-citations/scripts/bib-authors.mjs";
import type {
  AuthorBuckets,
  AuthorFinding,
  BibEntry,
} from "../../../skills/verify-citations/scripts/bib-authors.mjs";
import { zip } from "remeda";
import { messageOf } from "../../domain/text.ts";
import { isRecord } from "../../domain/record.ts";

const describeAuthors = (f: AuthorFinding): string =>
  [
    f.missing.length ? `missing ${f.missing.join(", ")}` : "",
    f.extra.length ? `extra ${f.extra.join(", ")}` : "",
    f.orderDiffers ? "order differs" : "",
  ]
    .filter(Boolean)
    .join("; ") + ` (DBLP: ${f.venue})`;

/** bib-authors' answer for one entry, from its buckets for that entry alone. */
const authorsOf = (a: AuthorBuckets): EntryVerdict["authors"] =>
  a.findings.length > 0
    ? "mismatch"
    : a.unchecked.length > 0
      ? "unchecked"
      : a.matched.length > 0
        ? "match"
        : "skipped";

/**
 * Why a work was not confirmed: verify-cites' reason, then — when some registry refused — which
 * one, so "unresolvable" is not read as "every registry looked and found nothing". Nothing for a
 * confirmed work: a refusal after a confirmation changed nothing.
 */
const unconfirmed = (c: CiteVerdict): readonly (string | undefined)[] =>
  c.verdict !== "true"
    ? [c.reason, ...(c.refused ?? []).map((r) => `not asked: ${r}`)]
    : [];

/** One entry's verdict: verify-cites' answer for it, and bib-authors' buckets for it alone. */
function entryVerdict(c: CiteVerdict, a: AuthorBuckets): EntryVerdict {
  const why = [
    ...unconfirmed(c),
    ...a.findings.map(describeAuthors),
    ...a.unchecked.map((u) => u.why),
  ]
    .filter(Boolean)
    .join("; ");
  return {
    key: c.id,
    exists: c.verdict,
    authors: authorsOf(a),
    ...(why ? { why } : {}),
  };
}

/**
 * bib-authors over each entry on its own, one after another as it would run them: its buckets name
 * an entry by key, and two entries of a bibliography may share a key (an `undecided` one's
 * candidates each define it, with other metadata).
 */
const authorsOfEach = (
  parsed: readonly BibEntry[],
  d: Pick<ReturnType<typeof cachedDblp>, "lookup" | "pause">,
): Promise<readonly AuthorBuckets[]> =>
  parsed.reduce<Promise<readonly AuthorBuckets[]>>(
    async (done, e) => [
      ...(await done),
      await authors.checkAuthors([e], { lookup: d.lookup, pause: d.pause }),
    ],
    Promise.resolve([]),
  );

/** Whether bib-authors will ask DBLP about this entry — the filter its `checkAuthors` applies. */
const asksDblp = (e: BibEntry): boolean =>
  Boolean(e.title && e.author) &&
  authors.claimsPublished(e) &&
  !authors.truncated(e.author);

/** Is every question this bibliography would ask already answered in `cache`? */
async function fullyCached(
  citations: readonly cites.Citation[],
  entries: readonly BibEntry[],
  cache: LookupCache,
  store: Readonly<Record<string, unknown>>,
): Promise<boolean> {
  const asks = await Promise.all(
    citations.map((c) => cites.wouldAsk(c, store)),
  );
  return (
    !asks.includes(true) &&
    entries.filter(asksDblp).every((e) => cache.dblp.has(dblpTitleKey(e.title)))
  );
}

/**
 * The key a DBLP answer is stored under in the lookup cache: the title's identity (verify-cites'
 * `titleIdentity` — the same rule its own title keys use, so the two caches cannot drift), hashed.
 * A re-cased or re-braced title keeps its answer; `C` and `C++` do not share one.
 */
export const dblpTitleKey = (title: string): string =>
  sha256Hex(new TextEncoder().encode(cites.titleIdentity(title))).slice(0, 16);

export interface ReferencesCheckerOptions {
  /** The day a new answer is stamped with, YYYY-MM-DD. */
  readonly today: () => string;
}

/**
 * bib-authors' `lookup` and `pause`, answering from the cached DBLP hits first.
 *
 * 🔴 DBLP IS ASKED UNTIL IT REFUSES ONCE, THEN NOT AT ALL FOR THE REST OF THE RUN (#120). A 429, an
 * HTML page where JSON was asked, a timeout: bib-authors would retry each title three times with
 * backoff, and move on to the next title to do it again — 51 titles × 3 × up to 15 s. After the
 * first refusal every lookup fails at once with the reason, and no pause is waited, so each entry
 * lands in bib-authors' `unchecked` bucket ("never a pass") for the price of ONE request.
 *
 * The 900 ms pace protects DBLP, so it is kept only after an answer DBLP actually gave: not after a
 * cached answer, and not once DBLP is off.
 */
function cachedDblp(cache: LookupCache, today: () => string) {
  const dblp = new Map<string, CachedDblp>(cache.dblp);
  let lastWasCached = false;
  let refused: string | null = null;
  return {
    dblp,
    lookup: async (title: string): Promise<readonly DblpHit[]> => {
      const hit = dblp.get(dblpTitleKey(title));
      lastWasCached = hit !== undefined;
      if (hit) return hit.hits;
      if (refused !== null)
        throw new Error(`DBLP refused earlier in this run (${refused})`);
      try {
        const hits = await authors.dblpHits(title);
        dblp.set(dblpTitleKey(title), { fetched: today(), title, hits });
        return hits;
      } catch (e) {
        refused = messageOf(e);
        throw new Error(`DBLP refused earlier in this run (${refused})`);
      }
    },
    pause: (ms: number): Promise<void> =>
      lastWasCached || refused !== null ? Promise.resolve() : sleep(ms),
  };
}

/**
 * The cache after a run: the old answers with every new one laid over them, dated today — or the
 * very object passed in when nothing was fetched, so the caller can tell there is nothing to write.
 * "New" is measured against `usable`, the part the run answered from: an answer too old to use was
 * asked again, and its fresh copy replaces the old one. An old answer the run could not refresh
 * (the service refused) stays, and is asked again next build.
 */
function grown(
  loaded: { readonly cache: LookupCache; readonly usable: LookupCache },
  run: {
    readonly store: Readonly<Record<string, unknown>>;
    readonly dblp: ReadonlyMap<string, CachedDblp>;
  },
  today: () => string,
): LookupCache {
  const { cache, usable } = loaded;
  const { store, dblp } = run;
  // verify-cites stores each answer as an object; only such a value is a response the cache can hold.
  const fresh = Object.entries(store).filter(
    (e): e is [string, Readonly<Record<string, unknown>>] =>
      !usable.citations.has(e[0]) && isRecord(e[1]),
  );
  const freshDblp = [...dblp].filter(([k]) => !usable.dblp.has(k));
  if (fresh.length === 0 && freshDblp.length === 0) return cache;
  const dated = fresh.map(([k, response]): [string, CachedResponse] => [
    k,
    { fetched: today(), response },
  ]);
  return {
    citations: new Map([...cache.citations, ...dated]),
    dblp: new Map([...cache.dblp, ...freshDblp]),
  };
}

/** The checker, with its clock injected; `onlineReferences` is the one the CLI wires. */
export const referencesChecker =
  ({ today }: ReferencesCheckerOptions): CheckReferences =>
  async (bib, cache) => {
    // Answers past MAX_AGE_DAYS are left out, so the run asks them again (and `grown` re-dates them).
    const usable = freshPart(cache, today());
    const citations = cites.citationsOf(bib);
    const parsed = authors.authorEntries(bib);
    const store: Record<string, unknown> = Object.fromEntries(
      [...usable.citations].map(([k, v]) => [k, v.response]),
    );
    if (!(await fullyCached(citations, parsed, usable, store))) {
      const why = await unreachable();
      if (why !== null) return { check: { kind: "not-checked", why }, cache };
    }
    // 🔴 #107: the lookups run LOOKUPS_IN_FLIGHT at a time, and the DBLP author pass runs beside
    // them. Each citation's own requests go to four different services one after another, so a
    // pool of 6 is at most 6 requests to any one of them. The store is shared: two citations with
    // the same identifier may both miss it and ask twice — an extra request, never a different
    // answer.
    // One breaker for the run: a service that refuses is not asked again, not once per citation
    // (#120). Requests already in flight when it starts refusing still land — at most six.
    const breaker = cites.createBreaker();
    const d = cachedDblp(usable, today);
    const [found, a] = await Promise.all([
      mapLimit(citations, LOOKUPS_IN_FLIGHT, (c) =>
        cites.verifyCitationLive(c, {
          cache: store,
          breaker,
        }),
      ),
      authorsOfEach(parsed, d),
    ]);
    // Both lists are one per entry, in its order: so is the verdict list.
    const entries = zip(found, a).map(([c, b]) => entryVerdict(c, b));
    return {
      check: { kind: "checked", entries },
      cache: grown({ cache, usable }, { store, dblp: d.dblp }, today),
    };
  };

/** The checker the CLI wires: the real clock. */
export const onlineReferences: CheckReferences = referencesChecker({
  today: todayUtc,
});
