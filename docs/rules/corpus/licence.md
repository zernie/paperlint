# corpus/licence

**Level:** off by default, in no rule set; documented way on is `"warn"` · **Reads:** a venue
corpus's `papers.json` and the licence table (`src/domain/licence.ts`) · **Reported on:**
`papers.json`, at the line of the `stored` of the copy each finding is about

## What it catches

A venue corpus, `<papers-root>/venues/<venue>/` ([`venues.md`](../../venues.md#the-corpus-of-accepted-papers)),
keeps copies of other people's papers, and each stored file is a copy of one version, judged by
that copy's licence. For every copy in `papers.json` and every kind in its `stored` (`"pdf"`,
`"text"`) the rule asks the licence table whether that licence permits keeping that kind, and
reports one finding per copy for each reason it refuses, naming every kind that reason stands
against (a copy storing both kinds under a publisher's terms is one finding, not two), in four kinds:

- no licence was read for the copy (`NOASSERTION`, `not-read`): the message asks for the licence
  and where it was read (`licence.id`, `read_from`, `read_on`), or for the file to go and the
  paper's ids to stay;
- an id the table does not list (`unlisted`): the message names it. The table lists what it has
  read the terms of; an id it does not list permits nothing, so a typo is as loud as a licence
  nobody has looked up;
- a licence that does not permit that kind (`forbidden`): the message quotes the table's reason
  (the publisher grants no right to third parties; arXiv's non-exclusive licence grants only arXiv
  the right to distribute; ND and an extracted text);
- a non-commercial licence in a project that has not declared itself non-commercial
  (`non-commercial-only`): the message names the option that answers it.

## Why

A real consumer kept 217 stored copies, 179 of them with no licence recorded
([the design note](../../design/venue-corpus.md#measured-on-a-real-consumer-2026-11-24)).
[`corpus/record`](record.md) holds that every stored file is a recorded fact; whether the recorded
licence lets it be kept is this rule's.

It is **off, and in no set**, because it is the one corpus rule whose answer depends on who can
read the files. The licence question arises when others can read the corpus, and the rule cannot
tell whether they can; a finding a careful author could dispute does not belong in the default
set. A project whose corpus others can read turns it on; a private one leaves it off, and
gets no finding, no notice and no prompt. Nothing opt-in ships at `error`: turn it on with
`"warn"`.

## Examples

Failing: a copy stored with no licence read.

```text
papers/venues/agent/papers.json
  22:11  warning  a copy of `2026-01` stores `pdf` (`pdf/<key>.pdf`), and no licence was read for that copy
                  (`NOASSERTION`). What to do: record the licence and where it was read (`licence.id`,
                  `read_from`, `read_on`), or remove the file and `"pdf"` from that copy's `stored`, and
                  keep the paper's ids  corpus/licence
```

Failing: a licence that grants nothing to a third party.

```text
papers/venues/agent/papers.json
  22:11  warning  a copy of `2026-02` stores `text` (`text/<key>.txt`) under `LicenseRef-publisher`, which
                  does not permit it: the publisher grants no right to third parties. What to do: remove
                  the file and `"text"` from that copy's `stored`, and keep the paper's ids  corpus/licence
```

Passing: the same copy under a licence the table permits, or a copy that stores nothing and keeps
only its ids.

```json
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
```

## Options / preset fields

Turn it on for every corpus in the root `paperlint.json`:

```json
{ "rules": { "corpus/licence": "warn" } }
```

One option, `nonCommercial` (boolean, default `false`; any other key is an error). A project that
is non-commercial says so on the rule, as ESLint rules take their options:

```json
{ "rules": { "corpus/licence": ["warn", { "nonCommercial": true }] } }
```

With it, the two non-commercial licences (`CC-BY-NC-4.0`, `CC-BY-NC-SA-4.0`) permit storing both
kinds, and `CC-BY-NC-ND-4.0` its PDF. paperlint does not assume it. The option declares how the corpus is
used, not who uses it: Creative Commons defines non-commercial as "not primarily intended for or
directed towards commercial advantage or monetary compensation", and its FAQ says the definition
"does not turn on the type of user". A paper's own `paperlint.json` does not reach a
corpus.

## What it does not check

- A `papers.json` that does not parse: [`corpus/record`](record.md) reports it, and this rule
  says nothing about that file.
- That a stored file exists, or that no file is unclaimed: [`corpus/record`](record.md).
- That a recorded licence is the licence the source states: the rule trusts `licence.id`, and
  `read_from` and `read_on` say where it was read.
- Whether a repository is public. That is why the rule is off by default.
- The legal questions the table leaves open: whether an extracted text is an adaptation under ND
  (the table says no), and what counts as non-commercial.
- A copy that stores nothing: ids and metadata are kept whatever the licence.
- A licence's conditions on sharing. `CC-BY` and `CC-BY-SA` permit a copy on condition of
  attribution: the creator, the licence and its URI, and a note that the material was modified.
  `papers.json` carries the first three for each copy; an extracted text carries no note of the
  change.
- A permission given to the project alone (an email from the authors). It has no SPDX id, a
  `LicenseRef-` the table does not list is `unlisted`, and `papers.json` is strict JSON, so no
  inline disable can stand beside the copy ([#676](https://github.com/zernie/paperlint/issues/676)).

## How to fix

Each finding names its cure. In short: record the licence and where it was read, or remove the
file and the kind from that copy's `stored` and keep the paper's ids; correct a misspelt id; and,
for a project that really is non-commercial, set `nonCommercial`.
