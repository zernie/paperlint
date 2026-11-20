# artifact/upload-current

**OPT-IN: off unless you turn it on with its options.** **Level:** whatever you give it; `warn` is
meant · **Reads:** the paper's upload record (`submission/artifact-upload.json`), its numbers file,
`paper.tex` and the body files of the last build · **Reported on:** the first line of the paper's
`PIPELINE-STATUS.md`

## What it catches

The paper prints a number its uploaded artifact was not built for. The upload record
([format](../../artifact-upload.md)) holds the paper's number macros as they were when the artifact
was uploaded; the rule compares them with the numbers file now and reports, once:

```text
papers/my-paper/PIPELINE-STATUS.md
  1:1  warning  the paper prints 4 numbers the upload of 2026-11-01 (https://osf.io/abcde/) was not
                built for: 3 new (nA, nB, nC), 1 changed (nRepos) — rebuild and upload the artifact,
                then record it again (`paperlint artifact record <zip> --url <url>`)
                artifact/upload-current
```

Only the macros the paper's source uses count: a macro defined in the numbers file and printed
nowhere never fires. A key is _new_ when the record lacks it, _changed_ when the record holds
another value.

Turned on and missing what it needs, it says so once and judges nothing else: no `numbers` option;
the numbers file missing, or defining no macro without arguments; no record (it names
`paperlint artifact record`); a record that is not one (it says which field and why).

## Why

A reviewer runs the archive the paper links. When the paper's numbers move after the upload (a
rerun, a new study, a fixed bug), the archive reproduces numbers the paper no longer prints, and
nothing in the build says so. The record is the one fact that survives the upload: what the paper
printed when the archive was made.

## Examples

Turning it on, in the paper's `paperlint.json`:

```json
{
  "rules": {
    "artifact/upload-current": ["warn", { "numbers": "numbersdef.tex" }]
  }
}
```

Failing: `numbersdef.tex` says `\newcommand{\nRepos}{64}`, the body prints `\nRepos`, and the
record's `numbers` has `"nRepos": "63"`.

Passing: the record's `numbers` holds `"nRepos": "64"`; or the rule is not turned on.

## Options

| option    | required | what                                                                                |
| --------- | -------- | ----------------------------------------------------------------------------------- |
| `numbers` | yes      | the paper's file of number macros, relative to the paper                            |
| `record`  | no       | the upload record, relative to the paper; default `submission/artifact-upload.json` |

The numbers file holds `\newcommand{\key}{value}` lines (`\newcommand*`, `\renewcommand`,
`\providecommand` and `\def\key{value}` too); a macro with arguments is skipped. A value is compared
as written in its definition, so `41.2\%` and `41.2 \%` differ.

## What it does not check

- **The host.** The rule never calls the network: it trusts the record. Whether the host still holds
  the file the record names is `paperlint artifact show` (by hash, where the host gives one).
- **The archive's inside.** Whether the uploaded archive computes those numbers is not looked at;
  the record says what the paper printed when it was uploaded, not what the archive produces.
- **Numbers typed into the prose.** A number not printed through a macro of the numbers file is
  invisible here (opt-in `tex/claim-provenance` looks at those).
- **Uses outside the paper's files.** Uses are read in `paper.tex` and, when the last build's record
  (`_build/sources.json`) is fresh, the body files it lists; with no record or a stale one,
  `paper.tex` alone, and `paper/sources-fresh` says so.
- **Which definition TeX keeps.** A macro defined twice keeps its last definition here, whatever
  the definer (`\providecommand` keeps the first in TeX).

## How to fix

Rebuild the artifact, upload it, and record the upload: `paperlint artifact record <zip> --url <url>`
(any host), or `paperlint artifact upload --to osf <zip> --save`, which writes the same record. Do
not re-record without uploading: the record would then claim an archive that was never built. If the
archive deliberately stays as it is, turn the rule off for the paper, or silence the finding with a
disable comment and its reason at the top of `PIPELINE-STATUS.md`.
