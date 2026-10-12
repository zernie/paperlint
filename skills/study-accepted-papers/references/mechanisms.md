# Mechanisms of a strong accept — the generic list (M1–M10)

What separates a venue's award winners from its ordinary accepted papers, written so it can be checked
against any draft. The ids are the rows of the scorecard section in the paper's `PIPELINE-STATUS.md`;
the skill scores a draft against them in mode C and checks the wording in mode D.

**Where the list comes from, and how far it reaches.** One run of this skill on one software-engineering
venue (zernie/paperlint#207): every award winner the venue listed for seven years against the ordinary
papers of the same years, then twelve papers read in full, with two award / no-award pairs on the same
question. It is a list of **hypotheses to re-test on your venue**, not a law. Each entry says what
supports it and what it is not. The examples below are award papers, named by title; what is said about
each comes from reading its full text.

**What did NOT separate the winners** (the same run, issue #207): form. Body words, figures, tables,
title shape, "first / gap / doubt" phrasing and statistics markers: 13 features, none significant after
correction, on 21 winners against 112 ordinary papers. Releasing an artifact did not separate them
either, because most ordinary papers release one too. Do not rebuild a paper's form to match the
winners. In that run, an apparent "winners have many figures" pattern came from one year of five papers
and did not hold across seven.

The two published sources on how reviewers in software engineering judge papers point the same way.
The ICSE 2018 PC report found best-paper nominees furthest above accepted papers on significance and
soundness, not on presentation. Ernst et al. (EMSE 2021) found negative reviews come from "a mismatch
between the method and the claims" and "overly grandiose claims". Both are quoted in
[`base-rates.md`](base-rates.md).

---

| id      | mechanism                                       | the check                                                                                                            |
| ------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **M1**  | a non-model oracle under the headline           | what decides the headline number: execution, a developer's action, or people reading, with their agreement reported? |
| **M2**  | the claim is aimed at a belief stated on record | which sentence, by whom, does the result confirm or refute, quoted and cited?                                        |
| **M3**  | the construct is the claim                      | does what the oracle decides equal what the claim sentence asserts?                                                  |
| **M4**  | the denominator in the claim sentence, no drift | does every claim sentence carry its scope, and does the abstract say no more than the body?                          |
| **M5**  | a negative or "X alone" claim shape             | is the claim a counter-example to a stated universal, or "X alone is not Y"?                                         |
| **M6**  | the generalised-over factor is a column         | if the claim names a class (models, tools, languages), is that class a manipulated column with every cell printed?   |
| **M7**  | the phenomenon measured directly                | is the thing the claim is about an outcome of its own, not inferred from a downstream proxy?                         |
| **M8**  | a reusable thing the field pays for once        | which benchmark, method, labelled set or actionable number will a reader reuse?                                      |
| **M9**  | relevance to every reviewer on the PC           | would a reviewer outside the topic care, e.g. because it is about how the venue does its own science?                |
| **M10** | where the paper's own result loses              | is the case where the method or tool fails reported as prominently as where it wins?                                 |

---

## M1 — a non-model oracle under the headline

**What it is.** The number in the title or abstract is decided by something other than a model's
judgement: running the code, what developers actually did, or people reading, with how much they agreed.

**Supports it.** In the run, no winner rested its headline on model-only labels. Award examples:
_Does Functional Package Management Enable Reproducible Builds at Scale? Yes._ (MSR 2025) rebuilds
packages and compares the result bit for bit; _A Large-scale Study about Quality and Reproducibility of
Jupyter Notebooks_ (MSR 2019) re-executes the notebooks; _Can LLMs Replace Manual Annotation of
Software Engineering Artifacts?_ (MSR 2025) keeps human annotations as the reference the models are
measured against.

**What it is not.** Not sufficient: in the run's pairs, papers with a human anchor still lost on M3 and
M4. Not "report κ": winners with and without an agreement statistic were indistinguishable. The point is
what decides the headline, not the statistic beside it.

## M2 — the claim is aimed at a belief stated on record

**What it is.** The introduction quotes a position the field has written down (a claim in a cited
paper, a practice the venue's own papers follow, a widely read critique) and the result confirms or
refutes it.

**Supports it.** All the award papers read in full did this; the non-award papers read mostly did not.
The reproducible-builds paper answers a doubt that a cited interview study put on record.

**What it is not.** Not "no study has done X": a gap is not a belief. Doubt words ("first", "gap",
"little is known") did not separate winners in the corpus count. What separates is a named position
with a source.

## M3 — the construct is the claim

**What it is.** What the oracle measures is exactly what the claim sentence asserts, so a reviewer
cannot ask "but is that what you mean?".

**Supports it.** Bitwise equality _is_ reproducibility (the reproducible-builds paper); re-execution
_is_ reproducibility (the notebooks paper). _Clarity Is Not Assumed_ (ASE 2026) defines its construct
formally before measuring it, so a change in the outcome can mean only one thing. In the run's
award / no-award pair on one question, this was the deciding difference, not the number of raters.

**What it is not.** Not the same as having an oracle (M1): a valid oracle on a nearby construct still
fails here.

## M4 — the denominator in the claim sentence, no drift

**What it is.** Each claim sentence carries its scope ("in the 1,000 repositories that…", "for the
evaluated models"), and the abstract and introduction claim no more than the body shows.

**Supports it.** The reproducible-builds abstract scopes its main sentence to one package manager. _The
Hidden Cost of Readability_ (ICSE 2026) has a title that asserts only what its oracle measured. In the
run's pairs, the non-award paper lost where its introduction or abstract said more than its own tables.

**What it is not.** Not hedging. A bold title wins when the fragile half of the claim lives, scoped, in
the body; the defect is drift between the levels, not confidence.

## M5 — a negative or "X alone" claim shape

**What it is.** Refute a stated universal with one large counter-example, or show that one factor alone
does not produce the outcome everyone assumes it does.

**Supports it.** The reproducible-builds paper refutes "reproducible builds do not scale" and, with
equal weight, the opposite myth about its own tool.

**What it is not.** A universal positive ("every X is Y") has the opposite logic: no single census can
carry it, so it either narrows or needs many independent settings.

## M6 — the generalised-over factor is a column

**What it is.** When the claim names a class (language models, tools, languages, ecosystems), the paper
varies that factor alone inside one design, prints every cell, and names the member that deviates.

**Supports it.** _The Hidden Cost of Readability_ runs ten models in one design and names the outliers.
_Understanding Software Engineering Agents: A Study of Thought-Action-Result Trajectories_ (ASE 2025)
names in its threats that comparing distinct models complicates a fair comparison, and scopes its
claims accordingly.

**What it is not.** Not necessary for an award: most winners in the run were observational. It is
necessary to use the class noun without bounding it to the members measured.

## M7 — the phenomenon measured directly

**What it is.** The thing the claim is about is an outcome of its own (for example, disagreement between
readings measured as a rate), beside the downstream outcome (for example, correctness) that it affects.

**Supports it.** _Clarity Is Not Assumed_ measures conflict between a model's outputs directly, beside
correctness. In the run, that was what separated it from a no-award paper on the same question, which
measured correctness alone.

**What it is not.** Only applies when the claim is about the phenomenon itself; a claim about an effect
is carried by M3 and M5.

## M8 — a reusable thing the field pays for once

**What it is.** A named benchmark, a method another team can apply, a labelled set, or an actionable
number a practitioner can use.

**Supports it.** The ambiguity benchmark of _Clarity Is Not Assumed_; the trajectory analysis method of
the agents paper; the decision procedure of the annotation paper.

**What it is not.** A released artifact alone is an admission ticket, not a differentiator: most
ordinary accepted papers release one. The differentiator is that a reader reuses it.

## M9 — relevance to every reviewer on the PC

**What it is.** A result that matters to reviewers outside the paper's topic, most often because it is
about how the venue's community does its own research (its datasets, its labelling practice, its
reproducibility).

**Supports it.** In the run, meta-research was over-represented among winners; examples are the
annotation paper and _Escaping the Time Pit_ (MSR 2021). This was a post-hoc observation by one coder.
Treat it as the weakest entry.

**What it is not.** Not a form. It is a topic choice, so it is a mode A or B decision, rarely a mode C
fix.

## M10 — where the paper's own result loses

**What it is.** The cases where the paper's method, tool or hypothesis fails are reported in the same
place and with the same prominence as where it wins.

**Supports it.** The reproducible-builds paper names a "false myth" about its own tool; the annotation
paper reports the tasks where models failed beside the ones where they succeeded.

**What it is not.** Not a threats section. This is what keeps M2 and M5 from reading as advocacy.

---

## Using the list

- **Mode A (idea) and B (design):** M1, M2, M3, M6 and M7 are design decisions. Write each as a
  requirement for the study before anything runs: what the oracle is, which stated belief is targeted,
  which factor is a column.
- **Mode C (draft):** score every row of the scorecard section in `PIPELINE-STATUS.md`. Each row gets a
  status (pass / partial / fail), evidence as `file:line` in the paper source, an owner, and a plan or an
  explicit "accept ceiling" with the reason.
- **Mode D (final):** M4 and M2, sentence by sentence, in the abstract and the introduction.
- **Re-test the list on your venue.** Add a mechanism your venue's winners share, with its evidence, in
  the venue corpus (`<papers-root>/venues/<venue>/`). Mark one that does not hold there. The ids M1–M10
  stay stable so scorecards stay comparable.
