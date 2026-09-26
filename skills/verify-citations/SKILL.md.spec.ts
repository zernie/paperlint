// Compiled to SKILL.md by `vigiles compile`. Edit THIS file, never the markdown.
//
// Adopted 2026-08-17 (batch 3). Body carried over VERBATIM so the compiled diff shows
// only what the compiler adds. No `disallowedTools` fence yet — the field landed on
// `SkillSpec` in vigiles branch `claude/skill-disallowed-tools` and is not in a release
// this repo installs, so writing one here would not compile.
import { experimental_skill } from "vigiles/spec";

export default experimental_skill({
  name: "verify-citations",
  description:
    "Verify every citation is a real work with correct metadata, and that the paper states its delta over the NEAREST prior work explicitly — before submit. For each \\cite, confirm the work exists (arXiv id / DOI / venue+year) and that author/title/venue/year are right (WebSearch/WebFetch); never fabricate — mark VERIFY on anything uncertain and flag invented-looking cites; make sure the paper says what it adds over its closest neighbor, and that the one obviously-expected citation a reviewer will miss if absent is present. Use as a pre-submission gate. Compose with draft-paper, map-prior-work, pc-panel-review.",
  tools: [
    "Read",
    "Write",
    "Edit",
    "Grep",
    "Glob",
    "Bash",
    "WebSearch",
    "WebFetch",
    "Agent",
  ],
  body: `
# verify-citations — every cite real, the delta explicit

## Run me

🔴 FIRST, before any other step:

\`\`\`
node .claude/skills/paper-pipeline/scripts/announce.mjs verify-citations <paper-dir>
\`\`\`

An advisory pass cannot be observed failing — silence is both its error state and its normal
state — so starting is an event, and events get written down.

Reviewers reject on a single fabricated or wrong citation — it reads as either sloppiness or a
hallucinated bibliography, and either one is fatal. And they reject on "this was already done by ___" if
your delta over the nearest prior work isn't spelled out. This skill closes both holes before submit.

## 🔴 This is a CONTINUOUS check, not a step you finish

**It re-runs whenever a \`\\cite\` is added or moved.** Not once, not "at the end" — every time the
bibliography changes, including the edit you make on the last day. Scorecard row **\`cites\`** in
\`<paper-dir>/PIPELINE-STATUS.md\`; see the CONTINUOUS section of \`paper-pipeline\`.

- **A pass dated before the current text is STALE, and stale reads as green.** The date in the \`cites\`
  row is compared against the paper's own mtime, and \`../paper-pipeline/scripts/pipeline-check.mjs\` reports the
  mismatch — because a \`☑\` from three days and forty edits ago is worse than a \`☐\`: it looks closed.
- **"We checked last cycle" does not count.** Say it plainly, because it is the exact sentence that
  ships a fabricated cite: a review round adds text, added text adds citations, and the run that
  cleared the bibliography never saw them.
- A single new \`\\cite\` is enough to fire it. There is no batch size below which this is skippable.

*This skill used to sit at a number in the middle of a stage list, which made it read like a one-shot
step you tick off and move past — one of the three concrete errors that numbering produced, and the
reason the list was replaced on 2026-08-03. The project rule was always that it re-runs every cycle;
the position contradicted the rule, and the position is what people followed.*

## 1. Every \\cite is a real work with correct metadata

For EACH reference in the \`.bib\` / bibliography:

- **Confirm it exists.** A real **arXiv id**, **DOI**, or **venue + year** that resolves. WebSearch the
  exact title + first author; WebFetch the landing page. "I'm fairly sure this paper exists" is not
  verification.
- **Confirm the metadata is right** — author list, exact title, venue, year. LLM-drafted bibs love to
  merge two papers, shift a year, or attach the wrong venue to a real title. Check each field.
- **Confirm it says what you attribute to it.** If you cite a number or claim, open the source and check
  the number is actually in it — cite the source's real range, not a rounded max.
- **Never invent a citation to fill a gap.** If a claim needs support you don't have, either find real
  support or soften the claim. Do not manufacture a plausible-looking cite.

## 2. Mark uncertainty, flag the invented-looking

- Anything you couldn't fully confirm → mark **\`% VERIFY\`** in the \`.tex\` at the cite site and resolve it
  before submit. A VERIFY that survives to submission is a bug.
- **Flag invented-looking cites explicitly** — a too-perfectly-on-topic title, an author+venue combo that
  doesn't turn up, a DOI that 404s. These are the ones that sink the paper; treat a non-resolving cite as
  guilty until proven real.
- Archive the verified set (id/DOI + one-line "confirms X") so it's reusable across papers in the area.

## 3. The delta over the NEAREST prior work must be explicit

The most common substantive reject is "this was already done by ___." Defend against it in the prose,
not just the bibliography:

- Identify the **single closest** prior work and state, in one sentence a reviewer can quote, what THIS
  paper adds that it didn't do. Nearest-neighbor, not a vague "unlike prior work."
- If the nearest work made the *argument* and you supply the *measurement* (or vice versa), say exactly
  that — the delta is the contribution.

## 4. The one obviously-expected citation

Every subfield has a paper a reviewer expects to see; its absence reads as "the authors don't know the
area." Ask: what is the one work a reviewer in this exact niche will look for first? Make sure it's cited
and positioned. If you genuinely shouldn't cite it, know why.

## 5. The deterministic reducer — \`scripts/verify-cites.mjs\`

Sections 1–4 are LLM judgment: good for the *delta* and the *expected-citation* calls, but non-reproducible
for the mechanical part — "does this id actually resolve?". \`scripts/verify-cites.mjs\` compiles that part into
a deterministic, cacheable gate (same "prose isn't policy → make it a self-checking artifact" move as
\`build-benchmark\`). Ported fresh (own code) from the OSS mining note
\`papers/research/oss-skill-mining-imbad0202.md\` (STEAL #1) + the CVE/PoC-SHA pinning from
\`oss-skill-mining-euzun.md\`.

**What it does.** For each citation it hits four real databases — Crossref, OpenAlex, Semantic Scholar,
arXiv — DOI/arXiv-id first, then a title search. Title comparison is **robust**, not raw Levenshtein: it
also does token-set containment + acronym expansion, so a split subtitle ("Gotta Catch 'Em All" vs the
subtitled full title), an abbreviation ("Deep CNNs" ↔ "Deep Convolutional Neural Networks"), or a
preprint→published title drift does **not** read as an unrelated paper. Normalization preserves Unicode
letters, so two *different* non-Latin titles no longer collapse to the same empty string. A title search
match still needs year within ±1. A \`CVE-YYYY-NNNNN\` is checked against NVD; a PoC/exploit \`commit\` is
checked for **exactly** 40 hex chars (short / >40 / malformed → advisory flag, not a verdict).

**The DOI-authority gate (M1 — why a 404 is never fabrication).** A 404 from a *content registry*
(Crossref / OpenAlex / Semantic Scholar) means only "this registry has no metadata," which is the **common
case** for DataCite/Zenodo DOIs and freshly-minted 2026 DOIs (including a paper's own artifact DOI). It is
**not** disproof of existence. So before ever emitting \`false\` for a DOI, the reducer requires the DOI
*authority* — \`doi.org/api/handles/{doi}\` — to say the handle does not exist (\`responseCode 100\`). A DOI
that resolves at doi.org but has no registry metadata → \`unresolvable\` (exists, metadata unverifiable),
never \`false\`. For arXiv ids, only a definitive not-found from the *reachable arXiv API itself* is disproof
(a Semantic-Scholar miss on a fresh arXiv id is not); arXiv's "Error" sentinel entry is detected as
not-found, not mistaken for an unrelated paper.

**The narrowed-false rule (the important part).** The reducer collapses evidence to three verdicts:

| verdict | when | meaning |
|---|---|---|
| \`true\` | any resolver **matched** (match always wins) | found, metadata matches |
| \`false\` | no match **and** an *authoritative* disproof: doi.org says the DOI is \`responseCode 100\`, the reachable arXiv API definitively rejects the id, NVD has no such CVE, **or** a DOI/arXiv id resolves to a *confidently-different* paper (\`DOI_MISMATCH\`) | fabrication — the only thing we call fabrication |
| \`unresolvable\` | title-misses, registry-404s with no authority disproof, uncomparable titles, and/or unreachable resolvers | couldn't verify, but **no positive disproof** |

The whole point: **a title you simply can't find is NOT fabrication** → \`unresolvable\`, never \`false\`. A
real-but-unindexed / regional / pre-digital paper looks exactly like a title-miss; a registry-404 without a
doi.org not-found looks exactly like a DataCite DOI; a network outage looks like neither — all degrade to
\`unresolvable\`. The reducer never turns a transport failure or a registry-404 into \`false\`. Fabrication
requires *positive* disproof from the relevant **authority**, or a DOI pointing at a confidently-different
paper.

**How to run.**
\`\`\`
node scripts/verify-cites.mjs cites.json      # JSON array of {id,doi?,arxiv?,title?,year?,cve?,commit?}
node scripts/verify-cites.mjs refs.bib        # best-effort .bib extraction
cat cites.json | node scripts/verify-cites.mjs -
node scripts/verify-cites.mjs cites.json --offline   # no network (everything degrades to unresolvable)
\`\`\`
It prints per-cite \`{id, verdict, reason, matched_db, matched_title?, flags?}\` + a summary, and **exits 1 iff
any \`false\` (fabrication)** — \`unresolvable\` alone is advisory and does NOT fail the gate, matching the
narrowed-false philosophy. API responses are cached to \`scripts/.cite-cache.json\` (gitignored) so re-runs are
cheap and deterministic.

## 5a. Both checks run on every \`paperlint build\`

\`npx paperlint build\` runs \`verify-cites\` and \`bib-authors\` over the paper's bibliography after the PDF is
built and records the verdicts, with the SHA-256 of the bibliography it checked, in
\`<paper>/_build/references.json\`. \`paperlint lint\` reads that record offline: \`paper/cite-exists\` and
\`paper/author-list\` report a failing entry on its own line, \`paper/refs-fresh\` says when the bibliography
changed since, and \`paper/refs-checked\` warns when nothing was recorded or the build had no network. The
step never fails the build. Run the scripts by hand (below) to read a single verdict in full.

## 5b. The author-list gate — \`scripts/bib-authors.mjs\`

\`verify-cites.mjs\` answers *"does this citation exist, and does the id point at it?"*. There is a second
question it structurally cannot ask, and on 2026-08-24 that gap cost three real defects in a bibliography
this skill had already reported as **"ALL 23 cites verified real"**:

> We write \`@inproceedings{... NeurIPS 2023}\`. Is our author list the **NeurIPS** one — or did we copy the
> **arXiv preprint's**?

The preprint and the published version are frequently **different lists**, and every existence check passes
either way: the paper is real, the id resolves, the title matches. What was found:

| entry | ours | the version we CLAIM to cite |
|---|---|---|
| \`schick2023toolformer\` | 8 authors | NeurIPS 2023 has **9** — **Eric Hambro** was simply absent |
| \`dehghani2022efficiency\` | Dehghani, Arnab, Beyer, Vaswani, Tay | ICLR 2022: Dehghani, **Tay**, Arnab, Beyer, Vaswani |
| \`raji2021benchmark\` | Raji, Bender, Paullada, Denton, Hanna | NeurIPS D&B 2021: Raji, **Denton**, Bender, **Hanna**, **Paullada** |

The first is a **real person dropped from a citation in an archival publication** — by our own scale that is
heavier than a typo, and it is exactly the class §"any regalia about third parties" already warns about.

**How to run.**
\`\`\`
node scripts/bib-authors.mjs <paper-dir>          # or a .bib, or a .tex with a filecontents block
node scripts/bib-authors.mjs <paper-dir> --json
\`\`\`
Exits **1** on any author-set or author-order disagreement, **0** when clean, **2** on usage/IO error.

**Source is DBLP, and that choice is the evidence.** DBLP indexes the proceedings record and the CoRR record
**separately**, so a single query returns both lists side by side — the cleanest proof available that the
difference is real and not a metadata glitch. Entries that themselves declare a preprint venue are out of
scope (a preprint entry is allowed to carry preprint metadata).

⚠️ **Discovery credit, and why it is NOT a dependency.** The class was found by running **rebiber**
(\`yuchenlin/rebiber\`), which rewrites bib entries into their DBLP records. We deliberately do not depend on
it: its install fights modern setuptools (the \`bibtexparser\` wheel dies with \`AttributeError:
install_layout\`), and its *output* replaces our entries with DBLP's very long official booktitles — wrong for
a page-limited paper. We needed the **comparison**, not the rewrite, and that is one fetch with zero deps.
Note also that live DBLP beat rebiber's bundled dump: \`raji2021benchmark\` was found only by the live query.

🔴 **Two design decisions that are load-bearing, both learned by measurement the same day:**
1. **Compare surname SEQUENCES, nothing else.** A first cut reported 13 differences of which **11 were
   "Last, First" vs "First Last"** — pure formatting. A checker that cries 13 when 2 are real is read once
   and then ignored; this repo has already killed a check that way (33 findings, 22 of them live files).
2. **A failed lookup is NOT a skip.** The first run printed *"PASS: no author-list disagreement"* while
   **9 of 27 entries had never been examined** (DBLP answered 429). Failures now retry with backoff and land
   in a separate bucket that downgrades the verdict to **PARTIAL** — never \`PASS\`.

**Tests:** \`node scripts/bib-authors.test.mjs\` — 11 assertions, offline, with the three real entries above
pinned as regressions. Mutation-checked: collapsing the name normalisation makes it fail.

**Pure/impure split + tests.** The verdict logic (\`reduceVerdict\` / \`classifyResolver\` / \`checkNvd\` /
\`checkCommit\` + the string helpers) is a pure function of \`(citation, evidence)\` — the live HTTP layer only
shapes raw API responses into that evidence. \`scripts/verify-cites.test.mjs\` exercises the reducer offline with
injected fixtures (\`node scripts/verify-cites.test.mjs\`); no test touches the network.

**Honest limits.** Semantic Scholar rate-limits (HTTP 429) without an API key, and arXiv's export API can be
unreachable behind some proxies — both degrade to \`unreachable\` (→ contribute nothing, never \`false\`). And,
by design, the gate **declines** in three situations rather than risk a false accusation:

- **A fabrication with no identifier (only a bogus title)** escapes this existence gate → it surfaces as
  \`unresolvable\`, and is caught by the LLM claim-faithfulness check (§1) + human review, not here. Verifying
  a work *exists* is not the same as verifying the paper's *claim about it* is faithful — that's §1's job.
- **A non-Latin / cross-script or otherwise uncomparable title** on a DOI/arXiv record: we **cannot** assert
  the id landed on an unrelated paper (a Russian work's DOI may record an English title), so we do **not**
  emit \`DOI_MISMATCH\` — the id counts as resolved (\`true\`) or, absent other confirmation, \`unresolvable\`.
  Never \`false\`. The \`doi_mismatch → false\` verdict fires **only** for two confidently-comparable titles that
  are genuinely different.
- **A DOI that resolves at doi.org but has no content-registry metadata** (DataCite/Zenodo, fresh 2026 DOIs)
  → \`unresolvable\`, because the work exists but its metadata (title/year) cannot be cross-checked here. This
  is the correct verdict for a paper's own artifact DOI; treat \`unresolvable\` as advisory, not a failure.

**Known narrow residue (rare, treat a lone \`DOI_MISMATCH → false\` as advisory, eyeball it).** Two edge cases
can still mis-fire: (a) a correct DOI whose *every* registry records junk metadata — e.g. the container /
proceedings title instead of the paper's — reads as "unrelated" (mitigated when any one registry has the real
title, since a match wins); (b) a translated-journal title in the *same script* (transliterated Latin vs
English) that shares no tokens. Both need semantics the gate doesn't have; both are near-zero frequency in an
English CS bib. Identifier-prefix / trailing-punctuation mangling (\`doi:\`, \`arXiv:\`, a bib-swallowed \`.\`) is
**fixed** — normalized at the verify boundary — so the common real-DOI-→-\`false\` path is closed.

## 5b. The ATTRIBUTION gate — \`extract-ref-facts.mjs\` + the \`refs/*\` ESLint rules

§5 asks *does this identifier name a real work*. This one asks *is the work it names the one the entry
describes* — and those are different questions, which is why they are different tools and not one flag.
Run both; neither replaces the other.

🔴 **Moved 2026-08-26 out of a script and into rules** (ladder step 3, the \`CLAUDE.md\` beside the papers).
It used to be one script, \`verify-refs.mjs\`; the measurement half stayed a script and the judgement half
became twelve ESLint rules over the facts it writes.

\`\`\`
# 1. measure: parse the bibliography, ask CrossRef/arXiv, write _build/refs.facts.json
node .claude/skills/paper-pipeline/scripts/extract-ref-facts.mjs <paper-dir>
node .claude/skills/paper-pipeline/scripts/extract-ref-facts.mjs <paper-dir> --offline  # cached responses only

# 2. judge: rules over those facts — severity from the config, positions, disable-with-reason
npx eslint --no-config-lookup --config eslint.config.mjs "<paper-dir>/_build/refs.facts.json"
\`\`\`

**Why it exists, stated plainly: \`verify-cites.mjs\` never compares an author list.** It parses \`author\`
out of a \`.bib\` into the citation object and then does nothing with it — the string appears twice in 991
lines, once in a doc comment and once in the extractor. So of the nine broken references this project
shipped across two nights, the shapes it structurally cannot see are the ones about ATTRIBUTION: seven
wrong initials on correct surnames, a reversed author order, an invented award. This leg closes that,
the same one MedSci Skills (arXiv:2606.09500) closes with \`verify_refs.py\`.

| | \`verify-cites.mjs\` (§5) | the \`refs/*\` rules (§5b) |
|---|---|---|
| question | does the id resolve to *something* | is *that* the work the entry describes |
| registries | Crossref · OpenAlex · Semantic Scholar · arXiv | CrossRef · arXiv (the two that matter for CS) |
| authors | **never compared** | surname multiset **+ order-sensitive first author** |
| year | ±1 on a title search | exact, and only against the record that dates the cited version |
| preprint→published | not asked | arXiv \`journal_ref\`/\`doi\` present and no venue named → say so |
| what it could not check | folded into \`unresolvable\` | **enumerated, one rule per reason, never counted as verified** |
| tests | \`verify-cites.test.mjs\` — not a \`*.harness.mjs\`, so \`npx vigiles test\` never runs it | \`eslint-rules/ref-facts.harness.mjs\` + \`.claude/skills/paper-pipeline/scripts/extract-ref-facts.harness.mjs\`, plus \`eslint-rules/ref-facts.mutations.mjs\` |

**The uncovered set is the point.** A reference with no resolvable identifier is a FINDING here
(\`refs/no-identifier\`), and every partial comparison is another (\`refs/partial-check\`, one messageId per
reason). On this project's submitted bibliography that set is 17 entries of 67 — an npm package, a Supreme
Court dissent, an FAA circular, Dijkstra. None of them is a defect; all of them are things a model checker
would have reported as fine. Being able to hand a reviewer the list of what was NOT machine-verified is a
property no model-driven pass has.

🔴 **\`.bib\` papers were never checked by the old script — two dead legs, both measured 2026-08-26.**
\`refs.bib\` was not in its source list (so \`agenticdev-2026\` and \`aisec-2026\` answered "nothing to check"),
and its \`.bib\` regex required a closing \`}\` on its own line, which neither real file has (\`parsed 0
references\`). The \`.bib\` half now goes through \`@retorquere/bibtex-parser\`. Two of the three papers are
therefore being checked for the first time.

**Every check is watched failing.** \`node eslint-rules/ref-facts.mutations.mjs\` neuters each rule in turn
and requires the harness to go red at the named case — 21 mutations, all killed, and three of them were
findings about the TEST rather than the rule. Run it after any edit to the rules.

## 6. Record the verdict

🔴 LAST step, once the deliverable exists:

\`\`\`
node .claude/skills/paper-pipeline/scripts/ledger.mjs record verify-citations <paper-dir> FINDING <count> <report-path>
node .claude/skills/paper-pipeline/scripts/ledger.mjs record verify-citations <paper-dir> ABSTAINED <reason> "<one line>"
\`\`\`

**FINDING** — \`<count>\` is the number of cites still \`% VERIFY\` or \`unresolvable\`; \`<report-path>\`
lists them. Add \`--blocking\` for a cite an authoritative source disproves, or a missing delta
sentence; either is a submit blocker.
**ABSTAINED** — \`no-witness\`: every cite resolved with correct metadata and the delta sentence is in
the prose. \`crashed\`: the registries were unreachable, so nothing was verified — which is emphatically
not the same as everything checking out, and under the old vocabulary both came back \`PASS\`.

🔴 **There is no PASS.** \`no-witness\` here means every cite the paper makes was looked up and none
of them came back wrong. It does not mean the bibliography is complete: this check cannot see a work
that should have been cited and is not. That gap belongs to \`map-prior-work\`, and no row here covers it.

Because this check is CONTINUOUS, it writes a row per run and never a final one. That is the point:
the ledger compares the row against the paper's current bytes, so a pass that predates the last three
\`\\cite\` additions reports as STALE-PAPER instead of reading as green.

## Rules
- **Re-run on every \`\\cite\` added or moved.** A \`cites\` row older than the paper's text is a stale pass,
  not a green one — "we checked last cycle" is not a verification.
- No cite ships unverified. Exists + correct metadata + says-what-you-claim, or it's \`% VERIFY\`.
- Never fabricate to fill a gap — soften the claim instead.
- The delta over the nearest neighbor is prose, not an implication.
- Report honestly: a cite you can't confirm is a finding, not something to wave through.
- A title you can't find is \`unresolvable\`, not a fabrication — \`false\` needs an *authoritative* disproof
  (doi.org \`responseCode 100\`, a reachable arXiv rejection, NVD-has-no-CVE) or a confidently-different title.
  A registry-404, an uncomparable/non-Latin title, or any transport failure is \`unresolvable\`, never \`false\`.

## Compose with
- **draft-paper** — related-work and the delta sentence are drafted there; this skill audits them.
- **map-prior-work** — fan-out prior-art search; use it to resolve hard-to-find cites and to surface
  the expected-but-missing citation. ⚠️ **Was \`deep-research\` until 2026-08-31 — no such skill has
  ever existed in this base** (0 matches on disk), and the name appeared BOTH here and in this
  skill's own \`description\`. A pointer to a non-existent skill fails silently: the step is simply
  not performed, and the compose line still reads as if coverage were arranged.
- **analyze-sibling-paper** — when a resolved cite turns out to be a close neighbor, that skill does
  the deep overlap/scoop analysis this one is too shallow for.
- **pc-panel-review** — its novelty/related-work reviewer will probe the delta and hunt uncited neighbors;
  clear this skill first so that lens finds nothing.

## Provenance
Both papers grounded their novelty delta over the nearest prior work explicitly, and that framing is what
made them land:
- **AgenticDev 2026 — "Measuring the Wrong Number":** positioned against Kapoor et al. *"AI Agents That
  Matter"* and Dehghani et al. *"The Efficiency Misnomer"* — the delta being a cost-aware,
  correctness-gated *measurement* where those argued the problem.
- **AISec 2026 @ CCS — "Safety Theater":** positioned against Ptacek & Newsham (the classic
  evasion-testing framing), **AgentDojo**, and **IsolateGPT** — the delta being a static, mutation-and-
  ablation evaluation of real command-guards rather than a new defense. Each of these was verified real,
  with correct venue/year, before submit.`,
});
