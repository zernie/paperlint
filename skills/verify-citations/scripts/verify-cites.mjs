#!/usr/bin/env node
/**
 * verify-cites.mjs — deterministic, cacheable citation-existence gate.
 *
 * Provenance: design ported (reimplemented fresh — no source copied) from
 * github.com/Imbad0202/academic-research-skills (CC BY-NC): the 4-DB lookup +
 * narrowed-false reducer + DOI-misdirection. CVE / PoC-commit-SHA pinning design
 * from github.com/euzun/security-paper-writing (MIT). Poach backlog for later
 * rounds: papers/research/oss-skill-mining-imbad0202.md.
 *
 * Turns the LLM cite-check (SKILL.md, prose) into a reproducible artifact: for
 * every citation it hits four real academic databases (Crossref, OpenAlex,
 * Semantic Scholar, arXiv), DOI/arXiv-id first then a title search, and reduces
 * the evidence to one of three verdicts:
 *
 *   true          — found, metadata matches (a resolver confirmed it)
 *   false         — FABRICATION: a provided DOI/arXiv-id/CVE resolves to nothing,
 *                   OR a DOI resolves to an UNRELATED real paper (DOI misdirection)
 *   unresolvable  — could not find it by title, but no positive disproof.
 *                   Explicitly NOT fabrication (a legit unindexed / regional /
 *                   pre-digital paper looks exactly like this).
 *
 * The "narrowed-false" rule is the whole point: a title you simply can't find is
 * NOT evidence of fabrication → unresolvable. Only a resolvable *identifier* that
 * provably fails, or a DOI that lands on the wrong paper, is fabrication → false.
 *
 * Design ported (fresh original code, no source copied) from the OSS mining note
 * papers/research/oss-skill-mining-imbad0202.md (STEAL #1), plus the
 * CVE / PoC-SHA pinning discipline from oss-skill-mining-euzun.md (§4a).
 *
 * Architecture: the PURE reducer (reduceVerdict / classifyResolver / checkNvd /
 * checkCommit + the string helpers) is separated from the live HTTP layer, so the
 * verdict logic is unit-testable offline with injected fixtures — see
 * verify-cites.test.mjs. The network layer only shapes raw API responses into the
 * normalized evidence the pure functions consume.
 *
 * Usage:
 *   node verify-cites.mjs cites.json      # JSON array of citation objects
 *   node verify-cites.mjs refs.bib        # best-effort .bib extraction
 *   cat cites.json | node verify-cites.mjs -   # from stdin
 *   node verify-cites.mjs cites.json --offline # no network (everything degrades)
 *
 * Citation object: { id, doi?, arxiv?, title?, authors?, year?, cve?, commit? }
 * Output: JSON array of { id, verdict, reason, matched_db, matched_title?, flags? }
 *         + a summary line on stderr. Exit 1 iff any verdict is `false`.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, extname } from "node:path";
import { createHash } from "node:crypto";
import { consumerContactEmail } from "../../paper-pipeline/scripts/consumer.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_PATH = join(__dirname, ".cite-cache.json");
// 🔴 THE ADDRESS IS THE CONSUMER'S, NOT OURS. Crossref's "polite pool" keys off this `mailto:`:
// it decides who gets the faster tier and, more to the point, WHOM THEY WARN before blocking.
// Hard-coded, it pointed at one person for every user of this package — so the warnings would
// reach someone who cannot act on them while the actual caller heard nothing. Undeclared, we
// send no `mailto:` and land in the public pool: slower, never wrong.
const CONTACT = consumerContactEmail();
const USER_AGENT = `verify-cites/1.0 (citation gate${CONTACT ? `; mailto:${CONTACT}` : ""})`;
const TIMEOUT_MS = 15000;
const TITLE_THRESHOLD = 0.7; // Levenshtein-normalized similarity
const YEAR_TOLERANCE = 1; // ±1

// ─────────────────────────────────────────────────────────────────────────────
// PURE LAYER — no I/O. Everything below is unit-testable with plain fixtures.
// ─────────────────────────────────────────────────────────────────────────────

/** Classic Levenshtein edit distance (own implementation, two-row DP). */
export function levenshtein(a, b) {
  a = a ?? "";
  b = b ?? "";
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = new Array(b.length + 1);
  let cur = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= b.length; j++) {
      const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[b.length];
}

/**
 * Normalize a title for comparison: lowercase, strip diacritics + punctuation,
 * collapse whitespace. PRESERVES unicode letters/numbers (\p{L}\p{N}) so that
 * Cyrillic / CJK / Greek titles keep their content — an ASCII-only normalizer
 * collapses every non-Latin title to "" and then scores two DIFFERENT non-Latin
 * titles as identical (S1: a fabricated non-Latin cite would pass as `true`).
 * A title that has NO letters/digits at all (pure punctuation/emoji) still
 * normalizes to "" — callers must treat "" as INCOMPARABLE, never as a match.
 */
