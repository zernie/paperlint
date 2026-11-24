# The venue corpus record — design

A venue's corpus (`<papers-root>/venues/<venue>/`, [`docs/venues.md`](../venues.md)) is where
`study-accepted-papers` keeps the papers a venue accepted, so every paper aimed at that venue measures
against the same set. Until now its shape was prose: fixed names for `MANIFEST.md`, `measurements.json`,
`text/` and `deep-reads/`, the lists "named by whoever runs the skill", and "the PDFs are not committed".
A real consumer kept six corpora, and they drifted: five names for the paper list, two ways of writing a
licence (a field per row in one, a separate TSV in another), PDFs committed in one corpus against the
rule, one corpus with no manifest, and one outside `venues/` altogether. Nothing could read them all, and
nothing could say whether a stored copy was allowed to be there.

This note fixes one record per corpus, the check that keeps its stored copies legal, and the order of the
pull requests that follow. It is the base for #302, #568, #356, #500, #215, #608 and #465.

## What is decided

1. **One record, `papers.json`, JSON with a schema.** It is the list of papers and, for each, every copy
   we know of with its licence, and it holds every fact about how the corpus was collected. The schema
   (zod, in `src/adapters/venue-corpus/`) is checked where the file is read; nothing after it
   re-validates (the study registry's pattern, [`study-registry.md`](study-registry.md)). Codes and
   measurements stay in `measurements.json`, keyed by the paper's `key`.

   **Why the collection facts are in the record, not in a prose `MANIFEST.md`.** Read against the four real manifests of the consumer (52 to 86
   lines each), three of their four parts were records: a hand-kept table of the folder's files (it
   drifts from the disk), coverage counts (computable from `papers.json`), and the sources, years,
   proxy and rebuild commands (fields). Only the caveats were prose. So the facts move into the record:
   an edition already carries `listed_from`, `read_on` and `accepted`; it gains `capped` (what was left
   out and why, or null) and `proxy` (the stand-in for "strong accept" and how many papers it marks, or
   null), and the record gains `rebuild` (the commands that regenerate it). Coverage is never stored:
   it is counted from the rows. `MANIFEST.md` becomes optional and holds caveats only; no rule reads it.

   ```json
   {
     "venue": "agent",
     "editions": [
       {
         "edition": 2026,
         "listed_from": "https://conf.researchr.org/home/icse-2026/agent-2026",
         "read_on": "2026-11-03",
         "accepted": 27
       }
     ],
     "papers": [
       {
         "key": "2026-01",
         "edition": 2026,
         "group": "accepted",
         "title": "A Catalogue of Evaluation Metrics for LLM-Based Multi-Agent Frameworks in Software Engineering",
         "authors": [
           "Ingrid Lima",
           "Vitor Linhares",
           "Anderson Martins Gomes",
           "Paulo Maia"
         ],
         "abstract": "LLM-based Multi-Agent (LMA) frameworks have recently gained traction …",
         "ids": { "doi": "10.1145/3786167.3788430" },
         "copies": [
           {
             "version": "published",
             "url": "https://doi.org/10.1145/3786167.3788430",
             "licence": {
               "id": "CC-BY-4.0",
               "read_from": "https://api.crossref.org/works/10.1145/3786167.3788430",
               "read_on": "2026-11-03"
             },
             "stored": []
           }
         ]
       }
     ]
   }
   ```

   | field                     | values                                                                                                                                                      |
   | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | `venue`                   | the corpus folder's name, which is the venue preset's series: the preset id without its year (`agent` for `paperlint:agent-2027`)                           |
   | `editions[]`              | each edition of THIS venue the corpus covers: the year, the page that lists what it accepted, the date read; `accepted` (the count) when the page gives one |
   | `papers[].key`            | unique in the file; names the stored files and the measurement rows                                                                                         |
   | `papers[].group`          | `accepted`, `award`, or `sister` (corpus 2: papers of another venue)                                                                                        |
   | `papers[].edition`        | for `accepted` and `award`: one of `editions[].edition`                                                                                                     |
   | `papers[].venue`, `.year` | for `sister`: the other venue and its year; `listed_from` on the row says where it was found                                                                |
   | `papers[].ids`            | any of `doi`, `arxiv`, `dblp`, `s2`, `url` (the paper's page on the listing, when nothing else identifies it); at least one                                 |
   | `copies[].version`        | `published`, `accepted`, `preprint` (OpenAlex's `publishedVersion` / `acceptedVersion` / `submittedVersion`), or `unknown`                                  |
   | `copies[].licence`        | `id`, `read_from` (the page or API response it was read from, never inferred), `read_on`                                                                    |
   | `copies[].fetched_from`   | required when `stored` is not empty: the URL the stored bytes were downloaded from                                                                          |
   | `copies[].stored`         | what of this copy is in the corpus: `[]`, `["text"]`, `["pdf"]` or both; `"text"` covers every text variant of the paper                                    |

   The top level, the edition, the copy and the licence objects are strict, so a misspelt key is an error.
   A paper row keeps any further fields as they are: the consumer's scripts read about forty of them
   (award flags, page counts, where a PDF was found), and a strict row would force every corpus to drop
   them to migrate.

2. **The licence belongs to a copy, not to a paper.** The same paper is often CC BY in the proceedings and
   under arXiv's non-exclusive licence as a preprint (one real 27-paper list had nine combinations, a
   16-paper one seven). A stored file is a copy of one version, so it is judged by that version's licence.
   This follows OpenAlex, which records a licence per location ("Different locations of the same work can
   carry different licenses"), and Crossref's per-work `license` array.

   That a stored file **is** the copy it is attributed to is a recorded fact, not a construction: the
   copy names `fetched_from`, and at most one copy of a paper may store each kind (two copies claiming
   `pdf/<key>.pdf` is a finding). A file whose origin nobody recorded is stored under a copy with
   `version: "unknown"`, which is allowed only with the licence `NOASSERTION`, and so permits nothing:
   the record cannot be made to pass by attributing a file to whichever copy has the friendlier licence
   without saying where the bytes came from.

3. **The licence table, in one module** (`src/domain/licence.ts`). Any SPDX id or `LicenseRef-…`
   parses; the table decides what it permits, and an id the table does not list permits nothing and
   gets a finding of its own that names it (so a `CC-BY-3.0` does not hide the rest of the record, and
   a typo is still loud).

   | id                                     | may store text                     | may store the PDF                  | why                                                                                                                                         |
   | -------------------------------------- | ---------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
   | `CC0-1.0`, `CC-BY-4.0`, `CC-BY-SA-4.0` | yes                                | yes                                | "anyone who has access to a copy of the material may continue to redistribute it" (CC FAQ)                                                  |
   | `CC-BY-NC-4.0`, `CC-BY-NC-SA-4.0`      | when the project is non-commercial | when the project is non-commercial | non-commercial reproduction is granted; whether a repository is non-commercial is the project's to declare, not paperlint's to assume       |
   | `CC-BY-ND-4.0`, `CC-BY-NC-ND-4.0`      | no                                 | yes (NC: as above)                 | "the ND licenses do allow you to reproduce the material in unmodified form"; whether an extracted text is an adaptation is unsettled, so no |
   | `LicenseRef-arxiv-nonexclusive-1.0`    | no                                 | no                                 | it grants arXiv alone the right to distribute: "We are thus unable to grant others the right to distribute arXiv articles"                  |
   | `LicenseRef-publisher`                 | no                                 | no                                 | no grant to third parties                                                                                                                   |
   | `NOASSERTION`                          | no                                 | no                                 | the licence was not read                                                                                                                    |

   The project declares itself non-commercial with one setting; without it an NC copy that is stored is a
   finding that names the setting. SPDX ids where SPDX has one; `LicenseRef-…` where it has none, as SPDX
   and REUSE prescribe. A version of a CC licence other than 4.0 gets its row when a corpus meets it.

4. **Three rules, one family, `corpus/`.** The family is the folder they judge, as `paper/`, `repro/` and
   `versions/` are; the names follow the ones those families already use (`paper/allowed-files-only`,
   `cycle/record`). Structure and licence are separate rules because they are needed by different
   projects: every corpus needs its structure held, and only a corpus that others can read needs its
   licences judged.

   | rule                        | reports                                                                                                                                                                                                                                                                             | default        |
   | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
   | `corpus/allowed-files-only` | a name in the corpus folder outside the fixed names (decision 5), any extension, plus names the settings add (#500's second rule, renamed from `venue/allowed-files-only`)                                                                                                          | on             |
   | `corpus/record`             | a corpus with `pdf/` or `text/` and no `papers.json`; a `papers.json` that does not parse, with the zod path of the first problem; a file in `pdf/` or `text/` that no copy's `stored` claims; a copy whose `stored` names a missing file; two copies of one paper storing one kind | on             |
   | `corpus/licence`            | a stored file whose copy has no licence recorded (`NOASSERTION`, decided by the author 2026-11-24), or whose licence does not permit that kind (decision 3), including an id outside the table and an NC licence in a project not declared non-commercial                           | off, in no set |

   Each finding names its cure: record the licence and where it was read, or remove the file and keep
   the ids.

   **Why the two structure rules are on by default.** They hold for every corpus whatever the venue and
   whoever reads the repository: a `papers.json` that does not parse breaks the skill that reads it, and
   a stray file is a file no reader knows the meaning of. They are silent where no corpus exists.

   **Why the licence rule is off and in no set.** The same stored files are illegal in a public
   repository and legal in a private one, and the rule cannot tell which it is in; that is a finding a
   careful author can dispute ("The Default Set Is What The Venue Decides"). A project whose corpus
   others read turns it on; a private one leaves it off. It belongs to none of today's sets
   (`paperlint:writing` is about prose); when #524 adds `recommended` and `strict`, it is a candidate
   for one of them.

   **Where they report, and how paperlint reaches a corpus.** Today nothing under `venues/` is linted
   ([`docs/venues.md`](../venues.md#what-checks-it)): rule blocks are scoped to paper files, and a rule
   runs only for a file that exists. `papers.json` is that file: paperlint lints it with ESLint's own
   JSON language (`@eslint/json`), so `corpus/record` reports at the field that is wrong, by line and
   column, and a file that is not JSON fails as ESLint's parse error (spike 2026-11-24, `@eslint/json`
   2.1.1 on ESLint 10.10.0: a planted `"licence": 7` reported at `4:45`; a clean record silent; a cut-off
   file `1:1 Parsing error`). A corpus folder with `pdf/` or `text/` and no `papers.json` has no file to
   anchor on; `corpus/allowed-files-only` reports it on the project's root `paperlint.json`, which
   `@eslint/json` also reads. The corpus is kept out of the paper rules (#215, part 1): a `paper.tex`
   saved in a corpus is an accepted paper's source, not one of the user's papers.

5. **The fixed file names**: `papers.json`, `MANIFEST.md` (optional, caveats only), `measurements.json`, `pdf/<key>.pdf`,
   `text/<key>.txt` and `text/<key>.<variant>.txt` (one paper extracted twice, by `pdftotext` and by
   `pdfminer`, or its first page alone), `deep-reads/<key>.md`, `sources/` (saved listing and call
   pages, not judged). The author's own paper is never in a corpus: its text belongs in its paper folder.

6. **What is a copy, and what is not.** `pdf/` and `text/` hold copies; the rule judges only them.
   Titles, abstracts, and short quotes inside codes or deep reads are metadata and quotation, not copies
   (decided below).

7. **A behaviour change, said plainly.** `docs/venues.md` and `study-accepted-papers` today tell the
   skill to extract a text for every paper. From PR 1a they tell it to read the copy's licence first and
   extract only what the table permits, keeping ids for the rest; "the PDFs are not committed" becomes
   "a PDF is kept when its copy's licence permits it" (#302's proposal). The rule then turns the old
   instruction's output into findings on a corpus that opts in.

## Measured on a real consumer (2026-11-24)

Before writing the rule, a consumer's six corpora were inventoried, git-tracked files only:

| stored third-party copies | permitted by the recorded licence | non-commercial | ND, extracted text | not permitted | no licence recorded | source of the copy not recorded |
| ------------------------: | --------------------------------: | -------------: | -----------------: | ------------: | ------------------: | ------------------------------: |
|                       217 |                                19 |            3–4 |                  5 |            12 |                 179 |                              18 |

The 12 not permitted are extracted texts of arXiv preprints under the non-exclusive licence, two of them in
a corpus that had already dropped the same papers' PDFs for that licence and kept the text. The 179 are
whole corpora built before a licence field existed; for most of them the licence is one request away (the
copy is an arXiv or ACL Anthology paper), which is what PR 2 automates. No corpus there has a `papers.json`
yet, so until it migrates the rule reports one finding per corpus that stores copies, not 12 + 179.

Identity is thinner than a DOI: 4 of 16, 23 of 49, 12 of 48 and 11 of 17 rows in four of its lists have
neither a DOI nor an arXiv id, only the conference page's id or URL. Hence `ids.url`.

## Migration

A corpus migrates by a script the consumer runs once, which writes `papers.json` from its old lists and
renames stored files to `pdf/<key>.pdf` and `text/<key>[.<variant>].txt`; old fields stay on the rows, and
a script that read a path from an old field reads the derived path instead. The author's own paper moves
to its paper folder. Licences that were never read stay `NOASSERTION` until PR 2's lister fills them in.

## The order of the pull requests

| PR     | what                                                                                                                                                                                                                                                                                | part of        |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| 1a     | the schema and its parser, the licence table, this note, `docs/venues.md` and `study-accepted-papers` rewritten to the record (decision 7)                                                                                                                                          | #302           |
| 1b-i   | `corpus/record` on `papers.json`, linted with `@eslint/json` and reporting at the field; the record gains `capped`, `proxy` and `rebuild`; `MANIFEST.md` optional; the corpus kept out of the paper rules; the rule's page under `docs/rules/corpus/`, linked from `docs/venues.md` | #302, #215 (1) |
| 1b-ii  | `corpus/allowed-files-only` (#500's second rule, moved up from PR 4): the corpus's fixed names, and a corpus with `pdf/` or `text/` and no `papers.json`, reported on the root `paperlint.json`; merged right after 1b-i, so a consumer meets both in one evening                   | #500 (1 of 2)  |
| 1b-iii | `corpus/licence` (off, in no set) with its page, linked from `docs/optional-rules.md`; a test that every rule id has the one-slash shape of "A Rule Id Names Its Subject"                                                                                                           | #302           |
| 2      | the venue lister #568 asks for, as a shared tested script that `study-accepted-papers` calls (not a new CLI command), writing `papers.json` rows with ids and licences                                                                                                              | #568           |
| 3      | the current cycle's venue has a corpus (matched by series, decision 1), the first of #356's three parts                                                                                                                                                                             | #356 (1 of 3)  |

PR 1a stands alone: a corpus written by hand, or by the skill, validates. Readers that compare a paper with
the corpus (#608 abstract rewrites, #465 the panel's demands, a title and scope comparison) come after PR 2.
The source order of PR 2 was measured on 2026-11-24, keyless, against three venues whose accepted
lists were known (27, 16 and 34 papers):

| field                         | first source                                                                                                | then                                                                                 | never                                                                                                            |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| the list                      | Crossref, filtered by the proceedings' full container title (ACM); the Anthology volume `.bib`/`.xml` (ACL) | OpenAlex by source id, as a cross-check; the programme page for papers without a DOI |                                                                                                                  |
| abstract                      | the programme's paper page                                                                                  | Semantic Scholar by DOI, OpenAlex, arXiv OAI-PMH                                     | Crossref (none deposited)                                                                                        |
| arXiv id                      | Semantic Scholar and OpenAlex, their union                                                                  |                                                                                      | Crossref `relation` (always empty)                                                                               |
| licence of the published copy | Crossref `license[]`, every URL kept                                                                        |                                                                                      |                                                                                                                  |
| licence of the arXiv copy     | arXiv OAI-PMH `<license>`                                                                                   |                                                                                      | OpenAlex (null for the arXiv default, once wrong), Semantic Scholar (its licence is of whichever copy it picked) |

Three gaps stay open: IEEE deposits no Creative Commons licence (only text-and-data-mining policy URLs), the
ACL Anthology states one licence for the whole site and none per paper, and the licence printed inside a PDF
can belong to another copy (an arXiv PDF printing its published version's footer), so the PDF is not a
source. Semantic Scholar's venue search and the arXiv Atom API refused every request that day (HTTP 429),
so neither was measured.

## Decided by the author (2026-11-24)

- **A copy with no licence recorded is a finding**, like a licence that forbids it: a check that passes
  what it cannot see looks the same as one that checked. On the consumer above that is 179 findings once
  it migrates and opts in, until PR 2's lister fills the licences in.
- **Titles and abstracts are kept as metadata whatever the licence**, and `docs/venues.md` says so. Every
  scholarly API (Crossref, Semantic Scholar, arXiv) serves them openly and every corpus examined keeps
  them; no source settles that storing them is allowed.

## Rejected

- **One licence per paper.** It cannot say which copy a stored file is, and the same paper's two copies
  routinely differ.
- **A dataset-level licence, as S2ORC or the ACL OCL corpus declare.** The corpus mixes publishers and
  licences; one line cannot be true for all of it.
- **A licence sidecar only (one row per stored file), the old lists left as they are.** It catches the same
  violations in one PR and cannot have two copies claim one file, but it gives no list a lister can write
  and #356, #608 and #465 can read, and a hand-written path drifts. Its one strength is kept: each stored
  file is a recorded fact (`fetched_from`, one storing copy per kind).
- **Rejecting an unlisted licence id at parse time.** One `CC-BY-3.0` would hide every other check and
  break every later reader until a release; it gets a finding instead.
- **Paths to stored files written in the record.** A second fact that can drift from the folder; the path
  is derived from `key`.

## What it does not check

- That a stored file is the copy it is attributed to: it checks that the attribution and its source were
  recorded.
- Whether the recorded licence is the true one: it checks that a licence was read and from where.
- Whether the repository is public, or the project really non-commercial.
- The legal questions the sources leave open (extraction under ND, what counts as non-commercial); the
  table takes the cautious reading for the first and asks the project for the second.
- Anything outside `pdf/` and `text/` until PR 4.
