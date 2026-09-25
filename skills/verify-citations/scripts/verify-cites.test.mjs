#!/usr/bin/env node
/**
 * verify-cites.test.mjs — offline, deterministic tests for the PURE reducer.
 *
 * These exercise reduceVerdict / classifyResolver / checkNvd / checkCommit with
 * injected fixtures — NO network. They pin the narrowed-false semantics:
 *   - a resolvable id that fails, or a DOI on the wrong paper → false
 *   - a title you simply can't find → unresolvable (NOT false)
 *
 * Run: npx vitest run skills/verify-citations/scripts/verify-cites.test.mjs
 */

import assert from "node:assert/strict";
import { test } from "vitest";
import {
  levenshtein,
  titleSimilarity,
  titlesMatch,
  yearMatch,
  titleRelation,
  bestTitleRelation,
  candidateTitles,
  classifyResolver,
  classifyDoiAuthority,
  checkNvd,
  checkCommit,
  reduceVerdict,
  parseBib,
  parseArxivFeed,
  normalizeDoi,
  normalizeArxiv,
  normalizeIdentifiers,
} from "./verify-cites.mjs";

/** One vitest case per check, named by it. */
function ok(cond, name) {
  test(name, () => {
    assert.ok(cond, name);
  });
}
function eq(actual, expected, name) {
  ok(actual === expected, `${name} (got ${JSON.stringify(actual)})`);
}

// ── string helpers ──────────────────────────────────────────────────────────
console.log("string helpers:");
eq(levenshtein("kitten", "sitting"), 3, "levenshtein kitten/sitting = 3");
eq(levenshtein("abc", "abc"), 0, "levenshtein identical = 0");
ok(
  titleSimilarity("Attention Is All You Need", "attention is all you need") >
    0.99,
  "case/normalize identical titles",
);
ok(
  titlesMatch(
    "Deep Residual Learning for Image Recognition",
    "Deep Residual Learning for Image Recognitionn",
  ),
  "one typo still ≥0.70",
);
ok(
  !titlesMatch(
    "Attention Is All You Need",
    "A Survey of Reinforcement Learning",
  ),
  "unrelated titles < 0.70",
);
ok(yearMatch(2020, 2021), "year ±1 ok");
ok(!yearMatch(2015, 2020), "year off by 5 fails");
ok(yearMatch(undefined, 2020), "missing claimed year is not disqualifying");

// ── (1) real DOI that matches → true ─────────────────────────────────────────
console.log("\n(1) DOI resolves to the matching paper → true:");
{
  const cite = {
    id: "vaswani2017",
    doi: "10.5555/3295222.3295349",
    title: "Attention Is All You Need",
    year: 2017,
  };
  const crossref = {
    db: "crossref",
    transport: "ok",
    query: "doi",
    record: { title: "Attention is all you need", year: 2017 },
  };
  const ev = classifyResolver(cite, crossref);
  eq(ev.status, "matched", "classify → matched");
  const v = reduceVerdict(cite, [ev], checkCommit(cite));
  eq(v.verdict, "true", "verdict true");
  eq(v.matched_db, "crossref", "matched_db = crossref");
}

// ── (2) DOI resolves to an UNRELATED title → false (DOI_MISMATCH) ─────────────
console.log(
  "\n(2) DOI resolves but to an unrelated paper → false (DOI_MISMATCH):",
);
{
  const cite = {
    id: "ghost2021",
    doi: "10.1000/realbutwrong",
    title: "A Formal Verification Framework for Autonomous Agents",
    year: 2021,
  };
  const openalex = {
    db: "openalex",
    transport: "ok",
    query: "doi",
    record: { title: "Photosynthesis in Deep-Sea Bacteria", year: 2009 },
  };
  const ev = classifyResolver(cite, openalex);
  eq(ev.status, "doi_mismatch", "classify → doi_mismatch");
  const v = reduceVerdict(cite, [ev], checkCommit(cite));
  eq(v.verdict, "false", "verdict false");
  ok(/DOI_MISMATCH/.test(v.reason), "reason names DOI_MISMATCH");
}

