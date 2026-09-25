# paperlint

[![npm version](https://img.shields.io/npm/v/paperlint)](https://www.npmjs.com/package/paperlint)
![Node version](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fzernie%2Fresearch-paper-pipeline%2Fmain%2Fpackage.json&query=%24.engines.node&label=node)

A checker for a research paper you keep in a git repository. You record what happened to the paper
— "submitted on 22 July, as this PDF" — and `paperlint` checks that the files match: the PDF you say you
sent is still there and unchanged, its LaTeX source was kept beside it, and the paper itself avoids
a few mistakes reviewers flag. It runs on your machine and in CI, like a linter.

It is for researchers and engineers who write papers in LaTeX inside git and submit them to
conferences or journals. Claude Code users also get optional skills and hooks.

## Install and set up

<!-- `vigiles:symbol src/init.ts#init` — `npm run check` fails if this function is renamed or removed. -->

```sh
npm i -D paperlint
npx paperlint init
```

Node 22.13 or newer. Install first: `paperlint init` links the skills and hooks to the copy in
your project's `node_modules`, so run without the install it has nothing to link to.

`paperlint init` finds your papers directory and records it in `package.json`, offers a CI workflow and a
first paper, and sets up the optional Claude Code skills and hooks. It installs no software. It
asks questions only when you run it in a terminal; an agent, CI or `--yes` gets the defaults, and
each default it takes is printed. It ends by running `paperlint doctor`, which checks the setup.
Exactly what it writes: [`docs/install.md`](docs/install.md#what-rpp-init-writes).

## What you get

| command                       | what it does                                                                                       |
| ----------------------------- | -------------------------------------------------------------------------------------------------- |
| `npx paperlint init`          | sets the project up (see above)                                                                    |
| `npx paperlint new my-paper`  | creates a paper folder from a template; never overwrites a file                                    |
| `npx paperlint lint`          | runs every check over your papers; `npx paperlint lint papers/my-paper` checks one                 |
| `npx paperlint build <paper>` | compiles `paper.tex` to `paper.pdf` with pdflatex and bibtex; `--all` builds every paper           |
| `npx paperlint toolchain`     | installs TeX Live with the LaTeX packages your venues need; `--check` only reports what is missing |
| `npx paperlint doctor`        | checks the setup and exits non-zero if something is miswired                                       |
| `npx paperlint --help`        | every command and flag                                                                             |

A venue is the conference or journal you submit to. TeX Live is the standard LaTeX distribution;
`paperlint build` offers to install it the first time it needs it.

## Your first paper in five minutes

### Starting a paper

<!-- `vigiles:symbol src/new-paper.ts#newPaper` — `npm run check` fails if this function is renamed or removed. -->

After `npx paperlint init`:

```sh
npx paperlint new my-paper
```

```
  ✓ created papers/my-paper
      + PIPELINE-STATUS.md  (from the package template)
      + paper.tex  (from the package template)

config: package.json
✓ 2 file(s) checked, no findings
```

You now have one folder per paper:

```
papers/
  my-paper/
    paper.tex                 the paper, in LaTeX
    PIPELINE-STATUS.md        the paper's record: its research question and the stages it reached
    reviews/*.md              review notes (optional)
    versions/                 the exact PDF and source you sent at each stage, never edited
```

A **stage** is a point the paper has reached, such as `submitted` or `camera-ready` (the final
version for the proceedings). The name may use `a-z`, `0-9`, `.`, `_` and `-`. On a folder that
already exists, `paperlint new` adds only the missing files. To use your own templates, put files with
the same names in `papers/.template/`; `{{name}}` in them becomes the paper's name.

Write the paper, then check and build it:

```sh
npx paperlint lint                     # check every paper
npx paperlint build papers/my-paper    # writes papers/my-paper/paper.pdf
```

`paperlint build` runs pdflatex and bibtex until the references settle. There is no build script to
write; a `build.sh` in the paper folder is ignored.

When you submit, copy the PDF and `paper.tex` into `versions/` and record the stage in the front
matter of `PIPELINE-STATUS.md`, with the file sizes in bytes:

```yaml
stages:
  - stage: submitted
    date: 2026-07-22
    venue: A Venue 2026
    pdf: versions/2026-07-22-submitted.pdf
    bytes: 305412
    source: versions/2026-07-22-submitted.tex
    sourceBytes: 57210
```

From then on `paperlint lint` fails if that PDF goes missing or changes size. A frozen PDF should never
change, so a size that no longer matches means the file was replaced after you recorded it
([`docs/rules.md`](docs/rules.md#the-scorecards-bytes-and-sourcebytes)).

### What a finding looks like

On a paper folder made by hand, with only `paper.tex`:

```
config: package.json
papers/my-paper
  error  missing `PIPELINE-STATUS.md` — `paper/stages`, `paper/source` and `paper/author-list` read this file, so nothing `my-paper` declares about its stages, sources or authors is checked
…/my-papers/papers/my-paper/paper.tex
  1:1  warning  1 × `§` instead of «Section» (reviewer B). Paying the debt down is silent; growth is reported                                                 paper/typography
  1:1  warning  1 × a decimal without a leading zero, `.05` instead of `0.05` (IEEE / ISO 80000-1 style). Paying the debt down is silent; growth is reported  paper/typography

✖ 2 problems (0 errors, 2 warnings)
```

Each finding gives the file, line and column, the level, what is wrong, and the check that found
it. The first line is an error about the folder: without `PIPELINE-STATUS.md`, the three checks
that read it have nothing to check; `npx paperlint new my-paper` adds the file and leaves `paper.tex`
alone. The two warnings count typography slips against an allowance you can set per paper: going over
it is reported, fixing some is not ("paying the debt down is silent").

`paperlint lint` exits `1` when any check reports an error (as here, even though the summary line counts
only the warnings in files), or when it checked no files at all (usually a wrong path). Warnings
never fail the run unless you pass `--max-warnings <n>`. `--json` prints the findings as JSON.

## Run it in CI

`paperlint init` offers to write this GitHub Actions workflow step for you. By hand:

```yaml
- uses: zernie/research-paper-pipeline@v2.0.0
  with:
    paths: papers
```

Use the tag of the version you installed (`npm ls paperlint`): every npm release has
a git tag of the same version, so the step runs the same code as your package. It runs
`paperlint lint`. `paths` is required, and the step fails if it checked zero files, so a typo in the path
shows up red. Optional inputs: `config`, `max-warnings` (default `-1`, no limit), `texcount` (default
`true`), `working-directory`.

## What the checks catch

| check                          | level   | catches                                                                                                    |
| ------------------------------ | ------- | ---------------------------------------------------------------------------------------------------------- |
| `paper/stages`                 | error   | a stage's PDF is missing, or it is not the same file any more (its size changed)                           |
| `paper/source`                 | error   | a stage has no frozen source file next to its PDF                                                          |
| `paper/author-list`            | warning | a stage is declared, but `PIPELINE-STATUS.md` does not record that the author list was checked             |
| `paper/research-question`      | warning | the research question is missing from `PIPELINE-STATUS.md`, or the paper does not contain that sentence    |
| `paper/typography`             | warning | more `§`, `.05`-style decimals, mixed `Fig.`/`Figure`, or references without a DOI or URL than you allowed |
| `tex/future-promise`           | warning | a camera-ready still says your code "will be released"                                                     |
| `tex/acm-frontmatter-override` | error   | an ACM paper overrides the template's title-page commands, so parts of page 1 go missing                   |
| `review/findings-cause`        | error   | a review note lists several findings and names no cause for any of them                                    |
| `doc/fields`                   | warning | a review note's front matter is missing a field you require (off unless configured)                        |

Errors fail the run; warnings only print. What each check reads: [`docs/rules.md`](docs/rules.md).
Checks that only some venues need are off until you turn them on:
[`docs/optional-rules.md`](docs/optional-rules.md).

## Configuration

`paperlint init` writes the one required setting into `package.json`:

```json
{
  "paperlint": {
    "papersDir": "papers"
  }
}
```

`papersDir` has no default, so the tool never checks a folder you did not choose: without it,
`paperlint lint` stops and says so, unless you pass a path. An unknown key is an error. The optional
settings, and how to use the checks inside your own ESLint setup, are in
[`docs/configuration.md`](docs/configuration.md). TeX Live, its install location and the external
programs the skills use are in [`docs/toolchain.md`](docs/toolchain.md).

## Claude Code (optional)

`paperlint lint` needs only Node. If you use Claude Code, `paperlint init` also sets up two things:

**Skills** — one per stage of writing a paper, from checking the idea through drafting, review,
submission and camera-ready. They are linked into `.claude/skills/`. Start with `/paper-pipeline`;
it routes to the rest. Some call Java or Python 3, which you install yourself.

**Hooks** — written into `.claude/settings.json`. Commit that file so every clone gets them; a
fresh clone needs `npm install` before they run.

| hook                 | blocks? | what it does                                                     |
| -------------------- | ------- | ---------------------------------------------------------------- |
| `paper-edit-guard`   | yes     | stops a shell command from writing to a paper file               |
| `paper-skills-nudge` | no      | after a paper edit, shows the agent the pre-submission checklist |
| `paper-status-gates` | no      | after a paper edit, lists the stages that have not run yet       |

**Know this about `paper-edit-guard`:** if the `paperlint` key in `package.json`
cannot be read (the file is missing, or has merge-conflict markers), it blocks **every** shell
command in Claude Code, not only paper ones, until the key is readable again. Fix `package.json`
with a normal file edit — those are not blocked.

## What it does not do

- **It does not install software behind your back.** `paperlint init` installs nothing; TeX Live comes
  only from `paperlint toolchain` or when you answer yes in `paperlint build`. On Windows, install TeX Live
  yourself.
- **It does not guess what to check.** There is no default papers directory.
- **It does not overwrite your files.** `paperlint new` and `paperlint init` only add what is missing.
- **It does not run your build script.** `paperlint build` compiles the paper itself.
- **It does not write or grade the paper.** `paperlint lint` checks records and a few mechanical
  mistakes; judging the writing is what the optional skills are for.
- **New papers are LaTeX.** Markdown papers (`paper.md`) are still read but deprecated
  ([#57](https://github.com/zernie/research-paper-pipeline/issues/57)).
- **No Yarn Plug'n'Play.** npm and pnpm are supported
  ([`docs/install.md`](docs/install.md#package-managers)).

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md): how the package is tested, the one command that runs
every check, and how releases work: the pull-request title decides the version (`feat:` is a
minor release, `fix:` a patch).

## License

MIT.

**banal is not part of this package.** banal, the page-geometry script from
[HotCRP](https://github.com/kohler/hotcrp) (Geoffrey M. Voelker, Eddie Kohler), is licensed
GPL-2.0-or-later. paperlint does not contain, copy or modify it: `paperlint toolchain` downloads it from HotCRP
at a pinned commit, checks its sha256, and paperlint runs it as a separate program (`perl banal …`),
reading its JSON output. Details: [`docs/toolchain.md`](docs/toolchain.md#page-geometry-banal-without-poppler).