export function normalizeTitle(t) {
  return (t ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "") // strip combining marks (diacritics)
    .replace(/[^\p{L}\p{N}\s]/gu, " ") // keep unicode letters/numbers, drop punct
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Normalized similarity in [0,1]: 1 - dist/maxLen over normalized titles.
 * If EITHER side normalizes to "" (incomparable) → 0, NEVER 1 (two empties are
 * not "identical", they are un-judgeable — see normalizeTitle / S1).
 */
export function titleSimilarity(a, b) {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (!na || !nb) return 0;
  const maxLen = Math.max(na.length, nb.length);
  return 1 - levenshtein(na, nb) / maxLen;
}

/** Two titles "match" iff normalized similarity ≥ threshold (default 0.70). */
export function titlesMatch(a, b, threshold = TITLE_THRESHOLD) {
  return titleSimilarity(a, b) >= threshold;
}

/** Normalize a DOI: strip a `doi:` / resolver-URL prefix and any TRAILING sentence
 *  punctuation a .bib or prose extractor swallowed. A trailing `.` makes doi.org
 *  return responseCode 100, so an unnormalized real DOI reads as fabrication (the
 *  gate's own parser must never manufacture a false `false`). */
export function normalizeDoi(doi) {
  if (!doi) return doi;
  return String(doi).trim()
    .replace(/^doi:\s*/i, "")
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")
    .replace(/[.,;:]+$/, "")
    .trim();
}

/** Normalize an arXiv id: strip an `arXiv:` prefix + surrounding punctuation, so a
 *  bib-styled `arXiv:1706.03762` reaches the API as a bare id (else the arXiv API
 *  returns an entry-less feed → authoritative not-found → a wrong `false`). */
export function normalizeArxiv(arxiv) {
  if (!arxiv) return arxiv;
  return String(arxiv).trim()
    .replace(/^arxiv:\s*/i, "")
    .replace(/[.,;:]+$/, "")
    .trim();
}

/** Shallow copy of a citation with doi/arxiv identifiers normalized. Applied at the
 *  verify boundary so BOTH JSON input and .bib-parsed input are clean before any
 *  network / authority lookup. */
export function normalizeIdentifiers(citation) {
  const c = { ...citation };
  if (c.doi) c.doi = normalizeDoi(c.doi);
  if (c.arxiv) c.arxiv = normalizeArxiv(c.arxiv);
  return c;
}

// Short function words that carry no discriminative signal for token-overlap.
const STOP_TOKENS = new Set([
  "the", "a", "an", "of", "and", "for", "to", "in", "on", "is", "are", "with",
  "via", "using", "from", "by", "at", "as", "or", "be", "we", "our",
]);

/** Content tokens of a normalized title (drop stopwords + 1-char noise). */
function contentTokens(norm) {
  return norm.split(" ").filter((w) => w.length >= 2 && !STOP_TOKENS.has(w));
}

/** Does `base` spell the initials of some run of consecutive `words`?
 *  ("cnn" ↔ ["convolutional","neural","networks"]). Handles acronym ↔ expansion. */
function isAcronymOf(base, words) {
  if (base.length < 2) return false;
  for (let i = 0; i < words.length; i++) {
    let acr = "";
    for (let j = i; j < words.length && acr.length < base.length; j++) {
      acr += words[j][0] || "";
    }
    if (acr === base) return true;
  }
  return false;
}

/** Count tokens of the SMALLER set present in the LARGER set — directly, as a
 *  depluralized form, or as an acronym expansion — for a containment ratio. */
function tokenOverlap(small, large) {
  const setL = new Set(large);
  let count = 0;
  for (const t of small) {
    const base = t.replace(/s$/, "");
    if (setL.has(t) || setL.has(base) || isAcronymOf(base, large)) count++;
  }
  return count;
}

/**
 * titleRelation — the ROBUST title comparison for identifier verification.
 * Returns 'match' | 'different' | 'incomparable'. Beyond raw Levenshtein it adds
 * token-set containment so a split subtitle, an abbreviation/acronym, or a
 * preprint→published drift does NOT read as an unrelated paper (M2/M3). If either
 * title is empty after normalization (e.g. non-Latin vs Latin) it is INCOMPARABLE
 * — we cannot assert the titles are unrelated, so we never say 'different'.
 */
/** Which alphabets/scripts appear in a normalized string (digits are neutral). */
function scriptsOf(s) {
  const set = new Set();
  if (/[a-z]/.test(s)) set.add("latin");
  if (/[Ѐ-ӿ]/.test(s)) set.add("cyrillic");
  if (/[぀-ヿ㐀-鿿가-힯]/.test(s)) set.add("cjk");
  if (/[Ͱ-Ͽ]/.test(s)) set.add("greek");
  if (/[؀-ۿ]/.test(s)) set.add("arabic");
  return set;
}

export function titleRelation(a, b) {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (!na || !nb) return "incomparable";
  // Cross-script titles (e.g. Cyrillic claimed vs Latin record) are NOT char-
  // comparable: a non-Latin work's DOI often records a translated/transliterated
  // title, so a character mismatch is NOT evidence of an unrelated paper (M3). If
  // the two share no script, we cannot assert 'different' → incomparable.
  const sa = scriptsOf(na);
  const sb = scriptsOf(nb);
  if (sa.size && sb.size && ![...sa].some((x) => sb.has(x))) return "incomparable";
  const sim = 1 - levenshtein(na, nb) / Math.max(na.length, nb.length);
  if (sim >= TITLE_THRESHOLD) return "match";
  const A = contentTokens(na);
  const B = contentTokens(nb);
  if (A.length && B.length) {
    const [small, large] = A.length <= B.length ? [A, B] : [B, A];
    const contain = tokenOverlap(small, large) / small.length;
    if (contain >= 0.6) return "match"; // subtitle split / abbrev / drift
  }
  return "different";
}

/** Candidate title strings for a resolved record — the plain title and, when the
 *  record splits a subtitle into its own field (Crossref), the concatenation. */
export function candidateTitles(record) {
  const t = (record.title || "").trim();
  const out = [t];
  if (record.subtitle) {
    const sub = String(record.subtitle).trim();
    out.push(`${t} ${sub}`.trim(), `${t}: ${sub}`.trim());
  }
  return out.filter(Boolean);
}

/** Best relation between a claimed title and any candidate rendering of a record.
 *  'match' if any candidate matches; 'incomparable' if EVERY comparison was
 *  incomparable (claimed title un-normalizable); otherwise 'different'. */
export function bestTitleRelation(claimed, candidates) {
  let sawComparable = false;
  for (const cand of candidates) {
    const rel = titleRelation(claimed, cand);
    if (rel === "match") return "match";
    if (rel !== "incomparable") sawComparable = true;
  }
  return sawComparable ? "different" : "incomparable";
}

/** Year match: within ±tolerance. Missing on either side → not disqualifying. */
export function yearMatch(claimed, found, tolerance = YEAR_TOLERANCE) {
  const c = toYear(claimed);
  const f = toYear(found);
  if (c == null || f == null) return true;
  return Math.abs(c - f) <= tolerance;
}

function toYear(y) {
  if (y == null) return null;
  const n = typeof y === "number" ? y : parseInt(String(y).slice(0, 4), 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * classifyResolver — PURE. Turn one resolver's normalized response into a
 * per-resolver evidence status. This is the heart of the narrowed-false logic.
 *
 * response shape (produced by the network layer OR by a test fixture):
 *   {
 *     db:       'crossref' | 'openalex' | 'semantic_scholar' | 'arxiv',
 *     transport:'ok' | 'error',        // 'error' = network/timeout/rate-limit
 *     query:    'doi' | 'arxiv' | 'title',
 *     record:   { title, year } | null,   // for id lookups: resolved record or null
 *     records:  [{ title, year }] | null, // for title searches: hits (may be [])
 *   }
 *
 * returns one of:
 *   { db, status:'matched',      matchedTitle, matchedYear }
 *   { db, status:'doi_mismatch', foundTitle }   // DOI landed on unrelated paper
 *   { db, status:'id_unmatched', query }        // provided id resolved to nothing
 *   { db, status:'title_miss' }                 // title search found no ≥0.70 hit
 *   { db, status:'unreachable' }                // transport failure — NOT disproof
 */
export function classifyResolver(citation, response) {
  const db = response.db;
  if (response.transport === "error") return { db, status: "unreachable" };

  if (response.query === "doi" || response.query === "arxiv") {
    // A provided identifier. If it resolves to nothing at THIS resolver → an
    // id-miss. Whether that is fabrication is decided in reduceVerdict: a content
    // registry (Crossref/OpenAlex/S2) is NOT the DOI authority (M1), so its DOI
    // id-miss is `authoritative:false`; only the arXiv API is authoritative for an
    // arXiv id, so an arXiv-db arXiv id-miss is `authoritative:true`.
    if (response.record == null) {
      return {
        db,
        status: "id_unmatched",
        query: response.query,
        authoritative: response.query === "arxiv" ? db === "arxiv" : false,
      };
    }
    // It resolved to a real record. If we have a claimed title, it must not be a
    // CONFIDENTLY-DIFFERENT paper. titleRelation returns 'different' ONLY for two
    // comparable-yet-unrelated titles; a split subtitle / abbreviation / drift →
    // 'match', and a non-Latin-vs-Latin (or otherwise un-normalizable) pair →
    // 'incomparable' → we do NOT assert misdirection (M2/M3).
    if (citation.title) {
      const rel = bestTitleRelation(citation.title, candidateTitles(response.record));
      if (rel === "different") {
        return { db, status: "doi_mismatch", foundTitle: response.record.title };
      }
    }
    return {
      db,
      status: "matched",
      matchedTitle: response.record.title,
      matchedYear: response.record.year,
    };
  }

  // Title search: accept iff a hit is a robust title MATCH (not merely ≥0.70 raw
  // Levenshtein) AND year ±1. titleRelation treats an un-normalizable claimed
  // title as 'incomparable' → no match (we can't confirm existence from a title
  // we can't compare), never a false positive.
  const hits = response.records || [];
  for (const rec of hits) {
    if (
      titleRelation(citation.title, rec.title) === "match" &&
      yearMatch(citation.year, rec.year)
    ) {
      return {
        db,
        status: "matched",
        matchedTitle: rec.title,
        matchedYear: rec.year,
      };
    }
  }
  // Nothing found by title. Coverage gap — NOT fabrication.
  return { db, status: "title_miss" };
}

/**
 * classifyDoiAuthority — PURE. The DOI *authority* (doi.org handle system) is the
 * only source that can positively DISPROVE a DOI's existence. A content-registry
 * 404 (Crossref/OpenAlex/S2 having no metadata) is NOT disproof — DataCite/Zenodo
 * DOIs and freshly-minted 2026 DOIs resolve at doi.org while carrying no registry
 * metadata (M1). Maps the doi.org `/api/handles/{doi}` response to evidence:
 *   response shape: { transport:'ok'|'error', responseCode?: number }
 *     responseCode 1   → the handle exists            → authority_present
 *     responseCode 100 → the handle does NOT exist    → authority_absent (disproof)
 *     anything else / transport error                 → unreachable (no disproof)
 */
export function classifyDoiAuthority(response) {
  const db = "doi_authority";
  if (!response || response.transport === "error") return { db, status: "unreachable" };
  if (response.responseCode === 1) return { db, status: "authority_present" };
  if (response.responseCode === 100) return { db, status: "authority_absent" };
  return { db, status: "unreachable" }; // unknown code — cannot disprove
}

/**
 * checkNvd — PURE. CVE existence via a normalized NVD response, folded into the
 * same evidence shape as a resolver so the reducer treats it uniformly.
 *   nvd shape: { transport:'ok'|'error', found: boolean }
 *   found === false on a well-formed CVE id = the id resolves to nothing = false.
 */
export function checkNvd(citation, nvd) {
  const db = "nvd";
  if (!citation.cve) return null;
  if (!nvd || nvd.transport === "error") return { db, status: "unreachable" };
  if (nvd.found) {
    return { db, status: "matched", matchedTitle: citation.cve };
  }
  // NVD authoritatively has no such CVE → id-keyed miss → fabrication evidence.
  return { db, status: "id_unmatched", query: "cve" };
}

/** Well-formed CVE id? CVE-YYYY-NNNN(+). */
export function isValidCveId(cve) {
  return /^CVE-\d{4}-\d{4,}$/i.test((cve ?? "").trim());
}

/**
 * checkCommit — PURE. PoC / exploit references must pin a FULL 40-char git SHA
 * (branches and tags move; SHAs don't). Returns advisory flags — a short or
 * malformed SHA is a hygiene flag, NOT a fabrication verdict.
 */
export function checkCommit(citation) {
  const flags = [];
  if (citation.commit == null) return flags;
  const sha = String(citation.commit).trim();
  if (!/^[0-9a-f]+$/i.test(sha)) {
    flags.push(`commit "${sha}" is not a hex git SHA — pin a full 40-char SHA`);
  } else if (sha.length < 40) {
    flags.push(
      `commit "${sha}" is a short SHA (${sha.length}/40) — pin the full 40-char SHA (short hashes collide / are ambiguous)`,
    );
  } else if (sha.length > 40) {
    // A hex string LONGER than 40 chars is not a valid SHA-1 git object id — do
    // not wave it through just because it is hex (S3).
    flags.push(
      `commit "${sha}" is ${sha.length} hex chars (>40) — not a valid git SHA; pin the exact full 40-char SHA`,
    );
  }
  return flags;
}

/**
 * reduceVerdict — PURE. The narrowed-false reducer. Given a citation and the
 * list of per-resolver/NVD evidence (from classifyResolver / checkNvd), plus the
 * commit flags, produce the final verdict.
 *
 *   true          iff ANY evidence is `matched`  (a match always WINS)
 *   false         iff NOT matched AND ≥1 evidence is `id_unmatched` or `doi_mismatch`
 *                 (a resolvable id that fails, or a DOI on the wrong paper)
 *   unresolvable  otherwise (only `title_miss` and/or `unreachable` — no disproof)
 */
export function reduceVerdict(citation, evidence, commitFlags = []) {
  const ev = evidence.filter(Boolean);
  const flags = [...commitFlags];
  const out = (verdict, reason, matched_db = null, extra = {}) => ({
    id: citation.id,
    verdict,
    reason,
    matched_db,
    ...extra,
    ...(flags.length ? { flags } : {}),
  });

  // A match ALWAYS wins.
  const matched = ev.find((e) => e.status === "matched");
  if (matched) {
    return out(
      "true",
      `confirmed by ${matched.db}${matched.matchedTitle ? ` — "${matched.matchedTitle}"` : ""}`,
      matched.db,
      { matched_title: matched.matchedTitle },
    );
  }

  // A DOI/arXiv id that resolves to a CONFIDENTLY-DIFFERENT paper → misdirection.
  const mismatch = ev.find((e) => e.status === "doi_mismatch");
  if (mismatch) {
    return out(
      "false",
      `DOI_MISMATCH: identifier resolves via ${mismatch.db} to an UNRELATED paper "${mismatch.foundTitle}" (claimed "${citation.title}") — DOI misdirection`,
    );
  }

  // ── Authority-gated fabrication (M1) ──────────────────────────────────────
  // A content-registry 404 is NOT positive disproof of a DOI. Fabrication may be
  // asserted ONLY from an AUTHORITATIVE not-found:
  //   • DOI  → doi.org handle system says responseCode 100 (authority_absent)
  //   • arXiv → the reachable arXiv API itself (not S2) definitively missed it
  //   • CVE  → NVD authoritatively has no such id
  const authorityAbsent = ev.find((e) => e.status === "authority_absent");
  const authorityPresent = ev.find((e) => e.status === "authority_present");
  const doiIdMiss = ev.find((e) => e.status === "id_unmatched" && e.query === "doi");
  const arxivAuthMiss = ev.find(
    (e) => e.status === "id_unmatched" && e.query === "arxiv" && e.authoritative,
  );
  const arxivAnyMiss = ev.find((e) => e.status === "id_unmatched" && e.query === "arxiv");
  const cveMiss = ev.find((e) => e.status === "id_unmatched" && e.query === "cve");

  if (authorityAbsent) {
    return out(
      "false",
      `RESOLVED_TO_NOTHING: DOI ${citation.doi} does not resolve at the DOI authority (doi.org handle responseCode 100 = not found) — fabrication evidence`,
    );
  }
  if (arxivAuthMiss) {
    return out(
      "false",
      `RESOLVED_TO_NOTHING: arXiv id ${citation.arxiv} returns a definitive not-found from the reachable arXiv API — fabrication evidence`,
    );
  }
  if (cveMiss) {
    return out(
      "false",
      `RESOLVED_TO_NOTHING: the provided CVE ${citation.cve} resolves to no record (checked ${cveMiss.db}) — fabrication evidence`,
    );
  }

  // ── No positive disproof → unresolvable, with the most informative reason ──
  const reachable = ev.some((e) => e.status !== "unreachable");
  let reason;
  if (doiIdMiss && authorityPresent) {
    reason = `DOI ${citation.doi} resolves at doi.org but no content registry (Crossref/OpenAlex/Semantic Scholar) has metadata for it — common for DataCite/Zenodo and freshly-minted DOIs; the work EXISTS, its metadata is just unindexed → unresolvable, NOT fabrication`;
  } else if (doiIdMiss) {
    reason = `DOI ${citation.doi} not found in any content registry, and the DOI authority (doi.org) was not reachable to confirm non-existence — cannot assert fabrication → unresolvable, never false`;
  } else if (arxivAnyMiss) {
    reason = `arXiv id ${citation.arxiv} missed only by non-authoritative sources (the reachable arXiv API did not definitively reject it) — cannot assert fabrication → unresolvable`;
  } else if (reachable) {
    reason =
      "not found by title in any database (no resolvable id to disprove) — could be a legit unindexed/regional/pre-digital work, NOT fabrication";
  } else {
    reason =
      "all databases unreachable (network/rate-limit) — degraded to unresolvable, never to false";
  }
  return out("unresolvable", reason);
}

// ─────────────────────────────────────────────────────────────────────────────
// .bib PARSER — small, best-effort. Extracts @article/@inproceedings/... entries
// and (loosely) \bibitem blocks. Not a full BibTeX grammar; enough to seed cites.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * field(body, name) — extract a BibTeX field value from an entry body.
 *  (a) anchors `name` so `title` does NOT also match `booktitle` (S4a);
 *  (b) reads BRACE-delimited values with balanced-brace scanning, so a protected
 *      acronym `{Evaluating {LLM}-based ...}` is captured whole, not truncated at
 *      the inner `}` (S4b);
 *  also handles "quoted" and bare (numeric) values.
 */
function bibField(body, name) {
  const re = new RegExp(`(?<![a-zA-Z])${name}\\s*=\\s*`, "i");
  const fm = re.exec(body);
  if (!fm) return undefined;
  let i = fm.index + fm[0].length;
  const ch = body[i];
  if (ch === "{") {
    let depth = 0;
    let j = i;
    for (; j < body.length; j++) {
      if (body[j] === "{") depth++;
      else if (body[j] === "}") {
        depth--;
        if (depth === 0) break;
      }
    }
    return body.slice(i + 1, j).replace(/\s+/g, " ").trim();
  }
  if (ch === '"') {
    let j = i + 1;
    while (j < body.length && body[j] !== '"') j++;
    return body.slice(i + 1, j).replace(/\s+/g, " ").trim();
  }
  // bare value (e.g. year = 2017,) — up to the next comma / newline / close brace
  let j = i;
  while (j < body.length && !/[,\n}]/.test(body[j])) j++;
  const v = body.slice(i, j).replace(/\s+/g, " ").trim();
  return v || undefined;
}

export function parseBib(text) {
  const cites = [];
  // @type{key,  — then read the entry body with BALANCED-BRACE scanning so that
  // one-line entries and indented / same-line closing braces (`\n  }` or `...}`)
  // are captured, not dropped by a `\n}`-at-column-0 requirement (S4c).
  const headRe = /@(\w+)\s*\{\s*([^,\s}]+)\s*,/g;
  let m;
  while ((m = headRe.exec(text)) !== null) {
    const type = m[1].toLowerCase();
    if (type === "comment" || type === "string" || type === "preamble") continue;
    const key = m[2].trim();
    // Balanced scan from just after the key's comma to the entry's closing brace.
    let depth = 1; // the entry's opening `{` was already consumed by headRe
    let j = headRe.lastIndex;
    for (; j < text.length && depth > 0; j++) {
      if (text[j] === "{") depth++;
      else if (text[j] === "}") depth--;
    }
    const body = text.slice(headRe.lastIndex, j - 1);
    headRe.lastIndex = j; // resume scanning AFTER this entry

    const c = { id: key };
    const doi = bibField(body, "doi");
    const title = bibField(body, "title");
    const year = bibField(body, "year");
    const author = bibField(body, "author");
    const eprint = bibField(body, "eprint");
    const archive = bibField(body, "archiveprefix") || bibField(body, "eprinttype");
    if (doi) c.doi = normalizeDoi(doi);
    if (title) c.title = title.replace(/[{}]/g, "");
    if (year) c.year = year;
    if (author) c.authors = author;
    if (eprint && (!archive || /arxiv/i.test(archive))) c.arxiv = normalizeArxiv(eprint);
    cites.push(c);
  }
  if (cites.length > 0) return cites;

  // Fallback: \bibitem — grab arXiv ids / DOIs out of each block, best-effort.
  const itemRe = /\\bibitem(?:\[[^\]]*\])?\{([^}]+)\}([\s\S]*?)(?=\\bibitem|\\end\{thebibliography\}|$)/g;
  while ((m = itemRe.exec(text)) !== null) {
    const key = m[1].trim();
    const block = m[2];
    const c = { id: key };
    const doiM = block.match(/10\.\d{4,9}\/[-._;()/:A-Z0-9]+/i);
    const arxivM = block.match(/arXiv:\s*(\d{4}\.\d{4,5})/i);
    const yearM = block.match(/\b(19|20)\d{2}\b/);
    if (doiM) c.doi = normalizeDoi(doiM[0]);
    if (arxivM) c.arxiv = normalizeArxiv(arxivM[1]);
    if (yearM) c.year = yearM[0];
    // crude title: longest quoted or {\em ...} run
    const titleM =
      block.match(/``([^']{6,}?)''/) ||
      block.match(/\\emph\{([^}]{6,}?)\}/) ||
      block.match(/\{\\em\s+([^}]{6,}?)\}/);
    if (titleM) c.title = titleM[1].replace(/\s+/g, " ").trim();
    cites.push(c);
  }
  return cites;
}

// ─────────────────────────────────────────────────────────────────────────────
// NETWORK LAYER — impure. Fetches the 4 APIs + NVD, shapes raw → normalized
// evidence, then hands off to the pure functions above. Cached to disk.
// ─────────────────────────────────────────────────────────────────────────────

function loadCache() {
  try {
    if (existsSync(CACHE_PATH)) return JSON.parse(readFileSync(CACHE_PATH, "utf8"));
  } catch {
    /* corrupt cache → start fresh */
  }
  return {};
}
function saveCache(cache) {
  try {
    writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
  } catch {
    /* best-effort; a cache write failure must never fail the run */
  }
}

function titleHash(t) {
  return createHash("sha1").update(normalizeTitle(t)).digest("hex").slice(0, 16);
}
function cacheKey(kind, val) {
  return `${kind}:${val}`;
}

async function httpGet(url, { json = true } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: json ? "application/json" : "*/*" },
      signal: ctrl.signal,
    });
    if (res.status === 429 || res.status >= 500) {
      return { ok: false, reason: `http ${res.status}` }; // rate-limit / outage
    }
    if (res.status === 404) return { ok: true, notFound: true };
    if (!res.ok) return { ok: false, reason: `http ${res.status}` };
    const data = json ? await res.json() : await res.text();
    return { ok: true, data };
  } catch (e) {
    return { ok: false, reason: e.name === "AbortError" ? "timeout" : String(e) };
  } finally {
    clearTimeout(timer);
  }
}

