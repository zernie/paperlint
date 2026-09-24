# research-paper-pipeline

A command-line checker for a research paper kept in git: it compares what you say about the paper
("submitted on this date, as this PDF") with the files that are actually there.

It is for people who write a paper in LaTeX inside a git repository — on their own, or with
Claude Code, for which it also ships optional skills and hooks. The command is `rpp`.

## What goes where

One directory per paper:

```
papers/
  my-paper/
    paper.tex                 the paper itself, in LaTeX
    PIPELINE-STATUS.md        Markdown: the scorecard — which stages the paper reached
    reviews/*.md              Markdown: review notes (optional)
    versions/                 the exact PDF and source you sent at each stage, frozen
```

A **stage** is a point the paper has reached, such as `submitted` or `camera-ready`.

- **The paper** is LaTeX, in `paper.tex`. A paper written in Markdown (`paper.md`) is still
  read today, but that is deprecated and being removed
  ([#57](https://github.com/zernie/research-paper-pipeline/issues/57)); do not start a new one.
- **The other files the tool reads** — the scorecard and the review notes — are Markdown. You (or
  the Claude Code skills) write them; `rpp` only reads them.
- **The PDF** is built by rpp: `rpp build papers/my-paper` runs pdflatex and bibtex until the
  references settle and writes `paper.pdf`. It uses TeX Live's `pdflatex` with every package your
  venue declares — its own copy, or one already on your machine that has them. There is no build
  script to write; one left in the paper directory is ignored
  ([`docs/configuration.md`](docs/configuration.md)).

## Install and set up

<!-- `vigiles:symbol src/init.ts#init` — `npm run check` fails if this function is renamed or removed. -->

![Node version](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fzernie%2Fresearch-paper-pipeline%2Fmain%2Fpackage.json&query=%24.engines.node&label=node)

```sh
npm i -D github:zernie/research-paper-pipeline#<commit-sha>
npx rpp init
```

Pick `<commit-sha>` from the default branch. An npm release (`npm i -D research-paper-pipeline`)
is coming; until then, install from GitHub. Run `npx rpp` only after this install — `rpp` on the
public npm registry is a different, unrelated package.

`rpp init` installs nothing else. It:

- adds a `research-paper-pipeline` key to your `package.json`, naming your papers directory;
- links the Claude Code skills into `.claude/skills/`;
- writes the three Claude Code hooks into `.claude/settings.json`, keeping your own entries;
- offers to add a CI workflow;
- offers to create a first paper if you have none.

It asks only when you run it in a terminal. Anywhere else (an agent, CI, or with `--yes`) it asks
nothing: it writes the hooks and skips the workflow and the paper. `--no-hooks` skips the hooks,
`--paper <name>` creates the paper. Every default it takes is printed with the flag that changes
it.

**TeX Live** is installed by rpp too, the first time you need it. In a terminal, `rpp build` asks
once — `TeX Live is not installed (needed to compile paper.tex, ~230 MB, ~2 min). Install it now
into ~/.cache/rpp/texlive? [Y/n]` — and continues. Without a terminal (CI, an agent) it stops and
says to run:

```sh
npx rpp toolchain          # upstream TeX Live + the packages the venue profiles declare
```

It installs into `~/.cache/rpp/texlive` (`RPP_TEXLIVE_DIR` changes that), verifies every declared
file with `kpsewhich`, and a second run does nothing. Linux and macOS; on Windows, install TeX Live
yourself. poppler (`pdftotext`, `pdffonts`) comes from your package manager:
[`docs/toolchain.md`](docs/toolchain.md).

Commit `.claude/settings.json`: then every clone gets the hooks. The hook commands run files
inside `node_modules`, so in a fresh clone they work only after `npm install`.

It finishes by running `rpp doctor`, which checks the setup and exits non-zero if something is
miswired. Details: [`docs/install.md`](docs/install.md#what-rpp-init-writes).

**In CI**, add one step to a GitHub Actions workflow — it runs the same `rpp lint`:

```yaml
- uses: zernie/research-paper-pipeline@<commit-sha>
  with:
    paths: papers
```

`paths` is required. The step fails if it checked zero files, so a typo in the path shows up red.
Optional inputs: `config`, `max-warnings` (default `-1`), `texcount` (default `true`),
`working-directory`.

## First run

```sh
npx rpp lint
```

On a paper folder made by hand, with `paper.tex` and nothing else, the output is:

```
config: package.json
papers/my-paper
  error  missing `PIPELINE-STATUS.md` — `paper/stages`, `paper/source` and `paper/author-list` read this file, so nothing `my-paper` declares about its stages, sources or authors is checked
…/my-papers/papers/my-paper/paper.tex
  1:1  warning  1 × `§` instead of «Section» (reviewer B). Paying the debt down is silent; growth is reported                                                 paper/typography
  1:1  warning  1 × a decimal without a leading zero, `.05` instead of `0.05` (IEEE / ISO 80000-1 style). Paying the debt down is silent; growth is reported  paper/typography

✖ 2 problems (0 errors, 2 warnings)
```

(Captured by running the command; only the file path is shortened.) Each finding names the file,
the line and column, the level, what is wrong, and at the end the check that found it.

The run exits `1` because of the missing scorecard. `npx rpp new my-paper` adds it and leaves
`paper.tex` alone. After that and fixing the two warnings:

```
config: package.json
✓ 2 file(s) checked, no findings
```

and the exit code is `0`.

**The scorecard.** `rpp new` writes `PIPELINE-STATUS.md` from a template; after that you, or the
Claude Code skills, keep it up to date. When the paper reaches a stage, you add an entry under
`stages:` with the date, the path of the frozen PDF (`pdf:`) and its size in bytes (`bytes:`) —
[example](docs/rules.md#the-scorecards-bytes-and-sourcebytes).

## Commands

```sh
npx rpp new my-paper             # start a paper from the template
npx rpp lint                     # check every paper
npx rpp lint papers/my-paper     # check one paper
npx rpp build papers/my-paper    # build one paper with its own build script
npx rpp build --all --dry-run    # list papers that have no build script
npx rpp doctor                   # check the setup
npx rpp --help                   # every command and flag
```

`rpp lint` exits `1` in two cases:

- any check reports an error;
- it checked no files at all (usually a wrong path).

Warnings never fail the run unless you pass `--max-warnings <n>`. `--json` prints the findings as
JSON.

### Starting a paper

<!-- `vigiles:symbol src/new-paper.ts#newPaper` — `npm run check` fails if this function is renamed or removed. -->

```sh
npx rpp new my-paper
```

```
  ✓ created papers/my-paper
      + PIPELINE-STATUS.md  (from the package template)
      + paper.tex  (from the package template)

config: package.json
✓ 2 file(s) checked, no findings
```

It creates the folder inside your papers directory with a scorecard and a LaTeX stub, then
checks it. The name may use `a-z`, `0-9`, `.`, `_` and `-`. (`--format md` still makes a
Markdown stub; Markdown papers are deprecated, see
[#57](https://github.com/zernie/research-paper-pipeline/issues/57).)

It never overwrites a file. On a folder that already exists it adds only what is missing, so it
also fixes an old folder that has no scorecard.

To use your own templates, put files with the same names in `papers/.template/`. Those win over
the built-in ones. `{{name}}` in a template becomes the paper's name.

## What the checks catch

| check                          | level   | catches                                                                                                    |
| ------------------------------ | ------- | ---------------------------------------------------------------------------------------------------------- |
| `paper/stages`                 | error   | a stage's PDF is missing, or it is not the same file any more (its size changed)                           |
| `paper/source`                 | error   | a stage has no frozen source file next to its PDF                                                          |
| `paper/author-list`            | warning | a stage is declared, but the scorecard does not record that the author list was checked                    |
| `paper/research-question`      | warning | the scorecard's research question is missing, or the paper does not contain that sentence                  |
| `paper/typography`             | warning | more `§`, `.05`-style decimals, mixed `Fig.`/`Figure`, or references without a DOI or URL than you allowed |
| `tex/future-promise`           | warning | LaTeX only: a camera-ready still says your code "will be released"                                         |
| `tex/acm-frontmatter-override` | error   | LaTeX only: an ACM paper overrides the template's front matter and loses parts of page 1                   |
| `review/findings-cause`        | error   | a review note lists several findings and names no cause for any of them                                    |
| `doc/fields`                   | warning | a review note's front matter is missing a field you require (off unless configured)                        |

Errors fail the run; warnings only print. Exactly what each check reads:
[`docs/rules.md`](docs/rules.md).

## Claude Code (optional)

`rpp lint` needs only Node. The Claude Code half is extra.

**Skills.** One skill per stage of writing a paper — from checking the
idea, through drafting and review, to submission and camera-ready. `rpp init` already linked them
into `.claude/skills/`. Start with `/paper-pipeline`; it routes to the rest. The skills call
external programs (TeX Live, poppler, Java, Python) — see [`docs/toolchain.md`](docs/toolchain.md).

**Hooks.** `rpp init` writes them into `.claude/settings.json`. `rpp doctor` says whether they
are there, and whether any runs twice.

| hook                 | blocks? | what it does                                                     |
| -------------------- | ------- | ---------------------------------------------------------------- |
| `paper-edit-guard`   | yes     | stops a shell command from writing to a paper file               |
| `paper-skills-nudge` | no      | after a paper edit, shows the agent the pre-submission checklist |
| `paper-status-gates` | no      | after a paper edit, lists the stages that have not run yet       |

If you installed the hooks earlier as a Claude Code plugin, remove it
(`/plugin uninstall research-paper-pipeline@research-paper-pipeline`). With both, every hook runs
twice.

**Know this about `paper-edit-guard`:** if the `research-paper-pipeline` key in `package.json`
cannot be read (the file is missing, or has merge-conflict markers), it blocks **every** shell
command in Claude Code, not only paper ones, until the key is readable again. Fix `package.json`
with a normal file edit — those are not blocked.

## Configuration

`rpp init` writes the one required setting:

```json
{
  "research-paper-pipeline": {
    "papersDir": "papers"
  }
}
```

`papersDir` is the directory your papers live in. It has no default on purpose, so the tool never
checks a folder you did not choose. It was called `papers` before 2026-09-24; a config that still
uses the old name is refused with a message saying so. The optional settings (typography
allowance, review fields, build-script names and more) are in
[`docs/configuration.md`](docs/configuration.md), which also shows how to use the checks inside
your own lint setup.

## License

MIT.
