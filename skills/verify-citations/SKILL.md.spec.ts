// Compiled to SKILL.md by `vigiles compile`. Edit THIS file, never the markdown.
//
import { experimental_skill } from "vigiles/spec";
import type { Flow } from "../../scripts/pipeline.ts";
import analyzeSiblingPaper from "../analyze-sibling-paper/SKILL.md.spec.ts";
import mapPriorWork from "../map-prior-work/SKILL.md.spec.ts";

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

Editing the paper's text after an approved copy exists (\`paperlint versions approve\`): declare each change in \`versions/<cycle>/changes.yaml\`, \`paperlint versions diff\` shows what was lost (EXPERIMENTAL; \`docs/rules/cycle/changes-since-approved.md\`).

Reviewers reject on a single fabricated or wrong citation — it reads as either sloppiness or a
hallucinated bibliography, and either one is fatal. And they reject on "this was already done by ___" if
your delta over the nearest prior work isn't spelled out. This skill closes both holes before submit.

## 🔴 This is a CONTINUOUS check, not a step you finish

**It re-runs whenever a \`\\cite\` is added or moved.** Not once, not "at the end" — every time the
bibliography changes, including the edit you make on the last day. Scorecard row **\`cites\`** in
\`<paper-dir>/PIPELINE-STATUS.md\`; see the CONTINUOUS section of \`paper-pipeline\`.

- **The trigger is the bibliography, not the text.** A \`cites\` row dated before a \`\\cite\` was added or
  moved does not cover that cite; a prose edit that moves no \`\\cite\` leaves the row as it is.
  \`paper/refs-checked\` says when the last build's references were not checked.
- **"We checked last cycle" does not count.** Say it plainly, because it is the exact sentence that
  ships a fabricated cite: a review round adds text, added text adds citations, and the run that
  cleared the bibliography never saw them.
- A single new \`\\cite\` is enough to fire it. There is no batch size below which this is skippable.

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
\`build-benchmark\`). 
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
| \`false\` | no match **and** an *authoritative* disproof: doi.org says the DOI is \`responseCode 100\`, the reachable arXiv API definitively rejects the id, NVD has no such CVE, **or** the id's own registry (arXiv for an arXiv id or arXiv DOI, Crossref for any other DOI) puts it on a *confidently-different* paper (\`DOI_MISMATCH\`) | fabrication — the only thing we call fabrication |
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
narrowed-false philosophy. API responses are cached to \`~/.cache/paperlint/cite-cache.json\`
(\`VERIFY_CITES_CACHE\` overrides) so re-runs are cheap and deterministic — outside the installed package,
which \`npm ci\` wipes.

## 5a. Both checks run on every \`paperlint build\` — from a committed cache

\`npx paperlint build\` runs \`verify-cites\` and \`bib-authors\` over the paper's bibliography after the PDF is
built and records the verdicts, with the SHA-256 of the bibliography it checked, in
\`<paper>/_build/references.json\`. \`paperlint lint\` reads that record offline: \`paper/cite-exists\` and
\`paper/author-list\` report a failing entry on its own line, \`paper/refs-fresh\` says when the bibliography
changed since, and \`paper/refs-checked\` warns when nothing was recorded or the build had no network. The
step never fails the build.

What the services ANSWERED is kept in \`<paper>/repro/data/references-cache.json\` — **commit it**. A build asks
only the questions that file cannot answer (a new or edited entry, or an answer older than 30 days), so an
unchanged bibliography builds with no network at all, in CI too, until its answers age out. It holds responses, never verdicts: the verdicts are derived again on
every build. A service that refuses (429, HTML instead of JSON, a timeout) is not asked again for the rest of the
build (the requests already in flight still land); the entries it would have answered say \`not asked: <service>: <reason>\`, and DBLP's become
\`authors: unchecked\`. Answers are asked again after 30 days; to refresh one sooner, delete its entry, or delete the file. Details:
\`docs/references.md\` in the package. Run the scripts by hand (below) to read a single verdict in full.

## 5b. The author-list gate — \`scripts/bib-authors.mjs\`

\`verify-cites.mjs\` answers *"does this citation exist, and does the id point at it?"*. There is a second
question it structurally cannot ask: is our author list the one of the version we cite (the proceedings),
or the arXiv preprint's? The two are often different lists, and every existence check passes either way.
The three defects that found it: \`docs/design/verify-citations-history.md\` in the package.

**How to run.**
\`\`\`
node scripts/bib-authors.mjs <paper-dir>          # the databases bibtex opened in the last build; or a .bib, or a .tex
node scripts/bib-authors.mjs <paper-dir> --json
\`\`\`
Exits **1** on any author-set or author-order disagreement, **0** when clean, **2** on usage/IO error. A paper
directory or a \`.tex\` is read through the build's record (\`_build/sources.json\`): a paper that was never built,
or changed since, is refused (exit 2) and told to run \`npx paperlint build\` first — the databases are TeX's answer,
not a reading of the source. A \`.bib\` named is read as itself.

**Source is DBLP, and that choice is the evidence.** DBLP indexes the proceedings record and the CoRR record
**separately**, so a single query returns both lists side by side — the cleanest proof available that the
difference is real and not a metadata glitch. Entries that themselves declare a preprint venue are out of
scope (a preprint entry is allowed to carry preprint metadata).

Two rules hold the checker honest: it compares surname sequences only (\`Last, First\` vs
\`First Last\` is formatting, not a finding), and a failed lookup is never a skip — it lands in its own
bucket and turns the verdict to **PARTIAL**, never \`PASS\`. Why DBLP and not rebiber, and how both rules
were measured: \`docs/design/verify-citations-history.md\` in the package.

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
- **An aggregator (OpenAlex, Semantic Scholar) that alone puts the id on another paper** →
  \`unresolvable\` with \`DOI_MISMATCH unconfirmed\`. Aggregators copy metadata and do attach DOIs to the
  wrong work; on 2026-10-01 OpenAlex mapped the arXiv DOIs of SWE-bench and ReAct to unrelated papers while
  arXiv was rate-limiting. Only the id's own registry can disprove it.
- **A DOI that resolves at doi.org but has no content-registry metadata** (DataCite/Zenodo, fresh 2026 DOIs)
  → \`unresolvable\`, because the work exists but its metadata (title/year) cannot be cross-checked here. This
  is the correct verdict for a paper's own artifact DOI; treat \`unresolvable\` as advisory, not a failure.

**Known narrow residue (rare, treat a lone \`DOI_MISMATCH → false\` as advisory, eyeball it).** Two edge cases
can still mis-fire: (a) a correct DOI whose *own* registry records junk metadata — e.g. the container /
proceedings title instead of the paper's — reads as "unrelated" (mitigated when any other registry has the real
title, since a match wins); (b) a translated-journal title in the *same script* (transliterated Latin vs
English) that shares no tokens. Both need semantics the gate doesn't have; both are near-zero frequency in an
English CS bib. Identifier-prefix / trailing-punctuation mangling (\`doi:\`, \`arXiv:\`, a bib-swallowed \`.\`) is
**fixed** — normalized at the verify boundary — so the common real-DOI-→-\`false\` path is closed.

## 5b. The ATTRIBUTION gate — \`extract-ref-facts.mjs\` + the \`refs/*\` ESLint rules

§5 asks *does this identifier name a real work*. This one asks *is the work it names the one the entry
describes* — and those are different questions, which is why they are different tools and not one flag.
Run both; neither replaces the other.

\`\`\`
# 1. measure: parse the bibliography bibtex opened (build the paper first), ask CrossRef/arXiv, write _build/refs.facts.json
node .claude/skills/paper-pipeline/scripts/extract-ref-facts.mjs <paper-dir>
node .claude/skills/paper-pipeline/scripts/extract-ref-facts.mjs <paper-dir> --offline  # cached responses only

# 2. judge: rules over those facts — severity from the config, positions, disable-with-reason
npx eslint --no-config-lookup --config eslint.config.mjs "<paper-dir>/_build/refs.facts.json"
\`\`\`

The difference from §5: \`verify-cites.mjs\` never compares an author list or an exact year; the \`refs/*\`
rules do, and a reference they cannot check (no identifier, a partial comparison) is reported as a
finding, one rule per reason, never counted as verified. Why, and what it found: \`docs/design/verify-citations-history.md\` in the package.

## Rules
- **Re-run on every \`\\cite\` added or moved.** A \`cites\` row older than that change does not cover
  it — "we checked last cycle" is not a verification.
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
  the expected-but-missing citation.
- **analyze-sibling-paper** — when a resolved cite turns out to be a close neighbor, that skill does
  the deep overlap/scoop analysis this one is too shallow for.
- **pc-panel-review** — its novelty/related-work reviewer will probe the delta and hunt uncited neighbors;
  clear this skill first so that lens finds nothing.

`,
});

export const flow = {
  stage: "review",
  handsTo: () => [],
  calls: () => [analyzeSiblingPaper, mapPriorWork],
} satisfies Flow;