// Each *Resolver returns a normalized response (the shape classifyResolver eats).
// A transport failure → { transport:'error' }: degrade to unresolvable, NEVER false.

async function crossrefResolve(citation) {
  const db = "crossref";
  if (citation.doi) {
    const r = await httpGet(`https://api.crossref.org/works/${encodeURIComponent(citation.doi)}`);
    if (!r.ok) return { db, transport: "error" };
    if (r.notFound) return { db, transport: "ok", query: "doi", record: null };
    const w = r.data?.message;
    return {
      db,
      transport: "ok",
      query: "doi",
      // Crossref splits a subtitle into its own field — carry it so the title
      // comparison can try title AND title+subtitle (M2).
      record: w
        ? {
            title: (w.title || [])[0] || "",
            subtitle: (w.subtitle || [])[0] || "",
            year: crYear(w),
          }
        : null,
    };
  }
  if (citation.title) {
    const url = `https://api.crossref.org/works?query.bibliographic=${encodeURIComponent(
      citation.title,
    )}&rows=5`;
    const r = await httpGet(url);
    if (!r.ok) return { db, transport: "error" };
    const items = r.data?.message?.items || [];
    return {
      db,
      transport: "ok",
      query: "title",
      records: items.map((w) => ({ title: (w.title || [])[0] || "", year: crYear(w) })),
    };
  }
  return null;
}
function crYear(w) {
  return (
    w?.issued?.["date-parts"]?.[0]?.[0] ??
    w?.published?.["date-parts"]?.[0]?.[0] ??
    null
  );
}

