# Venues: three places, three jobs

paperlint keeps three kinds of venue knowledge, each in its own place:

| place                                                                                                         | holds                                                                                                                                | written by                                                           | read by                                                                        |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `presets/<series>-<year>.jsonc` and its `.md`, in the paperlint package ([what ships](#what-paperlint-ships)) | a shipped **venue preset** (page limits, format, deadlines) and its **card** (the call's requirements in prose, the portal's quirks) | paperlint's maintainers; deadlines are re-read from the portal daily | `paperlint lint` (the preset), `submit-paper` (the card)                       |
| `venues/<name>.jsonc` and `venues/<name>.md`, at your project's root                                          | your own preset and card, for a venue paperlint does not ship                                                                        | you, when `find-venue` picks such a venue (stage 2)                  | `paperlint lint`, through the paper's `"extends"`; `submit-paper`              |
| `<papers-root>/venues/<venue>/`                                                                               | the venue's **corpus**: its accepted papers, measured and read                                                                       | `study-accepted-papers` (stage 2, and again at stage 5)              | `study-accepted-papers`, for this paper and every later one aimed at the venue |

A preset and a card say what a venue **requires**: a paper that breaks them is sent back. A corpus
says what a venue **rewards**: what its strongest accepted papers do that its ordinary ones do not.

The two `venues/` folders are different places. With the default papers directory they are
`venues/` (your presets) and `papers/venues/` (the corpora).

## What paperlint ships

A venue preset is one **edition**, `paperlint:<series>-<year>`; a **family** is a template, a format
and not an edition, with no year in its id. A workshop names the edition of the conference it is held
at (`parent`), of its own year. `test/venues-doc.test.ts` checks that every shipped preset is listed
here and that every `paperlint:` id below exists.

### Families

| family                      | the template                                    |
| --------------------------- | ----------------------------------------------- |
| `paperlint:acm-sigconf`     | ACM `acmart`, sigconf (two columns)             |
| `paperlint:acm-acmsmall`    | ACM `acmart`, acmsmall (one column)             |
| `paperlint:ieee-conference` | IEEE `IEEEtran`, conference                     |
| `paperlint:acl-latex`       | ACL's style files (`article`, `acl.sty`)        |
| `paperlint:neurips-style`   | `article` + `\usepackage{neurips_2026}`         |
| `paperlint:icml-style`      | `article` + `\usepackage{icml2027}`             |
| `paperlint:aaai-press`      | `article` + `\usepackage[submission]{aaai2027}` |

The TeX base set, `tex-base.jsonc`, is extended by nothing: every paper gets it.

### Editions, by field

**Software engineering**

| edition                      | parent                | family                      | what is checked                  |
| ---------------------------- | --------------------- | --------------------------- | -------------------------------- |
| `paperlint:icse-2028`        | —                     | `paperlint:acm-sigconf`     | the research track's call        |
| `paperlint:icse-2027`        | —                     | `paperlint:ieee-conference` | the format only (minimal preset) |
| `paperlint:fse-2027`         | —                     | `paperlint:acm-acmsmall`    | the research papers' call        |
| `paperlint:ase-2026`         | —                     | `paperlint:acm-sigconf`     | the research track's call        |
| `paperlint:msr-2027`         | —                     | `paperlint:ieee-conference` | the technical papers' call       |
| `paperlint:nlbse-2027`       | `paperlint:icse-2027` | `paperlint:ieee-conference` | the workshop's call              |
| `paperlint:agent-2027`       | `paperlint:icse-2027` | `paperlint:ieee-conference` | the workshop's call              |
| `paperlint:agentverify-2027` | `paperlint:icse-2027` | `paperlint:ieee-conference` | the workshop's call              |
| `paperlint:agenticdev-2026`  | `paperlint:ase-2026`  | `paperlint:acm-sigconf`     | the workshop's call              |

MSR is held beside ICSE, but it is a conference of its own, not a workshop, so it names no parent.

**Security**

| edition                | parent                 | family                      | what is checked                  |
| ---------------------- | ---------------------- | --------------------------- | -------------------------------- |
| `paperlint:ccs-2026`   | —                      | `paperlint:acm-sigconf`     | the call                         |
| `paperlint:sp-2027`    | —                      | `paperlint:ieee-conference` | the call                         |
| `paperlint:acsac-2026` | —                      | `paperlint:ieee-conference` | the format only (minimal preset) |
| `paperlint:aisec-2026` | `paperlint:ccs-2026`   | `paperlint:acm-sigconf`     | the workshop's call              |
| `paperlint:aidc-2026`  | `paperlint:acsac-2026` | `paperlint:ieee-conference` | the workshop's call              |

**Natural language processing**

| edition                | parent                 | family                | what is checked                                 |
| ---------------------- | ---------------------- | --------------------- | ----------------------------------------------- |
| `paperlint:emnlp-2026` | —                      | `paperlint:acl-latex` | the class line and packages (minimal preset)    |
| `paperlint:realm-2026` | `paperlint:emnlp-2026` | `paperlint:acl-latex` | the workshop's format; no page limit (its card) |

**Machine learning and AI**

| edition                  | parent | family                    | what is checked                                          |
| ------------------------ | ------ | ------------------------- | -------------------------------------------------------- |
| `paperlint:neurips-2026` | —      | `paperlint:neurips-style` | the main track's call and the kit's style file           |
| `paperlint:icml-2027`    | —      | `paperlint:icml-style`    | the call and the kit's style file                        |
| `paperlint:aaai-2027`    | —      | `paperlint:aaai-press`    | the main technical track's call and the kit's style file |

The template of these three is a style file a paper loads over `article`: each family names the
class in `template` and the style in `template_style`, and `tex/template` requires both.

**Human–computer interaction**: none shipped yet.

A minimal preset carries the edition's names, its call and its family, and no page limit or deadline:
it exists so the workshops held there can name it as their parent. Its card says so.

### In progress

ICLR and IJCAI have been measured and are not shipped yet. Their templates are style files a paper
loads over `article`, as NeurIPS's, ICML's and AAAI's are, and `template_style` can name them; what
holds them back is the page count: statements their calls keep out of the limit stand before the
references, where they count as body.

### Seen, not added yet

Venues we have come across in this repository's work and not added: each has a source to point to.
«Notable venues not covered», below, lists well-known venues nobody here has looked at yet.

| venue (series, edition)                                                                   | parent       | where we saw it                                                                    | what blocks it                                                                                                           |
| ----------------------------------------------------------------------------------------- | ------------ | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| JAWS 2026 (workshop)                                                                      | ASE 2026     | the acceptance comment of arXiv 2611.01265v1 (#545's candidate search, 2026-11-19) | nothing: on request                                                                                                      |
| POVC 2026 (workshop)                                                                      | ASE 2026     | arXiv 2609.05978v2 (#545)                                                          | nothing: on request                                                                                                      |
| LLMSC 2026 (workshop)                                                                     | FSE 2026     | arXiv 2604.27789v1 (#545)                                                          | on request; its parent edition, FSE 2026, has no preset (FSE 2027 ships)                                                 |
| FSE 2026, its tracks on sigconf (Ideas, Visions and Reflections; Industry)                | —            | arXiv 2603.28166v2, 2604.06448v2 and three more (#545)                             | the track's class is still to be confirmed from its call                                                                 |
| ACM ASIA CCS 2026                                                                         | —            | arXiv 2601.12634v1, `acmart` sigconf (#545)                                        | nothing: on request                                                                                                      |
| ISSTA 2026                                                                                | —            | the arXiv comment searches of 2026-11-19, not probed (#545)                        | nothing: on request                                                                                                      |
| ICLR 2027                                                                                 | —            | measured from its call and author kit                                              | statements its call keeps out of the page limit stand before the references and count as body (`body_ends_before`, #544) |
| IJCAI 2027                                                                                | —            | measured from its call and author kit                                              | the same as ICLR (#544)                                                                                                  |
| NeurIPS 2026, its Evaluations & Datasets and Position Paper tracks                        | —            | the 2026 call page, beside the main track (`neurips-2026.md`)                      | their own calls, not read: on request                                                                                    |
| NeurIPS 2026 workshops: «Who Verifies the Agents?», Interp4Discovery, TAE (Trust-AI-Eval) | NeurIPS 2026 | `fixtures/real-papers/preprints/2611.08666v1`, `2611.09818v1`, `2611.09147v1`      | on request; they load NeurIPS's style file, whose kit has workshop options (`dblblindworkshop`, `sglblindworkshop`)      |
| ICML 2027, its position paper track                                                       | —            | the ICML 2027 call (`icml-2027.md`)                                                | its call is not published                                                                                                |
| AAAI-27, its AI Alignment track                                                           | —            | the AAAI-27 call (`aaai-2027.md`)                                                  | on request: the main track's page limit, its own dates                                                                   |

### Notable venues not covered

USENIX Security and NDSS (security); OOPSLA and PLDI (software and programming languages);
ACL, NAACL and EACL main conferences (NLP); KDD and The Web Conference (data); CHI, CSCW and UIST
(HCI); OSDI and SOSP (systems); Springer LNCS venues.

### Adding a venue

Workshops are added on request, one edition at a time, with the edition of the conference they are
held at as their parent (the `add-venue` skill writes the preset and its card from the call for
papers). A venue paperlint does not ship needs no release: a user describes it in one file of their
own, `venues/<series>-<year>.jsonc`, that extends a family (`paperlint:ieee-conference`) or a shipped
conference edition (`paperlint:icse-2027`), and points the paper's `"extends"` at it
([`rules.md`](rules.md#writing-your-own-venue-preset)).

How long one workshop takes is not in the history: no past addition is one workshop alone. AGENT,
AGENTVERIFY and NLBSE came in one commit (#305, the branch's first commit at 2026-10-26 22:32 UTC,
merged 2026-10-27 09:35 UTC, the wait for review included), AIDC with the IEEE family and three rules
(#130), and the work before a first commit is not recorded; the repository is squash-merged.

## The corpus of accepted papers

`<papers-root>` is the papers directory: `papersDir` in the project's `paperlint.json`, default
`papers/`. The corpus lives there, beside the paper folders and not inside any of them, because it
belongs to the venue: every paper aimed at that venue reads the same one. The corpus folder is named
after the venue preset's series, the preset id without its year: `agent` for `paperlint:agent-2027`.

```text
<papers-root>/
├── venues/
│   └── <venue>/            ← one venue's corpus, shared by every paper aimed at it
└── <paper>/                ← a paper folder; it holds no corpus of its own
```

### When it is made

The skill `study-accepted-papers` makes it, the first time it runs for that venue. It always asks
which mode to run, and suggests one from what exists:

| mode     | when                                           | stage    | what it adds to the corpus                                                  |
| -------- | ---------------------------------------------- | -------- | --------------------------------------------------------------------------- |
| A idea   | a target venue and an idea; no `paper.tex` yet | 2 venue  | the rows of the award winners and the ordinary papers, their codes (L0, L1) |
| B design | a planned claim and measurements; no text yet  | 2 venue  | the same, if not there yet                                                  |
| C draft  | the paper's text exists                        | 5 review | the deep reads (L2), one file per paper                                     |
| D final  | near-final text, the deadline close            | 5 review | nothing new; it compares wording against the closest papers                 |

So the corpus usually appears at stage 2, right after `find-venue` and before the study is
designed, when what the venue rewards can still shape the study. A paper that first runs the skill
at stage 5 gets its corpus then. Each later run, by any paper, reuses what is there and adds only
what is missing.

### What is inside

```text
<papers-root>/venues/<venue>/
├── papers.json            ← the record: every paper and every copy of it with its licence; the sources, years, what was capped, the stand-in for "strong accept", the commands that rebuild it
├── MANIFEST.md            ← optional: caveats only, the prose no field holds
├── measurements.json      ← the codes of L0 and L1, one row per paper, keyed by its key
├── pdf/<key>.pdf          ← a paper's PDF, only when a copy's licence permits keeping it
├── text/<key>.txt         ← its extracted text, on the same condition
├── text/<key>.<variant>.txt ← a second extraction of the same paper (another extractor, the first page alone)
├── deep-reads/<key>.md    ← one file per paper read in full (L2), usable by any paper
└── sources/               ← the listing and call pages as they were read
```

These are all the names a corpus holds. The award winners and the ordinary accepted papers are rows
of `papers.json` (`group` `award` and `accepted`), and so are the papers of other venues, corpus 2
(`group` `sister`): one record, the corpora told apart by a field. How the corpus was collected is
in the record too: each edition's `capped` (what was left out and why, `null` when nothing was) and
`proxy` (the stand-in for "strong accept" and how many papers it marks, `null` when there is none),
and `rebuild`, the commands that fetched and measured (the scripts are not kept in the corpus).
Coverage is never written down: it is counted from the rows. `MANIFEST.md` is optional and holds
caveats only, such as a mechanism the venue adds to the generic ten (M1–M10, kept beside the skill)
or one that does not hold there; no rule reads it. The author's own paper is never in a corpus: its
text belongs in its paper folder.

### The record, `papers.json`

One row per paper, and in it every copy of the paper we know of with that copy's licence. A real
row, from a workshop's 2026 list:

```json
{
  "venue": "agent",
  "editions": [
    {
      "edition": 2026,
      "listed_from": "https://conf.researchr.org/home/icse-2026/agent-2026",
      "read_on": "2026-11-03",
      "accepted": 27,
      "capped": null,
      "proxy": null
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
  ],
  "rebuild": []
}
```

The example shows one of the edition's 27 rows. `accepted` is the count of the listing page's rows
and is required: with `capped` null the record lists all 27 papers of 2026 (`accepted` and `award`
rows together), and `corpus/record` reports an edition whose rows do not add up to it.

The fields, their values and which are required are the JSON Schema
[`skills/study-accepted-papers/papers.schema.json`](../skills/study-accepted-papers/papers.schema.json),
generated from the parser (`src/adapters/venue-corpus/index.ts`; `npm run schema:venue-corpus`
rewrites it, and a test fails when it is stale). A schema cannot say that a key is unique, that a
paper's edition is one of `editions[].edition`, or that a copy that stores a file names where it was
fetched from; the parser checks those and the skill's script reports each with its path.

Every web address is `http` or `https`. The top level, an edition, a copy, a licence and `ids` are
strict, so a misspelt key is an error; a paper row keeps any further field as it is, for a project's
own scripts. A copy whose origin nobody recorded is `unknown`, and its licence can only be
`NOASSERTION`. The paths of stored files are not written in the record: they follow from `key`.

### Licences: what a corpus may keep

A licence belongs to a **copy**, not to a paper. The same paper is often CC BY in the proceedings and
under arXiv's non-exclusive licence as a preprint, and a stored file is a copy of one version, so it
is judged by that version's licence.

Before it downloads a PDF or extracts a text, `study-accepted-papers` reads each copy's licence,
writes it in `papers.json`, and keeps a PDF or a text only when a copy's licence permits that kind;
for the other papers it keeps the ids. What each licence permits is one table, in paperlint's
`src/domain/licence.ts`, with its reasons in [the design note](design/venue-corpus.md#what-is-decided)
(decision 3). In short: CC0 1.0, CC BY 4.0 and CC BY-SA 4.0 permit both; an ND licence permits the
PDF and not an extracted text; an NC licence permits only in a project declared non-commercial; arXiv's
non-exclusive licence, a publisher's own and a licence not read (`NOASSERTION`) permit neither; and an
id the table does not list, another CC version included, permits nothing. A project declares itself
non-commercial with the option of [`corpus/licence`](rules/corpus/licence.md),
`["warn", { "nonCommercial": true }]`; without it an NC copy is treated as not permitted.

The skill's script prints, for each paper and each kind, the copy to keep or each copy's reason:

```text
node <skills>/study-accepted-papers/scripts/corpus-licences.js agent
2026-01 text: keep the published copy (CC-BY-4.0), https://doi.org/10.1145/3786167.3788430
2026-01 pdf: keep the published copy (CC-BY-4.0), https://doi.org/10.1145/3786167.3788430
```

It takes the venue, and finds `<papers-root>/venues/<venue>/papers.json` itself: the project is the git
top level of the folder it runs in, and the papers roots are `papersDir` in the project's
`paperlint.json`. Exactly one root may hold the venue; none or several is exit 1, naming the folders.
It parses `papers.json` first, and a record that does not parse is reported with the path of each
problem, exit 1.

**Titles and abstracts are kept as metadata whatever the licence.** Every scholarly API (Crossref,
Semantic Scholar, arXiv) serves them openly; they are not copies. Neither are the short quotes inside
the codes or a deep read.

### Where a copy's licence is read from

Measured on 2026-11-24, without API keys, on three venues whose accepted lists were known (27, 16 and
34 papers). `read_from` names the page or the API response the licence was read from:

| what                          | read it from                                                                                                | then                                                                                 | never                                                                                                            |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| the list                      | Crossref, filtered by the proceedings' full container title (ACM); the Anthology volume `.bib`/`.xml` (ACL) | OpenAlex by source id, as a cross-check; the programme page for papers without a DOI |                                                                                                                  |
| abstract                      | the programme's paper page                                                                                  | Semantic Scholar by DOI, OpenAlex, arXiv OAI-PMH                                     | Crossref (none deposited)                                                                                        |
| arXiv id                      | Semantic Scholar and OpenAlex, their union                                                                  |                                                                                      | Crossref `relation` (always empty)                                                                               |
| licence of the published copy | Crossref `license[]`, every URL kept                                                                        |                                                                                      |                                                                                                                  |
| licence of the arXiv copy     | arXiv OAI-PMH `<license>`                                                                                   |                                                                                      | OpenAlex (null for the arXiv default, once wrong), Semantic Scholar (its licence is of whichever copy it picked) |

**The licence line printed inside a PDF is not a source**: it can belong to another copy (an arXiv
PDF printing its published version's footer). Two gaps stay open: IEEE deposits no Creative Commons
licence (only text-and-data-mining policy URLs), and the ACL Anthology states one licence for the
whole site and none per paper. Where no source gives a copy's licence, it stays `NOASSERTION`.

### Who reads it

- **The paper's strong-accept scorecard.** In mode C, `study-accepted-papers` scores the draft
  against the corpus and writes the result in the section `## Strong-accept scorecard (M1–M10)` of the
  paper's `PIPELINE-STATUS.md`, the only place the verdicts live. Its dated report goes in the
  paper's `reviews/` and names the corpus in its frontmatter (`corpus:`).
- **Every later paper aimed at the same venue**, and the same paper when it is resubmitted there:
  the corpus is collected once and reused.

### What checks it

[`corpus/record`](rules/corpus/record.md), on by default, reads every corpus's `papers.json` under
`<papers-root>/venues/`: `paperlint lint` lints the file as JSON and reports, at the line of the field,
a field that breaks the record's schema, a stored file no copy claims, a claimed file that is
missing, and two copies of one paper storing one kind. A `papers.json` that is not JSON fails as a
parse error on its first line. A project turns the rule off with
`{ "rules": { "corpus/record": "off" } }` in its root `paperlint.json`.

[`corpus/allowed-files-only`](rules/corpus/allowed-files-only.md), on by default, holds the names
above: an entry at the top of a corpus outside them is reported on its `papers.json`, with where it
goes, and a corpus that keeps `pdf/` or `text/` with no `papers.json` is reported on the project's
root `paperlint.json`.

Nothing in a corpus is a paper: a `paper.tex` kept there is an accepted paper's source, and no
paper rule judges it. The hook that refuses misplaced files acts only inside a paper folder.

[`corpus/licence`](rules/corpus/licence.md) is **off by default and in no rule set**: the same stored
files are legal in a private repository and illegal in a public one, and the rule cannot tell which
it is in. A project whose corpus others read turns it on with `{ "rules": { "corpus/licence": "warn" } }`
in its root `paperlint.json`; it reports, at the copy's `stored`, a stored kind whose licence was not
read, is not in the licence table, or does not permit it. A non-commercial project says so with the
rule's option, `["warn", { "nonCommercial": true }]`.

Also checked: a corpus started **inside** a paper folder. A `venues/` or
`venue-corpus/` folder at a paper's root is reported, with this place as where it goes
([the paper folder's layout](rules/paper/allowed-files-only.md)), and the hook refuses to create one.

## Where the venue's other facts go

A format fact found while studying the corpus (a page limit, a template, a required section) is
something the venue **requires**: it goes in the preset and the card, with the quote it comes from,
not in the corpus. [`rules.md`](rules.md#writing-your-own-venue-preset) shows how to write a preset of
your own.

See also: [the map of every place, and what checks it](layout.md).
