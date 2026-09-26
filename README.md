# paperlint

[![npm version](https://img.shields.io/npm/v/paperlint)](https://www.npmjs.com/package/paperlint)
![Node version](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fzernie%2Fpaperlint%2Fmain%2Fpackage.json&query=%24.engines.node&label=node)

A linter for scientific papers written in LaTeX. It catches the mechanical mistakes that get a
paper desk-rejected or sent back at camera-ready, before you submit.

A LaTeX paper can build without an error and still be wrong. The ACM template silently switches to
another font when one of its font packages is missing, and the pages break differently. The same
source paginates differently on a machine with another version of the template. The submitted PDF
gets overwritten a week later and nobody can say what was sent. You find out from a reviewer or a
publisher, or never. paperlint checks for these on your machine and in CI:

- **Checks against your venue.** The page limit, embedded fonts, paper size, columns and font
  sizes, as the venue's call for papers sets them. You name the venue once per paper.
- **Builds the same PDF everywhere.** `paperlint toolchain` installs TeX Live with exactly the
  packages your venue's template needs, so your laptop and CI build the same PDF.
- **Keeps what you submitted.** Record "submitted on 22 July, as this PDF", and paperlint fails if
  that PDF changes or disappears, or its LaTeX source was not kept beside it.
- **Checks your references online.** At build time: each cited work exists, and its author list is
  the published version's, not the preprint's.
- **Knows the classic slips.** `§` instead of "Section", `.05` instead of `0.05`, "code will be
  released" left in a camera-ready. `paperlint lint --fix` fixes the typography ones.

It is for researchers and engineers who write papers in LaTeX inside git and submit them to
conferences or journals.

**It is built on ESLint.** The checks are ESLint rules run over `.tex` and `.md` files, which is why
they are named like `paper/leading-zero`. Findings, severities, `--fix` and disable comments work
as in ESLint; you do not need to know ESLint to use it.

## Install and set up

<!-- `vigiles:symbol src/init.ts#init` — `npm run check` fails if this function is renamed or removed. -->

```sh
npm i -D paperlint
npx paperlint init
```

Needs Node 22.13 or newer (pdf.js, which reads the PDF, needs it). Install before `init`.

`paperlint init` finds your papers directory, records it in `package.json`, and offers a CI
workflow and a first paper. It installs no software, and it asks nothing outside a terminal (or
with `--yes`). If you use Claude Code, it also sets up skills and hooks (see
[Claude Code](#claude-code-optional)). Details: [`docs/install.md`](docs/install.md).

## Commands

| command                       | what it does                                                                   |
| ----------------------------- | ------------------------------------------------------------------------------ |
| `npx paperlint init`          | sets the project up                                                            |
| `npx paperlint new my-paper`  | creates a paper folder from a template; never overwrites a file                |
| `npx paperlint lint`          | runs every check over your papers; `--fix` fixes what can be fixed             |
| `npx paperlint build <paper>` | compiles `paper.tex` to `paper.pdf`, measures it, checks the references online |
| `npx paperlint toolchain`     | installs TeX Live with the packages your venues need (~270 MB, ~3 min, once)   |
| `npx paperlint doctor`        | checks the setup and exits non-zero if something is miswired                   |
| `npx paperlint --help`        | every command and flag                                                         |

A venue is the conference or journal you submit to. TeX Live is the standard LaTeX distribution.

## Your first paper

<!-- `vigiles:symbol src/new-paper.ts#newPaper` — `npm run check` fails if this function is renamed or removed. -->

```sh
npx paperlint new my-paper
```

```
  ✓ created papers/my-paper
      + PIPELINE-STATUS.md  (from the package template)
      + paper.tex  (from the package template)
      + paperlint.json  (from the package template)

config: package.json
…/papers/my-paper/paper.tex
  1:1  warning  this paper names no venue preset yet, so its page limit, fonts and format are not checked — set "extends" in papers/my-paper/paperlint.json (e.g. "paperlint:agenticdev"; see docs/rules.md)  pdf/measured

✖ 1 problem (0 errors, 1 warning)
```

```
papers/
  my-paper/
    paper.tex             the paper
    PIPELINE-STATUS.md    the paper's record: its research question and the stages it reached
    paperlint.json        this paper's venue and kind of paper
    reviews/*.md          review notes (optional)
    versions/             the exact PDF and source you sent at each stage, never edited
```

The warning asks for the venue. Name it in the paper's `paperlint.json`, with the kind of paper
whose page limit applies:

```json
{ "extends": "paperlint:aisec", "kind": "research" }
```

Then check and build:

```sh
npx paperlint lint                     # check every paper
npx paperlint build papers/my-paper    # writes papers/my-paper/paper.pdf
```

### Venues

Shipped presets:

- `paperlint:acm-sigconf` — the ACM conference format (`acmart` sigconf), for any ACM venue.
- `paperlint:agenticdev`, `paperlint:aisec` — two ACM workshops.
- `paperlint:realm` — a workshop in the ACL (computational linguistics) format.

Each paper names its own venue, so papers for different venues sit side by side. For another venue,
write a preset in your repository and extend it by path (`"extends": "../../venues/my-venue.jsonc"`):

```jsonc
{
  "extends": "paperlint:acm-sigconf",
  "name": "My Workshop 2027",
  "format": { "kinds": { "short": { "body_pages_max": 4 } } },
}
```

The full shape: [`docs/rules.md`](docs/rules.md#writing-your-own-venue-preset).

### Recording what you submitted

When you submit, copy the PDF and `paper.tex` into `versions/` and record the stage in the front
matter of `PIPELINE-STATUS.md`. You write the sizes yourself (`wc -c < file`):

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

### What a finding looks like

On a paper folder made by hand, with only `paper.tex`:

```
config: package.json
papers/hand
  error  missing `PIPELINE-STATUS.md` — `paper/stages`, `paper/source` and `paper/research-question` read this file, so nothing `hand` declares about its stages, sources or research question is checked
…/papers/hand/paper.tex
  3:5   warning  `§` instead of the word «Section» — `paperlint lint --fix` writes it                              paper/section-word
  3:36  warning  `.05` has no leading zero — write `0.05` (IEEE / ISO 80000-1); `paperlint lint --fix` inserts it  paper/leading-zero

✖ 2 problems (0 errors, 2 warnings)
  0 errors and 2 warnings potentially fixable with the `--fix` option.
```

- Each finding gives the line and column, the level, what is wrong, and the check's name.
- Errors fail the run (exit 1); warnings only print, unless you pass `--max-warnings <n>`.
- The error is about the folder: `npx paperlint new hand` adds the missing file.
- To keep a deliberate exception, put the reason on the line above:
  `% eslint-disable-next-line paper/leading-zero -- quoted from the reviewer`.

## What the checks catch

A few you will recognise:

| check                 | catches                                                                |
| --------------------- | ---------------------------------------------------------------------- |
| `pdf/fonts`           | the template's fonts are missing — LaTeX silently used Computer Modern |
| `pdf/limits`          | more pages than the venue allows for your kind of paper                |
| `paper/stages`        | the PDF you recorded as submitted changed or disappeared               |
| `paper/source`        | the LaTeX source of a submitted version was not kept                   |
| `bib/reachable-entry` | a reference with no DOI, URL or arXiv id                               |
| `paper/author-list`   | a reference lists the preprint's authors, not the published version's  |

Every check, what it reads and when it fails: [`docs/rules.md`](docs/rules.md). Checks only some
venues need, such as a balanced last page, are off until you turn them on:
[`docs/optional-rules.md`](docs/optional-rules.md).

The page-size, column and font-size checks use banal, a GPL tool from HotCRP (the conference review system) that
`paperlint toolchain` downloads and runs as a separate program ([`docs/toolchain.md`](docs/toolchain.md)).

## Run it in CI

`paperlint init` offers to write this GitHub Actions step for you. By hand:

```yaml
- uses: zernie/paperlint@v3.0.0
  with:
    paths: papers
```

- Use the tag of the version you installed (`npm ls paperlint`).
- The step runs `paperlint lint`. It does not build, so CI needs no TeX Live.
- On an error the step fails, and its log lists each finding with file, line, check and message.
- It also fails when it checked zero files, so a wrong `paths` shows up red.

## Configuration

`paperlint init` writes the one required setting into `package.json`:

```json
{ "paperlint": { "papersDir": "papers" } }
```

- Only the paper files under it are linted, never a `repro/` script or other code beside a paper.
- An unknown key is an error, so a typo cannot silently turn a setting off.
- Everything else, including per-paper settings: [`docs/configuration.md`](docs/configuration.md).

## Claude Code (optional)

`paperlint lint` needs only Node. If you use Claude Code, `paperlint init` also sets up:

- **Skills** — instructions the agent loads for one stage of writing a paper, from checking the idea
  to camera-ready. Linked into `.claude/skills/`; start with `/paper-pipeline`.
- **Hooks** — scripts Claude Code runs around the agent's edits, written into `.claude/settings.json`.
  Commit that file; a fresh clone needs `npm install` before they run.

| hook                 | blocks? | what it does                                                     |
| -------------------- | ------- | ---------------------------------------------------------------- |
| `paper-edit-guard`   | yes     | stops a shell command from writing to a paper file               |
| `paper-skills-nudge` | no      | after a paper edit, shows the agent the pre-submission checklist |
| `paper-status-gates` | no      | after a paper edit, lists the stages that have not run yet       |

If every shell command gets blocked, see [troubleshooting](docs/install.md#troubleshooting).

## What it does not do

- **It does not install software behind your back.** TeX Live comes only from `paperlint toolchain`,
  or when you say yes in `paperlint build`. On Windows, install TeX Live yourself.
- **It does not guess what to check.** There is no default papers directory.
- **It does not overwrite your files.** `new` and `init` only add what is missing.
- **It does not run your build script.** `paperlint build` compiles the paper itself.
- **It does not grade the writing.** That is what the optional skills are for.
- **New papers are LaTeX.** Markdown papers (`paper.md`) are still read but deprecated
  ([#57](https://github.com/zernie/paperlint/issues/57)).
- **No Yarn Plug'n'Play.** npm and pnpm are supported ([`docs/install.md`](docs/install.md#package-managers)).

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md): how the package is tested and how releases work (the
pull-request title decides the version).

## License

MIT. banal, used for page geometry, is GPL and not part of this package:
[`docs/toolchain.md`](docs/toolchain.md#page-geometry-banal-without-poppler).
