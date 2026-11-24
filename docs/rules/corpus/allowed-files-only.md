# corpus/allowed-files-only

**Level:** error, on by default · **Reads:** the listing of each venue corpus's top · **Reported
on:** the corpus's `papers.json`, first line, once per stray entry; the project's root
`paperlint.json`, first line, once per corpus that stores copies without `papers.json`

## What it catches

A venue corpus, `<papers-root>/venues/<venue>/` ([`venues.md`](../../venues.md#the-corpus-of-accepted-papers)),
holds seven names and nothing else:

<!-- layout:begin — drawn from src/domain/corpus-layout.ts (CORPUS_LAYOUT_TREE); src/layout-docs.test.ts fails when this block differs -->

```text
<papers-root>/venues/<venue>/
├── papers.json        ← the record: every paper, each copy of it and its licence
├── MANIFEST.md        ← optional: caveats only, the prose no field holds
├── measurements.json  ← the codes of L0 and L1, one row per paper, by key
├── .gitignore         ← optional: keeps the stored copies out of git
├── pdf/               ← pdf/<key>.pdf, when a copy's licence permits it
├── text/              ← text/<key>.txt and text/<key>.<variant>.txt
├── deep-reads/        ← deep-reads/<key>.md, one per paper read in full
└── sources/           ← the listing and call pages as they were read
```

<!-- layout:end -->

The rule reports:

- an entry at the top of a corpus that is not one of those names, file or folder, any extension
  (`stray`), on the corpus's `papers.json`. A name of the list with the wrong kind (a folder named
  `papers.json`, a file named `pdf`) is a stray too;
- a corpus that keeps `pdf/` or `text/` and has no `papers.json` (`unrecorded`). It has no file of
  its own, so the finding is on the root `paperlint.json`, which `paperlint lint` lints only when a
  papers root holds `venues/`: a project without a corpus lints exactly what it linted before.

What the operating system and interpreters leave (`.DS_Store`, `Thumbs.db`, `__pycache__/`,
`node_modules/`: the names `paper/allowed-files-only` and `repro/allowed-files-only` never report)
is never reported here either.

## Why

A real consumer kept six corpora with five names for the paper list
([the design note](../../design/venue-corpus.md#measured-on-a-real-consumer-2026-11-24)). A reader of
a corpus, a person or `study-accepted-papers`, finds the record by its name; a list under another
name, a page saved beside it, or notes on one paper at the top are files nobody knows the meaning
of. A corpus that stores copies with no record is one where nobody can say what each file is a copy
of, or whether its licence lets the project keep it, and [`corpus/record`](record.md) has no file to
read. It is on by default because this holds for every corpus whatever the venue; it is silent in a
project with no `venues/`.

## Examples

Failing: a note at the top of a corpus, and PDFs kept with no record.

```text
papers/venues/agent/papers.json
  1:1  error  `venues/agent/notes.md` is not one of the names a venue corpus holds. Where it goes:
              MANIFEST.md when it is a caveat about the whole corpus; deep-reads/<key>.md when it is
              about one paper.  corpus/allowed-files-only

paperlint.json
  1:1  error  `papers/venues/other/` stores copies in pdf/ or text/ and has no papers.json, so nothing
              records which paper each file is a copy of, or under which licence it is kept.
              corpus/allowed-files-only
```

Passing: the seven names, the optional ones left out or not.

## Options / preset fields

No rule options. A project turns the rule off in its root `paperlint.json`:

```json
{ "rules": { "corpus/allowed-files-only": "off" } }
```

## What it does not check

- Names inside `pdf/` and `text/` ([`corpus/record`](record.md)'s), and what is inside
  `deep-reads/` and `sources/`.
- Entries directly in `venues/` that are not a corpus folder.
- The strays of a corpus with no `papers.json`: they are reported once the record is written.
- A corpus with no `papers.json` when the project has no root `paperlint.json`, or when
  `paperlint lint` is given paths: only a run of the whole project lints the root file.

## How to fix

Each finding names its cure: a caveat into `MANIFEST.md` and notes on one paper into
`deep-reads/<key>.md`; a PDF or a text into `pdf/<key>.pdf` or `text/<key>.txt`, claimed by its copy
in `papers.json`; a list's rows into `papers.json` or `measurements.json`, and the list as it was
downloaded into `sources/`; a saved page into `sources/`; a script out of the corpus, into the
paper's `repro/tools/`, with the command that runs it in `papers.json`'s `rebuild`. A corpus with no
`papers.json`: write it (`study-accepted-papers` does; the fields are in its `papers.schema.json`),
or remove `pdf/` and `text/` and keep the papers' ids.
