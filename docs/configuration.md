# Configuration reference

One key in your `package.json`, written by `paperlint init`. It holds the facts only your repository can
supply — nothing in it is guessable by a package that has never seen your corpus.

The README carries the minimal version of this. Everything below is the full surface, moved out on
2026-09-19.

```json
{
  "paperlint": {
    "papersDir": "papers",
    "authorListCommand": "node scripts/bib-authors.mjs",
    "typographyDebt": { "papers/my-paper": { "sectionSign": 12 } },
    "docFields": { "read": { "values": ["full", "abstract", "none"] } },
    "reviewSince": "2026-08-23",
    "minFindings": 3,
    "causeMarker": "Cause:",
    "rules": [
      {
        "files": ["papers/old-draft/**"],
        "rules": { "paper/typography": "off" }
      }
    ]
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
| `rules`             | no       | extra ESLint config blocks: turn optional rules on, change a rule's severity — see below  |

The skill scripts read a few more keys of the same object — `ledger`, `scripts`, `timezone`,
`contactEmail`, `citeChecks`, `triggerCases` — documented with the skills that use them.

**Any other key is an error**, named in the message: `package.json → "paperlint":
unknown key "typographyDept"`. A misspelt key would otherwise read as "not set", and the setting
you meant would silently do nothing. The list of known keys is `SETTINGS_KEYS` in
`lib/paper-config.mjs`.

`papersDir` is required because the scope is the one thing that must not default: a default of `"."`
turns every run into a green report over the whole checkout. `paperlint init` fills it by measuring —
and when nothing on disk looks like a papers directory, it writes the documented default and says
in the same breath that it is a guess.

Until 2026-09-24 this field was called `papers`. The old name is not read as a fallback: `paperlint lint`,
`paperlint init`, `paperlint doctor`, the ESLint helper and the edit guard all stop with
`"papers" was renamed to "papersDir" in package.json → "paperlint"`. The two advisory
hooks stay silent instead. The name is defined once, as `PAPERS_DIR_FIELD` in
`lib/paper-config.mjs`.

## Three levels of settings

Each level is named after the tool, and each says something the others cannot:

```
package.json                 "paperlint": { … }        the PROJECT: where the papers are, what every paper gets
papers/
  my-paper/
    paper.tex
    PIPELINE-STATUS.md
    paperlint.json           { "extends": … }          THIS PAPER: its venue preset, its kind, its own rules — `paperlint new` writes it
venues/usenix-sec.jsonc      (optional, your own)      a VENUE PRESET: format, page limits, TeX packages, rules
node_modules/paperlint/skills/submit-paper/references/venues/
    acm-sigconf.jsonc  agenticdev.jsonc  aisec.jsonc  realm.jsonc      the shipped presets (paperlint:<name>)
