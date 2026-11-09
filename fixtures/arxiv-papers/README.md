# `arxiv-papers` — ten real preprints, every rule, in the same test as the accepted papers

Run by `fixtures/accepted-papers/accepted-papers.test.ts` (its `ARXIV_PAPERS` list): each directory is
copied into a temporary project, linted with `paperlint lint --json`, and the findings per rule are
compared with that paper's `baseline.json` — more than recorded fails, a recorded rule going fully
quiet fails (reader: `../accepted-papers/baseline.ts`). Not in the TeX record e2e (its corpus is
`accepted-papers` alone).

## Why real papers

A new rule must not fire on correct real text, and a rule written against fixtures we wrote ourselves
cannot show that. Today's example (2026-11-09, #449): a rule measured against the hand-made fixtures
and the six accepted papers was then run over 297 fresh arXiv papers and its false positives showed up
there, not before. A real paper in the test is where the next such case is caught the day the rule is
registered, not afterwards by hand.

## Why only ten run

Measured: the lint test costs about 12 s per paper on the existing corpus (73 s of test time for 6
papers, 2026-11-09); on these ten it took about 4 s each, about 38 s together. The 108 papers of
[`../arxiv-papers-extra/`](../arxiv-papers-extra/README.md) at even 4 s each would add about 7 min
to the unit job; at the 12 s of the larger papers, about 16 min — on every CI run of a repository
whose CI minutes are paid. So ten run, and the rest are kept for a human to run when a rule needs a
wider sample.

## Why these ten

Variety, not size or chance: by document class and by category, each at most 200 KB of text.

| paper | category | class | text |
| --- | --- | --- | ---: |
| [2611.07876v1](2611.07876v1/README.md) | cs.SE | `IEEEtran` | 167 KB |
| [2611.08774v1](2611.08774v1/README.md) | cs.CR | `IEEEtran` | 60 KB |
| [2611.09846v1](2611.09846v1/README.md) | cs.AI | `acmart` | 82 KB |
| [2611.09260v1](2611.09260v1/README.md) | cs.SE | `llncs` | 110 KB |
| [2611.08383v1](2611.08383v1/README.md) | cs.CR | `elsarticle` | 89 KB |
| [2611.07166v1](2611.07166v1/README.md) | cs.SE | plain `article` | 99 KB |
| [2611.09373v1](2611.09373v1/README.md) | cs.LG | `article` + NeurIPS style | 83 KB |
| [2611.09204v1](2611.09204v1/README.md) | cs.CL | `article` + ICML style | 143 KB |
| [2611.08924v1](2611.08924v1/README.md) | cs.LG | `article` + ICLR style | 189 KB |
| [2611.08639v1](2611.08639v1/README.md) | cs.CL | `article` + ACL style | 121 KB |

## How they were selected

2026-11-09. The 70 newest papers of each of cs.SE, cs.CR, cs.LG, cs.CL and cs.AI from the arXiv API
(`search_query=cat:cs.<X>&start=0&max_results=70`): 297 distinct papers. Kept: licence on the abstract
page exactly CC BY 4.0 or CC BY-SA 4.0 (146), with a main `.tex` found (141). No NC, no ND, no arXiv
default licence. Sources, hashes and licences: [`../arxiv-manifest.json`](../arxiv-manifest.json);
re-download and verify: `node --experimental-strip-types ../arxiv-fetch.ts` (a maintenance helper, not
run by any test, not an npm script).

## What is weak about this

- **The record is not TeX's answer.** `record-by-hand.json` lists `paper.tex`, the class and style files
  at the root, then the `\input`/`\include` files in the order the source names them. Nothing was
  compiled. The accepted papers carry `tex-truth.json`, written by a real build; these do not, so what is
  measured here is measured on a belief about TeX, as for `llm-splained-acsac25`. No `\input` that is
  conditional or computed is followed.
- **Ten is a small sample.** A rule that fires on 1 paper in 50 is probably not seen.
- **Every paper extends `paperlint:ieee-conference`.** That is the template family the tests know; for a
  paper in another class, `tex/template` fires by construction (8 of 10 baselines record it), and the
  count says nothing about the paper.
- **Baselines store counts, not verdicts.** Nobody has classified a finding of these papers as real or
  false. `paper/leading-zero` 294 on one paper and `paper/section-word` 51 on another are recorded as
  they are. A count that grows fails; why a count is what it is is not written down.
- **Preprints are not accepted papers.** They may be unpolished, under no venue's checklist; that is why
  they are not in `accepted-papers/`, whose README states what its papers are.
- **Figures are omitted**, so the figure rules see no figure files.
- **The folder can rot**: an arXiv source is the author's, with whatever the author left in it.
