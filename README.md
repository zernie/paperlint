# research-paper-pipeline

A command-line checker for a research paper kept in git: it compares what you say about the paper
("submitted on this date, as this PDF") with the files that are actually there.

It is for people who write a paper in LaTeX or Markdown inside a git repository — on their own,
or with Claude Code, for which it also ships optional skills and hooks. The command is `rpp`.

## What goes where

One directory per paper:

```
papers/
  my-paper/
    paper.tex  or  paper.md   the paper itself: LaTeX or Markdown, you choose
    PIPELINE-STATUS.md        always Markdown: the scorecard — which stages the paper reached
    reviews/*.md              always Markdown: review notes (optional)
    versions/                 the exact PDF and source you sent at each stage, frozen
    build.sh                  your own script that builds the PDF (optional)
```

A **stage** is a point the paper has reached, such as `submitted` or `camera-ready`.

- **The paper** can be LaTeX or Markdown. A LaTeX paper gets four checks, a Markdown paper two;
  the two extra LaTeX checks look at LaTeX-only things (see [the checks](#what-the-checks-catch)).
- **The other files the tool reads** — the scorecard and the review notes — are always Markdown,
  whatever your paper is written in. You (or the Claude Code skills) write them; `rpp` only reads
  them.
- **The PDF** is built by your paper's own script: `rpp build papers/my-paper` runs `build.sh` or
  `repro/build-submission.sh` from the paper's directory. This package does not ship a LaTeX or
  Markdown compiler. For LaTeX you need TeX Live ([`docs/toolchain.md`](docs/toolchain.md)). For a
  Markdown paper there is no built-in way to make a PDF — your `build.sh` has to do it.

## Install and set up

You need Node 22.13 or newer.

```sh
npm i -D github:zernie/research-paper-pipeline#<commit-sha>
npx rpp init
```

Pick `<commit-sha>` from the default branch. An npm release (`npm i -D research-paper-pipeline`)
is coming; until then, install from GitHub. Run `npx rpp` only after this install — `rpp` on the
public npm registry is a different, unrelated package.

`rpp init` does three things and installs nothing else:

- adds a `research-paper-pipeline` key to your `package.json`, naming your papers directory;
- links the Claude Code skills into `.claude/skills/`;
- offers to add a CI workflow (it asks first).

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

On a new paper that has `paper.md` and nothing else, the output is:

```
config: package.json
papers/my-paper
  error  missing `PIPELINE-STATUS.md` — `paper/stages`, `paper/source` and `paper/author-list` read this file, so nothing `my-paper` declares about its stages, sources or authors is checked
…/my-papers/papers/my-paper/paper.md
  1:1  warning  1 × `§` instead of «Section» (reviewer B). Paying the debt down is silent; growth is reported                                   paper/typography
  1:1  warning  1 × a decimal without a leading zero, `.05` instead of `0.05` (reviewer B). Paying the debt down is silent; growth is reported  paper/typography

✖ 2 problems (0 errors, 2 warnings)
```

(Captured by running the command; only the file path is shortened.) Each finding names the file,
the line and column, the level, what is wrong, and at the end the check that found it.

The run exits `1` because of the missing scorecard. After adding one and fixing the two warnings:

```
config: package.json
✓ 2 file(s) checked, no findings
```

and the exit code is `0`.

**The scorecard, today.** `rpp` does not create `PIPELINE-STATUS.md`: you write it, or the Claude
Code skills write it as they run. The smallest valid one is:

```markdown
---
stages: []
---
```

When the paper reaches a stage, you add an entry under `stages:` with the date, the path of the
frozen PDF (`pdf:`) and its size in bytes (`bytes:`) —
[example](docs/rules.md#the-scorecards-bytes-and-sourcebytes).

## Commands

```sh
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

**Skills.** <!-- count:skills -->24 skills, one per stage of writing a paper — from checking the
idea, through drafting and review, to submission and camera-ready. `rpp init` already linked them
into `.claude/skills/`. Start with `/paper-pipeline`; it routes to the rest. The skills call
external programs (TeX Live, poppler, Java, Python) — see [`docs/toolchain.md`](docs/toolchain.md).

**Hooks.** Type these two lines inside Claude Code (`rpp init` prints them too):

```
/plugin marketplace add zernie/research-paper-pipeline
/plugin install research-paper-pipeline@research-paper-pipeline
```

| hook                 | blocks? | what it does                                                     |
| -------------------- | ------- | ---------------------------------------------------------------- |
| `paper-edit-guard`   | yes     | stops a shell command from writing to a paper file               |
| `paper-skills-nudge` | no      | after a paper edit, shows the agent the pre-submission checklist |
| `paper-status-gates` | no      | after a paper edit, lists the stages that have not run yet       |

**Know this about `paper-edit-guard`:** if the `research-paper-pipeline` key in `package.json`
cannot be read (the file is missing, or has merge-conflict markers), it blocks **every** shell
command in Claude Code, not only paper ones, until the key is readable again. Fix `package.json`
with a normal file edit — those are not blocked.

## Configuration

`rpp init` writes the one required setting:

```json
{
  "research-paper-pipeline": {
    "papers": "papers"
  }
}
```

`papers` is the directory your papers live in. It has no default on purpose, so the tool never
checks a folder you did not choose. The optional settings (typography allowance, review fields,
build-script names and more) are in [`docs/configuration.md`](docs/configuration.md), which also
shows how to use the checks inside your own lint setup.

## License

MIT.