// ── (3) made-up arXiv id that resolves to nothing → false ────────────────────
console.log(
  "\n(3) provided arXiv id resolves to nothing → false (RESOLVED_TO_NOTHING):",
);
{
  const cite = {
    id: "fake2023",
    arxiv: "2399.99999",
    title: "Neural Fabrication Networks",
    year: 2023,
  };
  // Every resolver either can't find the id or is a title miss; the arXiv id-keyed
  // miss is the fabrication evidence.
  const arxiv = { db: "arxiv", transport: "ok", query: "arxiv", record: null };
  const s2 = {
    db: "semantic_scholar",
    transport: "ok",
    query: "arxiv",
    record: null,
  };
  const crossref = {
    db: "crossref",
    transport: "ok",
    query: "title",
    records: [],
  };
  const evs = [arxiv, s2, crossref].map((r) => classifyResolver(cite, r));
  eq(evs[0].status, "id_unmatched", "arxiv classify → id_unmatched");
  const v = reduceVerdict(cite, evs, checkCommit(cite));
  eq(v.verdict, "false", "verdict false");
  ok(/RESOLVED_TO_NOTHING/.test(v.reason), "reason names RESOLVED_TO_NOTHING");
}

// ── (4) title not found anywhere, nothing else → unresolvable (NOT false) ─────
console.log(
  "\n(4) title-only, found nowhere → unresolvable (the narrowed-false rule):",
);
{
  const cite = {
    id: "regional1998",
    title: "Water Resource Management of the Balkhash Region",
    year: 1998,
  };
  // Title searches across all four DBs come back empty (unindexed regional work).
  const responses = ["crossref", "openalex", "semantic_scholar", "arxiv"].map(
    (db) => ({
      db,
      transport: "ok",
      query: "title",
      records: [],
    }),
  );
  const evs = responses.map((r) => classifyResolver(cite, r));
  ok(
    evs.every((e) => e.status === "title_miss"),
    "all classify → title_miss",
  );
  const v = reduceVerdict(cite, evs, checkCommit(cite));
  eq(v.verdict, "unresolvable", "verdict unresolvable — NOT false");
  ok(
    !/fabricat/i.test(v.reason.split("NOT fabrication")[0]),
    "reason does not accuse fabrication",
  );
}

// ── (5) CVE verified vs a mocked NVD hit → true ──────────────────────────────
console.log("\n(5) CVE present, mocked NVD hit → true:");
{
  const cite = { id: "log4shell", cve: "CVE-2021-44228" };
  const nvd = { transport: "ok", found: true };
  const ev = checkNvd(cite, nvd);
  eq(ev.status, "matched", "checkNvd → matched");
  const v = reduceVerdict(cite, [ev], checkCommit(cite));
  eq(v.verdict, "true", "verdict true");
  eq(v.matched_db, "nvd", "matched_db = nvd");
}
console.log("    …and a mocked NVD miss on a well-formed CVE → false:");
{
  const cite = { id: "notacve", cve: "CVE-2099-00001" };
  const nvd = { transport: "ok", found: false };
  const ev = checkNvd(cite, nvd);
  eq(ev.status, "id_unmatched", "checkNvd miss → id_unmatched");
  const v = reduceVerdict(cite, [ev], checkCommit(cite));
  eq(v.verdict, "false", "verdict false");
}
console.log("    …and an NVD outage → unresolvable, never false:");
{
  const cite = { id: "outage", cve: "CVE-2021-44228" };
  const ev = checkNvd(cite, { transport: "error" });
  const v = reduceVerdict(cite, [ev], checkCommit(cite));
  eq(v.verdict, "unresolvable", "NVD unreachable degrades to unresolvable");
}

// ── (6) short/truncated commit SHA → flagged ─────────────────────────────────
console.log("\n(6) short commit SHA → flagged (hygiene, advisory):");
{
  const cite = {
    id: "poc-exploit",
    title: "Attention Is All You Need",
    year: 2017,
    commit: "a1b2c3d", // short (7 chars)
  };
  const flags = checkCommit(cite);
  ok(flags.length === 1 && /short SHA/.test(flags[0]), "short SHA flagged");
  // A hygiene flag must NOT by itself turn a good cite into a fabrication.
  const matchedEv = {
    db: "arxiv",
    status: "matched",
    matchedTitle: "Attention Is All You Need",
    matchedYear: 2017,
  };
  const v = reduceVerdict(cite, [matchedEv], flags);
  eq(v.verdict, "true", "verdict still true despite flag");
  ok(v.flags && v.flags.length === 1, "flag surfaced on output");

  const full = checkCommit({ id: "x", commit: "a".repeat(40) });
  ok(full.length === 0, "full 40-char SHA not flagged");
  const nonhex = checkCommit({ id: "y", commit: "zzz-not-a-sha" });
  ok(
    nonhex.length === 1 && /not a hex/.test(nonhex[0]),
    "non-hex commit flagged",
  );
}

