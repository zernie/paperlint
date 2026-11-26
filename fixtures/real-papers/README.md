# `real-papers` — papers written by others, in two folders by purpose

Every other fixture was written by us, to make one rule fire or stay quiet. These are real papers,
as LaTeX source, and each folder answers a different question:

| folder | what it holds | the question it answers |
| --- | --- | --- |
| [`accepted/`](accepted/README.md) | papers a venue **accepted and published**: six older ones (ACSAC, AgenticDev) and 161 camera-ready papers (12 chosen on 2026-11-19, 80 sampled by a script on 2026-11-20, 69 on 2026-11-27, quotas per field), each linted against the venue that accepted it | **Is the rule right?** The calibration yardstick: a finding here is presumed false until shown otherwise, because the venue published the paper. The thresholds of the opt-in rules are set on it. |
| [`preprints/`](preprints/README.md) | 108 arXiv **preprints**, drafts under no venue's checklist | **What do authors actually lint?** Recall (what paperlint finds in drafts), and stress for the parser and for crashes on whatever authors leave in a source. |

Both folders are run together by [`../real-papers.test.ts`](../real-papers.test.ts) (the vitest
project `real-papers`): one `paperlint lint --json` over every paper, each paper's findings per rule
compared with its `baseline.json` by [`baseline.ts`](baseline.ts), the one comparison the install e2e
uses too. More than recorded fails, a recorded rule going fully quiet fails, a partial drop passes.
The same test file asserts the `tex/register` measures of the six older accepted papers, named in a
list there, so the camera-ready papers do not change that assertion.

Provenance (versioned id, licence, sha256 of the arXiv source) is in
[`../venue-manifest.json`](../venue-manifest.json) for the camera-ready papers and
[`../arxiv-manifest.json`](../arxiv-manifest.json) for the preprints;
`node --experimental-strip-types fixtures/arxiv-fetch.ts` re-downloads both and checks the hashes.
Nothing in this folder is in the npm package (`package.json` `files`), and the repository's MIT
licence does not cover it: each paper is under the licence its README names
([`../../LICENSE`](../../LICENSE), [`CLAUDE.md`](CLAUDE.md)).

## Adding a paper

Name the question first. A paper that was accepted goes in `accepted/`; a draft goes in
`preprints/`. Then follow the folder's own README, which holds the steps and the licence rule
(CC BY, CC BY-SA or CC0 only):

- a camera-ready paper — [`accepted/README.md`](accepted/README.md#adding-a-camera-ready-paper);
- an older accepted paper — [`accepted/README.md`](accepted/README.md#adding-an-older-accepted-paper);
- a preprint — [`preprints/README.md`](preprints/README.md).

Directory names are unique across both folders: the test copies every paper into one project.