async function openalexResolve(citation) {
  const db = "openalex";
  if (citation.doi) {
    const r = await httpGet(`https://api.openalex.org/works/doi:${encodeURIComponent(citation.doi)}`);
    if (!r.ok) return { db, transport: "error" };
    if (r.notFound) return { db, transport: "ok", query: "doi", record: null };
    const w = r.data;
    return {
      db,
      transport: "ok",
      query: "doi",
      record: w?.id ? { title: w.display_name || "", year: w.publication_year } : null,
    };
  }
  if (citation.title) {
    const r = await httpGet(
      `https://api.openalex.org/works?search=${encodeURIComponent(citation.title)}&per-page=5`,
    );
    if (!r.ok) return { db, transport: "error" };
    const items = r.data?.results || [];
    return {
      db,
      transport: "ok",
      query: "title",
      records: items.map((w) => ({ title: w.display_name || "", year: w.publication_year })),
    };
  }
  return null;
}

async function semanticScholarResolve(citation) {
  const db = "semantic_scholar";
  const base = "https://api.semanticscholar.org/graph/v1/paper";
  if (citation.doi || citation.arxiv) {
    const id = citation.doi ? `DOI:${citation.doi}` : `arXiv:${citation.arxiv}`;
    const r = await httpGet(`${base}/${encodeURIComponent(id)}?fields=title,year`);
    if (!r.ok) return { db, transport: "error" };
    if (r.notFound) return { db, transport: "ok", query: citation.doi ? "doi" : "arxiv", record: null };
    const w = r.data;
    return {
      db,
      transport: "ok",
      query: citation.doi ? "doi" : "arxiv",
      record: w?.title != null ? { title: w.title || "", year: w.year } : null,
    };
  }
  if (citation.title) {
    const r = await httpGet(
      `${base}/search?query=${encodeURIComponent(citation.title)}&fields=title,year&limit=5`,
    );
    if (!r.ok) return { db, transport: "error" };
    const items = r.data?.data || [];
    return {
      db,
      transport: "ok",
      query: "title",
      records: items.map((w) => ({ title: w.title || "", year: w.year })),
    };
  }
  return null;
}

