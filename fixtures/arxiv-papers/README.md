# `arxiv-papers` — 108 real preprints, every rule, in the real-papers test

Run, with the six papers of [`../accepted-papers/`](../accepted-papers/README.md), by
`fixtures/real-papers.test.ts`: ONE `paperlint lint --json` over a temporary project holding every
paper under `papers/<name>/`, then each paper's findings per rule are compared with its
`baseline.json` — more than recorded fails, a recorded rule going fully quiet fails (reader and
comparison: `../accepted-papers/baseline.ts`, one owner). It is the vitest project `real-papers`,
outside `unit` (so the macOS shards and the coverage run do not repeat it), run as a step of the CI
job `e2e-node` (`npx vitest run --project real-papers`; no npm script, no job of its own; local
`npm run check` has a gate for it). Not in the TeX record e2e: its corpus is `accepted-papers` alone.

## Why real papers

A new rule must not fire on correct real text, and a rule written against fixtures we wrote ourselves
cannot show that. Today's example (2026-11-09, #449): a rule measured against the hand-made fixtures
and the six accepted papers was then run over 297 fresh arXiv papers, and its false positives showed up
there, not before. A real paper in the test is where the next such case is caught the day the rule is
registered, not afterwards by hand.

## What changed, and why all of them run

First version of this folder: ten papers ran in the test, 98 more sat in a sibling folder, unrun, so as
not to cost CI time (measured then: 12 s a paper on the old corpus, so about 20 min for the 98 as one
CLI run per paper). The owner decided otherwise: «if they help find problems, always run them; optimise
later». What made that affordable: one CLI run over all papers is about 1.7 s a paper and one run per
paper about 3 s, startup being a large part of the second (measured by another agent, 4 vCPU,
origin/main: 138 s median for 80 preprints in one run). So the test is one run, in its own project, in
an existing CI job. Measured here, all 114 papers: one local run, 436 s for 114 papers on a 4-core container shared with other jobs; the CI time of the `e2e-node` step is in the PR.

## Why these papers

2026-11-09. The 70 newest papers of each of cs.SE, cs.CR, cs.LG, cs.CL and cs.AI from the arXiv API
(`search_query=cat:cs.<X>&start=0&max_results=70`): 297 distinct papers. Kept: licence on the abstract
page exactly CC BY 4.0 or CC BY-SA 4.0 (146), with a main `.tex` found (141), and at most 300 KB of text
(108; the ten first chosen for variety of class and category are all under 200 KB). No NC, no ND, no
arXiv default licence. Over 300 KB, left out so that all 141 (28.5 MB) are not committed:
2611.07194, 2611.07286, 2611.07461, 2611.07476, 2611.07486, 2611.07634, 2611.07650, 2611.07772, 2611.07887, 2611.08229, 2611.08343, 2611.08456, 2611.08704, 2611.09178, 2611.09212, 2611.09375, 2611.09400, 2611.09411, 2611.09412, 2611.09414, 2611.09446, 2611.09501, 2611.09598, 2611.09600, 2611.09621, 2611.09682, 2611.09700, 2611.09703, 2611.09707, 2611.09712, 2611.09769, 2611.09805, 2611.09822.

Provenance — versioned id, licence URL, sha256 of the arXiv source, main file, class, category, size —
is [`../arxiv-manifest.json`](../arxiv-manifest.json); `node --experimental-strip-types
fixtures/arxiv-fetch.ts` re-downloads exactly those versions and checks the hashes (a maintenance helper,
not run by any test, not an npm script). The folder is not in the npm package (`package.json` `files`).

## What is weak about this

- **The record is not TeX's answer.** `record-by-hand.json` lists `paper.tex`, the class and style files
  at the root, then the `\input`/`\include` files in the order the source names them. Nothing was
  compiled. The accepted papers carry `tex-truth.json`, written by a real build; these do not, so what is
  measured here is measured on a belief about TeX, as for `llm-splained-acsac25`. An `\input` that is
  conditional or computed is not followed.
- **Every paper extends `paperlint:ieee-conference`**, the template family the tests know. For a paper in
  another class `tex/template` fires by construction, and its count says nothing about the paper.
