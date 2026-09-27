# Verifying a bibliography against reality — is this solved?

**Question this file answers:** could `paperlint`'s "does every `.bib` entry name a real work, with the
right authors" check depend on an existing, maintained package instead of shelling out to Crossref /
Semantic Scholar / arXiv / DBLP itself?

**Verdict: no dependable dependency exists, but two API-level facts we were not using would cut our
own runtime by roughly 5–8×.** Depend on nothing; keep the in-repo checker; add Semantic Scholar's
`/paper/batch`, OpenAlex's `|`-joined `filter=doi:`, and the Crossref polite pool's raised concurrency.
Everything found in the "verify existence + author list against a real record" niche is either (a) a
research prototype released alongside one paper, (b) a solo weekend project pushed in the last few
months with single-digit-to-low-hundred commits and no PyPI/npm listing, or (c) a Zotero/LaTeX tool
that solves an adjacent problem (parsing, key generation, unused-entry detection) and does not touch
external databases at all. None ship a bulk/batch mode faster than calling the same three-to-five
free APIs ourselves would already be, and every one of them is Python — none is an npm package, so
"depend on it" would mean shelling out to a Python subprocess from a Node 22 tool. That includes
`rebiber` itself: this file corrects our earlier read of it (below) — the maintained line is GitHub
1.4, not the 2021 PyPI 1.1.3 our toolchain currently installs — but even 1.4 doesn't clear the bar,
because its bundled venue data is ML/NLP/CV/IR only.

---

## Comparison table

Checked 2026-09-27, via GitHub READMEs/WebFetch summaries unless marked otherwise. Star/commit counts
and "last activity" are as reported by the fetch, not independently re-verified against the live repo
— treat anything below as **[B]** (read a secondary description) rather than **[A]** (read the
primary source myself), except where a direct quote is given.

