# Venues: three places, three jobs

paperlint keeps three kinds of venue knowledge, each in its own place:

| place                                                                      | holds                                                                                                                                | written by                                                           | read by                                                                        |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `presets/<venue>.jsonc` and `presets/<venue>.md`, in the paperlint package | a shipped **venue preset** (page limits, format, deadlines) and its **card** (the call's requirements in prose, the portal's quirks) | paperlint's maintainers; deadlines are re-read from the portal daily | `paperlint lint` (the preset), `submit-paper` (the card)                       |
| `venues/<name>.jsonc` and `venues/<name>.md`, at your project's root       | your own preset and card, for a venue paperlint does not ship                                                                        | you, when `find-venue` picks such a venue (stage 2)                  | `paperlint lint`, through the paper's `"extends"`; `submit-paper`              |
| `<papers-root>/venues/<venue>/`                                            | the venue's **corpus**: its accepted papers, measured and read                                                                       | `study-accepted-papers` (stage 2, and again at stage 5)              | `study-accepted-papers`, for this paper and every later one aimed at the venue |

A preset and a card say what a venue **requires**: a paper that breaks them is sent back. A corpus
says what a venue **rewards**: what its strongest accepted papers do that its ordinary ones do not.

The two `venues/` folders are different places. With the default papers directory they are
`venues/` (your presets) and `papers/venues/` (the corpora).

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
([the paper folder's layout](rules/paper/folder-layout.md)), and the hook refuses to create one.

## Where the venue's other facts go

A format fact found while studying the corpus (a page limit, a template, a required section) is
something the venue **requires**: it goes in the preset and the card, with the quote it comes from,
not in the corpus. [`rules.md`](rules.md#writing-your-own-venue-preset) shows how to write a preset of
your own.

See also: [the map of every place, and what checks it](layout.md).