// ── degrade-never-to-false: all resolvers unreachable → unresolvable ──────────
console.log(
  "\n(extra) all resolvers unreachable → unresolvable (network ≠ fabrication):",
);
{
  const cite = {
    id: "netfail",
    doi: "10.1145/3372297.3417231",
    title: "Some Real Paper",
    year: 2020,
  };
  const evs = ["crossref", "openalex", "semantic_scholar", "arxiv"].map((db) =>
    classifyResolver(cite, { db, transport: "error" }),
  );
  const v = reduceVerdict(cite, evs, []);
  eq(
    v.verdict,
    "unresolvable",
    "network failure across the board → unresolvable",
  );
}

// ── matched WINS even alongside an id miss on another DB ──────────────────────
console.log("\n(extra) a match on one DB WINS over an id-miss on another:");
{
  const cite = {
    id: "mixed",
    doi: "10.1/x",
    title: "Real Paper Title",
    year: 2020,
  };
  const matched = {
    db: "crossref",
    transport: "ok",
    query: "doi",
    record: { title: "Real Paper Title", year: 2020 },
  };
  const miss = {
    db: "semantic_scholar",
    transport: "ok",
    query: "doi",
    record: null,
  };
  const evs = [classifyResolver(cite, matched), classifyResolver(cite, miss)];
  const v = reduceVerdict(cite, evs, []);
  eq(v.verdict, "true", "matched wins");
}

// ── .bib parser smoke ─────────────────────────────────────────────────────────
console.log("\n(extra) .bib parser best-effort extraction:");
{
  const bib = `
@article{vaswani2017,
  title = {Attention Is All You Need},
  author = {Vaswani, Ashish and others},
  year = {2017},
  doi = {10.5555/3295222.3295349}
}
@inproceedings{he2016,
  title="Deep Residual Learning",
  year="2016",
  archiveprefix={arXiv},
  eprint={1512.03385}
}
`;
  const cites = parseBib(bib);
  eq(cites.length, 2, "parsed 2 entries");
  eq(cites[0].doi, "10.5555/3295222.3295349", "entry 1 doi");
  eq(cites[1].arxiv, "1512.03385", "entry 2 arxiv eprint");
}

// ═════════════════════════════════════════════════════════════════════════════
// REGRESSION TESTS for the adversarial-review fixes (M1, M2, M3, S1–S4).
// Each pins a bug that must never come back: the gate must NEVER call a REAL
// citation `false`.
// ═════════════════════════════════════════════════════════════════════════════

