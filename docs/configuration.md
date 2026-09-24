# Configuration reference

One key in your `package.json`, written by `rpp init`. It holds the facts only your repository can
supply — nothing in it is guessable by a package that has never seen your corpus.

The README carries the minimal version of this. Everything below is the full surface, moved out on
2026-09-19.

```json
{
  "research-paper-pipeline": {
    "papersDir": "papers",
    "authorListCommand": "node scripts/bib-authors.mjs",
    "typographyDebt": { "papers/my-paper": { "sectionSign": 12 } },
    "docFields": { "read": { "values": ["full", "abstract", "none"] } },
    "reviewSince": "2026-08-23",
    "minFindings": 3,
    "causeMarker": "Cause:"
  }
}
```

| key                 | required | what it is                                                                                |
| ------------------- | -------- | ----------------------------------------------------------------------------------------- |
| `papersDir`         | **yes**  | the directory your papers live in, relative to the file holding it. One string or a list. |
| `structure`         | no       | which files every paper directory must contain — see below. `false` turns it off.         |
| `authorListCommand` | no       | the command `paper/author-list` tells you to run when the check is missing                |
| `typographyDebt`    | no       | per-paper allowance of existing typography findings, so the count can only go down        |
| `docFields`         | no       | required front-matter fields in review files, and the values each may hold                |
| `reviewSince`       | no       | only review files created on or after this date are checked                               |
| `minFindings`       | no       | a review with fewer findings than this is not required to name causes                     |
| `causeMarker`       | no       | the phrase a review uses to introduce a cause (default `Cause:`), in any language         |

`papersDir` is required because the scope is the one thing that must not default: a default of `"."`
turns every run into a green report over the whole checkout. `rpp init` fills it by measuring —
and when nothing on disk looks like a papers directory, it writes the documented default and says
in the same breath that it is a guess.

Until 2026-09-24 this field was called `papers`. The old name is not read as a fallback: `rpp lint`,
`rpp init`, `rpp doctor`, the ESLint helper and the edit guard all stop with
`"papers" was renamed to "papersDir" in package.json → "research-paper-pipeline"`. The two advisory
hooks stay silent instead. The name is defined once, as `PAPERS_DIR_FIELD` in
`lib/paper-config.mjs`.

## Why the key lives in `package.json`

Because of a count: the `package.json` key has **five** readers — the three editor hooks, the
ESLint helper, the skill scripts — and a separate config file had **one**, the CLI. A hook cannot
import code and cannot walk up a tree looking for a config; it can read a path it is able to name,
and the one path it can always name is the project's `package.json`.

`rpp lint` looks for it in the current directory and then upwards, the way eslint and tsc find
theirs, and prints which file it found. `--config <file>` overrides the search.

⚠️ **`rpp.json` is deprecated and still read.** Earlier versions of `init` created it; `init` no
longer does, and a run that reads one says so on its first line. The hooks never read it, so
leaving settings there is how the linter and the guard end up watching different directories —
`rpp init` copies the value across for you.

## Required files

A rule runs on a file it was handed. A file that is missing is never handed to anything — so no
rule can report it, and a paper directory without `PIPELINE-STATUS.md` gets **zero** rules and a
clean report. `rpp lint` therefore checks presence itself, before ESLint runs.

Detection is generous and requirements are strict, on purpose. A directory counts as a paper only
once it already holds one of the marker files, so `research/`, `plans/` and other neighbours in
the corpus are left alone; an error-level check that fires on a correct tree gets switched off,
and the real findings leave with it.

```json
"structure": {
  "markers":      ["PIPELINE-STATUS.md", "paper.tex", "paper.md", "venue.json"],
  "require":      ["PIPELINE-STATUS.md"],
  "requireOneOf": [["paper.tex", "paper.md"]],
  "ignore":       []
}
```