async function arxivResolve(citation) {
  const db = "arxiv";
  // arXiv only makes sense for an arXiv id or a title search (no DOI endpoint).
  if (citation.arxiv) {
    const r = await httpGet(
      `https://export.arxiv.org/api/query?id_list=${encodeURIComponent(citation.arxiv)}&max_results=1`,
      { json: false },
    );
    if (!r.ok) return { db, transport: "error" };
    const entry = parseArxivFeed(r.data);
    return { db, transport: "ok", query: "arxiv", record: entry[0] ?? null };
  }
  if (citation.title && !citation.doi) {
    const r = await httpGet(
      `https://export.arxiv.org/api/query?search_query=ti:${encodeURIComponent(
        '"' + citation.title + '"',
      )}&max_results=5`,
      { json: false },
    );
    if (!r.ok) return { db, transport: "error" };
    return { db, transport: "ok", query: "title", records: parseArxivFeed(r.data) };
  }
  return null;
}
export function parseArxivFeed(xml) {
  const out = [];
  if (!xml) return out;
  const entries = xml.split(/<entry>/).slice(1);
  for (const e of entries) {
    const tM = e.match(/<title>([\s\S]*?)<\/title>/);
    const pM = e.match(/<published>(\d{4})/);
    const idM = e.match(/<id>([\s\S]*?)<\/id>/);
    if (!tM) continue;
    const title = tM[1].replace(/\s+/g, " ").trim();
    // S2: arXiv answers a bad/unknown id with HTTP 200 and a SENTINEL entry titled
    // "Error" whose <id> is the arxiv.org/api/errors URL. That is NOT a real
    // "unrelated paper" — skip it so the id reads as not-found, not a mismatch.
    const isErrorSentinel =
      title === "Error" && /arxiv\.org\/api\/errors/i.test(idM ? idM[1] : "");
    if (isErrorSentinel) continue;
    out.push({ title, year: pM ? +pM[1] : null });
  }
  return out;
}

