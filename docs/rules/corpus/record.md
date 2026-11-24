# corpus/record

**Level:** error, on by default · **Reads:** the listing of a venue corpus's `pdf/` and `text/`, and
its `papers.json` · **Reported on:** the first line of the corpus's `MANIFEST.md`, once per finding;
a corpus without `MANIFEST.md` on the first line of the first paper's `PIPELINE-STATUS.md` in the
same papers directory

## What it catches

A venue corpus, `<papers-root>/venues/<venue>/` ([`venues.md`](../../venues.md#the-corpus-of-accepted-papers)),
keeps copies of accepted papers in `pdf/` and `text/`. Its record, `papers.json`, says for each
paper which copy every stored file is and under which licence. The rule reports a stored file the
record does not account for, and a record that does not match the folder:

- a corpus that stores files in `pdf/` or `text/` and has no `papers.json` (`no-record`, one
  finding naming every stored file);
- a `papers.json` that does not parse, with the path of each field that is wrong, first problem first
  (`unparsed`). It is the parser the skill's script uses, so the two refuse the same record; the
  fields are in `papers.schema.json`, shipped with `study-accepted-papers`;
- a file in `pdf/` or `text/` that no copy's `stored` claims (`unclaimed`), including a name that
  is not `pdf/<key>.pdf`, `text/<key>.txt` or `text/<key>.<variant>.txt`;
- a copy whose `stored` names a kind whose file is not there (`missing`);
- two copies of one paper that both store one kind (`twice`): one file is a copy of one version;
- a folder under `venues/` that holds `papers.json`, `pdf/` or `text/` and no `MANIFEST.md`
  (`no-manifest`). paperlint reaches a corpus through its `MANIFEST.md`, so such a corpus is not
  checked at all until it has one.

A `paper.tex` or `PIPELINE-STATUS.md` kept in a corpus (an accepted paper's source) is not one of the
project's papers: no paper rule judges it.

## Why

A real consumer kept six corpora with five names for the paper list and 217 stored copies, 179 of
them with no licence recorded and 18 whose source nobody wrote down
([the design note](../../design/venue-corpus.md#measured-on-a-real-consumer-2026-11-24)). A copy
the record does not name is a copy nobody can say may be kept. The rule holds that every stored
file is a recorded fact; whether its licence permits keeping it is a separate question, for a
separate rule.

It is on by default because it holds for every corpus whatever the venue: a `papers.json` that
does not parse breaks the skill that reads it, and a file the record does not name is one no reader
knows the meaning of. It is silent in a project with no `venues/`.

## Examples

Failing: a PDF stored with no record.

```text
papers/venues/agent/MANIFEST.md
  1:1  error  the corpus stores `pdf/2026-01.pdf` and has no `papers.json`, so nothing records what
              each file is a copy of or under which licence. What to do: write `papers.json`
              (`study-accepted-papers` writes it): a row per paper, and for each stored file the copy
              it was fetched from, with `fetched_from`, its licence and where the licence was read; or
              remove the file and keep the paper's ids in `papers.json`, which is all a corpus needs to
              measure against it  corpus/record
```

Passing: the same PDF claimed by the copy it was downloaded from.

```json
{
  "key": "2026-01",
  "copies": [
    {
      "version": "published",
      "url": "https://doi.org/10.1145/3786167.3788430",
      "licence": {
        "id": "CC-BY-4.0",
        "read_from": "https://api.crossref.org/works/10.1145/3786167.3788430",
        "read_on": "2026-11-03"
      },
      "fetched_from": "https://dl.acm.org/doi/pdf/10.1145/3786167.3788430",
      "stored": ["pdf"]
    }
  ]
}
```

Passing: a corpus that keeps only ids, with `pdf/` and `text/` absent or empty.

## Options / preset fields

No rule options. The rule is on for every corpus; a project turns it off in its root
`paperlint.json`:

```json
{ "rules": { "corpus/record": "off" } }
```

A paper's own `paperlint.json` does not reach a corpus's `MANIFEST.md`: the corpus belongs to the
venue, not to one paper. (It does reach its own `PIPELINE-STATUS.md`, so the first paper's setting
also silences the report of a corpus without `MANIFEST.md`.)

## What it does not check

- Whether a stored copy's licence permits keeping it, or whether a licence was read at all: that is
  the licence rule, planned and off by default.
- That a stored file is the copy it is attributed to; it checks that the attribution was recorded.
- Names in the corpus folder outside `pdf/` and `text/` (`deep-reads/`, `sources/`, a stray file),
  and folders inside `pdf/` or `text/` beyond their names: the planned `corpus/allowed-files-only`.
- Hidden files in `pdf/` and `text/` (`.gitkeep`, `.DS_Store`): they are not copies.
- A corpus outside `<papers-root>/venues/`, and a corpus without `MANIFEST.md` when the run lints no
  paper of that papers directory (`paperlint lint papers/other-root`).
- `MANIFEST.md`'s and `measurements.json`'s contents.

## How to fix

Each finding names its cure. In short:

- Stored copies with no record: write `papers.json`, a row per paper, and for each stored file add
  its kind to the `stored` of the copy it was fetched from, with `fetched_from`, its licence and
  where the licence was read. `study-accepted-papers` writes the record. Where the licence was never
  read, the copy is `"version": "unknown"` with `"licence": { "id": "NOASSERTION" }`.
- A file nobody claims: record it as above, or remove it and keep the paper's ids.
- A claimed file that is missing: put it back, or remove the kind from that copy's `stored`.
- Two copies storing one kind: keep the kind on the copy the file was fetched from.
- No `MANIFEST.md`: write it, with the corpus's sources and years, or move the folder out of
  `venues/`.