Those are the defaults; you only write the block to change them. `paper.md` is still in them
because Markdown papers are deprecated but not yet removed
([#57](https://github.com/zernie/research-paper-pipeline/issues/57)). They were measured against a
real five-paper corpus rather than chosen — it passes with zero findings, while adding
`paper.pdf` to `require` produces two findings on papers that are perfectly fine, which is why it
is not there.

This is the half [ls-lint](https://ls-lint.org/) cannot do. ls-lint judges the **names** of files
that exist; it has nothing to compare against for a file that does not. Use both: ls-lint for
"what is there is named right", this for "what must be there is there".

## How `rpp build` compiles a paper

`rpp build <paper>` compiles `paper.tex` to `paper.pdf` itself, with TeX Live's `pdflatex` and
`bibtex` ([`docs/toolchain.md`](toolchain.md)). There is nothing to configure and no script to
write. It prints its plan first, one line per step, then runs it:

```
papers/my-paper
  inputs: TEXINPUTS += <rpp>/skills/submit-paper/references/venues
  compile: paper.tex (\documentclass[sigconf,screen]{acmart}, venue agenticdev)
  balance: acmart sigconf is two-column — will place \balance in the bibliography
  ✓ paper.pdf — 4 pdflatex passes, 1 bibtex run; balance: \balance before \bibitem #2 of 27, last page 464.2 / 461.5 pt (was 625.2 / 303.8 pt); 2 positions tried, 4 pdflatex passes
```

- **inputs** — rpp's own venue files (`paper-guards.tex`, `<venue>.tex`) are put on `TEXINPUTS`,
  so `\input{paper-guards}` in a preamble resolves with no setup. The system tree still resolves
  after them.
- **compile** — `pdflatex -interaction=nonstopmode -halt-on-error -file-line-error`, then `bibtex`
  when the `.aux` names a bibliography, then pdflatex again until the `.aux`, `.toc`, `.out` and
  `.bbl` stop changing and the log stops asking for a rerun. bibtex runs again only when the cited
  keys or a `.bib` file changed. After that, one **final** pass defines `\finalpass`, which arms
  the reference guards in `paper-guards.tex`: an undefined `\ref` or `\cite` fails the build
  there instead of printing `??`. A document that still changes after five passes fails, naming
  the file that kept changing.
- **balance** — only for acmart in a two-column format (acmtog, sigconf, siggraph, sigplan, sigchi,
  acmengage) with a `\bibliography`, and not with `review`. ACM requires the last page's columns to
  end at about the same height; acmart's own `balance` option calls `\balance` from the second
  column, where it does nothing. rpp measures the last page with `pdftotext -bbox`; if the columns
  differ by more than 120 pt it inserts `\balance` into the generated `paper.bbl` before one
  `\bibitem` at a time, first to last, and rebuilds (two pdflatex passes when the `.aux` settles at
  once, the last one the `\finalpass` pass). It keeps the first position whose PDF has balanced
  columns, the same page count, no second-column warning from balance.sty and no new overfull box.
  **If no position works the build fails**, lists every position with the reason it was rejected
  and the closest miss, deletes `paper.pdf` and puts bibtex's `paper.bbl` back.

The class and its options and the venue in `venue.json` are read from the paper and shown in the
plan; later steps decide from them whether they apply.

**`paper.pdf` is deleted before anything runs**, for every targeted paper — before the TeX Live is
chosen and before the first step. So no outcome leaves an old PDF looking current: not a failed
build, not a run that stops because there is no TeX Live with the packages the papers need, not a
paper with no `paper.tex`. A green `✓ paper.pdf` therefore always means this run wrote it, and a
pdflatex that exits 0 without writing one (a document with no pages) is a failure:

```
  ✗ compile: pdflatex exited 0 but wrote no paper.pdf — does the document have any pages?
```

**On failure** the command names the program that failed, quotes the first error line from the log
with its `l.NNN` source context, and says the PDF is gone — the same line on every path that ends
without a new one:

```
  ✗ compile: pdflatex exited with 1
      ./paper.tex:6: Undefined control sequence.
      l.6 Text before, then \undefinedmacro
                                           {} after.
      full log: papers/my-paper/paper.log
      paper.pdf removed — a stale PDF must not pass for this build
```

**A paper with no `paper.tex` is a FAILURE, not a skip.** "Nothing to build" and "built" must never
look alike: the corpus this came from once let a paper reach its venue without a single paper job
having run on it, because a missing build read as nothing to do.

`--dry-run` prints the plan and runs nothing — and deletes nothing, `paper.pdf` included.

⚠️ **A `build.sh` or `repro/build-submission.sh` in the paper directory is IGNORED.** Earlier
versions ran it; `rpp build` now says one line — `build.sh is ignored — rpp builds the paper
itself` — and builds the paper itself. The `buildScripts` key is ignored the same way.
Why: [#59](https://github.com/zernie/research-paper-pipeline/issues/59).

## Using the rules from an existing ESLint config

Under the hood `rpp lint` builds an ESLint flat config and runs it. If your repository already
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