```

`paperlint new` writes `<paper>/paperlint.json` from the template (`templates/paper/paperlint.json`,
or your `<papers>/.template/paperlint.json` if you keep one), with `"extends": null` — no venue chosen
yet — and a `$comment` saying what goes there. Until `extends` names a preset, `paperlint lint` gives
that paper one warning, `pdf/measured`: "this paper names no venue preset yet … set "extends" in
papers/my-paper/paperlint.json". A paper folder with no `paperlint.json` at all — one created before
2.1.0 — gets no venue checks and no warning; `npx paperlint new <its name>` adds the file and
changes nothing else.

```json
{
  "extends": "paperlint:aisec",
  "kind": "research",
  "rules": { "pdf/body-size": "off" }
}
```

| key        | what it is                                                                                                                                                                                 |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `extends`  | the venue preset the built PDF is judged against: `paperlint:<name>` (shipped) or `./path` / `../path` (your own, relative to this file) — [`rules.md`](rules.md#checks-against-the-venue) |
| `kind`     | the kind of paper (`short`, `research`, …) whose page limit applies                                                                                                                        |
| `pdf`      | where the built PDF is, relative to the paper, when it is not `paper.pdf`                                                                                                                  |
| `rules`    | rule id → severity, for this paper alone — the same entries as a `rules` block below                                                                                                       |
| `$comment` | a note for humans (JSON Schema's comment keyword); ignored                                                                                                                                 |

Any other key is an error naming the file and the key, as in `package.json`.

**Where a paper's rules come from, in order — a later one wins, rule by rule:** paperlint's own
configuration → the preset chain's `rules`, from the root preset to the one the paper extends →
the paper's own `rules` → the project's `rules` blocks in `package.json`. So a venue can turn a
rule on for its papers, a paper can turn it off for itself, and the project can still override
both. Only rules paperlint ships may be named, at every level.

**`paperlint.json` replaces `venue.json` (2.1.0); `npx paperlint init` moves it.** The old name is not
read: a paper with only a `venue.json` gets a `pdf/profile` error and `paperlint doctor` names the
file, both pointing at `init`. `init` writes the same settings as `paperlint.json` —
`"venue": "aisec"` becomes `"extends": "paperlint:aisec"`, and the `"_"` some files used as a
comment becomes `"$comment"` — then deletes `venue.json`. It removes a `venue.json` whose
`paperlint.json` already says the same, and refuses, changing nothing, when both exist and differ.

## Why the key lives in `package.json`

Because of a count: the `package.json` key has **five** readers — the three editor hooks, the
ESLint helper, the skill scripts — and a separate config file had **one**, the CLI. A hook cannot
import code and cannot walk up a tree looking for a config; it can read a path it is able to name,
and the one path it can always name is the project's `package.json`.

`paperlint lint` looks for it in the current directory and then upwards, the way eslint and tsc find
theirs, and prints which file it found. `--config <file>` overrides the search; the file has the
same shape, with the settings under the `paperlint` key.

## The `rules` key: turning rules on and off

`rules` is a list of blocks in ESLint's own
[flat-config shape](https://eslint.org/docs/latest/use/configure/configuration-files), limited to
the three keys that make sense in JSON — `files`, `ignores` and `rules`. paperlint appends the blocks
**after** its own configuration, so, as in ESLint, a later block wins: a block can turn on a rule
that is off by default, or change the severity of one that is on.

For ONE paper, the paper's own `paperlint.json` is simpler — no glob to get wrong
([above](#three-levels-of-settings)). Use a block here for a rule across several papers, or to
override what a paper says:

```json
"rules": [
  {
    "files": ["papers/**"],
    "rules": { "pdf/body-size": "off" }
  },
  {
    "files": ["papers/old-draft/**"],
    "rules": { "paper/typography": "off" }
  }
]
```

- **`files` and `ignores` are globs relative to the file that holds the settings** — the
  directory of your `package.json` — exactly as ESLint resolves them relative to its config file,
  whatever directory you run `paperlint lint` from. A block without `files` applies to every linted file.
  A pattern ending in `/**` is the usual way to name one paper.
- **A rule entry** is a severity (`"off"`, `"warn"`, `"error"`, or `0`/`1`/`2`), or a list whose
  first element is a severity and the rest are the rule's options.
- **Only rules paperlint ships can be named** — the ones in [`docs/rules.md`](rules.md) and
  [`docs/optional-rules.md`](optional-rules.md). A rule id paperlint does not ship, a bad severity, a
  `rules` that is not a list, or a block key other than `files`, `ignores` and `rules` stops the run
  with a message naming the exact key, before anything is linted.
- **An optional rule you turned on must reach a paper.** If no linted `paper.tex` gets the rule —
  usually a `files` glob with a typo — `paperlint lint` fails and says so: a rule that never runs
  reports exactly like one that passed.

## Required files

A rule runs on a file it was handed. A file that is missing is never handed to anything — so no
rule can report it, and a paper directory without `PIPELINE-STATUS.md` gets **zero** rules and a
clean report. `paperlint lint` therefore checks presence itself, before ESLint runs.

Detection is generous and requirements are strict, on purpose. A directory counts as a paper only
once it already holds one of the marker files, so `research/`, `plans/` and other neighbours in
the corpus are left alone; an error-level check that fires on a correct tree gets switched off,
and the real findings leave with it.

```json
"structure": {
  "markers":      ["PIPELINE-STATUS.md", "paper.tex", "paper.md", "paperlint.json"],
  "require":      ["PIPELINE-STATUS.md"],
  "requireOneOf": [["paper.tex", "paper.md"]],
  "ignore":       []
}
```

Those are the defaults; you only write the block to change them. `paper.md` is still in them
because Markdown papers are deprecated but not yet removed
([#57](https://github.com/zernie/paperlint/issues/57)). They were measured against a
real five-paper corpus rather than chosen — it passes with zero findings, while adding
`paper.pdf` to `require` produces two findings on papers that are perfectly fine, which is why it
is not there.

This is the half [ls-lint](https://ls-lint.org/) cannot do. ls-lint judges the **names** of files
that exist; it has nothing to compare against for a file that does not. Use both: ls-lint for
"what is there is named right", this for "what must be there is there".

## How `paperlint build` compiles a paper

`paperlint build <paper>` compiles `paper.tex` to `paper.pdf` itself, with TeX Live's `pdflatex` and
`bibtex` ([`docs/toolchain.md`](toolchain.md)). There is nothing to configure and no script to
write. It prints its plan first, one line per step, then runs it:

```
papers/my-paper
  inputs: TEXINPUTS += <paperlint>/skills/submit-paper/references/venues
  compile: paper.tex (\documentclass[sigconf,screen]{acmart}, venue agenticdev)
  measure: pdf.js → _build/paper.facts.json (facts for the lint rules; nothing is judged here)
  ✓ paper.pdf — 4 pdflatex passes, 1 bibtex run; facts: _build/paper.facts.json, last page 621.5 / 264.8 pt
```

- **inputs** — paperlint's own venue files (`paper-guards.tex`, `<venue>.tex`) are put on `TEXINPUTS`,
  so `\input{paper-guards}` in a preamble resolves with no setup. The system tree still resolves
  after them.
- **compile** — `pdflatex -interaction=nonstopmode -halt-on-error -file-line-error`, then `bibtex`
  when the `.aux` names a bibliography, then pdflatex again until the `.aux`, `.toc`, `.out` and
  `.bbl` stop changing and the log stops asking for a rerun. bibtex runs again only when the cited
  keys or a `.bib` file changed. After that, one **final** pass defines `\finalpass`, which arms
  the reference guards in `paper-guards.tex`: an undefined `\ref` or `\cite` fails the build
  there instead of printing `??`. A document that still changes after five passes fails, naming
  the file that kept changing.
- **measure** — after a green compile, the PDF is read with pdf.js and what it measures is written
  to `_build/paper.facts.json`: the page count, every font the pages draw text with (and whether
  its program is embedded, and whether it is Type 3), and the heights of the last page's two
  columns — or why they were not measured (a stub page of a few lines, or a review build with
  numbered lines). [banal](https://github.com/kohler/hotcrp/blob/master/src/banal) — installed by
  `paperlint toolchain`, or a project's own `vendor/banal` or `$BANAL` — adds the page size, column count
  and font sizes, measured from the same pdf.js read (no poppler; see
  [`toolchain.md`](toolchain.md#page-geometry-banal-without-poppler)); without banal those fields
  are `null` and the build says so. A PDF pdf.js cannot read fails the build. The file is
  written by one function, which `skills/render-paper/extract-pdf-facts.mjs` also calls for PDFs
  paperlint did not build. Keep `_build/` out of git: the facts carry the PDF's SHA-256, and a rule
  refuses facts about a different PDF than the one on disk.

The build does **not** judge the layout. A balanced last page, a page limit, the fonts a venue
wants — those are verdicts about the finished PDF, and they belong to lint rules that can be
turned on per venue, given a severity and suppressed with a reason: the `pdf/` venue rules
([`rules.md`](rules.md#checks-against-the-venue)) and the optional `pdf/last-page-balance`. paperlint once searched for a
`\balance` position itself and failed the build when none worked; that was removed on
2026-09-24.

The class and its options and the venue in `paperlint.json` are read from the paper and shown in the
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
versions ran it; `paperlint build` now says one line — `build.sh is ignored — paperlint builds the paper
itself` — and builds the paper itself. The `buildScripts` key is ignored the same way.
Why: [#59](https://github.com/zernie/paperlint/issues/59).

## Using the rules from an existing ESLint config

Under the hood `paperlint lint` builds an ESLint flat config and runs it. If your repository already
lints with ESLint, you can import the rule modules from `paperlint/eslint-rules/`
and wire them yourself; `bin/paperlint.mjs` exports `buildConfig(options, texLanguage)` that returns
the exact config the CLI uses, so the shortest path is:

```js
// eslint.config.mjs
import { buildConfig } from "paperlint/bin/paperlint.mjs";
import { texLanguage } from "paperlint/eslint-rules/latex-language.mjs";
export default buildConfig({ minFindings: 3 }, texLanguage);
```

Then point the CI action's `config` input at that file.
