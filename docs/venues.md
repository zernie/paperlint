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

### Notable venues not covered

USENIX Security and NDSS (security); ISSTA, OOPSLA and PLDI (software and programming languages);
ACL, NAACL and EACL main conferences (NLP); KDD and The Web Conference (data); CHI, CSCW and UIST
(HCI); OSDI and SOSP (systems); Springer LNCS venues.

### Adding a venue

Workshops are added on request, one edition at a time, with the edition of the conference they are
held at as their parent (the `add-venue` skill writes the preset and its card from the call for
papers). A venue paperlint does not ship needs no release: a user describes it in one file of their
own, `venues/<series>-<year>.jsonc`, that extends a family (`paperlint:ieee-conference`) or a shipped
conference edition (`paperlint:icse-2027`), and points the paper's `"extends"` at it
([`rules.md`](rules.md#writing-your-own-venue-preset)).

## The corpus of accepted papers

`<papers-root>` is the papers directory: `papersDir` in the project's `paperlint.json`, default
`papers/`. The corpus lives there, beside the paper folders and not inside any of them, because it
belongs to the venue: every paper aimed at that venue reads the same one.

```text
<papers-root>/
├── venues/
│   └── <venue>/            ← one venue's corpus, shared by every paper aimed at it
└── <paper>/                ← a paper folder; it holds no corpus of its own
```

### When it is made

The skill `study-accepted-papers` makes it, the first time it runs for that venue. It always asks
which mode to run, and suggests one from what exists:

| mode     | when                                           | stage    | what it adds to the corpus                                  |
| -------- | ---------------------------------------------- | -------- | ----------------------------------------------------------- |
| A idea   | a target venue and an idea; no `paper.tex` yet | 2 venue  | the winner and ordinary lists, their measurements (L0, L1)  |
| B design | a planned claim and measurements; no text yet  | 2 venue  | the same, if not there yet                                  |
| C draft  | the paper's text exists                        | 5 review | the deep reads (L2), one file per paper                     |
| D final  | near-final text, the deadline close            | 5 review | nothing new; it compares wording against the closest papers |

So the corpus usually appears at stage 2, right after `find-venue` and before the study is
designed, when what the venue rewards can still shape the study. A paper that first runs the skill
at stage 5 gets its corpus then. Each later run, by any paper, reuses what is there and adds only
what is missing.

### What is inside

```text
<papers-root>/venues/<venue>/
├── MANIFEST.md        ← the sources, the years, what was capped, the stand-in for "strong accept" and how often it occurs
├── the winner and ordinary lists
├── measurements.json  ← the codes of L0 and L1, one row per paper
├── text/              ← the text extracted from each paper
├── deep-reads/        ← one file per paper read in full (L2), usable by any paper
├── the scripts that fetched and measured
└── a labelled subfolder for corpus 2: award papers on the topic at other venues
```

Only `MANIFEST.md`, `measurements.json`, `text/` and `deep-reads/` have fixed names; the lists, the
scripts and the corpus-2 folder are named by whoever runs the skill. The PDFs are not committed: the
manifest records each paper's identifier and the command that fetches it.

A mechanism the venue adds to the generic ten (M1–M10, kept beside the skill), or one that does not
hold there, is written in `MANIFEST.md`.

### Who reads it

- **The paper's strong-accept scorecard.** In mode C, `study-accepted-papers` scores the draft
  against the corpus and writes the result in the section `## Strong-accept scorecard (M1–M10)` of the
  paper's `PIPELINE-STATUS.md`, the only place the verdicts live. Its dated report goes in the
  paper's `reviews/` and names the corpus in its frontmatter (`corpus:`).
- **Every later paper aimed at the same venue**, and the same paper when it is resubmitted there:
  the corpus is collected once and reused.

### What checks it

**No rule reads the corpus yet.** `paperlint lint` treats a folder in the papers directory as a paper
only when it holds `PIPELINE-STATUS.md`, `paper.tex` or `paperlint.json`, and `venues/` holds none of
them, so nothing in it is linted. The hook that refuses misplaced files does not act there either:
it acts only inside a paper folder.

What is checked is the other side: a corpus started **inside** a paper folder. A `venues/` or
`venue-corpus/` folder at a paper's root is reported, with this place as where it goes
([the paper folder's layout](rules/paper/allowed-files-only.md)), and the hook refuses to create one.

## Where the venue's other facts go

A format fact found while studying the corpus (a page limit, a template, a required section) is
something the venue **requires**: it goes in the preset and the card, with the quote it comes from,
not in the corpus. [`rules.md`](rules.md#writing-your-own-venue-preset) shows how to write a preset of
your own.

See also: [the map of every place, and what checks it](layout.md).
