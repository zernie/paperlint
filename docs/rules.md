# The checks, one by one

The README lists what each check catches in one line. This page says exactly which file each one
reads and when it fails. Errors fail `paperlint lint`; warnings print and do not.

| Rule                           | Level | Reads                                         | Fails when                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------ | ----- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `paper/stages`                 | error | `PIPELINE-STATUS.md`                          | a declared stage's PDF is missing, or the `bytes:` it names does not match the file's real size, or a frozen PDF exists that no stage declares                                                                                                                                                                                                                                                                                                                  |
| `paper/source`                 | error | `PIPELINE-STATUS.md`                          | a declared stage has no frozen `.tex` beside its PDF (a commit hash does not count — squash and gc destroy it)                                                                                                                                                                                                                                                                                                                                                  |
| `paper/author-list`            | warn  | `PIPELINE-STATUS.md`                          | a stage is declared and **no cell of the scorecard's table contains the run marker** (default `bib-authors`). It checks that you recorded the cross-check; it does not read your `.bib`. What to run is your own `authorListCommand`, empty by default                                                                                                                                                                                                          |
| `paper/research-question`      | warn  | `paper.tex`, `paper.md`, `PIPELINE-STATUS.md` | a stage is declared and either the scorecard has no `researchQuestion` field, or it has one the paper does not contain. The declared sentence is compared against the source with whitespace collapsed — your words, not a pattern. Advisory, because nothing here can judge whether what you declared _is_ a research question                                                                                                                                 |
| `paper/typography`             | warn  | `paper.tex`, `paper.md`                       | any of four counts rises above the per-paper allowance you set: `§` or `\S\ref` instead of "Section"; a decimal with no leading zero (`.05` instead of `0.05`, IEEE / ISO 80000-1 style), counted only where the reader sees it — prose, math and table cells, not macro options, column specs, comments, code or tikz; `Fig.` and `Figure` mixed in one document; bibliography entries with no doi, url or arXiv id. Existing debt is tolerated, growth is not |
| `tex/future-promise`           | warn  | `paper.tex`                                   | a camera-ready build still says "will be released" about something already handed over                                                                                                                                                                                                                                                                                                                                                                          |
| `tex/acm-frontmatter-override` | error | `paper.tex`                                   | an `acmart` build overrides ACM's front-matter commands and drops template elements from page 1                                                                                                                                                                                                                                                                                                                                                                 |
| `review/findings-cause`        | error | `reviews/*.md`                                | a review lists at least `minFindings` (default 3) findings and no cell introduces a cause with the marker (default `Cause:`)                                                                                                                                                                                                                                                                                                                                    |
| `doc/fields`                   | warn  | `reviews/*.md`                                | a front-matter field is missing or holds a value outside the list you configured. Off entirely unless you configure `docFields`                                                                                                                                                                                                                                                                                                                                 |
| `pdf/fresh`                    | error | `paper.tex` → `_build/paper.facts.json`       | the paper names a venue and the facts cannot be judged: not JSON, a schema other than 2, or they describe a PDF that is gone or differs from the one on disk (its SHA-256)                                                                                                                                                                                                                                                                                      |
| `pdf/profile`                  | error | `paper.tex` → `paperlint.json`                | `paperlint.json` is not JSON or has an unknown key, only a pre-2.1.0 `venue.json` is there (`npx paperlint init` moves it), it names a venue paperlint has no profile for, names no `kind` while the venue has kinds, or names a kind the venue does not have                                                                                                                                                                                                   |
| `pdf/fonts`                    | error | `paper.tex` → `_build/paper.facts.json`       | a font the pages draw is Type 3 or not embedded, or no font starts with the family the venue profile names for body text (`fonts_text`) or headings (`fonts_title`)                                                                                                                                                                                                                                                                                             |
| `pdf/geometry`                 | error | `paper.tex` → `_build/paper.facts.json`       | the page width or height is more than `dimTol` (default 0.05 in) off the profile's, or the column count differs                                                                                                                                                                                                                                                                                                                                                 |
| `pdf/limits`                   | error | `paper.tex` → `_build/paper.facts.json`       | body or reference pages exceed the limit of the paper's kind, or the reference font size is outside the profile's range widened by `body_pt_tol`                                                                                                                                                                                                                                                                                                                |
| `pdf/body-size`                | warn  | `paper.tex` → `_build/paper.facts.json`       | the body font size is more than `body_pt_tol` off the profile's. A warning: banal measures the mode of the rendered text, not the declared size (9.30 pt measured at a declared 9)                                                                                                                                                                                                                                                                              |
| `pdf/measured`                 | warn  | `paper.tex` → `_build/paper.facts.json`       | the paper names a venue and there are no facts (it was not built), or the facts carry no page geometry (banal was not found) — so the checks above did not run                                                                                                                                                                                                                                                                                                  |

