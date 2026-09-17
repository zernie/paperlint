# research-paper-pipeline

Checks for an academic paper that lives in a git repository and is written with an AI coding
agent (Claude Code). It ships two things:

- **<!-- count:skills -->24 skills** — instruction files the agent reads, one per stage of writing a paper: decide
  whether the idea is worth it, pick a venue, run the study, draft, tighten, red-team, simulate
  the program committee, submit, camera-ready, extend into a second paper.
- **<!-- count:rules -->13 rules and 3 hooks** — machine checks that verify what those stages _claim_. Each paper
  keeps a scorecard file, `PIPELINE-STATUS.md`. A skill writes "submitted on this date, this PDF,
  this many bytes" into it; a rule then reads the scorecard and compares it with the files on
  disk. The rule never trusts the skill's word.

CLI name: `rpp`. Requires Node 22.13 or newer.

## Install and first run

Not on npm yet — install from GitHub, pinned to a commit:

```sh
npm i -D github:zernie/research-paper-pipeline#<commit-sha>
npx rpp init          # writes rpp.json and prints the next steps
npx rpp check papers  # runs every rule over the papers/ directory
```

`check` needs at least one path. There is no default on purpose: linting "." would pass over
whatever happens to be in the checkout.

The exit code is `1` when any rule reports an error, and also `1` when _nothing_ was checked —
a clean report over zero files is not a clean report. `--json` prints machine-readable findings.

## What else has to be on the machine

`rpp check` needs nothing but Node — it reads your files and reports. **The skills are a different
matter**: they build PDFs, read them back, and run external checkers, so they call programs this
package does not ship.

| program                | comes from                       | which skills call it                     | what happens without it                                            |
| ---------------------- | -------------------------------- | ---------------------------------------- | ------------------------------------------------------------------ |
| `pdflatex`, `bibtex`   | TeX Live                         | render-paper, submit-paper, camera-ready | no PDF is produced — loud                                          |
| `pdfinfo`, `pdftotext` | poppler-utils                    | render-paper, submit-paper               | checks that read the built PDF report that they did not run        |
| `texcount`             | TeX Live (`texlive-extra-utils`) | render-paper, grade-paper-writing        | the length checks cannot run                                       |
| `checkcites`           | TeX Live                         | render-paper                             | nothing asks whether a bibliography entry is uncited               |
| `java`                 | any JRE (21 works)               | render-paper                             | TeXtidote does not run, and **nothing else spell-checks the text** |
| `python3`              | your system                      | the analysis and report scripts          | those scripts do not start                                         |
| `tlmgr`                | TeX Live                         | the TeX installer itself                 | you cannot add a TeX package                                       |

🔴 **Most of these fail QUIETLY**, which is why they are listed rather than left to be discovered.
A missing checker and a passing checker look identical from outside, so every script here states in
its last line which checks actually ran — read that line, not the exit code.

### TeX Live: 298 MB, not 2.1 GB

The distribution packages are the expensive way. `texlive-fonts-extra` alone is **1.69 GB**, and
these papers use **71 MB** of it — apt cannot install less, because Debian does not split those
font families into separate packages.

So install TeX Live directly instead, by name:

```sh
bash node_modules/research-paper-pipeline/skills/render-paper/ci-install-texlive.sh ~/texlive
export PATH="$(find ~/texlive/bin -maxdepth 1 -mindepth 1 -type d | head -1):$PATH"
```

The bin directory is named after the platform, so it is found rather than guessed — the installer
prints the same path on its last line.

41 named packages, **298 MB**, and the script verifies every file the papers actually load before
it reports success. (The `ci-` in the name is historical — there is nothing CI-specific inside.)

An apt list is kept in `skills/render-paper/ensure-toolchain.sh` for machines that cannot reach
CTAN. It works, and it costs 2.1 GB.

### The external checkers

`aclpubcheck` (the official ACL format checker), TeXtidote (spelling) and `rebiber` are not TeX
packages and not npm packages. One idempotent command installs them and then **proves each one
starts**:

```sh
bash node_modules/research-paper-pipeline/skills/render-paper/ensure-checkers.sh
```