// ── M1: registry-404 + doi.org says EXISTS → unresolvable, NEVER false ────────
console.log(
  "\n[M1] DOI 404s at every content registry but doi.org confirms it exists → unresolvable:",
);
{
  // A DataCite/Zenodo (or fresh-2026) DOI: Crossref/OpenAlex/S2 have no metadata,
  // yet doi.org handle responseCode 1 = the DOI genuinely resolves.
  const cite = {
    id: "zenodoArtifact",
    doi: "10.5281/zenodo.21511018",
    title: "My Paper's Reproduction Artifact",
    year: 2026,
  };
  const registryMisses = [
    { db: "crossref", transport: "ok", query: "doi", record: null },
    { db: "openalex", transport: "ok", query: "doi", record: null },
    { db: "semantic_scholar", transport: "ok", query: "doi", record: null },
  ].map((r) => classifyResolver(cite, r));
  const authority = classifyDoiAuthority({ transport: "ok", responseCode: 1 });
  eq(
    authority.status,
    "authority_present",
    "doi.org responseCode 1 → authority_present",
  );
  const v = reduceVerdict(cite, [...registryMisses, authority], []);
  eq(
    v.verdict,
    "unresolvable",
    "registry-404 + doi.org-exists → unresolvable, NOT false",
  );
  ok(
    /doi\.org/i.test(v.reason) &&
      !/fabricat/i.test(v.reason.split("NOT fabrication")[0]),
    "reason: exists, metadata unindexed",
  );
}
console.log(
  "    …and doi.org itself says NOT FOUND (responseCode 100) → false:",
);
{
  const cite = {
    id: "fabricatedDoi",
    doi: "10.1000/definitelynotarealdoi99999",
    title: "A Fabricated Paper",
    year: 2023,
  };
  const registryMisses = [
    { db: "crossref", transport: "ok", query: "doi", record: null },
    { db: "openalex", transport: "ok", query: "doi", record: null },
  ].map((r) => classifyResolver(cite, r));
  const authority = classifyDoiAuthority({
    transport: "ok",
    responseCode: 100,
  });
  eq(
    authority.status,
    "authority_absent",
    "doi.org responseCode 100 → authority_absent",
  );
  const v = reduceVerdict(cite, [...registryMisses, authority], []);
  eq(
    v.verdict,
    "false",
    "doi.org authority not-found → false (RESOLVED_TO_NOTHING)",
  );
  ok(/RESOLVED_TO_NOTHING/.test(v.reason), "reason names RESOLVED_TO_NOTHING");
}
console.log(
  "    …and doi.org UNREACHABLE with registry-404s → unresolvable (no disproof):",
);
{
  const cite = {
    id: "unknownAuthority",
    doi: "10.1234/maybe.real",
    title: "Possibly Real Paper",
    year: 2025,
  };
  const registryMisses = [
    { db: "crossref", transport: "ok", query: "doi", record: null },
    { db: "openalex", transport: "ok", query: "doi", record: null },
  ].map((r) => classifyResolver(cite, r));
  const authority = classifyDoiAuthority({ transport: "error" });
  const v = reduceVerdict(cite, [...registryMisses, authority], []);
  eq(
    v.verdict,
    "unresolvable",
    "registry-404 + doi.org unreachable → unresolvable, never false",
  );
}

// ── M2: DOI_MISMATCH false positives from a brittle title test → now match ────
console.log(
  "\n[M2] correct DOIs no longer flagged DOI_MISMATCH (subtitle / abbrev / drift):",
);
{
  // (a) Crossref splits a subtitle into its own field; claimed title carries it.
  const cite = {
    id: "pokemon",
    doi: "10.1/x",
    title: "Gotta Catch 'Em All: A Multistage Framework for Honeypots",
    year: 2020,
  };
  const rec = {
    db: "crossref",
    transport: "ok",
    query: "doi",
    record: {
      title: "Gotta Catch 'Em All",
      subtitle: "A Multistage Framework for Honeypots",
      year: 2020,
    },
  };
  const ev = classifyResolver(cite, rec);
  eq(ev.status, "matched", "subtitle-split title → matched (not doi_mismatch)");
  eq(reduceVerdict(cite, [ev], []).verdict, "true", "verdict true");
}
{
  // subtitle test the OTHER way: record has only the main title, claimed has subtitle.
  const cite = {
    id: "sub2",
    doi: "10.1/y",
    title: "Attention Is All You Need: A Transformer Study",
    year: 2017,
  };
  const rec = {
    db: "openalex",
    transport: "ok",
    query: "doi",
    record: { title: "Attention Is All You Need", year: 2017 },
  };
  eq(
    classifyResolver(cite, rec).status,
    "matched",
    "claimed-has-subtitle, record-plain → matched via containment",
  );
}
{
  // (a') abbreviation / acronym expansion: "Deep CNNs" vs the expansion.
  const cite = {
    id: "cnn",
    doi: "10.1/z",
    title: "Deep CNNs for Image Recognition",
    year: 2016,
  };
  const rec = {
    db: "crossref",
    transport: "ok",
    query: "doi",
    record: {
      title: "Deep Convolutional Neural Networks for Image Recognition",
      year: 2016,
    },
  };
  eq(
    classifyResolver(cite, rec).status,
    "matched",
    "acronym expansion (CNNs↔Conv.Neural Networks) → matched",
  );
  eq(
    titleRelation(
      "Deep CNNs for Image Recognition",
      "Deep Convolutional Neural Networks for Image Recognition",
    ),
    "match",
    "titleRelation acronym → match",
  );
}
{
  // preprint→published drift adds a subtitle clause.
  const cite = {
    id: "drift",
    doi: "10.1/d",
    title: "Prune the Timeline",
    year: 2026,
  };
  const rec = {
    db: "crossref",
    transport: "ok",
    query: "doi",
    record: {
      title: "Prune the Timeline: Fighting Combinatorial Explosion in LLM Code",
      year: 2026,
    },
  };
  eq(
    classifyResolver(cite, rec).status,
    "matched",
    "preprint→published drift → matched",
  );
}
{
  // …but a GENUINELY different paper still trips DOI_MISMATCH → false (invariant holds).
  const cite = {
    id: "wrong",
    doi: "10.1/w",
    title: "A Formal Verification Framework for Autonomous Agents",
    year: 2021,
  };
  const rec = {
    db: "openalex",
    transport: "ok",
    query: "doi",
    record: { title: "Photosynthesis in Deep-Sea Bacteria", year: 2009 },
  };
  eq(
    classifyResolver(cite, rec).status,
    "doi_mismatch",
    "confidently-different titles → doi_mismatch preserved",
  );
}

