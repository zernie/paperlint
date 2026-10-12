# PIPELINE-STATUS template — the per-paper readiness scorecard

`paperlint new <name>` writes this into `<papers>/<name>/PIPELINE-STATUS.md` for each paper. It is the
**durable, colocated, markdown source-of-truth** for _which pipeline work has run, its result, and what is still open_ — so
"did everything run?" is a checked fact, not a memory. Chat evaporates; this file rides with the paper
to camera-ready.

🔴 **It is also machine-read.** The status hook prints the `**Readiness verdict:**` line and every
`☐` gate row each time a paper source is edited, and the rules read the front matter below. Keep
the verdict line's wording and the `☐`/`☑` marks as they are, or the hook goes quiet.

## The front matter

Above the sections, the file carries YAML. The rules read its `stages` field:

```yaml
---
stages:
  - stage: submitted
    date: 2026-07-22
    pdf: versions/2026-07-22-submitted.pdf
    bytes: 305412
    source: versions/2026-07-22-submitted.tex
    sourceBytes: 57210
---
```

## One live-state file: the plan, the scorecard, the stages

Everything about a paper that is _live_ (true now, and rewritten when it changes) is a section of this
one file, so there is one place to read and nothing to keep in step:

| section                              | holds                                                                                                                                          | written by                                                     |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| **Plan / now**                       | what is being done now and next, the decisions in force (who, when, a link to the record), the schedule                                        | whoever changes the plan, in the same commit                   |
| **Strong-accept scorecard (M1–M10)** | a row per strong-accept mechanism: status (`pass` / `partial` / `fail` / `—`), evidence as `file:line`, owner, plan or `accept ceiling: <why>` | `study-accepted-papers` (mode C: every row; mode D: M2 and M4) |
| **Stages** (SETUP … AFTER)           | a row per unit of pipeline work                                                                                                                | the skill that ran it                                          |

- **No `PLAN.md` beside it.** A plan in a second file drifts from the status it plans against;
  `paper/folder-layout` reports a `PLAN.md` at the paper's root. A decision's _history_ (why it was
  taken, what was rejected) is a record, not live state: it goes to `research/` as a dated file.
- **Each study gets a dated folder in `repro/`.** The `study` stage's runs go in
  `repro/<slug>-YYYY-MM-DD/` (or `<slug>-YYYY-MM` for one that ran over weeks), with a `README.md`
  saying what it asks, how to run it and what it found, and a line in `repro/README.md`. Scripts the
  whole paper uses go in `repro/tools/`, shared data in `repro/data/`; `paper/repro-layout` reports
  anything else at the top of `repro/`.
- **The scorecard's verdicts live only here.** The dated report `study-accepted-papers` writes under
  `reviews/` keeps the reasoning and links to this section; it never copies the table, so there is one
  truth to update. The mechanisms themselves, with what each is not, are in
  `study-accepted-papers/references/mechanisms.md`. Nothing checks the table mechanically yet: keep its
  columns as the template has them.
- 🔴 **Only stage tables have a first column headed `id`.** A stage-table parser reads every
  `id`-headed table as stage rows, and a row under a heading that names no stage section is an error
  there: a fix-list table headed `id` gave a real paper two such errors (2026-10-12). Head every other
  table with `#` or a word, as the scorecard does. `src/new-paper.test.ts` holds the template to it.

## The row ids, and what each one runs

The `id` cell is the **join key** — the same string appears in this template, in every paper's
scorecard, in `Requires` cells and in the skills' own prose. So
the scorecard explains itself where it lives:

| id            | section    | what it is                                                                | run by                          |
| ------------- | ---------- | ------------------------------------------------------------------------- | ------------------------------- |
| `idea`        | SETUP      | is the idea worth a paper?                                                | `research-ideate`               |
| `priorwork`   | SETUP      | full competitor sweep, before drafting                                    | `map-prior-work`                |
| `venue`       | SETUP      | pick where it goes                                                        | `find-venue`                    |
| `venuebar`    | SETUP      | what this venue rewards (modes A/B), and later the draft scored (C/D)     | `study-accepted-papers`         |
| `access`      | SETUP      | 🔴 _can you physically upload?_ — account, ACTIVE profile, portal, form   | `plan-paper-timeline`           |
| `schedule`    | SETUP      | the backwards plan and its calendar events                                | `plan-paper-timeline`           |
| `frame`       | SETUP      | the claim, stated **before** the runs                                     | `argument-arc` (frame mode)     |
| `study`       | LOOP       | the empirical study + reproduction artifact                               | `build-benchmark`               |
| `draft`       | LOOP       | the paper itself                                                          | `draft-paper`                   |
| `arc`         | LOOP       | does the argument carry end to end?                                       | `argument-arc`                  |
| `cites`       | CONTINUOUS | every `\cite` is real, and the delta over the nearest neighbour is stated | `verify-citations`              |
| `siblings`    | CONTINUOUS | deep read of a competing/concurrent paper                                 | `analyze-sibling-paper`         |
| `priordelta`  | CONTINUOUS | re-sweep restricted to work posted since                                  | `map-prior-work` (delta)        |
| `render`      | CONTINUOUS | build the PDF; the page count everything else is blocked on               | `render-paper`                  |
| `numbers`     | CONTINUOUS | every printed quantity traces to committed data                           | the paper's own numbers gate    |
| `structure`   | GATES      | the developmental/editorial verdict + cut plan                            | `tighten-paper`                 |
| `writing`     | GATES      | writing craft + the persona stall inventory                               | `grade-paper-writing`           |
| `panel`       | GATES      | the simulated PC decision                                                 | `pc-panel-review`               |
| `artifact`    | GATES      | defects found by **executing** the artifact                               | `pc-panel-review` §C            |
| `claims`      | GATES      | claim-preservation diff after every rewrite                               | Fable diff (`writing-craft.md`) |
| `harden`      | GATES      | the multi-axis pre-submit gate                                            | `harden-paper`                  |
| `submit`      | GATES      | the upload itself                                                         | `submit-paper`                  |
| `coldread`    | GATES      | a reader with no context on the changed prose                             | `cold-read-diff`                |
| `cameraready` | AFTER      | de-anonymize, disclose, archive                                           | `camera-ready`                  |
| `extend`      | AFTER      | the ≥30%-new follow-on at a stronger venue                                | `extend-paper`                  |