```
   ✅ aclpubcheck
   ✅ rebiber
   ✅ jinja2
   ✅ textidote (/opt/textidote/textidote.jar)
✅ все чекеры установлены И запускаются
```

It checks that the tools RUN, not that pip exited zero — `aclpubcheck --help` prints usage and
exits zero on an interpreter where its own dependencies do not import, so "installed" and "works"
are separate questions here.

## How the pieces fit

```
   YOU + CLAUDE CODE                          THE PACKAGE
   ───────────────────                        ───────────────────────────────────

   research-ideate ─► map-prior-work ─► find-venue ─► plan-paper-timeline
         │                                                 │
         ▼                                                 ▼
   build-benchmark ◄──► draft-paper ◄──► argument-arc      (loop until the argument holds)
         │
         ▼
   tighten-paper ─► grade-paper-writing ─► pc-panel-review ─► harden-paper ─► submit-paper
         │                                                                        │
         ▼                                                                        ▼
   camera-ready ─► extend-paper                                          (accepted? start over)

   each skill WRITES a row               ┌──────────────────────────┐
   into the scorecard ─────────────────► │ papers/<name>/           │
                                         │   PIPELINE-STATUS.md     │
                                         │   paper.tex / paper.md   │
                                         │   reviews/*.md           │
                                         │   versions/<date>-*.pdf  │
                                         └────────────┬─────────────┘
                                                      │
                                    rules READ the scorecard and compare it
                                    with the files beside it (bytes, dates, names)
                                                      │
                                                      ▼
                                              npx rpp check papers
                                              (locally, and in CI via action.yml)
```

The skills do the writing. The rules check that what was written down actually happened.
The 3 hooks (below) sit in the editor and remind the agent to run the right skill at the
right moment.

## The scorecard

Every paper directory carries a `PIPELINE-STATUS.md`. Its YAML front matter declares the stages
the paper has reached. Minimal example:

```markdown
---
stages:
  - stage: submitted
    date: 2026-07-22
    venue: A Venue 2026
    pdf: versions/2026-07-22-submitted.pdf
    bytes: 305412
    source: versions/2026-07-22-submitted.tex
    sourceBytes: 57210
---

# PIPELINE-STATUS

| id | status | date | result |
| ... one row per stage the skills ran ... |
```

A template with every row explained is in `skills/paper-pipeline/references/pipeline-status-template.md`.

## What the rules check

| Rule                           | Reads                   | Fails when                                                                                                     |
| ------------------------------ | ----------------------- | -------------------------------------------------------------------------------------------------------------- |
| `paper/stages`                 | `PIPELINE-STATUS.md`    | a declared stage has no PDF on disk, the byte count differs, or a frozen PDF exists with no declaration        |
| `paper/source`                 | `PIPELINE-STATUS.md`    | a declared stage has no frozen `.tex` beside its PDF (a commit hash does not count — squash and gc destroy it) |
| `paper/author-list`            | `PIPELINE-STATUS.md`    | a paper was submitted but the scorecard never recorded an author-list check of the bibliography                |
| `paper/research-question`      | `paper.tex`, `paper.md` | the paper shipped without stating its research question                                                        |
| `paper/typography`             | `paper.tex`, `paper.md` | mechanical conventions a reviewer already flagged got _worse_ (existing debt is tolerated, growth is not)      |
| `tex/future-promise`           | `paper.tex`             | a camera-ready build still says "will be released" about something already handed over                         |
| `tex/acm-frontmatter-override` | `paper.tex`             | an `acmart` build overrides ACM's front-matter commands and drops template elements from page 1                |
| `review/findings-cause`        | `reviews/*.md`          | a review report lists findings but does not say which pipeline step let them through                           |
| `review/cold-read-cause`       | `reviews/*.md`          | an open cold-read finding has no stated cause                                                                  |
| `doc/fields`                   | `reviews/*.md`          | a front-matter field is missing or holds a value outside the list you configured                               |

Errors fail the run. Warnings print and do not. Three more rules guard the package's own code
and do not run on your papers.

## The options file

`rpp init` writes `rpp.json`. It holds the facts only you can supply; every key is optional.
Pass it explicitly:

```sh
npx rpp check papers --options rpp.json
```

