# The checks, one by one

The README lists what each check catches in one line. This page says exactly which file each one
reads and when it fails. Errors fail `rpp lint`; warnings print and do not.

| Rule                           | Level | Reads                                         | Fails when                                                                                                                                                                                                                                                                                                                      |
| ------------------------------ | ----- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `paper/stages`                 | error | `PIPELINE-STATUS.md`                          | a declared stage's PDF is missing, or the `bytes:` it names does not match the file's real size, or a frozen PDF exists that no stage declares                                                                                                                                                                                  |
| `paper/source`                 | error | `PIPELINE-STATUS.md`                          | a declared stage has no frozen `.tex` beside its PDF (a commit hash does not count — squash and gc destroy it)                                                                                                                                                                                                                  |
| `paper/author-list`            | warn  | `PIPELINE-STATUS.md`                          | a stage is declared and **no cell of the scorecard's table contains the run marker** (default `bib-authors`). It checks that you recorded the cross-check; it does not read your `.bib`. What to run is your own `authorListCommand`, empty by default                                                                          |
| `paper/research-question`      | warn  | `paper.tex`, `paper.md`, `PIPELINE-STATUS.md` | a stage is declared and either the scorecard has no `researchQuestion` field, or it has one the paper does not contain. The declared sentence is compared against the source with whitespace collapsed — your words, not a pattern. Advisory, because nothing here can judge whether what you declared _is_ a research question |
| `paper/typography`             | warn  | `paper.tex`, `paper.md`                       | any of four counts rises above the per-paper allowance you set: `§` or `\S\ref` instead of "Section"; a decimal with no leading zero (`.05`); `Fig.` and `Figure` mixed in one document; bibliography entries with no doi, url or arXiv id. Existing debt is tolerated, growth is not                                           |
| `tex/future-promise`           | warn  | `paper.tex`                                   | a camera-ready build still says "will be released" about something already handed over                                                                                                                                                                                                                                          |
| `tex/acm-frontmatter-override` | error | `paper.tex`                                   | an `acmart` build overrides ACM's front-matter commands and drops template elements from page 1                                                                                                                                                                                                                                 |
| `review/findings-cause`        | error | `reviews/*.md`                                | a review lists at least `minFindings` (default 3) findings and no cell introduces a cause with the marker (default `Cause:`)                                                                                                                                                                                                    |
| `doc/fields`                   | warn  | `reviews/*.md`                                | a front-matter field is missing or holds a value outside the list you configured. Off entirely unless you configure `docFields`                                                                                                                                                                                                 |

Besides these rules, `rpp lint` reports a paper directory that is missing a required file (by
default `PIPELINE-STATUS.md`) as an error. Which files are required is configurable — see
[`configuration.md`](configuration.md#required-files).

## LaTeX or Markdown

The paper body is `paper.tex` or `paper.md` (`draft.md` is read like `paper.md`). The scorecard
and the review notes are always Markdown, so their five rules apply either way. For the body it
is not symmetrical: a `.tex` body gets four rules, a `.md` body gets two —
`tex/future-promise` and `tex/acm-frontmatter-override` are LaTeX-only.

## The scorecard's `bytes:` and `sourceBytes:`

A stage in `PIPELINE-STATUS.md` looks like this:

```yaml
---
stages:
  - stage: submitted
    date: 2026-07-22
    venue: A Venue 2026
    pdf: versions/2026-07-22-submitted.pdf
    bytes: 305412
    source: versions/2026-07-22-submitted.tex
    sourceBytes: 57210
researchQuestion: "Does pruning the state space reduce review cost?"
---
```

Today you write `bytes:` and `sourceBytes:` yourself, or the agent does, once, when the stage is
recorded; no command in this package generates them. They are not a checksum to maintain: a
frozen PDF is never supposed to change, so `bytes:` disagreeing with the file means the file was
replaced after it was declared, and that is exactly the finding. If you really did re-freeze a
stage, update the number in the same commit.