- **Baselines store counts, not verdicts.** Nobody has classified a finding of these papers as real or
  false. A count that grows fails; why a count is what it is is not written down.
- **Preprints are not accepted papers**: unpolished, under no venue's checklist. That is why they are not
  in `accepted-papers/`, whose README states what its papers are.
- **Figures are omitted**, so the figure rules see no figure files.
- **A sample of 114 is still a sample**, of five categories of one week; and it grows slower than it
  rots: an arXiv source is the author's, with whatever the author left in it.
- **A new rule's first run here fails by design** on every paper it reports: record the counts in the
  baselines in the same change, and read the new findings (`eslint-rules/CLAUDE.md`).

## The papers

| paper | category | class | text |
| --- | --- | --- | ---: |
| [2611.06553v1](2611.06553v1/README.md) | cs.AI | `IEEEtran` | 147 KB |
| [2611.06563v1](2611.06563v1/README.md) | cs.SE | `IEEEcsmag` | 260 KB |
| [2611.06764v1](2611.06764v1/README.md) | cs.SE | `acmart` | 83 KB |
| [2611.07159v1](2611.07159v1/README.md) | cs.CR | `article` | 158 KB |
| [2611.07164v1](2611.07164v1/README.md) | cs.CR | `article` | 105 KB |
| [2611.07166v1](2611.07166v1/README.md) | cs.SE | `article` | 99 KB |
| [2611.07297v1](2611.07297v1/README.md) | cs.CY | `acmart` | 282 KB |
| [2611.07307v1](2611.07307v1/README.md) | cs.SE | `article+iclr` | 249 KB |
| [2611.07370v1](2611.07370v1/README.md) | cs.CR | `llncs` | 66 KB |
| [2611.07403v1](2611.07403v1/README.md) | cs.RO | `ieeeconf` | 254 KB |
| [2611.07576v1](2611.07576v1/README.md) | cs.CY | `IEEEtran` | 132 KB |
| [2611.07640v1](2611.07640v1/README.md) | cs.CR | `article+iclr` | 216 KB |
| [2611.07652v1](2611.07652v1/README.md) | cs.AI | `article` | 195 KB |
| [2611.07876v1](2611.07876v1/README.md) | cs.SE | `IEEEtran` | 166 KB |
| [2611.07945v1](2611.07945v1/README.md) | cs.CY | `article` | 119 KB |
| [2611.07951v1](2611.07951v1/README.md) | cs.SE | `acmart` | 132 KB |
| [2611.08144v1](2611.08144v1/README.md) | cs.RO | `IEEEtran` | 47 KB |
| [2611.08325v1](2611.08325v1/README.md) | cs.CR | `acmart` | 159 KB |
| [2611.08383v1](2611.08383v1/README.md) | cs.CR | `elsarticle` | 89 KB |
| [2611.08442v1](2611.08442v1/README.md) | cs.SE | `article` | 148 KB |
| [2611.08608v1](2611.08608v1/README.md) | cs.CR | `IEEEtran` | 180 KB |
| [2611.08639v1](2611.08639v1/README.md) | cs.CL | `article+acl` | 121 KB |
| [2611.08666v1](2611.08666v1/README.md) | cs.AI | `article+neurips` | 76 KB |
| [2611.08669v1](2611.08669v1/README.md) | cs.AI | `article` | 173 KB |
| [2611.08706v1](2611.08706v1/README.md) | cs.LG | `article+acl` | 83 KB |
| [2611.08714v1](2611.08714v1/README.md) | cs.LG | `article+acl` | 118 KB |
| [2611.08737v1](2611.08737v1/README.md) | cs.LG | `article+neurips` | 213 KB |
| [2611.08774v1](2611.08774v1/README.md) | cs.CR | `IEEEtran` | 60 KB |
| [2611.08811v1](2611.08811v1/README.md) | cs.AI | `IEEEtran` | 46 KB |
| [2611.08892v1](2611.08892v1/README.md) | cs.CL | `article` | 236 KB |
| [2611.08924v1](2611.08924v1/README.md) | cs.LG | `article+iclr` | 189 KB |
| [2611.08933v1](2611.08933v1/README.md) | cs.SE | `article+neurips` | 109 KB |
| [2611.08971v1](2611.08971v1/README.md) | cs.MA | `article+neurips` | 114 KB |
| [2611.08995v1](2611.08995v1/README.md) | cs.CY | `article` | 109 KB |
| [2611.09027v1](2611.09027v1/README.md) | cs.CL | `jmlr` | 98 KB |
| [2611.09075v1](2611.09075v1/README.md) | cs.LG | `IEEEtran` | 38 KB |
| [2611.09113v1](2611.09113v1/README.md) | cs.CR | `article+acl` | 234 KB |
| [2611.09147v1](2611.09147v1/README.md) | cs.AI | `article+neurips` | 118 KB |
| [2611.09177v1](2611.09177v1/README.md) | cs.AI | `llncs` | 156 KB |
| [2611.09196v1](2611.09196v1/README.md) | cs.CL | `article` | 147 KB |
| [2611.09200v1](2611.09200v1/README.md) | cs.IR | `llncs` | 159 KB |
| [2611.09203v1](2611.09203v1/README.md) | cs.LG | `article` | 72 KB |
| [2611.09204v1](2611.09204v1/README.md) | cs.CL | `article+icml` | 143 KB |
| [2611.09218v1](2611.09218v1/README.md) | cs.SE | `article+iclr` | 232 KB |
| [2611.09223v1](2611.09223v1/README.md) | cs.CL | `article+acl` | 227 KB |
| [2611.09239v1](2611.09239v1/README.md) | cs.CL | `article` | 113 KB |
| [2611.09260v1](2611.09260v1/README.md) | cs.SE | `llncs` | 109 KB |
| [2611.09277v1](2611.09277v1/README.md) | cs.CR | `elsarticle` | 187 KB |
| [2611.09307v1](2611.09307v1/README.md) | cs.SE | `article` | 108 KB |
| [2611.09313v1](2611.09313v1/README.md) | cs.CL | `IEEEtran` | 81 KB |
| [2611.09342v1](2611.09342v1/README.md) | cs.CL | `article+acl` | 171 KB |
| [2611.09373v1](2611.09373v1/README.md) | cs.LG | `article+neurips` | 83 KB |
| [2611.09385v1](2611.09385v1/README.md) | cs.AI | `fairmeta` | 121 KB |
| [2611.09388v1](2611.09388v1/README.md) | cs.LG | `article` | 259 KB |
| [2611.09396v1](2611.09396v1/README.md) | cs.AI | `article` | 156 KB |
| [2611.09401v1](2611.09401v1/README.md) | cs.AI | `article+iclr` | 214 KB |
| [2611.09402v1](2611.09402v1/README.md) | cs.CL | `article` | 91 KB |
| [2611.09417v1](2611.09417v1/README.md) | cs.LG | `article+neurips` | 73 KB |
| [2611.09448v1](2611.09448v1/README.md) | cs.LG | `article+aaai` | 146 KB |
| [2611.09454v1](2611.09454v1/README.md) | cs.LG | `article` | 106 KB |
| [2611.09457v1](2611.09457v1/README.md) | cs.AI | `article+acl` | 163 KB |
| [2611.09472v1](2611.09472v1/README.md) | cs.AI | `article` | 215 KB |
| [2611.09496v1](2611.09496v1/README.md) | cs.LG | `article` | 42 KB |
| [2611.09505v1](2611.09505v1/README.md) | cs.CV | `article+acl` | 156 KB |
| [2611.09511v1](2611.09511v1/README.md) | cs.CV | `article+aaai` | 122 KB |
| [2611.09514v1](2611.09514v1/README.md) | cs.AI | `asmeconf` | 239 KB |
| [2611.09516v1](2611.09516v1/README.md) | cs.CL | `llncs` | 75 KB |
| [2611.09520v1](2611.09520v1/README.md) | cs.LG | `article` | 218 KB |
| [2611.09522v1](2611.09522v1/README.md) | cs.AI | `acmart` | 275 KB |
| [2611.09529v1](2611.09529v1/README.md) | cs.AI | `asmeconf` | 227 KB |
| [2611.09534v1](2611.09534v1/README.md) | cond-mat.mtrl-sci | `sn-jnl` | 213 KB |
| [2611.09536v1](2611.09536v1/README.md) | cs.CV | `article+cvpr` | 127 KB |
| [2611.09554v1](2611.09554v1/README.md) | cs.CL | `article+acl` | 135 KB |
| [2611.09567v1](2611.09567v1/README.md) | physics.flu-dyn | `article+neurips` | 193 KB |
| [2611.09569v1](2611.09569v1/README.md) | cs.CR | `acmart` | 190 KB |
| [2611.09573v1](2611.09573v1/README.md) | physics.ao-ph | `article` | 134 KB |
| [2611.09596v1](2611.09596v1/README.md) | cs.LG | `article` | 98 KB |
| [2611.09612v1](2611.09612v1/README.md) | stat.ML | `article` | 150 KB |
| [2611.09615v1](2611.09615v1/README.md) | cs.GT | `article` | 140 KB |
| [2611.09625v1](2611.09625v1/README.md) | cs.LG | `article+iclr` | 224 KB |
| [2611.09634v1](2611.09634v1/README.md) | cs.CL | `article+iclr` | 247 KB |
| [2611.09670v1](2611.09670v1/README.md) | cs.RO | `article+icml` | 208 KB |
| [2611.09709v1](2611.09709v1/README.md) | cs.LG | `article` | 185 KB |
| [2611.09715v1](2611.09715v1/README.md) | cs.AI | `article+neurips` | 137 KB |
| [2611.09722v1](2611.09722v1/README.md) | cs.AI | `article` | 152 KB |
| [2611.09723v1](2611.09723v1/README.md) | cs.LG | `article` | 208 KB |
| [2611.09734v1](2611.09734v1/README.md) | cs.CR | `article` | 108 KB |
| [2611.09759v1](2611.09759v1/README.md) | cs.LG | `article+neurips` | 107 KB |
| [2611.09767v1](2611.09767v1/README.md) | cs.LG | `ifacconf` | 248 KB |
| [2611.09780v1](2611.09780v1/README.md) | cs.GT | `article` | 150 KB |
| [2611.09785v1](2611.09785v1/README.md) | cs.CL | `article+acl` | 222 KB |
| [2611.09791v1](2611.09791v1/README.md) | cs.AI | `elsarticle` | 110 KB |
| [2611.09792v1](2611.09792v1/README.md) | cs.AI | `article` | 141 KB |
| [2611.09798v1](2611.09798v1/README.md) | cs.AI | `arxiv` | 165 KB |
| [2611.09799v1](2611.09799v1/README.md) | math.ST | `article` | 164 KB |
| [2611.09808v1](2611.09808v1/README.md) | cs.SE | `svjour3` | 201 KB |
| [2611.09815v1](2611.09815v1/README.md) | cs.LG | `article+neurips` | 66 KB |
| [2611.09817v1](2611.09817v1/README.md) | hep-lat | `article` | 186 KB |
| [2611.09818v1](2611.09818v1/README.md) | cs.AI | `article+neurips` | 110 KB |
| [2611.09828v1](2611.09828v1/README.md) | cs.LG | `article+neurips` | 215 KB |
| [2611.09843v1](2611.09843v1/README.md) | cs.LG | `article+neurips` | 155 KB |
| [2611.09846v1](2611.09846v1/README.md) | cs.AI | `acmart` | 82 KB |
| [2611.09847v1](2611.09847v1/README.md) | cs.LG | `article+neurips` | 74 KB |
| [2611.09848v1](2611.09848v1/README.md) | cs.IT | `article` | 32 KB |
| [2611.09866v1](2611.09866v1/README.md) | cs.CV | `article` | 67 KB |
| [2611.09868v1](2611.09868v1/README.md) | cs.CL | `article+neurips` | 145 KB |
| [2611.09869v1](2611.09869v1/README.md) | cs.SE | `svjour3` | 227 KB |
| [2611.09879v1](2611.09879v1/README.md) | cs.CR | `article` | 204 KB |