```json
{
  "authorListCommand": "node scripts/bib-authors.mjs",
  "typographyDebt": { "papers/my-paper": { "sectionSign": 12 } },
  "docFields": { "read": { "values": ["full", "abstract", "none"] } },
  "reviewSince": "2026-08-23",
  "minFindings": 3,
  "causeMarker": "Cause:"
}
```

- `authorListCommand` — the command `paper/author-list` tells you to run when the check is missing.
- `typographyDebt` — per-paper counts of known typography issues; the rule stays quiet at or below them.
- `docFields` — required front-matter fields in review files and their allowed values.
- `reviewSince` — only review files created on or after this date are checked.
- `minFindings` — a review with fewer findings than this is not required to name causes.
- `causeMarker` — the phrase a review uses to name a cause (default `Cause:`). Set it to
  whatever your reviews actually write, in any language.

## In CI

The repository ships a GitHub composite action. Add one step:

```yaml
- uses: zernie/research-paper-pipeline@<commit-sha>
  with:
    paths: papers
```

`paths` is required. The action also refuses to pass when zero files were linted, so a typo in
the path shows up as a red job instead of a green one. Optional inputs: `config` (your own
ESLint config, see the bottom of this page), `max-warnings` (default `-1`, warnings never fail
the job), `texcount` (default `true`; set to `false` if you have no `texcount/*` rules of your
own — this package ships none), `working-directory`.

## Skills and hooks in Claude Code

The skills and hooks are delivered as a Claude Code plugin. The three hooks run on
[`vigiles`](https://github.com/zernie/vigiles), so it has to be installed first:

```sh
npm i -D vigiles
/plugin marketplace add zernie/research-paper-pipeline
/plugin install research-paper-pipeline@research-paper-pipeline
```

⚠️ **This is the worst part of the install and it is being replaced.** `vigiles` costs 93 MB in a
clean project — 51 MB of `@ast-grep`, 23 MB of `typescript` — and nothing outside the hooks uses
any of it. Installing the plugin *without* it is worse than not installing it: Claude Code's
contract is that a failed or skipped dependency install never blocks a plugin, so the plugin would
load and its hooks would die on `Cannot find module` with nothing said.

Skip this section entirely and everything above still works. The rules, the CLI and the skills do
not use vigiles; what you lose is the in-editor guard.

That installs all 24 skills (`/paper-pipeline` is the entry point; it routes to the rest) and
three hooks:

| Hook                 | When                           | What it does                                                                                             |
| -------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `paper-edit-guard`   | before a Bash command          | blocks writing a paper source from Bash, because a Bash write skips every check that hangs on Edit/Write |
| `paper-skills-nudge` | after an Edit/Write on a paper | shows the agent the pre-submit checklist                                                                 |
| `paper-status-gates` | after an Edit/Write on a paper | reads that paper's scorecard and lists the gates that have not run yet                                   |

The hooks look for papers under `papers/`. To use another directory, declare it once in your
`package.json`:

```json
{ "research-paper-pipeline": { "papers": "docs/papers" } }
```

## How reliable are the checks

Every rule is tested two ways: it has to catch a planted mistake, and it has to stay quiet on a
correct file. Both halves matter, because a broken check and a clean file look identical from
the outside. The test suite also deletes one load-bearing line from each rule and confirms the
right test goes red.

<details>
<summary>Already have an ESLint config? Use the rules directly</summary>

Under the hood `rpp check` builds an ESLint flat config and runs it. If your repository already
lints with ESLint, you can import the rule modules from `research-paper-pipeline/eslint-rules/`
and wire them yourself; `bin/rpp.mjs` exports `buildConfig(options, texLanguage)` that returns
the exact config the CLI uses, so the shortest path is:

```js
// eslint.config.mjs
import { buildConfig } from "research-paper-pipeline/bin/rpp.mjs";
import { texLanguage } from "research-paper-pipeline/eslint-rules/latex-language.mjs";
export default buildConfig({ minFindings: 3 }, texLanguage);
```

Then point the CI action's `config` input at that file.

</details>

## Contributing

Layout, test commands, and how to add a rule or a skill are in `CONTRIBUTING.md`.

## License

MIT.
