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
-->

# paperlint

[![npm version](https://img.shields.io/npm/v/paperlint)](https://www.npmjs.com/package/paperlint)
![Node version](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fzernie%2Fpaperlint%2Fmain%2Fpackage.json&query=%24.engines.node&label=node)

**A linter for scientific papers written in LaTeX.** It catches the mechanical mistakes that get a
paper desk-rejected or sent back at camera-ready, before you submit.

A LaTeX paper can build without an error and still be wrong: a missing font package silently
changes the font, another template version changes the pagination, the submitted PDF gets
overwritten. paperlint checks for these on your machine and in CI:

- 📏 **Checks against your venue.** Page limit, embedded fonts, paper size, columns and font sizes,
  as the call for papers sets them.
- 🧱 **Builds the same PDF everywhere.** `paperlint toolchain` installs TeX Live with exactly the
  packages your venue's template needs.
- 📌 **Keeps what you submitted.** Record the PDF you sent, and paperlint fails if it changes or
  disappears, or its LaTeX source was not kept.
- 🔗 **Checks your references online.** At build time: each cited work exists, and its author list
  is the published version's.
- ✏️ **Knows the classic slips.** `§` instead of "Section", `.05` instead of `0.05`.
  `paperlint lint --fix` fixes them.

It is built on ESLint: the checks are ESLint rules over `.tex` and `.md` files, named like
`paper/leading-zero`. You do not need to know ESLint to use it.

## Contents

- [Supported venues](#-supported-venues)
- [Skills](#-skills)
- [Getting started](#-getting-started)
- [Commands](#-commands)
- [Configuration](#-configuration)
- [Run it in CI](#-run-it-in-ci)
- [FAQ](#-faq)
- [Docs](#-docs)

## 🎯 Supported venues

A preset holds a venue's format and page limits. Its **kind** is the paper type the venue sets a
limit for — `short`, `full`, `research` — named once per paper in its `paperlint.json`.

| preset                  | venue              | format                           | page limit                                                     |
| ----------------------- | ------------------ | -------------------------------- | -------------------------------------------------------------- |
| `paperlint:acm-sigconf` | any ACM conference | ACM two-column conference format | not checked: the family sets no kinds                          |
| `paperlint:agenticdev`  | AgenticDev @ ASE   | ACM two-column conference format | `short` 5, `full` 10, `demo` 5 body pages, + 2 of references   |
| `paperlint:aisec`       | AISec @ ACM CCS    | ACM two-column conference format | 10 body pages + 2 (`research`, `benchmark`, `position`, `sok`) |
| `paperlint:realm`       | REALM @ EMNLP      | ACL two-column format, A4        | `long` 8, `short` 4 — recorded, not checked (below)            |

REALM's limit is recorded but not checked because ACL leaves the Limitations and Ethics sections
out of the page count, and the PDF measurement counts them as body pages: a paper within the limit
would fail.

Another venue: [a four-line preset file](#another-venue).

## 🧠 Skills

paperlint has two halves:

1. **The linter** — `lint` and `build` — is deterministic: the same paper gives the same verdict,
   so it belongs in CI.
2. **The skills** help with the work itself, where the answer is a judgment call. They are
   optional; `paperlint init` installs them for [Claude Code](https://claude.com/claude-code).

- **Start here** — run the whole process step by step (`paper-pipeline`), or ask where the paper
  stands (`paper-status`).
- **Judge the idea** — is it worth doing (`research-ideate`), who else works on it
  (`map-prior-work`), read a close competitor in depth (`analyze-sibling-paper`).
- **Pick a venue** — find where to send it (`find-venue`), see what gets accepted there
  (`study-accepted-papers`), put the deadlines in your calendar (`plan-paper-timeline`).
- **Do the study and write** — design the study and its artifact (`build-benchmark`), write the
  draft (`draft-paper`), fix the outline (`argument-arc`), cut it down (`tighten-paper`).
- **Review before you submit** — a reader with no context (`cold-read-diff`), the prose
  (`grade-paper-writing`), a hostile reviewer (`paper-adversarial-review`), a simulated committee
  (`pc-panel-review`), the references (`verify-citations`), the final check (`harden-paper`).
- **Submit and after** — render pages to images (`render-paper`), submit (`submit-paper`), upload
  the artifact (`osf-artifact-upload`), camera-ready (`camera-ready`), the next paper (`extend-paper`).

## 🚀 Getting started

<!-- `vigiles:symbol src/init.ts#init` — `npm run check` fails if this function is renamed or removed. -->

1. Install (Node 22.13 or newer):

   ```sh
   npm i -D paperlint
   ```

2. Set up — it finds your papers directory, offers a CI workflow and a first paper, and (with
   Claude Code) links the skills:

   ```sh
   npx paperlint init
   ```

3. TeX Live, for building — once. `init` offers it; `paperlint lint` alone needs no TeX:

   ```sh
   npx paperlint toolchain   # ~270 MB, ~3 min, once
   ```

4. Create a paper:

   <!-- `vigiles:symbol src/new-paper.ts#newPaper` — `npm run check` fails if this function is renamed or removed. -->

   ```sh
   npx paperlint new my-paper
   ```

   ```
     ✓ created papers/my-paper
         + PIPELINE-STATUS.md  (from the package template)
         + paper.tex  (from the package template)
         + paperlint.json  (from the package template)
   ```

5. Pick the venue ([the table above](#-supported-venues)) in `papers/my-paper/paperlint.json`:

   ```json
   { "extends": "paperlint:agenticdev", "kind": "short" }
   ```

6. Build the PDF:

   ```sh
   npx paperlint build papers/my-paper
   ```

7. Check every paper:

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

Errors fail the run (exit 1); warnings only print, unless you pass `--max-warnings <n>`. To keep
a deliberate exception, put the reason on the line above:
`% eslint-disable-next-line paper/leading-zero -- quoted from the reviewer`.

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

| command                       | what it does                                                                   |
| ----------------------------- | ------------------------------------------------------------------------------ |
| `npx paperlint init`          | sets the project up                                                            |
| `npx paperlint new my-paper`  | creates a paper folder from a template; never overwrites a file                |
| `npx paperlint lint`          | runs every check over your papers; `--fix` fixes what can be fixed             |
| `npx paperlint build <paper>` | compiles `paper.tex` to `paper.pdf`, measures it, checks the references online |
| `npx paperlint toolchain`     | installs TeX Live with the packages your venues need (~270 MB, ~3 min, once)   |
| `npx paperlint doctor`        | checks the setup and exits non-zero if something is miswired                   |
| `npx paperlint --help`        | every command and flag                                                         |

### 🔍 What the checks catch

| check                 | catches                                                                |
| --------------------- | ---------------------------------------------------------------------- |
| `pdf/fonts`           | the template's fonts are missing — LaTeX silently used Computer Modern |
| `pdf/limits`          | more pages than the venue allows for your kind of paper                |
| `paper/stages`        | the PDF you recorded as submitted changed or disappeared               |
| `paper/source`        | the LaTeX source of a submitted version was not kept                   |
| `bib/reachable-entry` | a reference with no DOI, URL or arXiv id                               |
| `paper/author-list`   | a reference lists the preprint's authors, not the published version's  |

Every check: [`docs/rules.md`](docs/rules.md). Checks only some venues need are off until you
turn them on: [`docs/optional-rules.md`](docs/optional-rules.md).

## 🧩 Configuration

Two levels, one file name, both optional:

```
paperlint.json                   the project: papersDir, rules, defaults for every paper
papers/my-paper/paperlint.json   one paper: its venue, its kind, its own rules
```

`papersDir` defaults to `papers`. If your papers live elsewhere, say so in a `paperlint.json`
beside your `package.json`:

```json
{ "papersDir": "docs/papers" }
```

- A paper's file merges over the root's: its `extends` and `kind` win, its `rules` apply last.
- Only the paper files under `papersDir` are linted, never a `repro/` script beside a paper.
- An unknown key is an error, so a typo cannot silently turn a setting off.

Every key: [`docs/configuration.md`](docs/configuration.md).

### Another venue

Write a preset in your repository, and extend it by path from the paper's `paperlint.json`
(`"extends": "../../venues/my-venue.jsonc"`):

```jsonc
{
  "extends": "paperlint:acm-sigconf",
  "format": { "kinds": { "short": { "body_pages_max": 4 } } },
}
```

The full shape: [`docs/rules.md`](docs/rules.md#writing-your-own-venue-preset).

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
Write [a four-line preset](#another-venue) that extends the closest template family. For any ACM
venue, `paperlint:acm-sigconf` already checks the format, without a page limit.

**Do I need TeX Live just to lint?**
No. `paperlint lint` needs only Node. `paperlint build` needs TeX Live.

**What does a CI failure look like?**
The step fails, and its log lists each finding with file, line, check and message. It also fails
when it checked zero files, so a wrong `paths` shows up red.

**Several papers for different venues in one repo?**
Yes. Each paper names its own venue in its own `paperlint.json`.

**Where does my configuration live?**
In `paperlint.json` — at the project root (optional) and in each paper. Nothing goes into
`package.json`.

**Do I need Claude Code?**
No. The linter needs only Node. With Claude Code, `init` also links the skills and wires three
hooks into `.claude/settings.json`: one stops a shell command from writing to a paper file, two
remind the agent what is left after a paper edit ([`docs/install.md`](docs/install.md)).

**Does it change my paper?**
Only `paperlint lint --fix`, and only three rules: `paper/section-word` (`§` → Section),
`paper/leading-zero` (`.05` → `0.05`) and `paper/figure-ref-style` (one figure-reference style).

## 📚 Docs

- [`docs/install.md`](docs/install.md) — what `init` does, package managers, troubleshooting
- [`docs/configuration.md`](docs/configuration.md) — every setting, and how `build` compiles
- [`docs/rules.md`](docs/rules.md) — every check, what it reads and when it fails
- [`docs/optional-rules.md`](docs/optional-rules.md) — checks only some venues need
- [`docs/toolchain.md`](docs/toolchain.md) — TeX Live, and Banal (HotCRP's page-geometry checker, GPL)
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — how the package is tested and released

## License

MIT. Banal, used for page geometry, is GPL and not part of this package:
[`docs/toolchain.md`](docs/toolchain.md#page-geometry-banal-without-poppler).