// ── M3: non-Latin / uncomparable title → NOT doi_mismatch, never false ────────
console.log(
  "\n[M3] non-Latin (uncomparable) title against a Latin record → NOT a mismatch:",
);
{
  const cite = {
    id: "cyrillicDoi",
    doi: "10.1/ru",
    title: "Управление водными ресурсами",
    year: 2019,
  };
  const rec = {
    db: "crossref",
    transport: "ok",
    query: "doi",
    record: { title: "Water Resource Management", year: 2019 },
  };
  const ev = classifyResolver(cite, rec);
  eq(
    ev.status,
    "matched",
    "Cyrillic-vs-Latin → incomparable → matched (id resolves), NOT doi_mismatch",
  );
  eq(
    reduceVerdict(cite, [ev], []).verdict,
    "true",
    "verdict true — never false on an uncomparable title",
  );
  eq(
    bestTitleRelation(
      "Управление водными ресурсами",
      candidateTitles(rec.record),
    ),
    "incomparable",
    "bestTitleRelation → incomparable",
  );
}

// ── S1: normalization preserves unicode letters → two DIFFERENT non-Latin ─────
//        titles do NOT score 1.0 (a fabricated non-Latin cite can't pass as true).
console.log(
  "\n[S1] different Cyrillic titles score LOW (was 1.0 via empty-normalization):",
);
{
  const a = "Управление водными ресурсами Прибалхашья";
  const b = "Совершенно другая научная работа о климате";
  ok(
    titleSimilarity(a, b) < 0.5,
    `different Cyrillic titles < 0.5 (got ${titleSimilarity(a, b).toFixed(2)})`,
  );
  ok(titleSimilarity(a, a) > 0.99, "identical Cyrillic titles still ~1.0");
  ok(
    titleSimilarity("北京大学的研究", "上海的天气报告") < 0.6,
    "different CJK titles score low",
  );
  eq(
    titleRelation(a, b),
    "different",
    "different Cyrillic → 'different' (comparable now)",
  );
  // a title with NO letters/digits normalizes to "" → incomparable, NEVER 1.0
  eq(
    titleSimilarity("★★★ !!!", "▲▲▲ ???"),
    0,
    "punctuation-only titles → 0, not 1.0",
  );
}

// ── S2: arXiv "Error" sentinel entry is detected, not treated as a real paper ─
console.log(
  "\n[S2] arXiv error-sentinel feed → no record (not an 'unrelated paper'):",
);
{
  const errorFeed = `<feed><entry>
    <id>http://arxiv.org/api/errors#incorrect_id_format_for_2399.99999</id>
    <title>Error</title>
    <summary>incorrect id format for 2399.99999</summary>
  </entry></feed>`;
  const recs = parseArxivFeed(errorFeed);
  eq(
    recs.length,
    0,
    "error sentinel skipped → 0 records (id reads as not-found)",
  );
  // and a REAL feed still parses
  const realFeed = `<feed><entry>
    <id>http://arxiv.org/abs/1706.03762v5</id>
    <title>Attention Is All You Need</title>
    <published>2017-06-12T00:00:00Z</published>
  </entry></feed>`;
  const real = parseArxivFeed(realFeed);
  eq(real.length, 1, "a real entry still parses");
  eq(real[0].title, "Attention Is All You Need", "real title extracted");
}

