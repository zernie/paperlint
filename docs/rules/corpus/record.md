# corpus/record

**Level:** error, on by default · **Reads:** a venue corpus's `papers.json`, and the listing of its
`pdf/` and `text/` · **Reported on:** `papers.json`, at the line of the field each finding names

## What it catches

A venue corpus, `<papers-root>/venues/<venue>/` ([`venues.md`](../../venues.md#the-corpus-of-accepted-papers)),
keeps copies of accepted papers in `pdf/` and `text/`. Its record, `papers.json`, says for each
paper which copy every stored file is and under which licence, and how the corpus was collected.
`paperlint lint` lints `papers.json` with ESLint's JSON language, and the rule reports:

- a field that does not match the record's schema (`unparsed`), at that field: a misspelt key where
  it stands, a wrong value at its key, a required field left out at the object that should hold it.
  It is the parser the skill's script uses, so the two refuse the same record; the fields are in
  `papers.schema.json`, shipped with `study-accepted-papers`;
- a `venue` that is not the name of the folder the record stands in (`venue`), at that field: the
  folder is the venue preset's series, so the two say the same; rename the folder or correct the field;
- a file in `pdf/` or `text/` that no copy's `stored` claims (`unclaimed`), including a name that
  is not `pdf/<key>.pdf`, `text/<key>.txt` or `text/<key>.<variant>.txt`: at the paper's `copies`
  when the record lists the paper, otherwise on the first line;
- a copy whose `stored` names a kind whose file is not there (`missing`), at that `stored`;
- two copies of one paper that both store one kind (`twice`), at the second copy's `stored`: one
  file is a copy of one version.
- an edition whose papers do not add up to its `accepted` (`unparsed`, at that `accepted`): without
  `capped` the record lists every paper the edition accepted, winners included; with `capped` it
  lists at most that many. A list copied in half is caught here, not by the schema.

A `papers.json` that is not JSON is not this rule's finding: ESLint reports it as a parse error on
its first line. A `paper.tex` or `PIPELINE-STATUS.md` kept in a corpus (an accepted paper's source)
is not one of the project's papers: no paper rule judges it.

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

Failing: a date written as a number.

```text
papers/venues/agent/papers.json
  27:13  error  `papers.0.copies.0.licence.read_on`: Invalid input: expected string, received number.
                What to do: correct the field; the fields are in the JSON Schema `papers.schema.json`
                that `study-accepted-papers` ships  corpus/record
```

Failing: a copy claims a PDF that is not there.

```text
papers/venues/agent/papers.json
  30:11  error  a copy of `2026-01` stores `pdf` in `papers.json`, and `pdf/2026-01.pdf` is not there.
                What to do: put the file back, or remove `"pdf"` from that copy's `stored`  corpus/record
```

Passing: the PDF claimed by the copy it was downloaded from, and the file in `pdf/2026-01.pdf`.

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

A paper's own `paperlint.json` does not reach a corpus: the corpus belongs to the venue, not to one
paper.

## What it does not check

- A corpus folder with no `papers.json`: there is no file to report on.
  [`corpus/allowed-files-only`](allowed-files-only.md) reports a corpus that stores files without one.
- Whether a stored copy's licence permits keeping it, or whether a licence was read at all: that is
  the licence rule, planned and off by default.
- That a stored file is the copy it is attributed to; it checks that the attribution was recorded.
- Names in the corpus folder outside `pdf/` and `text/` (`deep-reads/`, `sources/`, a stray file),
  and folders inside `pdf/` or `text/` beyond their names: the top of the corpus is
  [`corpus/allowed-files-only`](allowed-files-only.md)'s.
- Hidden files in `pdf/` and `text/` (`.gitkeep`, `.DS_Store`): they are not copies.
- A corpus outside `<papers-root>/venues/`.
- `MANIFEST.md` (optional, caveats only) and `measurements.json`.

## How to fix

Each finding names its cure. In short:

- A `venue` that is not its folder's name: rename the folder, or correct the field.
- A field that breaks the schema: correct it. `capped`, `proxy` and `rebuild` are required; "none"
  is `null` (`capped`, `proxy`) or `[]` (`rebuild`), never a field left out.
- A file nobody claims: add its kind to the `stored` of the copy it was fetched from, with
  `fetched_from`, its licence and where the licence was read (`"version": "unknown"` with
  `"licence": { "id": "NOASSERTION" }` where the licence was never read); or remove the file and
  keep the paper's ids.
- A claimed file that is missing: put it back, or remove the kind from that copy's `stored`.
- Two copies storing one kind: keep the kind on the copy the file was fetched from.