/**
 * doiAuthorityCheck — hit the DOI *authority* (doi.org handle system). This is the
 * only source that can positively disprove a DOI (M1). A content-registry 404 just
 * means "no metadata here"; doi.org responseCode 100 means "this DOI does not
 * exist". Returns { transport, responseCode } for classifyDoiAuthority.
 */
async function doiAuthorityCheck(citation) {
  if (!citation.doi) return null;
  // Keep the DOI's own slashes as path separators; encode the rest.
  const path = encodeURIComponent(citation.doi.trim()).replace(/%2F/gi, "/");
  const r = await httpGet(`https://doi.org/api/handles/${path}`);
  if (r.notFound) return { transport: "ok", responseCode: 100 }; // 404 = not found
  if (!r.ok) return { transport: "error" };
  const code = r.data?.responseCode;
  return { transport: "ok", responseCode: typeof code === "number" ? code : undefined };
}

async function nvdCheck(citation) {
  if (!citation.cve) return null;
  if (!isValidCveId(citation.cve)) {
    // Malformed CVE id — treat as a provided-id-that-cannot-resolve (fabrication).
    return { transport: "ok", found: false };
  }
  const r = await httpGet(
    `https://services.nvd.nist.gov/rest/json/cves/2.0?cveId=${encodeURIComponent(
      citation.cve.toUpperCase(),
    )}`,
  );
  if (!r.ok) return { transport: "error" };
  if (r.notFound) return { transport: "ok", found: false };
  const total = r.data?.totalResults ?? (r.data?.vulnerabilities || []).length;
  return { transport: "ok", found: total > 0 };
}

