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
- One name per thing, everywhere (lint, build, venue preset, kind, skill, papersDir), each explained once, before it is used.
- Editing this file: re-read all of it first, and change it so it still reads as one document — the opening, the diagram, the order and the names your change touches. Remove or merge what it makes redundant. Never bolt on a section or patch one paragraph in isolation.
-->

# paperlint

[![npm version](https://img.shields.io/npm/v/paperlint)](https://www.npmjs.com/package/paperlint)
![Node version](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fzernie%2Fpaperlint%2Fmain%2Fpackage.json&query=%24.engines.node&label=node)

**A linter and a pipeline for writing a research paper in LaTeX, from idea to camera-ready.** It
catches, before a reviewer or the proceedings editor does:

- 📏 **a paper over the page limit** for its kind at your venue;
- 🔤 **the wrong font** — LaTeX silently fell back to Computer Modern because a package was missing;
- 🔗 **a bad reference** — a cited work that does not exist, or lists the preprint's authors
  instead of the published version's.

Also: `§` instead of "Section", `.05` instead of `0.05` (fixed for you), and a submitted PDF that
changed after you sent it. With [Claude Code](https://claude.com/claude-code), 24 skills help with
the rest of the work, stage by stage.

## Contents

[The pipeline](#-the-pipeline) · [Supported venues](#-supported-venues) ·
[Getting started](#-getting-started) · [Commands](#-commands) · [Lint and build](#-lint-and-build) ·
[Skills](#-skills) · [Configuration](#-configuration) ·
[Add a venue that isn't listed](#-add-a-venue-that-isnt-listed) · [Run it in CI](#-run-it-in-ci) ·
[FAQ](#-faq) · [Docs](#-docs)

## 🧭 The pipeline

```text
stage           what you get
1 idea          a go / no-go, with the reason
2 venue         a venue, and its page limit
3 study         results you can defend
4 draft         a full first draft
5 review        the problems, found before the reviewers
6 submit        a PDF within the limit, kept as sent
7 camera-ready  the final version
8 extend        the next, stronger paper

paperlint lint   checks the paper from stage 2 on: on every edit, and in CI
paperlint build  compiles and measures the PDF: before you submit (6, 7)
```

Each stage has [skills](#-skills) that do the work with you; the linter needs none of them.

## 🎯 Supported venues

A **venue preset** holds a venue's format and page limits. Its **kind** is the paper type the venue
sets a limit for — `short`, `full`, `research` — chosen once per paper.

| preset                  | venue              | format                           | page limit                                                                              |
| ----------------------- | ------------------ | -------------------------------- | --------------------------------------------------------------------------------------- |
| `paperlint:acm-sigconf` | any ACM conference | ACM two-column conference format | none: format only                                                                       |
| `paperlint:agenticdev`  | AgenticDev @ ASE   | ACM two-column conference format | `short` 5, `full` 10, `demo` 5 body pages, + 2 of references                            |
| `paperlint:aisec`       | AISec @ ACM CCS    | ACM two-column conference format | 10 body pages + 2 (`research`, `benchmark`, `position`, `sok`)                          |
| `paperlint:realm`       | REALM @ EMNLP      | ACL two-column format, A4        | `long` 8, `short` 4 — recorded, not checked [¹](docs/rules.md#checks-against-the-venue) |

Not listed? [Add your venue](#-add-a-venue-that-isnt-listed) in one small file.

## 🚀 Getting started

<!-- `vigiles:symbol src/init.ts#init` — `npm run check` fails if this function is renamed or removed. -->

1. Install (Node 22.13 or newer):

   ```sh
   npm i -D paperlint
   ```

2. Set up. `init` finds the directory your papers live in (`papers/` unless you say otherwise) and
   offers TeX Live and a CI workflow. With Claude Code it also installs the skills and three hooks —
   one stops a shell command from writing to a paper file ([`docs/install.md`](docs/install.md)):

   ```sh
   npx paperlint init
   ```

3. Create a paper. `--venue` names its venue preset from the table above, `--kind` which of its page
   limits applies:

   <!-- `vigiles:symbol src/new-paper.ts#newPaper` — `npm run check` fails if this function is renamed or removed. -->

   ```sh
   npx paperlint new my-paper --venue agenticdev --kind short
   ```

   It writes `papers/my-paper/` with `paper.tex` (your paper), `paperlint.json` (its venue preset
   and kind) and `PIPELINE-STATUS.md` (the paper's progress, which the skills fill in — leave it as
   generated).

4. Check it:

   ```sh
   npx paperlint lint
   ```

   ```
   papers/my-paper/paper.tex
     1:1   warning  this paper names the venue `agenticdev`, but _build/paper.facts.json does not exist, so its page limit, fonts and format were NOT checked — run `paperlint build` before `paperlint lint`  pdf/measured
     7:4   warning  `§` instead of the word «Section» — `paperlint lint --fix` writes it                          paper/section-word
     7:40  warning  `.05` has no leading zero — write `0.05` (IEEE / ISO 80000-1); `paperlint lint --fix` inserts it  paper/leading-zero

   ✖ 3 problems (0 errors, 3 warnings)
     0 errors and 2 warnings potentially fixable with the `--fix` option.
   ```

**Next:** `npx paperlint build papers/my-paper` compiles and measures the PDF, so lint can check the
page limit, fonts and references. It needs TeX Live: say yes in `init`, or run
`npx paperlint toolchain` once (~270 MB, ~3 min).

## 🧰 Commands

| command                                                     | what it does                                                                   |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `npx paperlint init`                                        | sets the project up                                                            |
| `npx paperlint new my-paper --venue <preset> --kind <kind>` | creates a paper folder for that venue; never overwrites a file                 |
| `npx paperlint lint`                                        | runs every check over your papers; `--fix` fixes what can be fixed             |
| `npx paperlint build <paper>`                               | compiles `paper.tex` to `paper.pdf`, measures it, checks the references online |
| `npx paperlint toolchain`                                   | installs TeX Live with the packages your venues need (~270 MB, ~3 min, once)   |
| `npx paperlint doctor`                                      | checks the setup and exits non-zero if something is miswired                   |
| `npx paperlint --help`                                      | every command and flag                                                         |

## 🔍 Lint and build

|        | `paperlint lint`                                                                  | `paperlint build`                                                |
| ------ | --------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| needs  | Node                                                                              | Node, TeX Live, the network                                      |
| reads  | `paper.tex`, `PIPELINE-STATUS.md`, `reviews/*.md`, `siblings/*.md` — nothing else | `paper.tex`                                                      |
| checks | typography, references, recorded stages; page limit and fonts from the last build | nothing: it compiles, measures, and checks references online     |
| writes | nothing (`--fix`: the three fixable slips)                                        | `paper.pdf`, `_build/paper.facts.json`, `_build/references.json` |
| runs   | on every edit, and in CI; offline, the same files give the same verdict           | on your machine, before you submit                               |

**Lint judges the last build.** After you edit the paper, the page and font results describe the old
PDF until you run build again. A PDF that no longer matches its measurements, or a bibliography
changed since the reference check, is an error.

| check                 | catches                                                                                                                           |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `pdf/limits`          | more pages than the venue allows for your kind of paper                                                                           |
| `pdf/fonts`           | the template's fonts are missing — LaTeX silently used Computer Modern                                                            |
| `paper/author-list`   | a reference lists the preprint's authors, not the published version's                                                             |
| `bib/reachable-entry` | a reference with no DOI, URL or arXiv id                                                                                          |
| `paper/stages`        | the PDF you recorded as submitted changed or disappeared ([how to record it](docs/rules.md#the-scorecards-bytes-and-sourcebytes)) |

A deliberate exception gets its reason on the line above:
`% eslint-disable-next-line paper/leading-zero -- quoted from the reviewer`. Errors fail the run;
warnings only print, unless you pass `--max-warnings <n>`. Every check:
[`docs/rules.md`](docs/rules.md); how build compiles:
[`docs/configuration.md`](docs/configuration.md#how-paperlint-build-compiles-a-paper).

## 🧠 Skills

You do not need to learn the skills' names: you ask Claude Code, and the matching skill starts.
`paper-pipeline` walks you through the stages; any skill also starts on its own when you ask for
what it does — "is this idea worth a paper?", "find me a venue for this". `init` installs them.

- **A go / no-go on your idea, with the reason.** `research-ideate`
- **A ranked list of venues that fit** — deadline, page limit, indexing. `find-venue`
- **A first draft from your results.** `draft-paper`
- **A hostile review before the real one.** `paper-adversarial-review`
- **A ready / not ready verdict before you submit**, worst problem first. `harden-paper`
- **Where your paper stands**, measured from the real build. `paper-status`

All 24, by stage: [`docs/skills.md`](docs/skills.md).

## 🧩 Configuration

Two levels, one file name, both optional:

```
paperlint.json                   the project: papersDir, rules, defaults for every paper
papers/my-paper/paperlint.json   one paper: its venue preset ("extends"), its kind, its own rules
```

- `papersDir` is the directory your papers live in; it defaults to `papers`.
- The paper's venue preset is its `"extends"` key — the one `new --venue` writes.
- A paper's file merges over the root's; an unknown key is an error, so a typo cannot silently turn
  a setting off.

Every key: [`docs/configuration.md`](docs/configuration.md). Already use ESLint for other files? See
[`docs/configuration.md`](docs/configuration.md#using-the-rules-from-an-existing-eslint-config).

### ➕ Add a venue that isn't listed

A venue preset is a small JSONC file: the preset it builds on, and the page limit of each kind of
paper. For an ACM workshop with a 4-page limit for short papers, `venues/my-workshop.jsonc`:

```jsonc
{
  // page size, columns and fonts of the ACM two-column format
  "extends": "paperlint:acm-sigconf",
  "format": {
    // one entry per kind of paper the call for papers names
    "kinds": {
      // the limit from the call for papers, in body pages (references not counted)
      "short": { "body_pages_max": 4 },
    },
  },
}
```

```sh
npx paperlint new my-paper --venue ./venues/my-workshop.jsonc --kind short
```

The path is relative to where you run the command; `new` writes it into the paper's
`paperlint.json` relative to that file (`../../venues/my-workshop.jsonc`). A venue on another
format: [`docs/rules.md`](docs/rules.md#writing-your-own-venue-preset).

## 🤖 Run it in CI

`paperlint init` offers to write this workflow for you, pinned to the version you installed:

```yaml
- uses: zernie/paperlint@v3.0.0
  with:
    paths: papers # your papersDir
```

- **CI runs lint, not build.** It checks typography, references and recorded stages, and fails when
  it checked zero files.
- The page limit, fonts and online reference checks need a build, which needs TeX Live: they run
  on your machine. In CI they show as one warning per paper, `pdf/measured`, saying so.

## ❓ FAQ

**Does it install anything without asking?**
No. TeX Live comes only from `paperlint toolchain`, or when you say yes in `init` or `build`. On
Windows, install TeX Live yourself.

**Several papers for different venues in one repo?**
Yes. Each paper names its own venue preset in its own `paperlint.json`.

**Does it change my paper?**
Only `paperlint lint --fix`, and only three rules: `paper/section-word` (`§` → Section),
`paper/leading-zero` (`.05` → `0.05`) and `paper/figure-ref-style` (one figure-reference style).

## 📚 Docs

- [`docs/skills.md`](docs/skills.md) — every skill, by stage
- [`docs/install.md`](docs/install.md) — what `init` does, the hooks, package managers, troubleshooting
- [`docs/configuration.md`](docs/configuration.md) — every setting, how `build` compiles, using your own ESLint
- [`docs/rules.md`](docs/rules.md) — every check, venue presets, recording a submitted PDF
- [`docs/optional-rules.md`](docs/optional-rules.md) — checks only some venues need
- [`docs/toolchain.md`](docs/toolchain.md) — TeX Live, and Banal (HotCRP's page-geometry checker, GPL)
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — how the package is tested and released, and adding a venue to it

## License

MIT. Banal, used for page geometry, is GPL and not part of this package:
[`docs/toolchain.md`](docs/toolchain.md#page-geometry-banal-without-poppler).