Optional rules — off unless you turn them on in the `rules` setting, because only some venues need
them — are on their own page: [`optional-rules.md`](optional-rules.md). Today there is one,
`pdf/last-page-balance`.

Besides these rules, `paperlint lint` reports a paper directory that is missing a required file (by
default `PIPELINE-STATUS.md`) as an error. Which files are required is configurable — see
[`configuration.md`](configuration.md#required-files).

## Checks against the venue

A paper says where it is submitted in a `paperlint.json` beside `paper.tex`
([`configuration.md`](configuration.md#three-levels-of-settings)):

```json
{ "venue": "aisec", "kind": "research" }
```

`venue` names a profile that ships with paperlint; `kind` names the kind of paper, whose page
limit applies. The profiles hold the numbers from each venue's call for papers, each with the
quote it came from:

| profile      | template             | kinds                                                    | page limit checked |
| ------------ | -------------------- | -------------------------------------------------------- | ------------------ |
| `agenticdev` | ACM `acmart` sigconf | `short` (5 + 2 refs), `full` (10 + 2), `demo` (5 + 2)    | yes                |
| `aisec`      | ACM `acmart` sigconf | `research`, `benchmark`, `position`, `sok` (10 + 2 each) | yes                |
| `realm`      | ACL                  | `long`, `short`                                          | no — see below     |

That is all there is today. There is no IEEE, NeurIPS, USENIX or Springer profile, and a paper
that names one gets a `pdf/profile` error rather than a silent pass. Adding a venue is one file in
[`skills/submit-paper/references/venues/`](../skills/submit-paper/references/venues/), validated
by `venue-profile.schema.json` next to it; the same file tells `paperlint toolchain` which TeX Live
packages the venue's template needs. REALM's profile sets no page limit on purpose: banal counts
the Limitations and Ethics sections as body, ACL does not, and a limit on banal's number would
fail a correct paper.

**Build, then lint.** The rules judge what `paperlint build` measured and wrote to
`_build/paper.facts.json` — page count, fonts, and, through banal, page size, columns, font sizes
and the split into body and reference pages. They report on the paper's `paper.tex`, at the
`\documentclass` line. What they say when there is nothing to judge, one rule per reason:

| the paper                                                       | what you get                                                                                                                 |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| has no `paperlint.json`, or it names no venue                   | nothing — you asked for no venue checks                                                                                      |
| names a venue with no profile (a typo, or an unsupported venue) | `pdf/profile` error, listing the profiles that exist                                                                         |
| has not been built (no facts file)                              | `pdf/measured` warning — it does not fail the run, because lint often runs where nothing is built (the CI action only lints) |
| was built without banal                                         | `pdf/measured` warning; fonts are still checked, the rest is not                                                             |
| has facts about another PDF than the one on disk                | `pdf/fresh` error, and nothing else is judged                                                                                |
| names no `kind`, or a kind the venue lacks                      | `pdf/profile` error; everything but the page limit is still checked                                                          |

The venue comes from `paperlint.json`, not from the facts, so changing the venue needs no rebuild: the
measurements do not depend on it.

To skip a check for a paper — a venue without a profile, or a finding you accept — set it to
`"off"` in the `rules` setting ([`configuration.md`](configuration.md#the-rules-key-turning-rules-on-and-off)):

```json
"rules": [{ "files": ["papers/my-paper/**"], "rules": { "pdf/profile": "off" } }]
```

## The paper is LaTeX

The paper body is `paper.tex`, and it gets four rules of its own: `paper/research-question`,
`paper/typography`, `tex/future-promise` and `tex/acm-frontmatter-override` — plus the `pdf/`
venue rules above, which run on it but judge the files beside it. The scorecard and
the review notes are Markdown files, and the other five rules read those.

A Markdown body (`paper.md`, or `draft.md`) is still read today and gets only the two `paper/`
rules, which is why they list it above. Markdown papers are deprecated and being removed
([#57](https://github.com/zernie/paperlint/issues/57)); do not start a new one.

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
