<!--
README style — keep it scannable, not a wall of text:
- One idea per paragraph; paragraphs ≤ 3 lines. Split anything longer.
- Every section starts with a heading (##); sub-topics get ###. No section longer than one screen.
- Lists over prose for anything with 3+ items; bullets ≤ 2 lines.
- Tables for comparisons (commands, venues, checks). Code blocks for every command and file.
- A blank line between every block. Bold only for the one phrase a skimmer must see.
- Mechanics and edge cases live in docs/, linked — not inline.
- A reader must be able to answer "what is it, which venues, how do I start" from the first screen.
- Sparse emoji are fine where they help rhythm and scanning (e.g. one per section heading or feature bullet); never decorative, never several in a row.
- One name per thing, everywhere (lint, build, venue preset, kind, skill, papersDir), and no term before it is explained.
- Editing this file: re-read all of it first, and change it so it still reads as one document — the opening, the diagram, the order and the names your change touches. Remove or merge what it makes redundant. Never bolt on a section or patch one paragraph in isolation.
-->

# paperlint

[![npm version](https://img.shields.io/npm/v/paperlint)](https://www.npmjs.com/package/paperlint)
![Node version](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fzernie%2Fpaperlint%2Fmain%2Fpackage.json&query=%24.engines.node&label=node)

**A pipeline for writing a research paper in LaTeX, from idea to camera-ready — with a linter that
checks the paper at every step.**

- ✅ **The linter is the backbone.** `paperlint lint` checks your paper against your venue's rules
  on every edit and in CI. `paperlint build` compiles it and measures the PDF, so lint can also
  judge the page limit, the fonts and the references.
- 🧠 **The skills do the rest of the work with you.** 24 skills for Claude Code, covering every
  stage: the idea, the venue, the study, the draft, the reviews, submission, camera-ready.

The linter needs only Node. The skills need [Claude Code](https://claude.com/claude-code) and are
optional.

## Contents

- [The pipeline](#-the-pipeline)
- [Supported venues](#-supported-venues)
- [Getting started](#-getting-started)
- [Skills](#-skills)
- [Lint and build](#-lint-and-build)
- [Commands](#-commands)
- [Configuration](#-configuration)
- [Run it in CI](#-run-it-in-ci)
- [FAQ](#-faq)
- [Docs](#-docs)

## 🧭 The pipeline

Eight stages, the skills that do each, and where the linter checks the paper:

```text
stage           skills (with Claude Code)                    paperlint
--------------  -------------------------------------------  ----------------
1 idea          research-ideate, map-prior-work,
                analyze-sibling-paper, sweep-design-space
2 venue         find-venue, study-accepted-papers,           new --venue
                plan-paper-timeline                            |
3 study         build-benchmark                                | lint:
4 draft         draft-paper, argument-arc, tighten-paper,      |  every edit,
                cold-read-diff, render-paper                   |  every CI run
5 review        grade-paper-writing, verify-citations,         |
  and harden    paper-adversarial-review, pc-panel-review,     | build:
                harden-paper                                   |  pages, fonts,
6 submit        submit-paper, osf-artifact-upload              |  references
                                                               | + submitted PDF
7 camera-ready  camera-ready                                   |  locked in
8 extend        extend-paper                                   v

paper-pipeline walks you through the stages; paper-status says where you are.
```

- `new --venue` creates the paper folder with its venue preset (below): the file that holds the
  venue's page limit and format.
- `lint` runs from then on, on every edit and in CI. `build` compiles and measures the PDF before
  you submit; after that, lint also checks that the PDF you sent is kept, unchanged.

## 🎯 Supported venues

A **venue preset** holds a venue's format and page limits. Its **kind** is the paper type the venue
sets a limit for — `short`, `full`, `research` — chosen once per paper.

| preset                  | venue              | format                           | page limit                                                     |
| ----------------------- | ------------------ | -------------------------------- | -------------------------------------------------------------- |
| `paperlint:acm-sigconf` | any ACM conference | ACM two-column conference format | not checked: the family sets no kinds                          |
| `paperlint:agenticdev`  | AgenticDev @ ASE   | ACM two-column conference format | `short` 5, `full` 10, `demo` 5 body pages, + 2 of references   |
| `paperlint:aisec`       | AISec @ ACM CCS    | ACM two-column conference format | 10 body pages + 2 (`research`, `benchmark`, `position`, `sok`) |
| `paperlint:realm`       | REALM @ EMNLP      | ACL two-column format, A4        | `long` 8, `short` 4 — recorded, not checked (below)            |

REALM's limit is recorded but not checked because ACL leaves the Limitations and Ethics sections
out of the page count, and the PDF measurement counts them as body pages: a paper within the limit
would fail.

Your venue is not listed? [Add it in five steps](#-add-a-venue-that-isnt-listed).

## 🚀 Getting started

<!-- `vigiles:symbol src/init.ts#init` — `npm run check` fails if this function is renamed or removed. -->

1. Install (Node 22.13 or newer):

   ```sh
   npm i -D paperlint
   ```

2. Set up. `init` finds the directory your papers live in (`papers/` unless you say otherwise),
   offers a CI workflow, and — with Claude Code — installs the skills:

   ```sh
   npx paperlint init
   ```

3. Install TeX Live, once, for `build`. `init` offers it; `lint` alone needs no TeX:

   ```sh
   npx paperlint toolchain   # ~270 MB, ~3 min, once
   ```

4. Create a paper for your venue. `--venue` names a venue preset from
   [the table above](#-supported-venues); `--kind` names which of its page limits applies to
   your paper (`short`, `full`, … as the table lists):

   <!-- `vigiles:symbol src/new-paper.ts#newPaper` — `npm run check` fails if this function is renamed or removed. -->

   ```sh
   npx paperlint new my-paper --venue agenticdev --kind short
   ```

   ```
     ✓ created papers/my-paper
         + PIPELINE-STATUS.md  (from the package template)
         + paper.tex  (from the package template)
         + paperlint.json  (from the package template)
   ```

   `paper.tex` is your paper. `PIPELINE-STATUS.md` is its scorecard: the stages it has reached.
   `paperlint.json` names its venue preset and kind.

5. Build the PDF ([what build does](#-paperlint-build)):

   ```sh
   npx paperlint build papers/my-paper
   ```

6. Check every paper ([what lint checks](#-paperlint-lint)):

   ```sh
   npx paperlint lint
   ```

   Sample output, on a paper with two slips and no `PIPELINE-STATUS.md`:

   ```
   papers/hand
     error  missing `PIPELINE-STATUS.md` — `paper/stages`, `paper/source` and `paper/research-question` read this file, so nothing `hand` declares about its stages, sources or research question is checked
   …/papers/hand/paper.tex
     3:4   warning  `§` instead of the word «Section» — `paperlint lint --fix` writes it                              paper/section-word
     3:19  warning  `.05` has no leading zero — write `0.05` (IEEE / ISO 80000-1); `paperlint lint --fix` inserts it  paper/leading-zero

   ✖ 2 problems (0 errors, 2 warnings)
     0 errors and 2 warnings potentially fixable with the `--fix` option.
   ```

7. With Claude Code, ask for the next step in plain words — "is this idea worth a paper?" — or for
   the whole pipeline: "walk me through writing this paper". More in [Skills](#-skills).

## 🧠 Skills

You do not need to learn the skills' names. You talk to Claude Code, and the right skill starts:

- `paper-pipeline` walks you through the stages in order and calls the other skills on the way.
- Each skill also starts on its own when you ask for what it does: "is this idea worth a paper?",
  "find me a venue for this", "red-team my draft".

`paperlint init` installs them. The six a new user meets first:

- **A go / no-go on your idea, with the reason** — and the smallest result that would make it a
  paper. `research-ideate`
- **A ranked list of venues that fit** — deadline, page limit, indexing. `find-venue`
- **A first draft from your results** — claims sized, threats to validity written. `draft-paper`
- **A hostile review before the real one** — overclaims, missing baselines, holes in the
  method. `paper-adversarial-review`
- **A ready / not ready verdict before you submit** — worst problem first. `harden-paper`
- **Where your paper stands, measured** — pages from the real build, what is checked, what
  blocks you. `paper-status`

All 24, by stage: [`docs/skills.md`](docs/skills.md).

## 🔍 Lint and build

Two commands, two jobs. **build** turns the paper into a PDF and measures it. **lint** judges the
paper: its source, and what build measured.

### ✅ `paperlint lint`

- **What it reads:** in each paper folder, `paper.tex` (or `paper.md`, `draft.md`),
  `PIPELINE-STATUS.md`, `reviews/*.md` and `siblings/*.md` — nothing else. A script, a README or
  `node_modules` beside them is never linted.
- **What it checks:** the source (typography, references), the scorecard, and what the last build
  measured (`_build/`): page limit, fonts, format.
- **Offline and repeatable:** no network, and the same files always give the same verdict. That is
  why it can fail a CI run.
- **Exit code:** errors fail the run (exit 1); warnings only print, unless you pass
  `--max-warnings <n>`. `paperlint lint --fix` fixes what can be fixed.

A deliberate exception gets its reason on the line above:
`% eslint-disable-next-line paper/leading-zero -- quoted from the reviewer`.

| check                 | catches                                                                |
| --------------------- | ---------------------------------------------------------------------- |
| `pdf/fonts`           | the template's fonts are missing — LaTeX silently used Computer Modern |
| `pdf/limits`          | more pages than the venue allows for your kind of paper                |
| `paper/stages`        | the PDF you recorded as submitted changed or disappeared               |
| `paper/source`        | the LaTeX source of a submitted version was not kept                   |
| `bib/reachable-entry` | a reference with no DOI, URL or arXiv id                               |
| `paper/author-list`   | a reference lists the preprint's authors, not the published version's  |

Every check: [`docs/rules.md`](docs/rules.md). Checks only some venues need are off until you turn
them on: [`docs/optional-rules.md`](docs/optional-rules.md).

### 🧱 `paperlint build`

`paperlint build papers/my-paper` starts from `papers/my-paper/paper.tex`, and:

1. **Compiles** with TeX Live's `pdflatex`, runs `bibtex` when the paper has a bibliography, and
   reruns pdflatex until the references settle (at most five passes, then one final pass).
2. **Measures** the PDF: page count, fonts, page size, columns, font sizes.
3. **Checks the references online** (Crossref, DOI, arXiv, DBLP): each cited work exists, and its
   authors are the published version's. Offline it records "not checked", and the build still passes.

What the paper folder holds afterwards:

```
papers/my-paper/
  paper.tex
  paperlint.json
  PIPELINE-STATUS.md
  paper.pdf                  the PDF
  paper.aux, paper.log, …    LaTeX's own files
  _build/
    paper.facts.json         what was measured (step 2)
    references.json          what the reference check found (step 3)
```

The build judges nothing: a PDF over the page limit still builds, and lint reports it. Keep
`_build/` out of git. Details: [`docs/configuration.md`](docs/configuration.md#how-paperlint-build-compiles-a-paper).

### How they fit

- build writes `_build/`; lint reads it. The `pdf/*` checks judge `paper.facts.json`, the
  reference checks judge `references.json`. Each fails when the PDF or the bibliography changed
  since the build that wrote it.
- **lint belongs in CI:** it needs only Node and is fast. There, without a build, it checks the
  source and the scorecard, and says that the venue checks did not run.
- **build runs on your machine** before you submit, and after changes that move pages: it needs
  TeX Live and the network. Then run lint to see the venue checks.

### 📌 When you submit

Copy the PDF and `paper.tex` into `versions/`, and record the stage in the front matter of
`PIPELINE-STATUS.md`. You write the sizes yourself (`wc -c < file`):

```yaml
stages:
  - stage: submitted
    date: 2026-07-22
    pdf: versions/2026-07-22-submitted.pdf
    bytes: 305412
    source: versions/2026-07-22-submitted.tex
    sourceBytes: 57210
```

From then on `paperlint lint` fails if that PDF goes missing or changes size
([`docs/rules.md`](docs/rules.md#the-scorecards-bytes-and-sourcebytes)).

## 🧰 Commands

| command                                                     | what it does                                                                   |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `npx paperlint init`                                        | sets the project up                                                            |
| `npx paperlint new my-paper --venue <preset> --kind <kind>` | creates a paper folder for that venue; never overwrites a file                 |
| `npx paperlint build <paper>`                               | compiles `paper.tex` to `paper.pdf`, measures it, checks the references online |
| `npx paperlint lint`                                        | runs every check over your papers; `--fix` fixes what can be fixed             |
| `npx paperlint toolchain`                                   | installs TeX Live with the packages your venues need (~270 MB, ~3 min, once)   |
| `npx paperlint doctor`                                      | checks the setup and exits non-zero if something is miswired                   |
| `npx paperlint --help`                                      | every command and flag                                                         |

## 🧩 Configuration

Two levels, one file name, both optional:

```
paperlint.json                   the project: papersDir, rules, defaults for every paper
papers/my-paper/paperlint.json   one paper: its venue preset, its kind, its own rules
```

`papersDir` — the directory your papers live in — defaults to `papers`. If yours live elsewhere,
say so in a `paperlint.json` beside your `package.json`:

```json
{ "papersDir": "docs/papers" }
```

- A paper's file merges over the root's: its `extends` (the venue preset) and `kind` win, its
  `rules` apply last.
- An unknown key is an error, so a typo cannot silently turn a setting off.

Every key: [`docs/configuration.md`](docs/configuration.md).

### ➕ Add a venue that isn't listed

A venue preset is a small file that tells paperlint a venue's rules: its template family, and the
page limit for each kind of paper. You write one for your venue, on top of a shipped one:

1. **Pick the closest shipped preset.** Any ACM venue: `paperlint:acm-sigconf` — it already knows
   the ACM template's page size, columns and fonts. Another template family: a preset can also
   [stand alone](docs/rules.md#writing-your-own-venue-preset).

2. **Create the file** in your project, for example `venues/my-workshop.jsonc`.

3. **Write in it what the call for papers sets** — here, a 4-page limit for short papers:

   ```jsonc
   {
     // everything the ACM template decides (page size, columns, fonts) comes from here
     "extends": "paperlint:acm-sigconf",
     "format": {
       // one entry per kind of paper the call for papers names
       "kinds": {
         // the page limit, not counting references — the number in the call for papers
         "short": { "body_pages_max": 4 },
       },
     },
   }
   ```

4. **Point the paper at it.** For a new paper, from the project root:

   ```sh
   npx paperlint new my-paper --venue ./venues/my-workshop.jsonc --kind short
   ```

   For an existing paper, set `extends` in `papers/my-paper/paperlint.json`. There the path is
   relative to that file: `{ "extends": "../../venues/my-workshop.jsonc", "kind": "short" }`.

5. **Check it is picked up:** `npx paperlint build papers/my-paper`, then `npx paperlint lint`. A
   wrong path is a `pdf/profile` error naming the file it looked for; a kind the preset lacks is a
   `pdf/profile` error listing its kinds.

A preset other people could use is welcome as a pull request
([`CONTRIBUTING.md`](CONTRIBUTING.md#adding-a-venue)).

### 🧷 Your own ESLint config

paperlint is built on ESLint: each check is an ESLint rule over `.tex` and `.md` files, named like
`paper/leading-zero`. You do not need to know ESLint to use it.

If your own ESLint config also lints the paper files, spread `rulesOff` into it. It registers
paperlint's rules, turned off, so a `% eslint-disable-next-line paper/leading-zero` does not fail
your run with "Definition for rule … was not found":

```js
// eslint.config.mjs
import { rulesOff } from "paperlint/bin/paperlint.mjs";
import { texLanguage } from "paperlint/eslint-rules/latex-language.mjs";

export default [...rulesOff(texLanguage) /* , your own blocks */];
```

Details, and how to run paperlint's whole config from ESLint:
[`docs/configuration.md`](docs/configuration.md#using-the-rules-from-an-existing-eslint-config).

## 🤖 Run it in CI

`paperlint init` offers to write this workflow for you, pinned to the version you installed. By
hand:

```yaml
- uses: zernie/paperlint@v3.0.0
  with:
    paths: papers
```

- Pin the tag of the version you installed: `npm ls paperlint` prints it.
- The step runs `paperlint lint`. It does not build, so CI needs no TeX Live.

## ❓ FAQ

**Does it install anything without asking?**
No. TeX Live comes only from `paperlint toolchain`, or when you say yes in `init` or `build`. On
Windows, install TeX Live yourself.

**Will `new` or `init` overwrite my files?**
No. They only add what is missing, and `init` keeps a `papersDir` you already declared.

**My venue isn't listed — what now?**
Write a venue preset for it on top of the closest shipped one:
[five steps](#-add-a-venue-that-isnt-listed).

**Do I need TeX Live just to lint?**
No. `paperlint lint` needs only Node. `paperlint build` needs TeX Live.

**What does a CI failure look like?**
The step fails, and its log lists each finding with file, line, check and message. It also fails
when it checked zero files, so a wrong `paths` shows up red.

**Several papers for different venues in one repo?**
Yes. Each paper names its own venue preset in its own `paperlint.json`.

**Do I need Claude Code?**
No. The linter needs only Node. With Claude Code, `init` also installs the skills and wires three
hooks into `.claude/settings.json`: one stops a shell command from writing to a paper file, two
remind the agent what is left after a paper edit ([`docs/install.md`](docs/install.md)).

**Is it ESLint? Can I keep my own ESLint config?**
It is built on ESLint, and yes: [your own ESLint config](#-your-own-eslint-config).

**Does it change my paper?**
Only `paperlint lint --fix`, and only three rules: `paper/section-word` (`§` → Section),
`paper/leading-zero` (`.05` → `0.05`) and `paper/figure-ref-style` (one figure-reference style).

## 📚 Docs

- [`docs/skills.md`](docs/skills.md) — every skill, by stage
- [`docs/install.md`](docs/install.md) — what `init` does, package managers, troubleshooting
- [`docs/configuration.md`](docs/configuration.md) — every setting, and how `build` compiles
- [`docs/rules.md`](docs/rules.md) — every check, what it reads and when it fails
- [`docs/optional-rules.md`](docs/optional-rules.md) — checks only some venues need
- [`docs/toolchain.md`](docs/toolchain.md) — TeX Live, and Banal (HotCRP's page-geometry checker, GPL)
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — how the package is tested and released

## License

MIT. Banal, used for page geometry, is GPL and not part of this package:
[`docs/toolchain.md`](docs/toolchain.md#page-geometry-banal-without-poppler).
