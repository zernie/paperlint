# `arxiv-papers-extra` — the other CC BY / CC BY-SA preprints, kept and not run

108 papers, text sources only (figures omitted), same selection and licence rule as
[`../arxiv-papers/`](../arxiv-papers/README.md), which explains why real papers, why only ten run, and
what is weak about the approach. **Nothing here is read by any test, lint or formatter run**: no
baselines, no record, not listed in `accepted-papers.test.ts`; `.prettierignore` skips every
`fixtures/` tree, `.gitattributes` marks it vendored. It has no baselines and can rot.

33 more of the 141 papers with a CC BY / CC BY-SA licence and a main `.tex` are **not kept**: all 141 would be about 28 MB of text, so only those up to 300 KB are here. The dropped ids (each is in the arXiv listing of 2026-11-09, versions as `v1`):

2611.07194, 2611.07286, 2611.07461, 2611.07476, 2611.07486, 2611.07634, 2611.07650, 2611.07772, 2611.07887, 2611.08229, 2611.08343, 2611.08456, 2611.08704, 2611.09178, 2611.09212, 2611.09375, 2611.09400, 2611.09411, 2611.09412, 2611.09414, 2611.09446, 2611.09501, 2611.09598, 2611.09600, 2611.09621, 2611.09682, 2611.09700, 2611.09703, 2611.09707, 2611.09712, 2611.09769, 2611.09805, 2611.09822

Provenance of the kept ones (versioned id, licence, sha256 of the arXiv source, main file): [`../arxiv-manifest.json`](../arxiv-manifest.json).

## Running a rule over it by hand

Copy a paper into a scratch project and lint it, as the test does:

```
mkdir -p /tmp/p/papers && echo '{"name":"c","private":true}' > /tmp/p/package.json
cp -r fixtures/arxiv-papers-extra/<id> /tmp/p/papers/
mkdir /tmp/p/papers/<id>/_build   # a build record is needed: copy a record-by-hand.json shaped like
                                  # ../arxiv-papers/*/record-by-hand.json, listing paper.tex first
(cd /tmp/p && npx paperlint lint --json)
```
