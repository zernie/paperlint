# verify-citations: history and measurements

The `verify-citations` skill keeps its instructions; this page keeps the incidents and measurements
behind them. Dates are when each was observed.

## Why it is continuous

_This skill used to sit at a number in the middle of a stage list, which made it read like a one-shot
step you tick off and move past — one of the three concrete errors that numbering produced, and the
reason the list was replaced on 2026-08-03. The project rule was always that it re-runs every cycle;
the position contradicted the rule, and the position is what people followed._

## Where the reducer came from

Ported fresh (own code) from the OSS mining note
`papers/research/oss-skill-mining-imbad0202.md` (STEAL #1) + the CVE/PoC-SHA pinning from
`oss-skill-mining-euzun.md`.

## The author-list gate: the three defects that found it

question it structurally cannot ask, and on 2026-08-24 that gap cost three real defects in a bibliography
this skill had already reported as **"ALL 23 cites verified real"**:

> We write `@inproceedings{... NeurIPS 2023}`. Is our author list the **NeurIPS** one — or did we copy the
> **arXiv preprint's**?

The preprint and the published version are frequently **different lists**, and every existence check passes
either way: the paper is real, the id resolves, the title matches. What was found:

| entry                    | ours                                  | the version we CLAIM to cite                                        |
| ------------------------ | ------------------------------------- | ------------------------------------------------------------------- |
| `schick2023toolformer`   | 8 authors                             | NeurIPS 2023 has **9** — **Eric Hambro** was simply absent          |
| `dehghani2022efficiency` | Dehghani, Arnab, Beyer, Vaswani, Tay  | ICLR 2022: Dehghani, **Tay**, Arnab, Beyer, Vaswani                 |
| `raji2021benchmark`      | Raji, Bender, Paullada, Denton, Hanna | NeurIPS D&B 2021: Raji, **Denton**, Bender, **Hanna**, **Paullada** |

The first is a **real person dropped from a citation in an archival publication** — by our own scale that is
heavier than a typo, and it is exactly the class §"any regalia about third parties" already warns about.

## The author-list gate: rebiber, and the two design decisions

⚠️ **Discovery credit, and why it is NOT a dependency.** The class was found by running **rebiber**
(`yuchenlin/rebiber`), which rewrites bib entries into their DBLP records. Re-measured 2026-09-27 on rebiber
1.4.0 (GitHub commit `b917e36`, the pin in `render-paper/checkers-requirements.txt`; the PyPI package is
a 2021 release upstream disowns):

- **Install: no longer broken, but heavy.** It installs in 36 s in a clean venv (bibtexparser 2.0.1 wheel,
  rebiber built from source) — and carries **409 MB** of bundled venue data.
- **Rewrites: now optional.** `--dry-run --report` previews and leaves the file untouched; `-s True` shortens
  venues (NAACL 2019 becomes `Proc. of NAACL-HLT` instead of a 160-character booktitle).
- **Bundled data still misses what live DBLP finds.** `raji2021benchmark` stayed an arXiv entry, local
  index and `--live-lookup` alike, as it did in August.

So the reason not to depend on it is now scope, not breakage: we need the **comparison** of an author list
against the published record, not a rewrite of the entry, and that is one DBLP query with zero dependencies.

🔴 **Two design decisions that are load-bearing, both learned by measurement the same day:**

1. **Compare surname SEQUENCES, nothing else.** A first cut reported 13 differences of which **11 were
   "Last, First" vs "First Last"** — pure formatting. A checker that cries 13 when 2 are real is read once
   and then ignored; this repo has already killed a check that way (33 findings, 22 of them live files).
2. **A failed lookup is NOT a skip.** The first run printed _"PASS: no author-list disagreement"_ while
   **9 of 27 entries had never been examined** (DBLP answered 429). Failures now retry with backoff and land
   in a separate bucket that downgrades the verdict to **PARTIAL** — never `PASS`.

**Tests:** `node scripts/bib-authors.test.mjs` — 11 assertions, offline, with the three real entries above
pinned as regressions. Mutation-checked: collapsing the name normalisation makes it fail.

## The reducer's tests

**Pure/impure split + tests.** The verdict logic (`reduceVerdict` / `classifyResolver` / `checkNvd` /
`checkCommit` + the string helpers) is a pure function of `(citation, evidence)` — the live HTTP layer only
shapes raw API responses into that evidence. `scripts/verify-cites.test.mjs` exercises the reducer offline with
injected fixtures (`node scripts/verify-cites.test.mjs`); no test touches the network.

## The attribution gate: from a script to rules

🔴 **Moved 2026-08-26 out of a script and into rules** (ladder step 3, the `CLAUDE.md` beside the papers).
It used to be one script, `verify-refs.mjs`; the measurement half stayed a script and the judgement half
became twelve ESLint rules over the facts it writes.

## The attribution gate: why it exists and what it found

**Why it exists, stated plainly: `verify-cites.mjs` never compares an author list.** It parses `author`
out of a `.bib` into the citation object and then does nothing with it — the string appears twice in 991
lines, once in a doc comment and once in the extractor. So of the nine broken references this project
shipped across two nights, the shapes it structurally cannot see are the ones about ATTRIBUTION: seven
wrong initials on correct surnames, a reversed author order, an invented award. This leg closes that,
the same one MedSci Skills (arXiv:2606.09500) closes with `verify_refs.py`.

|                         | `verify-cites.mjs` (§5)                                                              | the `refs/*` rules (§5b)                                                                                                                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| question                | does the id resolve to _something_                                                   | is _that_ the work the entry describes                                                                                                                                                                            |
| registries              | Crossref · OpenAlex · Semantic Scholar · arXiv                                       | CrossRef · arXiv (the two that matter for CS)                                                                                                                                                                     |
| authors                 | **never compared**                                                                   | surname multiset **+ order-sensitive first author**                                                                                                                                                               |
| year                    | ±1 on a title search                                                                 | exact, and only against the record that dates the cited version                                                                                                                                                   |
| preprint→published      | not asked                                                                            | arXiv `journal_ref`/`doi` present and no venue named → say so                                                                                                                                                     |
| what it could not check | folded into `unresolvable`                                                           | **enumerated, one rule per reason, never counted as verified**                                                                                                                                                    |
| tests                   | `verify-cites.test.mjs` — not a `*.harness.mjs`, so `npx vigiles test` never runs it | `src/references.test.ts` (the `refs/*` rules in `src/reference-rules.ts`) + `skills/paper-pipeline/scripts/extract-ref-facts.test.mjs` and `.harness.mjs`, under the package's 100% line and branch coverage gate |

**The uncovered set is the point.** A reference with no resolvable identifier is a FINDING here
(`refs/no-identifier`), and every partial comparison is another (`refs/partial-check`, one messageId per
reason). On this project's submitted bibliography that set is 17 entries of 67 — an npm package, a Supreme
Court dissent, an FAA circular, Dijkstra. None of them is a defect; all of them are things a model checker
would have reported as fine. Being able to hand a reviewer the list of what was NOT machine-verified is a
property no model-driven pass has.

🔴 **`.bib` papers were never checked by the old script — two dead legs, both measured 2026-08-26.**
`refs.bib` was not in its source list (so `agenticdev-2026` and `aisec-2026` answered "nothing to check"),
and its `.bib` regex required a closing `}` on its own line, which neither real file has (`parsed 0
references`). The `.bib` half now goes through `@retorquere/bibtex-parser`. Two of the three papers are
therefore being checked for the first time.

**Every check is exercised.** `src/references.test.ts` drives the `refs/*` rules, and `npm run coverage`
fails CI if any line or branch of them goes unexercised. Run `npx vitest run src/references.test.ts`
after any edit to the rules.

## A pointer to a skill that never existed

⚠️ **Was `deep-research` until 2026-08-31 — no such skill has
ever existed in this base** (0 matches on disk), and the name appeared BOTH here and in this
skill's own `description`. A pointer to a non-existent skill fails silently: the step is simply
not performed, and the compose line still reads as if coverage were arranged.

## Provenance

Both papers grounded their novelty delta over the nearest prior work explicitly, and that framing is what
made them land:

- **AgenticDev 2026 — "Measuring the Wrong Number":** positioned against Kapoor et al. _"AI Agents That
  Matter"_ and Dehghani et al. _"The Efficiency Misnomer"_ — the delta being a cost-aware,
  correctness-gated _measurement_ where those argued the problem.
- **AISec 2026 @ CCS — "Safety Theater":** positioned against Ptacek & Newsham (the classic
  evasion-testing framing), **AgentDojo**, and **IsolateGPT** — the delta being a static, mutation-and-
  ablation evaluation of real command-guards rather than a new defense. Each of these was verified real,
  with correct venue/year, before submit.