/**
 * Verify ONE citation live (with caching). Returns the reduceVerdict result.
 *
 * 🔴 CONTRACT: CALL SEQUENTIALLY. The shared `cache` is read BEFORE the `await` and written AFTER
 * it (three places below), so two concurrent calls sharing the same `cache` will both miss the
 * write and both fall through to the network. This doesn't corrupt the data — the resolvers are
 * deterministic, and the second call writes an equivalent value — but it's extra requests to
 * CrossRef / OpenAlex / Semantic Scholar / arXiv / NVD, i.e. a direct route to a 429, which is
 * exactly why the neighboring `bib-authors.mjs` has 900ms pauses.
 *
 * Today the contract IS HONORED: the only caller is `main()` in this same file (a sequential
 * `for … of` with `await`), so the interleaving `require-atomic-updates` warns about does not
 * exist. The rule is deliberately left at `warn` for that reason: it judges the SHAPE, not the
 * fact of it. But the function IS EXPORTED and takes a shared cache — exactly what gets
 * parallelized via `Promise.all` — so the warning is left visible rather than suppressed. The real
 * fix would be caching UNRESOLVED promises in the cache (in-flight deduplication) rather than
 * values; that's incompatible with the current JSON-based `saveCache()` and so hasn't been done
 * (measured 2026-08-28).
 */