// ── S3: commit SHA must be EXACTLY 40 hex (was: >40 hex accepted) ─────────────
console.log("\n[S3] commit SHA flagged unless exactly 40 hex chars:");
{
  ok(
    checkCommit({ id: "x", commit: "a".repeat(40) }).length === 0,
    "exactly 40 hex → OK",
  );
  const long = checkCommit({ id: "x", commit: "a".repeat(41) });
  ok(
    long.length === 1 && />40|not a valid/.test(long[0]),
    "41 hex chars → flagged (was wrongly accepted)",
  );
  const longer = checkCommit({ id: "x", commit: "a".repeat(64) });
  ok(longer.length === 1, "64 hex chars → flagged");
  ok(
    checkCommit({ id: "x", commit: "a1b2c3d" }).length === 1,
    "short SHA still flagged",
  );
}

// ── S4: .bib parser — booktitle/title, brace-protected acronyms, one-line & indented ─
console.log("\n[S4] .bib parser edge cases:");
{
  // (a) booktitle appears BEFORE title — field('title') must not grab booktitle.
  const bibA = `@inproceedings{k1,
  booktitle = {Proceedings of the Booktitle Conference},
  title = {The Real Paper Title},
  year = {2021}
}`;
  const a = parseBib(bibA)[0];
  eq(a.title, "The Real Paper Title", "title anchored — not booktitle");

  // (b) brace-protected acronym must not truncate at the inner brace.
  const bibB = `@article{k2,
  title = {Evaluating {LLM}-based Systems for Code Review},
  year = {2026}
}`;
  eq(
    parseBib(bibB)[0].title,
    "Evaluating LLM-based Systems for Code Review",
    "brace-protected acronym kept whole",
  );

  // (c1) one-line entry (no \n} at column 0).
  const bibC1 = `@article{k3, title = {A One Line Entry}, year = {2020}, doi = {10.1/abc}}`;
  const c1 = parseBib(bibC1)[0];
  eq(c1.title, "A One Line Entry", "one-line entry title parsed");
  eq(c1.doi, "10.1/abc", "one-line entry doi parsed");

  // (c2) indented closing brace `\n  }`.
  const bibC2 = `@article{k4,
    title = {Indented Closing Brace},
    year = {2019}
  }`;
  eq(
    parseBib(bibC2)[0].title,
    "Indented Closing Brace",
    "indented-closing-brace entry parsed",
  );

  // all four parse together, in sequence (balanced-brace scan resumes correctly).
  eq(
    parseBib(bibA + "\n" + bibB + "\n" + bibC1 + "\n" + bibC2).length,
    4,
    "all 4 entries parsed in sequence",
  );
}

// ── identifier normalization (parser must not manufacture a false `false`) ──────
// Fable re-check MUST-FIX: doi:/arXiv: prefixes + a bib-swallowed trailing period
// were reaching the authority gate verbatim and flipping REAL works to `false`.
{
  eq(
    normalizeDoi("10.1145/3576915.3623218."),
    "10.1145/3576915.3623218",
    "DOI trailing period stripped",
  );
  eq(
    normalizeDoi("doi:10.1145/1234.5678"),
    "10.1145/1234.5678",
    "DOI doi: prefix stripped",
  );
  eq(
    normalizeDoi("https://doi.org/10.1/x"),
    "10.1/x",
    "DOI resolver-URL prefix stripped",
  );
  eq(normalizeDoi("10.1/x"), "10.1/x", "clean DOI untouched");
  eq(
    normalizeArxiv("arXiv:1706.03762"),
    "1706.03762",
    "arXiv: prefix stripped",
  );
  eq(normalizeArxiv("1706.03762"), "1706.03762", "clean arXiv id untouched");
  const n = normalizeIdentifiers({
    id: "x",
    doi: "doi:10.1/y.",
    arxiv: "arXiv:1234.5678",
  });
  eq(n.doi, "10.1/y", "normalizeIdentifiers cleans doi");
  eq(n.arxiv, "1234.5678", "normalizeIdentifiers cleans arxiv");
  // the exact live-reproduced break: a \bibitem DOI with a swallowed sentence period.
  const bib = `\\begin{thebibliography}{9}
\\bibitem{ccs23} A. Author. Title. In Proc. CCS. doi:10.1145/3576915.3623218. 2023.
\\end{thebibliography}`;
  eq(
    parseBib(bib)[0].doi,
    "10.1145/3576915.3623218",
    "bibitem DOI trailing period not swallowed",
  );
}