| tool                                                                | verifies                                                                                                                                                                                                                                                           | online/offline                                                                                                                              | install                                                                                                                                                       | license                           | maintenance signal                                                                                                                                     | batch/bulk                                                                                                                                                                               | verdict                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **rebiber 1.4** (yuchenlin, GitHub HEAD — **not** the PyPI package) | rewrites entry to DBLP/ACL-anthology record (existence + authors + venue, by _replacing_ the entry); `--dry-run --report` now previews without rewriting, `-s True` keeps short venue names, `--live-lookup` falls back to a live DBLP search on a local-data miss | offline-first against a bundled, **monthly-refreshed** local DBLP/anthology snapshot; only `--live-lookup` goes to the network              | **GitHub only, and its own README says so**: _"Install from GitHub only. We do not publish or support PyPI (`pip install rebiber` is a 2021 1.1.3 release)."_ | not stated in the fetched excerpt | active — 1.4 migrates to `bibtexparser 2`, raises the Python floor to 3.10                                                                             | one bib file per run; the local-snapshot design makes that run fast regardless                                                                                                           | **narrower than it looks, not simply rejected** — see the callout right below the table                                                                                                                                                                    |
| **hallucite** (se-uhd)                                              | title + authors primarily, DOI/venue/year via 5 DBs (offline DBLP mirror first, then CrossRef/DOI/arXiv/OpenAlex/S2); LLM only for human-in-the-loop triage of what's left unresolved                                                                              | **offline-first**: local DBLP mirror built from Dagstuhl monthly snapshot (~3.8 GB, ~5 min build), only escalates to the network for misses | `mise install` + `mise run fetch-dblp-dump` + `mise run build-dblp`; ships as a Claude Code / Codex CLI plugin, not a pip/npm package                         | not stated in README              | 83 commits, active CI, no version tag seen                                                                                                             | offline pass over the whole PDF's refs is effectively bulk (SQLite lookups); network fallback is per-entry                                                                               | closest in spirit to our DBLP pass — the offline-mirror idea is real and reusable _as an idea_, but it's a Python-only agent-skill bundle, not an importable package, and license is unstated                                                              |
| **clibib** (from arXiv:2604.03159)                                  | deterministic **identifier resolution** — given a DOI/arXiv-id/ISBN/PMID it returns exactly one record via the Zotero Translation Server (falls back to CrossRef on an empty `/search`); title match via token-Jaccard ≥0.3                                        | online                                                                                                                                      | PyPI, MIT, "≈230 lines of Python, 2 runtime deps (`requests`, `python-dotenv`)"                                                                               | MIT                               | released alongside a Sept-2026 arXiv paper; no independent release history yet                                                                         | not documented as batched — one identifier per call                                                                                                                                      | narrower than what we need: it fixes/retrieves a record given a _known-good_ id, not "does this claimed entry match a real one" — a retrieval tool, not a verifier                                                                                         |
| **bibverify** (Hylouis233)                                          | DOI/PMID/PMCID/arXiv + title/authors/year/venue/pages across **9 providers** (Crossref, OpenAlex, S2, PubMed, Europe PMC, CORE, DBLP, arXiv, bioRxiv)                                                                                                              | online, with an **expiring SQLite cache of successful responses only** (TTL 168h default)                                                   | `pip`, `uv tool install`, Docker; npm wrapper (`npx @hylouis233/bibverify`) "planned v0.4.0", not shipped                                                     | MIT                               | v0.3.0, 51 commits, 100 stars, CI across OS/Python matrix — the most conventionally "maintained"-looking of the group                                  | shared connection pool + retry/backoff/`Retry-After`, `delay_between_requests` (default 0.5s); README's own benchmark is explicitly disclaimed as "not a complete scientific evaluation" | the best-engineered of the bunch, but pre-1.0, single-maintainer, npm channel not live yet                                                                                                                                                                 |
| **citeproof** (xiehuanyi)                                           | existence + author/year/venue/DOI/arXiv-id match across Crossref, DBLP, S2, OpenAlex, arXiv; verdicts `verified / metadata_mismatch / inconclusive / likely_hallucinated`                                                                                          | online only                                                                                                                                 | `pip install git+…`, not on PyPI                                                                                                                              | MIT                               | **4 commits visible** — early/inactive                                                                                                                 | `--workers` flag (default 3); README benchmarks 1 worker ≈47s vs 3 workers ≈4s for its test set, and warns raising workers past API throughput does nothing                              | too new/thin to trust; but its own worker benchmark independently confirms our finding that concurrency, not CPU, is the lever                                                                                                                             |
| **reference-validator** (bet-lab)                                   | DOI vs Crossref, arXiv detection, "dual validation" flagging local-vs-API conflicts; also touches DBLP/PubMed/Zenodo/DataCite/OpenAlex                                                                                                                             | online                                                                                                                                      | `uv tool install git+…`                                                                                                                                       | Apache-2.0                        | 60 commits, no date surfaced                                                                                                                           | `--workers` (default 10), `--delay` (default 1.0s)                                                                                                                                       | same shape as the others: solo project, git-only install                                                                                                                                                                                                   |
| **Bibtex-Verifier** (Ritesh778 / merfanian forks)                   | Crossref + OpenAlex + Semantic Scholar; web-app framing ("catch errors & hallucinated references")                                                                                                                                                                 | online                                                                                                                                      | web app / local Flask-style app, not a library                                                                                                                | not confirmed                     | multiple parallel forks (Ritesh778, merfanian, Slowist-Lee) — a sign of "everyone reinvents this small thing," not of one canonical maintained project | not documented                                                                                                                                                                           | a UI tool for a human pasting one `.bib`, wrong shape for a CI dependency                                                                                                                                                                                  |
| **VeriBib** (Ferry-Li)                                              | cross-references against **Google Scholar** to catch fabrications                                                                                                                                                                                                  | online, scrapes Google Scholar                                                                                                              | GitHub only                                                                                                                                                   | not confirmed                     | not confirmed                                                                                                                                          | not documented                                                                                                                                                                           | Google Scholar has no public API and scraping it is a ban-prone, unstable foundation — worse than what we have                                                                                                                                             |
| **Better BibTeX** (Zotero plugin)                                   | _nothing external_ — it generates stable citation keys and exports formats from a Zotero library the user already curated                                                                                                                                          | offline (operates on your own library)                                                                                                      | Zotero plugin                                                                                                                                                 | AGPL-3.0                          | mature, years of releases, widely used                                                                                                                 | n/a                                                                                                                                                                                      | **not a verifier at all** — it assumes your Zotero entry is already correct and just keeps the citation key stable across edits. Wrong tool for this problem, included because it's the obvious "isn't this solved by reference-manager software" question |
| **checkcites** (CTAN/LuaTeX)                                        | unused/undefined references between `.bib` and `.aux`/`.bcf` — a **local consistency** check, no external database at all                                                                                                                                          | offline                                                                                                                                     | TeX Live (bundled)                                                                                                                                            | mature CTAN package               | stable, part of TeX Live                                                                                                                               | n/a                                                                                                                                                                                      | answers a different question ("did I cite everything I defined"), not "is this a real paper"                                                                                                                                                               |
| **GPTZero / Paperpile "citation checker"**                          | existence + hallucination flagging, marketed at authors/reviewers after the NeurIPS-2025 incident (GPTZero found 53/4,841 accepted papers with fabricated cites)                                                                                                   | online, hosted SaaS                                                                                                                         | web upload only, no API/CLI for automation                                                                                                                    | proprietary                       | commercial product, actively marketed                                                                                                                  | unknown, not exposed for programmatic bulk use                                                                                                                                           | not integrable into a CLI linter at all — no API surface to call from Node                                                                                                                                                                                 |