export async function verifyCitationLive(citation, { cache = {}, offline = false } = {}) {
  citation = normalizeIdentifiers(citation); // clean doi:/arXiv: prefixes + trailing punct first
  const commitFlags = checkCommit(citation);

  if (offline) {
    // No network: everything degrades to unresolvable (matches narrowed-false).
    return reduceVerdict(citation, [], commitFlags);
  }

  const evidence = [];

  // Paper resolvers (skip when the citation is CVE/commit-only).
  if (citation.doi || citation.arxiv || citation.title) {
    const resolvers = [
      { name: "crossref", fn: crossrefResolve },
      { name: "openalex", fn: openalexResolve },
      { name: "semantic_scholar", fn: semanticScholarResolve },
      { name: "arxiv", fn: arxivResolve },
    ];
    for (const { name, fn } of resolvers) {
      const ck = cacheKey(
        name,
        citation.doi
          ? `doi:${citation.doi}`
          : citation.arxiv
            ? `arxiv:${citation.arxiv}`
            : `title:${titleHash(citation.title)}`,
      );
      let resp;
      if (cache[ck]) {
        resp = cache[ck];
      } else {
        resp = await fn(citation);
        if (resp && resp.transport === "ok") cache[ck] = resp; // only cache successes
      }
      if (resp) evidence.push(classifyResolver(citation, resp));
    }

    // DOI authority (doi.org) — the ONLY source that can disprove a DOI (M1).
    // Always consulted when a DOI is present so a registry-404 never becomes
    // `false` without doi.org confirming responseCode 100.
    if (citation.doi) {
      const ck = cacheKey("doi_authority", citation.doi);
      let auth = cache[ck];
      if (!auth) {
        auth = await doiAuthorityCheck(citation);
        // Cache only POSITIVE existence; never cache authority-absent (100), so a
        // freshly-minted DOI checked pre-propagation isn't pinned to `false` on re-run.
        if (auth && auth.transport === "ok" && auth.responseCode !== 100) cache[ck] = auth;
      }
      if (auth) evidence.push(classifyDoiAuthority(auth));
    }
  }

  // CVE via NVD.
  if (citation.cve) {
    const ck = cacheKey("nvd", citation.cve.toUpperCase());
    let nvd = cache[ck];
    if (!nvd) {
      nvd = await nvdCheck(citation);
      if (nvd && nvd.transport === "ok") cache[ck] = nvd;
    }
    const e = checkNvd(citation, nvd);
    if (e) evidence.push(e);
  }

  return reduceVerdict(citation, evidence, commitFlags);
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────────────

function loadInput(argv) {
  const path = argv.find((a) => !a.startsWith("-"));
  const raw =
    path && path !== "-"
      ? readFileSync(path, "utf8")
      : readFileSync(0, "utf8"); // stdin
  if (path && extname(path).toLowerCase() === ".bib") return parseBib(raw);
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [parsed];
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) {
    process.stderr.write(
      "usage: verify-cites.mjs <cites.json | refs.bib | -> [--offline]\n",
    );
    process.exit(0);
  }
  const offline = argv.includes("--offline");

  let cites;
  try {
    cites = loadInput(argv);
  } catch (e) {
    process.stderr.write(`error: could not read input — ${e.message}\n`);
    process.exit(2);
  }

  const cache = loadCache();
  const results = [];
  for (const c of cites) {
    if (!c || !c.id) {
      results.push({ id: c?.id ?? null, verdict: "unresolvable", reason: "citation has no id", matched_db: null });
      continue;
    }
    results.push(await verifyCitationLive(c, { cache, offline }));
  }
  saveCache(cache);

  process.stdout.write(JSON.stringify(results, null, 2) + "\n");

  const n = results.length;
  const f = results.filter((r) => r.verdict === "false").length;
  const u = results.filter((r) => r.verdict === "unresolvable").length;
  const t = results.filter((r) => r.verdict === "true").length;
  const flagged = results.filter((r) => r.flags && r.flags.length).length;
  process.stderr.write(
    `\nverify-cites: ${n} citation(s) — ${t} true, ${f} false (fabrication), ${u} unresolvable` +
      (flagged ? `, ${flagged} with hygiene flag(s)` : "") +
      `\n${f > 0 ? "FAIL — fabrication(s) found (exit 1)" : "PASS — no fabrication (unresolvable is advisory)"}\n`,
  );
  process.exit(f > 0 ? 1 : 0);
}

// Run as CLI only when invoked directly (not when imported by the test).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
