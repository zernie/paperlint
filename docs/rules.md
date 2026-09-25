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
| `pdf/profile`                  | error | `paper.tex` → `paperlint.json`                | `paperlint.json` is not JSON or has an unknown key, only a pre-2.1.0 `venue.json` is there (`npx paperlint init` moves it), its `extends` does not resolve (not found, a cycle, a chain longer than four, a preset that fails the schema, an npm name), it names no `kind` while the preset has kinds, or names a kind the preset does not have                                                                                                                 |
| `pdf/fonts`                    | error | `paper.tex` → `_build/paper.facts.json`       | a font the pages draw is Type 3 or not embedded, or no font starts with the family the venue preset names for body text (`fonts_text`) or headings (`fonts_title`)                                                                                                                                                                                                                                                                                              |
| `pdf/geometry`                 | error | `paper.tex` → `_build/paper.facts.json`       | the page width or height is more than `dimTol` (default 0.05 in) off the preset's, or the column count differs                                                                                                                                                                                                                                                                                                                                                  |
| `pdf/limits`                   | error | `paper.tex` → `_build/paper.facts.json`       | body or reference pages exceed the limit of the paper's kind, or the reference font size is outside the preset's range widened by `body_pt_tol`                                                                                                                                                                                                                                                                                                                 |
| `pdf/body-size`                | warn  | `paper.tex` → `_build/paper.facts.json`       | the body font size is more than `body_pt_tol` off the preset's. A warning: banal measures the mode of the rendered text, not the declared size (9.30 pt measured at a declared 9)                                                                                                                                                                                                                                                                               |
| `pdf/measured`                 | warn  | `paper.tex` → `_build/paper.facts.json`       | the paper's `paperlint.json` names no venue preset yet; or it names one and there are no facts (it was not built), or the facts carry no page geometry (banal was not found) — so the checks above did not run                                                                                                                                                                                                                                                  |

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
{ "extends": "paperlint:aisec", "kind": "research" }
```

`extends` names a **venue preset** — the way an ESLint config extends a shareable config. `kind`
names the kind of paper, whose page limit applies. A preset holds the numbers from the venue's call
for papers, each with the quote it came from, the TeX packages its template needs, and the rules
the venue implies. A preset may itself extend another: the ACM venues extend the `acm-sigconf`
family, which holds everything the ACM template decides.

| preset                  | extends                 | template             | kinds                                                    | page limit checked | rules it turns on       |
| ----------------------- | ----------------------- | -------------------- | -------------------------------------------------------- | ------------------ | ----------------------- |
| `paperlint:acm-sigconf` | —                       | ACM `acmart` sigconf | none                                                     | no (no kinds)      | —                       |
| `paperlint:agenticdev`  | `paperlint:acm-sigconf` | ACM `acmart` sigconf | `short` (5 + 2 refs), `full` (10 + 2), `demo` (5 + 2)    | yes                | `pdf/last-page-balance` |
| `paperlint:aisec`       | `paperlint:acm-sigconf` | ACM `acmart` sigconf | `research`, `benchmark`, `position`, `sok` (10 + 2 each) | yes                | —                       |
| `paperlint:realm`       | —                       | ACL                  | `long`, `short`                                          | no — see below     | —                       |

That is all that ships today. There is no IEEE, NeurIPS, USENIX or Springer preset. A paper for an
ACM venue nobody has profiled can extend `paperlint:acm-sigconf` directly: page size, columns and
fonts are checked, and `pdf/profile` says the page limit is not. For anything else, write your own
preset ([below](#writing-your-own-venue-preset)). REALM's preset sets no page limit on purpose:
banal counts the Limitations and Ethics sections as body, ACL does not, and a limit on banal's
number would fail a correct paper. AgenticDev's turns on `pdf/last-page-balance` because its
proceedings are produced by Conference Publishing Consulting, which sends back an unbalanced last
page; AISec's does not, because nothing in hand says who produces the AISec proceedings.

**Build, then lint.** The rules judge what `paperlint build` measured and wrote to
`_build/paper.facts.json` — page count, fonts, and, through banal, page size, columns, font sizes
and the split into body and reference pages. They report on the paper's `paper.tex`, at the
`\documentclass` line. What they say when there is nothing to judge, one rule per reason:

| the paper                                                                                        | what you get                                                                                                                 |
| ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| has a `paperlint.json` that extends no preset (`"extends": null` is what `paperlint new` writes) | `pdf/measured` warning naming the file to set — no venue chosen yet                                                          |
| has no `paperlint.json` at all (a paper made before 2.1.0)                                       | nothing                                                                                                                      |
| extends a preset that does not resolve (a typo, a missing file)                                  | `pdf/profile` error, listing the shipped presets                                                                             |
| has not been built (no facts file)                                                               | `pdf/measured` warning — it does not fail the run, because lint often runs where nothing is built (the CI action only lints) |
| was built without banal                                                                          | `pdf/measured` warning; fonts are still checked, the rest is not                                                             |
| has facts about another PDF than the one on disk                                                 | `pdf/fresh` error, and nothing else is judged                                                                                |
| names no `kind` while its preset has kinds, or a kind the preset lacks                           | `pdf/profile` error; everything but the page limit is still checked                                                          |
| names no `kind` and its preset has none (`paperlint:acm-sigconf`)                                | nothing — that preset has no page limit to check; everything else is                                                         |

The venue comes from `paperlint.json`, not from the facts, so changing it needs no rebuild: the
measurements do not depend on it. Messages name the venue by the preset's `name`, else by the file
name of what the paper extends (`paperlint:agenticdev` → `agenticdev`).

To skip a check for one paper — a finding you accept — set it to `"off"` in the paper's own
`paperlint.json`:

```json
{
  "extends": "paperlint:aisec",
  "kind": "research",
  "rules": { "pdf/body-size": "off" }
}
```

### Writing your own venue preset

A preset is a JSONC file (JSON with comments — keep the call-for-papers quote beside each number)
of the same shape as the shipped ones, validated by
[`venue-profile.schema.json`](../skills/submit-paper/references/venues/venue-profile.schema.json).
Put it in your repository and extend it by a path relative to the file that names it:

```
package.json
venues/
  usenix-sec.jsonc
