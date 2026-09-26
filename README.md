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

- **Checks against your venue.** Point the paper's `paperlint.json` at a venue preset
  (`"extends": "paperlint:aisec"`), build, lint: the page limit for your kind of paper, embedded
  fonts and the template's font families, the paper size and column count, and the font sizes, as
  the venue's call for papers sets them — plus the checks the venue implies, such as a balanced last
  page. Presets ship for the ACM `acmart` sigconf family and three venues — AgenticDev and AISec
  (ACM) and REALM (ACL); for any other venue, a preset is one JSON file in your repository
  ([`docs/rules.md`](docs/rules.md#writing-your-own-venue-preset)).
- **Builds the same PDF everywhere.** `paperlint toolchain` installs TeX Live with exactly the
  packages your venue's template needs and checks that each one is really there, so the silent
  font switch cannot happen and your laptop and CI build with the same TeX Live.
- **Keeps what you submitted.** Record "submitted on 22 July, as this PDF", and paperlint fails if
  that PDF changes or disappears, or its LaTeX source was not kept beside it.
- **Knows the classic slips.** An ACM paper that overrides the title-page commands and loses part
  of page 1; "code will be released" left in a camera-ready; references without a DOI or URL; an
  unbalanced last page, for publishers that ask for balanced columns (an optional check).
- **Works with coding agents.** Hooks and skills for Claude Code run the checks after every edit
  and stop an agent from rewriting the paper around them.

It is for researchers and engineers who write papers in LaTeX inside git and submit them to
conferences or journals.

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
Exactly what it writes: [`docs/install.md`](docs/install.md#what-paperlint-init-writes).

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
      + paperlint.json  (from the package template)

config: package.json
…/papers/my-paper/paper.tex
  1:1  warning  this paper names no venue preset yet, so its page limit, fonts and format are not checked — set "extends" in papers/my-paper/paperlint.json (e.g. "paperlint:agenticdev"; see docs/rules.md)  pdf/measured

✖ 1 problem (0 errors, 1 warning)
```

The warning is the only thing left to do: the paper does not say where it is going yet.

You now have one folder per paper:

```
papers/
  my-paper/
    paper.tex                 the paper, in LaTeX
    PIPELINE-STATUS.md        the paper's record: its research question and the stages it reached
    paperlint.json            this paper's settings: its venue preset and kind — `new` writes it
    reviews/*.md              review notes (optional)
    versions/                 the exact PDF and source you sent at each stage, never edited
```

`paperlint new` writes `paperlint.json` with `"extends": null` and a comment saying what goes
there. To have the paper checked against its venue, name the venue preset and the kind of paper:

```json
{ "extends": "paperlint:aisec", "kind": "research" }
```

Settings come in three levels, each named after the tool:

```
package.json            "paperlint": { "papersDir": "papers" }        the project
papers/my-paper/
  paperlint.json        { "extends": "paperlint:aisec", … }            this paper
paperlint:aisec         a venue preset: shipped, or ./your-venue.jsonc  the venue
```

More in [`docs/configuration.md`](docs/configuration.md#three-levels-of-settings).

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
- uses: zernie/paperlint@v2.0.0
  with:
    paths: papers
```

Use the tag of the version you installed (`npm ls paperlint`): every npm release has
a git tag of the same version, so the step runs the same code as your package. It runs
`paperlint lint`. `paths` is required, and the step fails if it checked zero files, so a typo in the path
shows up red. Optional inputs: `config`, `max-warnings` (default `-1`, no limit), `texcount` (default
`true`), `working-directory`.

## What the checks catch

| check                          | level   | catches                                                                                                          |
| ------------------------------ | ------- | ---------------------------------------------------------------------------------------------------------------- |
| `paper/stages`                 | error   | a stage's PDF is missing, or it is not the same file any more (its size changed)                                 |
| `paper/source`                 | error   | a stage has no frozen source file next to its PDF                                                                |
| `paper/author-list`            | error   | an entry's authors are the preprint's, not those of the version cited (checked online by `paperlint build`)      |
| `paper/research-question`      | warning | the research question is missing from `PIPELINE-STATUS.md`, or the paper does not contain that sentence          |
| `paper/section-word`           | warning | `§` instead of the word Section — `paperlint lint --fix` fixes it                                                |
| `paper/leading-zero`           | warning | `.05` instead of `0.05`, where the reader sees it — `--fix` fixes it                                             |
| `paper/figure-ref-style`       | warning | `Fig.` and `Figure` mixed in one document — `--fix` writes the majority form                                     |
| `bib/reachable-entry`          | warning | a reference with no DOI, URL or arXiv id                                                                         |
| `paper/cite-exists`            | error   | a reference whose DOI or arXiv id resolves to nothing or to another work (checked by `paperlint build`)          |
| `paper/refs-fresh`             | error   | the bibliography changed since the build checked it                                                              |
| `paper/refs-checked`           | warning | the references were not checked: no build yet, or it had no network                                              |
| `tex/future-promise`           | warning | a camera-ready still says your code "will be released"                                                           |
| `tex/acm-frontmatter-override` | error   | an ACM paper overrides the template's title-page commands, so parts of page 1 go missing                         |
| `review/frontmatter`           | error   | a review's `findings` records fail the schema — an open finding names no cause — or your own `reviewSchema`      |
| `pdf/limits`                   | error   | more body or reference pages than the venue allows for your kind of paper, or a reference font size out of range |
| `pdf/fonts`                    | error   | a Type 3 or unembedded font, or the venue template's fonts are missing (a silent Computer Modern fallback)       |
| `pdf/geometry`                 | error   | the paper size or column count differs from the venue's                                                          |
| `pdf/body-size`                | warning | the body font size is off the venue's                                                                            |
| `pdf/profile`                  | error   | the paper's `extends` names no preset (a typo), or a kind of paper the venue does not have                       |
| `pdf/fresh`                    | error   | the build facts describe an earlier PDF than the one on disk                                                     |
| `pdf/measured`                 | warning | the venue checks did not run: the paper names no venue preset yet, or was not built                              |

To keep a deliberate exception, put ESLint's disable directive with the reason on the line:
`% eslint-disable-next-line paper/leading-zero -- quoted from the reviewer` (it works inside the
bibliography block of `paper.tex` too). There is no allowance to set: `paperlint lint --fix` fixes the
typography, and what is left is fixed or excepted where it is.

The `pdf/` checks run only for a paper whose `paperlint.json` extends a venue preset, and they judge the PDF
`paperlint build` made: build, then lint. Errors fail the run; warnings only print. What each check
reads: [`docs/rules.md`](docs/rules.md).
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
`paperlint lint` stops and says so, unless you pass a path. Inside it, only the paper's own files are
linted (`PIPELINE-STATUS.md`, `paper.md`/`paper.tex`, `reviews/*.md`), never a `repro/` script or other
code kept beside a paper. An unknown key is an error. The optional
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
  ([#57](https://github.com/zernie/paperlint/issues/57)).
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