### 🔴 Correction to our own prior verdict on rebiber — and a live bug it exposes

Our original rejection of rebiber (setuptools-broken install, DBLP-snapshot miss, forced rewrite to
long booktitles) was measured against **PyPI `rebiber` 1.1.3, released 2021-09-08**. That is not the
tool's current state, and — checked while writing this file — **it is not even the artifact rebiber's
own maintainer wants installed.** Its README says outright:

> Install from GitHub only. We do not publish or support PyPI (`pip install rebiber` is a 2021 1.1.3
> release).

`paperlint`'s toolchain currently pins `rebiber>=1.1.3` and installs it **from PyPI** — meaning it is
running exactly the release the upstream maintainer disowns, five point-releases and a bibtexparser
major-version migration behind. Filed as **paperlint#114**.

GitHub HEAD (1.4) fixes two of our three original complaints in principle: `--dry-run --report` can
preview matches without rewriting the entry (no forced long booktitle unless asked for), and
`-s True` keeps short venue abbreviations; `--live-lookup` adds a live-DBLP fallback for the
local-snapshot-miss case that burned us before. It does **not** fix the shape of the underlying
problem for us: its bundled venue data is **ML/NLP/CV/IR only** — no CCS, USENIX Security, S&P/Oakland,
ICSE, or FSE — so any reference to a security or software-engineering venue falls straight through to
`--live-lookup` (a live, unbatched DBLP query, the exact bottleneck this file is about) or is left
unmatched. **Verdict on rebiber specifically: worth re-pointing our toolchain at GitHub 1.4 instead of
the disowned PyPI 1.1.3 regardless (that's a straight bug-fix, tracked in #114), but not worth adopting
as the existence/author checker itself** — its offline-snapshot idea is sound (same shape as
hallucite's, below), its venue coverage is not ours, and it still rewrites rather than reports unless
`--dry-run` is remembered on every invocation.

## What "solved" would require, and why nothing here clears the bar

A dependency worth taking has to be (1) **on a registry** (npm ideally, or a PyPI package with a clean
wheel — not `pip install git+…`), (2) **maintained** past a single paper's release, (3) **licensed**
clearly, and (4) **faster or no slower** than calling the free APIs directly. Every project above fails
at least one of these:

- **rebiber, citeproof, clibib, reference-validator, bibverify's Python line** — git-only or PyPI-only
  install, none published to npm. A Node 22 linter would be shelling out to a Python venv it has to
  provision itself — the same failure class that sank `rebiber` (its `bibtexparser` wheel breaking on
  modern `setuptools`), just relocated to a different Python package.
- **hallucite** is the one idea genuinely worth stealing rather than depending on: an **offline DBLP
  mirror**, rebuilt monthly from the Dagstuhl CC0 dump (`dblp.xml.gz`, updated on every DBLP rebuild —
  <https://dblp.org/faq/1474679.html>), turns "one DBLP query per reference, rate-limited" into "one
  3.8 GB SQLite build, then instant local lookups." That is a real fix for the exact bottleneck named
  in our own script's docstring ("DBLP rate limits at >1 req/s"). It is not something to `npm install`;
  it is a pattern (`fetch dump → build local index → query locally → escalate misses`) our own script
  could adopt without taking hallucite as a dependency.
- **Everything web-UI-shaped** (Bibtex-Verifier forks, GPTZero, Paperpile) has no CLI/API a build step
  can call.
- **Better BibTeX and checkcites** are not verifiers against reality at all — they were checked because
  "doesn't Zotero/LaTeX already solve this" is the natural next question, and the honest answer is no:
  BBT trusts whatever is already in your Zotero library, and checkcites only compares your `.bib`
  against your own `.tex`, never against an external database.
- **No maintained project publishes a batch/bulk verification API of its own.** The closest thing —
  citeproof's and reference-validator's `--workers` flags — is just client-side concurrency against the
  _same_ public APIs we already call, with no batching at the HTTP level. Their own numbers (citeproof:
  1 worker ≈47s → 3 workers ≈4s on its test set, extra workers "no faster") independently confirm what
  our own 3.5–7 min runtime already suggests: **the bottleneck is round trips, not our per-request
  logic**, which points straight at the API-level fixes below rather than at swapping tools.

## API-level speedups we are not using, ranked by expected gain

1. **Semantic Scholar `/graph/v1/paper/batch`** — up to **500 mixed identifiers (DOI/arXiv/PMID/…) in
   one POST**, replacing up to 500 of our per-entry calls with one round trip
   (<https://api.semanticscholar.org/api-docs/graph#tag/Paper-Data/operation/post_graph_get_papers>).
   For a 27-reference file this alone turns Semantic Scholar's contribution from ~27 sequential
   requests into 1. **Highest expected gain of the three**, because it removes an entire per-entry
   network round-trip rather than just widening its allowed rate.

2. **DBLP: switch from live per-entry queries to an offline mirror**, the hallucite pattern above.
   DBLP's live API has no published numeric rate limit — the FAQ only asks callers to "tone down"
   scripts and offers a self-hosted SPARQL/dump route for anyone needing volume
   (<https://dblp.org/faq/Am+I+allowed+to+crawl+the+dblp+website.html>) — which is exactly the
   unpredictability our docstring already blames for the 3.5–7 min runtime ("DBLP rate limits at >1
   req/s, timeouts, retries"). A monthly dump (`https://dblp.org/xml/release/`, or the Dagstuhl-hosted
   snapshot) turns every DBLP author-sequence comparison into a local SQLite lookup. **Second-highest
   gain** because it's specifically the part our own docstring names as the slow one, but it costs a
   ~3.8 GB local artifact and a monthly refresh job — a real added complexity, not free.

3. **OpenAlex: `filter=doi:<doi1>|<doi2>|…`**, joining **up to 50–100 DOIs per call** with `|` (OR)
   inside one `filter=` parameter (confirmed by OpenAlex's own blog post,
   <https://blog.openalex.org/fetch-multiple-dois-in-one-openalex-api-request/>, and its help docs).
   For a paper with ~27 references this collapses OpenAlex's entire contribution into 1 request instead
   of up to 27. Ranked third only because our current script does not query OpenAlex at all today per
   the task description (Crossref + S2 + arXiv + DBLP) — so this is a net-new win, not a replacement of
   an existing slow path, and adding a fourth provider is itself a small scope increase to weigh.

4. **Crossref: send `mailto=` for the polite pool, and prefer `/works/{doi}` (single-record) over
   `/works?query=` (list) lookups.** Crossref's Dec-2025 rate-limit revision documents the public pool
   at 5 req/s (single-record) / 1 req/s (list) with concurrency 1, versus the polite pool at **10 req/s
   / 3 req/s with concurrency 3** (<https://www.crossref.org/blog/announcing-changes-to-rest-api-rate-limits/>).
   Our script already sends `mailto` (see its docstring: "THE ADDRESS IS THE CONSUMER'S, NOT OURS"), so
   this is confirmation the polite pool is already in effect, not a new lever — but the single-record
   vs. list distinction is: a citation with a known DOI should hit `/works/{doi}` (5–10 req/s) rather
   than the title-search `/works?query.bibliographic=` (1–3 req/s) fallback path, and it's worth
   auditing which of our 27 references fall through to the slower list endpoint today.

Combined, (1)+(3) should remove most of the _count_ of round trips for entries that carry a DOI or
arXiv id (the common case), and (2) removes the specific bottleneck our own docstring names for
authors-vs-venue checks. None of these require a new dependency — they are call-shape changes to the
same four APIs the script already knows how to speak to (plus adding OpenAlex, which it does not
currently query).

---

## Status

Written 2026-09-27 from WebSearch/WebFetch passes over GitHub READMEs, arXiv:2604.03159, and the
Crossref/OpenAlex/Semantic Scholar/DBLP official docs — no tool below was cloned and run locally, so
every non-quoted maintenance/star claim is **[B]**, and the "closest to solved" claim (hallucite) rests
on its README's self-description, not an independent audit of its DBLP-mirror code.

Sources:
[rebiber](https://github.com/yuchenlin/rebiber) ·
[rebiber README (raw, checked for the 1.4 / PyPI-disowned correction)](https://raw.githubusercontent.com/yuchenlin/rebiber/main/README.md) ·
[hallucite](https://github.com/se-uhd/hallucite) ·
[BibTeX Citation Hallucinations in Scientific Publishing Agents (arXiv:2604.03159)](https://arxiv.org/abs/2604.03159) ·
[bibverify](https://github.com/Hylouis233/bibverify) ·
[citeproof](https://github.com/xiehuanyi/citeproof) ·
[reference-validator](https://github.com/bet-lab/reference-validator) ·
[Bibtex-Verifier](https://github.com/merfanian/Bibtex-Verifier) ·
[VeriBib](https://github.com/Ferry-Li/VeriBib) ·
[Better BibTeX for Zotero](https://retorque.re/zotero-better-bibtex/) ·
[checkcites (CTAN)](https://ctan.org/tex-archive/support/checkcites) ·
[Paperpile — a new tool to fight hallucinations in preprints](https://paperpile.com/blog/citation-checker-hallucinations/) ·
[Semantic Scholar Graph API — batch endpoint](https://api.semanticscholar.org/api-docs/graph) ·
[OpenAlex blog — fetch multiple DOIs in one request](https://blog.openalex.org/fetch-multiple-dois-in-one-openalex-api-request/) ·
[OpenAlex — Filter docs](https://help.openalex.org/api/filtering/) ·
[Crossref — Announcing changes to REST API rate limits](https://www.crossref.org/blog/announcing-changes-to-rest-api-rate-limits/) ·
[Crossref — Access and authentication (polite pool)](https://www.crossref.org/documentation/retrieve-metadata/rest-api/access-and-authentication/) ·
[DBLP — How can I download the whole dblp dataset?](https://dblp.org/faq/1474679.html) ·
[DBLP — Am I allowed to crawl the dblp website?](https://dblp.org/faq/Am+I+allowed+to+crawl+the+dblp+website.html) ·
[Crossref — Public data files and snapshots](https://www.crossref.org/documentation/retrieve-metadata/bulk-downloads/)