papers/
  usenix-2027/
    paper.tex
    paperlint.json        { "extends": "../../venues/usenix-sec.jsonc", "kind": "full" }
```

```jsonc
// venues/usenix-sec.jsonc
{
  "name": "USENIX Security",
  // a standalone preset needs its template's TeX packages; one that extends a family inherits them
  "template": "article",
  // TeX Live packages only, each with a file that proves it is installed. The USENIX style file
  // itself is not in TeX Live: keep it beside paper.tex.
  "tex": { "packages": { "psnfss": ["times.sty"] } },
  "format": {
    "page_size": "letter",
    "page_w_in": 8.5,
    "page_h_in": 11,
    "columns": 2,
    "body_pt": 10,
    "body_pt_tol": 0.5,
    // the page limit of each kind of paper, as the call for papers states it
    "kinds": { "full": { "body_pages_max": 13 } },
  },
  // only if the proceedings' producer asks for a balanced last page
  "rules": { "pdf/last-page-balance": "error" },
}
```

The numbers and packages above illustrate the shape; take yours from the venue's own call for papers and template.

| key        | what it is                                                                                          |
| ---------- | --------------------------------------------------------------------------------------------------- |
| `extends`  | the preset this one builds on: `paperlint:<name>` or `./path` / `../path`, relative to this file    |
| `name`     | how messages name the venue; the file name otherwise                                                |
| `template` | the `\documentclass` the venue's template uses                                                      |
| `format`   | page size, columns, fonts, font sizes, and `kinds` (page limits per kind of paper)                  |
| `tex`      | TeX Live packages, each with the files that prove it is installed. Required unless `extends` is set |
| `rules`    | rules the venue implies, rule id → severity or `[severity, options]`                                |

How a chain merges, from the root preset to the paper: `tex` is the union — a child never removes a
package; `format` keys are replaced one by one, and a child's kind replaces that kind whole;
`rules` are replaced rule by rule, and the paper's own `rules` come last. A chain is at most four
presets long, and a cycle is refused by name. `paperlint toolchain` installs the packages of every
shipped preset and of every preset your papers extend.

Presets from npm packages are not supported yet.

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