🔴 **Ids are WORDS, and that is load-bearing** (renamed 2026-08-09 from two-letter codes). Two
letters had run out and had already collided twice, both live in this repo: `Cr` was
`cold-read-diff` in one table of `compile-rules-2026` and `Camera-ready` in another — one join key,
two rows, merged by every consumer — and `Id` (research-ideate) was the header word `id`, so the
parser's header-row filter silently ate that row on **every** scorecard for as long as the template
existed. Neither is expressible now. Keep new ids lowercase, one word, and say what the row is.

## Rules

- **One row per unit of work; update the row in the SAME commit as the work.** Status + ISO date +
  result + open findings + a link to the durable artifact (`siblings/`, a saved grader report).
- **Four sections, because the four kinds fail differently** (see `paper-pipeline` → "There is no
  stage 7"). SETUP is done-or-not. LOOP iterates. **CONTINUOUS is never done** — its date is compared
  against the paper's own mtime, and a `☑` older than the text is a _stale pass_, which reads as
  green and is not. GATES are blocked on named inputs.
- 🔴 **The `Requires` cells above are not free-form — do not thin them.** The cell was retyped by
  hand for every paper until 2026-08-08, and `compile-rules-2026` had lost four of them — including
  `arc`, which argument-arc's SKILL.md says must precede `tighten-paper`. A dropped edge is
  invisible. Adding an input the table does not know about is fine.
- 🔴 **Row `access` is the one that is not about the paper, and it is the one that bites.** _Can you
  physically upload?_ — account exists, profile is **ACTIVE** rather than "pending moderation", the
  portal is reachable, you know the form's fields and its artifact-hosting requirement. On
  `compile-rules-2026` this was the sole critical-path item at T−4 days: the paper was finished and
  there was nowhere to put it, because OpenReview requires an active profile to submit and moderation
  runs **up to two weeks**. Turn it green in the first week, not the last. Record the date it went
  ACTIVE, not just the tick.
- **Row `frame` costs one paragraph and saves a study.** State what the paper will claim _before_ the
  runs. Reframing after the data is collected is how experiments get thrown away — observed on
  `compile-rules-2026`, and the reason `argument-arc` has a rebuild mode at all.
- **Status legend:** `☑` done/pass · `◐` partial (say what's missing) · `☐` not run · `⚠` ran, findings
  open · `n/a` not applicable to this paper/venue.
- **Never inflate.** A unit that didn't run _this_ cycle is `☐` — do not borrow credit from a prior
  submission you can't point to. Approximate or from-memory grades get `≈`.
- **The verdict line leads WORST-GATE-FIRST.** One sentence: submit-ready or not, and the single thing
  blocking. "Ready" is a vector (science/defects, readability, structure, claims-honest, mechanical) —
  **any failing gate caps the verdict**. **A high accept-probability alone is never "submit-ready"**:
  an ~88% panel number once masked failing readability and structure on a paper a human found
  exhausting, and the checker now refuses a verdict line that is only a percentage.
- **Distinct from `SUBMIT-CHECKLIST.md`** (venue-format compliance: page limit, blind model, portal).
  This tracks _quality completeness_. Both green before upload.

---

The template itself is a FILE, not this page: `templates/paper/PIPELINE-STATUS.md` at the package
root (beside `templates/paper/paper.tex`). `paperlint new <name>` copies it with the paper's
name filled in, and a project that keeps its own richer scorecard puts one at
`<papers>/.template/PIPELINE-STATUS.md`, which `paperlint new` prefers. The copy carries no `stages` — a new paper has shipped nothing.

---

## How to use

- **"Is paper X ready / what's checked?"** → read `<paper-dir>/PIPELINE-STATUS.md`. Report the verdict
  line + any `☐`/`⚠`/`◐` rows. Do not re-derive from chat.
- **After running anything** (here or in a subagent) → update its row before moving on; commit with the
  work.
- **Before submit** → every non-`n/a` row is `☑`, or a consciously-accepted `◐`/`⚠` named in the verdict
  line. **An unrun GATE is not a valid "anti-churn" skip if capacity exists: run it.** Anti-churn covers
  re-polishing prose that already passed a gate, never skipping a gate that never ran. And a **stale
  CONTINUOUS row is worse than an empty one** — it reads as green while being false.
