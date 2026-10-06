---
name: grade-paper-writing
description: Use when asking "does this paper read well?" / "is the writing any good?" / "it reads like a wall of text and jargon" / "grade the writing" on a draft. Grades WRITING CRAFT only — ten dimensions 1–5 (Title, Abstract, Intro architecture, Structure, Prose clarity, Jargon discipline, Landing-the-point, Figure economy, Honesty-without-hedge-stacking, Register distance to the target venue) against how the best-written papers read (Peyton Jones, McEnerney, Gopen & Swan; exemplars Trusting Trust, Carlini, Greshake) AND against 2–3 accepted papers of the target venue, naming the offending sentence and the fix for each. Runs the cold-read stall pass with TWO committed personas (a non-academic engineer per section, and a workshop reviewer skimming abstract, introduction and conclusion) whose stall inventory — not the rubric number — is the readability gate other skills consume (pc-panel-review, paper-adversarial-review, harden-paper). Defaults to a blind multi-grader panel; after fixes, mandates the claims-preservation diff (row `claims`). NOT a content/defect review (paper-adversarial-review / pc-panel-review), NOT a structural cut plan (tighten-paper — run that first on a bloated draft), NOT venue-bar content strength (study-accepted-papers). Compose with harden-paper (which calls it), draft-paper (generative counterpart), render-paper.
allowed-tools: [Read, Write, Edit, Grep, Glob, Agent, Skill]
---

<!-- vigiles:sha256:6401b9117bbf899f compiled from skills/grade-paper-writing/SKILL.md.spec.ts -->

# grade-paper-writing — grade how the paper READS, then fix it sentence by sentence

The review skills hunt scientific defects; `study-accepted-papers` checks whether the contribution clears
the venue's bar. Neither tells you the paper is a slog to read. This skill does exactly that: it grades
the **writing craft** against how the best-written papers actually read, and turns each low score into a
concrete, sentence-level fix. Its target failure mode is the common one — *"a wall of text and jargon that
doesn't drive home how crazy the situation is"* — which is a writing problem, not a science problem, and
which the defect-hunting skills will pass right over.

Grounding (do NOT re-derive — read it): `../paper-pipeline/references/writing-craft.md` holds the craft
rules, the exemplar lessons, and the full ten-dimension rubric with 1/5 anchors. This skill applies it.

## The frame to hold while grading (from the reference)
The papers that make a human care share three moves: **(1) open on a problem/assumption the reader already
holds; (2) break it with the single most visceral concrete instance, not an aggregate stat; (3) land one
repeatable sentence.** Grade the draft against that trio, plus McEnerney's test — *does this create value
for the reader, or just record the author's thinking?* — and Gopen/Swan's sentence mechanics (payload in
the stress position, subject next to verb, one idea per sentence).

🔴 **Every push in this rubric has a floor as well as a ceiling.** The craft rules above pull toward
short, plain, punchy sentences, and each mechanical check below caps something: jargon, length, hedges,
connectives. A rubric in which every check is a ceiling has one equilibrium — terse assertions with no
signposting and no stated owner — and reviewers call that a blog post (*"overly literary"*, *"some
sentences are too informal"*, *"readers are often required to infer the intended relationships between
claims"*). The floor is the venue's own register: dimension #10 measures the distance to it, and no fix
this skill proposes may move the text further from it than it already is.

## Execution model — run the graders as subagents (context forks), by default
The blind panel (≥3 graders) and the cold-read stall pass **run in fresh subagents, not inline** — for two
reasons: (a) grading dumps the whole paper + long stall inventories into context, which gunks up the main
thread (context rot); (b) fresh context is the *point* of blind grading — a grader that saw the drafting or
the "it improved from last draft" history anchors optimistic. **Spawn the graders in parallel** (one message,
multiple Agent calls), with an adversarial model (Fable) for at least one seat. The main thread only
**synthesizes the distilled scorecards** — it does not read the paper line-by-line for the grade itself.
(This is the writing-axis instance of the session working rule: delegate heavy/ context-heavy work to
subagents, keep the main thread for synthesis.)

## The stall pass — specification

This is the pass the author cannot run on himself, and it was the weakest thing in this skill: its
spec was a pointer to a file that does not exist. On 2026-08-05 it had run six times on one paper,
and the author then found eleven unreadable passages by eye in twenty minutes. Everything below is
derived from that gap.

### 🔴 Read the BUILT PDF, not the source

**The stall pass reads the typeset pages.** The source is for locating the fix afterwards, never for
judging the read. This was previously written as "read the `.tex`, **or** run `render-paper`",
and that *or* is why the pass kept missing what the author saw immediately: he reads the PDF.

Things that exist only in the render, every one of which produces a real stall:

- a paragraph broken across a column or a page, so its second half arrives with no antecedent;
- a table or figure floated away from the sentence that introduces it — the caption is now the
  reader's only context, and captions are written assuming the body;
- a wall of text, which is a **visual** property: nine lines of unbroken prose in a narrow column
  reads as impassable at a width where six does not;
- a heading orphaned at the foot of a column;
- how much of page 1 is numbers, which is what a reviewer's first impression is actually made of;
- line numbers and two-column measure, which change where the eye stops.

`repro/build-submission.sh` produces the PDF; `render-paper` turns pages into images. Judge from
those. If only the source is available, say so in the report — a stall inventory taken from source
is a weaker artifact and must not be presented as the same thing.

### What the reader is given, and what is withheld

**Given:** the typeset text. **Withheld:** the title's meaning, the abstract as framing, the venue,
the research area, what the paper is trying to show, and every previous stall inventory.

🔴 **Withholding is the mechanism, not politeness.** A grader handed the paper *plus* the framing
reconstructs the idea from the surroundings and then reports that the sentence is clear. It cannot
un-know. That is precisely how six passes in a row missed *"the state to remove is not the rule but
its claim about itself"* — an expert reader supplies the missing idea for free and never notices
they supplied it.

Give the passage **as text in the prompt**, not as a file path. A path invites reading the
neighbours, and reading the neighbours is how this pass fails silently.

### Two readers, and both run

The pass runs two committed personas, each in its own subagent. Neither replaces the other: they
stall on different sentences.

| persona | reads | stalls on |
|---|---|---|
| **the engineer** — a strong practitioner outside academia (`Sam` in the reference) | every section, one subagent per section | terms, walls, sentences that mean nothing to someone who does not already hold the idea |
| **the workshop reviewer** — a PC member at the target venue with 40 minutes for the paper, Confidence 3 | the abstract, the introduction and the conclusion, skimmed in that order | a sentence whose result has no owner (the authors? a cited work? a population?), a relation between claims left for the reader to infer, and anything that does not read like a paper at this venue |

The engineer cannot report the second column by construction: he does not know what a paper at the
venue sounds like, and a sentence with no stated owner reads to him as confident, not as ambiguous.
The reviewer persona's full prompt is in the reference, next to the engineer's. Its findings go into
the same stall inventory, under their own classes (7 and 8 below).

### The one question, per sentence

> **What does this sentence claim? Restate it in your own words.**

Not "did you stumble" — stumbling is a feeling, and a competent model does not feel it. Restatement
is a task with a pass/fail. If the reader cannot restate without guessing, that is `CANNOT PARSE`
and it is the finding.

### Stall classes — the taxonomy the pass was missing

The old pass logged only classes 1–3 and rated papers readable that were not. Classes 4–6 are where
every 2026-08-05 defect lived.

| # | class | test | real example |
|---|---|---|---|
| 1 | undefined term | a coined word used before any sentence says what it refers to | `admission` before the mechanism is described |
| 2 | orphan number | a figure with no denominator or no named population | "over 90 runs … none of 48 … 12 of 12" — three populations, no map |
| 3 | unreadable exhibit | a table cell or caption that needs the body to decode | — |
| 4 | 🔴 **means nothing** | every word is known, the sentence parses grammatically, and the reader still cannot say what it claims | *"the state to remove is not the rule but its claim about itself"* · *"constructions nobody built"* |
| 5 | 🔴 **sounds clever, carries nothing** | reads smoothly, feels like a payoff, and its content is a restatement or is borrowed from a section the reader has not read | *"nine deletions against four fixes is §5.1's cheap way out, winning again"* |
| 6 | 🔴 **vague heading** | a heading naming no concrete object — no linter, no configuration, no agent, no file | *"Three answers, all of them after the fact"* · *"The configuration nobody resolves"* |
| 7 | 🔴 **whose result?** (reviewer persona) | the reader cannot tell whether a claim is a property of the world, a cited finding, or the authors' own measurement | *"asked twice about the same repositories, it changes its mind on a fifth"* — the paper's own experiment, read as a fact about LLMs |
| 8 | 🔴 **off-register** (reviewer persona) | a sentence the venue's accepted papers would not contain: an aphorism, a fragment, a colloquial closing line, an unmarked jump between claims | *"Measure the bill, not the syllables."* — quoted back by a reviewer as "too informal" |

Class 5 is the one a knowing reader always waves through, because it reads *well*. Ask for it by
name — "which sentences sound clever but say less than they appear to?" — or it will not be reported.

### Report shape

Per stall: **location · quoted trigger · class · the reader's actual question · a one-line fix.**
Then the **stall inventory + density per page**, which is the artifact other skills consume — not
the rubric number. Then, separately, the sentences the reader could not restate at all: that list is
the pass's headline, above any score.

### The fix rule

🔴 **A fix that removes the flagged wording and keeps the compression is not a fix.** Proven twice in
one hour on 2026-08-05: *"not through any defect in how we write it, but because that is what English
is"* → *"that is what English is for"* (tic gone, meaning inverted into nonsense); *"the agent turns
out not to be the weak link"* → *"The agent obeys"* (three words, every threshold green, the wrong
finding). **Rewrite the whole thought in plain words.** The construction is usually a symptom of a
compressed idea, and decompressing it removes the construction as a side effect. Then re-read the
replacement cold — the author is least able to judge his own repair exactly when he feels most sure.

### Scope: whole paper here, diff continuously

This pass covers the whole paper and is expensive, so it runs at gate time. The per-edit counterpart
is the `cold-read-diff` skill, which asks the same question of just-changed paragraphs and is cheap
enough to run every time. Running only this one leaves every sentence written after it unread, which
is what happened.

## How to run it

1. **Read the actual draft** (the `.tex`, or run `render-paper` to read the built pages as a reader
   would). Grade the writing as written — never from a summary.
2. **Run the cold-read stall pass FIRST — the full specification is below, under "The stall pass".**
   It was previously a pointer to a reference section that did not exist, which is why the pass drifted
   into "log where I stumbled" and stopped catching the class it exists for.
2. **Score all ten dimensions 1–5** using the anchors in the reference, on the **absolute scale** defined
   there (5 = best-in-field, **3 = the default for a solid paper**; most dimensions are 2–3). Weight Prose
   (#5), Jargon (#6), Landing (#7) and Register (#10) ×2 — the first three are where "wall of jargon"
   lives, the fourth is where "blog post" lives. Report raw /50 + weighted /70.
   **Do NOT trust a single grade.** A lone grader — especially one that just wrote or verified the paper —
   anchors optimistic; a 60/70-looking number is suspect until confirmed. So **when the score matters, run a
   blind panel: ≥3 independent graders (fresh subagents, ideally an adversarial model like Fable), each
   blind to any prior score, to each other, and to the "it improved" framing — given only the current page
   and the field's best.** Report the **distribution (per-dimension + overall min / median / max)**, not one
   number; flag any dimension where graders disagree by >1 as genuinely ambiguous. (See "Scoring
   calibration" in the reference; this is the writing-axis analogue of `pc-panel-review`.)
3. **For every dimension scoring ≤3, name the specific offending sentence or section** and write the fix —
   not "tighten the prose" but the rewritten sentence, or "move the point from ¶3 to ¶1", or "gloss
   `operation-normalized` in plain words at first use." Fixes must be applyable, not vibes.
3a. **Grade #10, register distance, against the venue's own papers, section by section — not against
   the exemplars.** The rules count and this step judges; it starts from their numbers, not from a
   count of its own.
   - **Take the counts from the rules.** `npx paperlint lint <paper-dir>` reports
     `tex/contrast-frames`, `tex/claim-emphasis` and `tex/relation-markers` when the venue preset
     records anchors (AIDC does): each gives the body's rate per 10,000 words, the band, and the
     anchors' range, and above the band it reports every frame and every claim in bold where it
     stands. Those locations are the worklist. Do not recount them by grep — a narrower count is
     gamed by rewording (*, not* → *rather than*), and the rules count every form.
   - **Take the reference papers from the preset.** Its `register.anchors` names the accepted papers
     the band comes from (AIDC: five ACSAC papers, all on arXiv under CC licences). Read two or three
     of the same paper type as LaTeX source (`https://arxiv.org/e-print/<id>`) or as built PDFs. A
     preset without anchors: fetch 2–3 accepted papers of the venue (or, for a first-edition workshop,
     of its parent conference) from the proceedings or the program page, or use the ones the author
     supplies.
   - **Compare section by section, not the paper as a whole:** abstract, introduction, threat model or
     background, method, results, limitations, conclusion. For each, put the draft's section beside the
     same section of each reference paper and record, for both sides: how each result is owned (*we
     measured* · a citation · a named population); how the relation between neighbouring sentences is
     named (*because*, *therefore*, *however*, *for example*) or left to infer (a colon, a dash, a short
     sentence); how often a point is made by what it is not; what is set in bold; and whether any
     sentence is an aphorism, a fragment or a closing punchline. Quote the reference sentence beside
     each draft sentence you flag.
   - **Return concrete rewrites, and every one keeps every number and claim.** For each flagged sentence:
     the draft sentence → the rewrite → the reference sentence it is modelled on → one line saying that
     every number, citation and hedge is unchanged and the claim is neither softened nor strengthened.
     A contrast frame is rewritten by saying what the thing is and naming the relation (*because*,
     *as a result*), not by switching to another contrast form; a claim in bold loses the bold and
     gains its owner (*we measured*, `\ref` to the table); a relation left to infer gets its word.
     Where the frame IS the claim (the paper's thesis sets one mechanism against another), keep it
     once, in the abstract and the introduction, and say so.
   - **Score the distance:** 5 = a reviewer could not tell the draft from the reference papers by
     register, section by section; 1 = it reads as a different genre. After the rewrites, run
     `npx paperlint lint` again: every register rule inside its band is the floor for a 4, not the
     score itself.
   If no accepted paper can be fetched or supplied, write `#10: not graded — no reference papers` and
   say which were tried; a register score from memory is the guess this dimension exists to replace.
4. **Find the paper's three-move opportunities:** what held assumption could open it? what is its single
   most visceral concrete instance (lead with that, not the mean)? what one sentence should the reader
   quote? If the draft is missing any, that's the highest-leverage fix.
5. **Flag the two prose traps by name:** (a) Attention-style dense contribution-less prose used where the
   audience does NOT already care; (b) hedge-stacking ("may possibly in some cases potentially") — replace
   each pile with one precise scope sentence.
6. 🔴 **Run `prose-lint.mjs` on the paper and treat every FLAG as a finding, not as context:**

   ```
   node ${CLAUDE_SKILL_DIR}/prose-lint.mjs <paper-dir>/paper.tex             # the report
   node ${CLAUDE_SKILL_DIR}/prose-lint.mjs --headings <paper-dir>/paper.tex  # the headings as a set
   ```

   It measures the prose a reader sees — includes spliced, no preamble, comments, floats or inline
   `.bib` — so its rates are the paper's, not the source file's. The skill is what must ACT on it.
   Its thresholds are sourced; a FLAG means the text sits above a published human or machine
   baseline, which is a defect with a number attached, not an opinion.
   Two entries in `THRESHOLDS` exist because this skill previously ran five times without either
   firing: the `"not X, but Y"` density had **no threshold at all** and printed as a neutral line
   while standing at 50.8 per 10,000 words against an LLM baseline of 7.8, and the lexicon missed
   both variants a reader spotted by eye — the bare inversion (*"Reading the file is not the weak
   point; judging it is"*) and the appositive that reaches headings (*"Admission, not translation"*).
   A number printed without a threshold is prose; that is this project's own thesis, and the linter
   was violating it.

6b. 🔴 **A lint fix that costs meaning is a REGRESSION, and no linter can see it.** The metrics above
   are diagnostics, never objectives. Optimising one directly is how a sentence gets worse while the
   number gets better — and the number is exactly what makes it feel like progress.

   Observed 2026-08-05, twice in one pass, both by the author of this rule:
   - *"English cannot be exact — not through any defect in how we write it, but because that is what
     English is"* became *"English cannot be exact; that is what English is for"*. The tic went. So
     did the meaning: the new clause says English **exists in order to** be inexact, which is not a
     claim anyone holds. The author's reaction was *«what the fuck does that even mean»*.
   - *"Yet the agent turns out not to be the weak link"* became **"The agent obeys."** Three words,
     zero flags, and the wrong finding — the experiment measured whether *writing a rule down* works,
     while the replacement reads as a claim about agents being submissive.

   **The procedure, and it is not optional:** after replacing a flagged sentence, read the
   replacement as someone who has not read the paper. Does it still say the thing? Would they know
   what it means? If the honest answer is no, the original was better and the flag stays open — an
   open flag is a truthful state, and a passing metric over a sentence nobody can parse is not.
   Prefer rewriting the whole **thought** in plain words to surgically excising the construction:
   the tic is usually a symptom of a compressed idea, and decompressing it removes the tic as a
   side effect.

7. 🔴 **Put `WORST-SECTION: <section>` on the FIRST LINE of the report.** Machine-readable, one
   section, lowercase, no decoration, so the next round can compare it with the last report. This exists because the abstract
   was named worst **five consecutive times**, was faithfully recorded in the scorecard all five
   times, and was never once the next task. A review loop that only appends findings converges on a
   paper whose defects are all thoroughly documented and none of them fixed. **Naming the worst
   section is not the deliverable — a fix for it, or a recorded decision to ship with it, is.**

8. **Run the avoid-list grep (mechanical).** Grep the source for the slop / web-slang / filler / hype words
   in `../paper-pipeline/references/writing-craft.md` → "The avoid-list", and report every hit with its line number and a
   replacement. These are scrutinize-words, not absolute bans — but each hit is a readability debit against
   dimension #6 (Jargon) and the north star — readable by the target reader, in the venue's register. (This session's miss that motivated
   it: "listicle" survived into a submitted-ready AISec draft.)
7. **Wall-of-text sweep (see `writing-craft.md` → "The wall-of-text check").** Flag any paragraph running
   >~15 source lines / ~150 words or covering >3 sub-points — a visual wall the reader's eye slides off
   (distinct from stall density). Prescribe the fix: break into run-in-headed chunks. Caps dimension #4.
8. **Conclusion & quotability sweep (explicit — see `writing-craft.md` → "The conclusion & quotability
   check").** Grade the CONCLUSION on its own, not just the intro: does it pay off in plain language, name the
   stakes, point past the result, and hand the reader a concrete action — or is it a limp results-recap (a 2)?
   Then check the abstract AND the conclusion each carry one extractable, quotable line (the "paste onto a
   talk slide" test); if a surface has none, flag it and draft the candidate line. Report both explicitly —
   these feed dimension #7 (which is graded on both surfaces). This is the axis that catches "the conclusion
   isn't strong enough" and "nothing here is quotable."

## Output
1. **Scorecard** — ten dimensions with one-line justification each; raw /50 + weighted /70. When a blind
   panel was run (the default when the score matters), report the **distribution** — per-dimension and
   overall min / median / max across graders — not a single number, and name any dimension they split on.
   Lead with the two or three dimensions dragging it down, ranked.
2. **Cold-read stall inventory** — the ranked list of "what does that even mean?" points (location → quoted
   trigger → reader's question → fix) plus the stall density per page. This is the most directly actionable
   output; a fix pass works straight off it.
2. **Sentence-level fix list** — for every ≤3 dimension: the offending text → the concrete rewrite/move.
   Ordered by leverage (the fix that most improves how it reads first).
3. **The three-move audit** — the assumption to open on, the visceral instance to lead with, the one
   repeatable sentence — supplied or flagged as missing.
4. **A one-paragraph verdict** — is this a pleasant read for a busy, skeptical reviewer yet, and the single
   change that would move it most.
5. **SAVE the report colocated — don't let it evaporate.** A grade run in a subagent reports into a
   transcript that is gone next session. Write the scorecard + stall inventory + fix list to
   **`<paper-dir>/reviews/<YYYY-MM-DD>-grade-paper-writing.md`** and link it from the paper's
   `PIPELINE-STATUS.md` (Wc row). Same rule as `pc-panel-review`'s ledger and `analyze-sibling-paper`'s
   `siblings/` — review artifacts live colocated and ride with the paper to camera-ready/extension.

## The report's frontmatter — the findings, as records

The report opens with YAML frontmatter that lists what it found, one record per finding.
`paperlint lint` validates it (`review/frontmatter`): an **open** finding must name the
pipeline `cause` that let it through — fix that, and the text edit falls out of running the
fixed tool.

```yaml
---
findings:
  - id: 1
    status: open            # open | fixed | wontfix
    cause: missing-skill    # skill-defect | missing-skill | hook | rule — required when open
    title: "§3 opens on a term the reader has not met"
  - id: 2
    status: fixed
---
```

## Rules
- Grade **writing, not science.** A correct paper can still score a 2 here; say so. Don't drift into
  content/defect review — that's `paper-adversarial-review` / `pc-panel-review`.
- **Every low score comes with the offending sentence and its fix.** No abstract advice.
- **Preserve claims.** Suggested rewrites must not change any result, number, or hedge — only how it reads.
  (This mirrors the constraint on any prose rewrite of a real submission.)
- **After applying sentence fixes, run the `claims` claim-preservation diff** (owner:
  `../paper-pipeline/references/writing-craft.md` → "The claim-preservation diff") — an adversarial
  (Fable) before/after diff verifying **no number moved, no hedge dropped, no claim strengthened, no
  new absolute, no self-contradiction**. The fix pass is not done until it's clean; record it in the
  `claims` row of the paper's `PIPELINE-STATUS.md`. This step is mandatory after EVERY rewrite, not optional.
- **Respect the page budget.** Prefer fixes that cut or hold length; a paper at its page ceiling can't grow.
- **Honesty over flattery.** If the abstract is a stat-wall, score it a 2 and show the five-move rewrite.

## 🔴 The tell that says a machine wrote it: three findings in one sentence

The single most reliable marker of LLM prose in a paper is **the citation tricolon** — separate
findings packed into one sentence with a reference hung off each:

> *Adherence has been measured directly more than once: it decays as a session proceeds [6], and
> agents that undertake to follow a process frequently do not [7] — while a factorial study of the
> file's own structure, varying size, position and ordering, found no effect at all [4].*

Three unrelated results, one sentence, 48 words, a colon, a comma-splice and an em-dash contrast. It
reads fluently and nothing survives it. Its cousin is the **noun pile with no verb**, which exists
only to carry citations:

> *Censuses, taxonomies and labellings of what these files contain [3, 11, 12, 18–20, 25, 34].*

**Rule: one finding, one sentence.** If three works said three things, that is three sentences, and
each says what the work found rather than that it exists. A citation group belongs to a claim, not to
a list. When the related work genuinely is a survey, say what the surveys share and cite them once.

Mechanical leg: `paper-lint`'s plain-language pass flags any sentence carrying three or more separate
citation groups, or five or more reference numbers in under 45 words. It cannot judge whether the
prose is *good*; it reliably catches this one shape, which is the shape that recurs.

**And the words themselves, not only the sentences.** *Utilise* means *use*. The "Jargon discipline"
dimension below does not catch this, because the word looks perfectly at home — judgment slides right
past it. What catches it is a list: `paper-lint` carries ~30 words with a plainer equivalent (utilise ·
constitutes · prior to · necessitates · facilitates · leverage · albeit · in order to …) and names the
replacement in the nudge.

🔴 **The swap is two-sided: replace a word only when the plain word stays in academic register.**
*Utilise → use* and *in order to → to* pass: the replacement is what the venue's own papers write.
*Adherence → following*, *demonstrates → shows* in a results sentence, *methodology → how we did it*
do not pass when the reference papers of dimension #10 use the first form — there the plain word is a
step toward a blog post, and the finding is withdrawn. Keep the list narrow — only words where the swap
changes neither meaning nor register — and never rewrite a cited work's title to obey it.

**Signposting is the register, not a tic, and this skill never removes it on style grounds.** Frame
markers and relation words — *we show*, *this section*, *first … finally*, *in contrast*, *therefore*,
*however* — are how academic prose tells the reader what kind of claim comes next and how it relates to
the last one. Relation words are a floor: `tex/relation-markers` reports a body below the band its
venue's accepted papers set (AIDC: 25.4 per 10,000 words; the paper reviewers called a blog post stood
at 19.1, and never wrote *however* once, where every accepted ACSAC paper writes it 6–11 times). Frame
markers do not separate a draft from accepted papers in either direction (see "Contrast framing"
below). Flag a connective only when it asserts a relation the two sentences do not have (a *therefore*
that does not follow), or when it is empty filler (*it is worth noting that*). Never flag one for being
academic.

**Other markers worth a pass:** nominalisation density (*an honest accounting of what the construction
costs* — abstract nouns doing the work verbs should do) and statistics chained through a paragraph
instead of sitting in a table. Numbers belong in a table the moment there are more than about six of
them in one paragraph.


## 🔴 The class the rubric could not see, and why it kept coming back (2026-08-04)

The author of `compile-rules-2026` read the built abstract and wrote: *«what the f\*** does that
even mean, no human would write it like that»*. He had said the same thing about the same paper
**repeatedly**. Nine rubric axes, a persona cold-read at 5.9 stalls/page, an AI-tells counter and
three tighten passes all scored the text and **none of them named the defect**, because every one of
them measures words and sentences. The defect is not in the words.

**The specimen, verbatim, and it passed every check we own:**

> "Two findings about the agent come first, because they bind whatever else you build. Asked the
> same question twice with identical inputs, a frontier model changes its verdict on 21.5% of rows,
> so no harness that has a model adjudicate its own instructions can use one as the gate."

Two separable failures:

### 1. Contrast framing, and a frame that carries nothing

**What separates this corpus from accepted papers is contrast, not signposting — and a rule counts
it.** `tex/contrast-frames` counts every form (*X, not Y* · *not X but Y* · *rather than* ·
*instead of* · *as opposed to*) per 10,000 words against the band the venue preset's anchors set: the
five accepted ACSAC papers measure 1.3–5.5, AIDC's band is 0–10.4, and the paper reviewers called a blog
post measured 101 before its rewrite and 28 after it. Every sentence that defines its point by what
it is not is a sentence whose point the reader must reconstruct. **Rewrite heuristic:** state the
thing and name the relation; move the rejected alternative to its own sentence, or drop it if nobody
proposed it. Swapping one form for another (*, not* → *rather than*) moves nothing — the rule counts
both, and so does a reviewer.

**Frame markers do not separate us from accepted papers, and are not a target in either direction.**
Hyland's *frame markers* (*this paper · this section · we show · first … finally · in what follows*)
measured 0.76–3.1 per 1,000 words on those five accepted papers (median 1.46); the lowest accepted
paper measured is 0.76, and ours sat inside that range. So neither "remove signposting" nor "add
signposting to reach a number" is a fix. A published average from a different counter (Hyland's
~5 per 1,000) says nothing about where a venue's floor lies.

What IS a defect is a frame that carries nothing. *"Two findings come first, because they bind
whatever else you build"* says nothing about rules files, agents, or repositories: the frame is
there, and the claim it announces is not. List the frames whose announced content never arrives
within the next two sentences; those are the findings. **Rewrite heuristic:** keep the frame and make
it carry the claim. *"Two findings come first, because they bind whatever else you build. Asked the
same question twice…"* → *"We first report two properties of the model that constrain any harness
built on it. Asked the same question twice with identical inputs, it changed its verdict on 21.5% of
rows (Section 4.5)."* The frame now names what follows, and the sentence after it says whose
measurement it is.

⚠️ **Vocabulary lists are not a register signal.** *robust*, *significant*, *comprehensive* and the
rest of the AI-tells vocabulary fire on every one of the five accepted papers. Flag such a word only
when it is empty in its sentence, never as evidence of a machine or of the wrong register.

### 2. The qualification eats the claim

*"…though that cell does not survive our own correction for multiplicity and we report it as
suggestive (Appendix A.2)"* is 20 words of hedge welded onto a 20-word finding. Each hedge was
added honestly, by a different review round, and none was wrong. Their **placement** is the defect, and no single round can see it.

🔴 **The obvious diagnosis is wrong, and it was measured.** Peer review does **not** ratchet hedge
words in. Keserlioglu, Kilicoglu & ter Riet (2019, *Research Integrity and Peer Review*, n = 446
manuscript–publication pairs across 28 journals) found hedge density moving 2.06% → 2.13% — and
non-significant after adjusting for journal characteristics. What review adds is **standalone
limitation sentences**: 2.48 → 3.87 per paper. So the published norm is that qualification enters a
good paper **as its own sentence**, not as particles inside a claim sentence. `compile-rules-2026`
ran at **0.37%** hedge words against that 2.13% norm — it was never over-hedged by count. It was
mis-**placed**: the caveat was welded into the result sentence, where it competes with the result for
the stress position and wins.

**Countable.** Caveats that are grammatically independent sentences versus caveats embedded as
subordinate clauses (*though · while · although · albeit*) inside a sentence that also states a
result. Target: all standalone. Also count sentences ending on a cross-reference, citation or hedge
while the sentence's own number sits earlier — Gopen & Swan's stress position, spent on a pointer.

**Rewrite heuristic — the order matters:** state the finding as a whole sentence, then qualify it in
the **next** sentence. Never inside it. *"Violations went from 17% to 100%, back to the rate with no
file at all. That is one cell of five, and it does not clear the multiplicity correction we
pre-registered (Appendix A.2)."* Same words, same honesty, and the claim survives the reading.

### 3. Phrases that reference an unstated alternative

*"So we left the sentences alone"* — the reader has not been told what else might have been done to
them, so "left alone" refers to nothing. Same author reaction, same day. **Check:** any *instead of ·
rather than · left alone · we did not · not X but Y* whose rejected alternative is not stated within
one sentence.

### 🎯 The abstract and the conclusion are graded on a different scale

They are the only two sections most readers finish, and the abstract is the only one every reviewer
reads before forming a view. Grade them **separately and harder**:

- no frame that announces a claim and then does not make it; *"We show that…"* naming the authors'
  own result is the register of an abstract, not a defect;
- first sentence is about the world, never about the document;
- no number arrives without the unit it counts (*"21.5% of rows"* — rows of what?) or without its
  owner — the authors' measurement, a cited work, or a named population;
- the last sentence of each is a **conclusion**, not an announcement of one;
- nothing may refer forward to a section the reader has not read.

A body section may be merely clear. These two have to be **sharp**, and if the abstract survives a
tighten pass marked `KEEP` three rounds running, that is evidence it was never really read — this
one did, and it was the worst section in the paper by measured density both times.

### What is NOT mechanizable here

Whether a frame marker carries its claim (*"we claim nothing there"* genuinely scopes one), whether a
hedge is honest or defensive, whether a given contrast frame is the one a reader needs, and whether a
rewrite kept every claim at its strength. The mechanical legs that do exist: `tex/claim-provenance`
reports every sentence of the body that holds a number and no owner, and `tex/contrast-frames`,
`tex/claim-emphasis` and `tex/relation-markers` report a body outside its venue's band. Count them,
surface them, and leave the verdict to a reader. The counter's job is that nobody can say afterwards
they did not know.

## Compose with
- `harden-paper` — the multi-axis pre-submit gate calls this as its *writing* axis (the one a defect-hunt
  and a threat-model check both miss).
- `draft-paper` — the generative counterpart (writes the prose); this grades it. Both cite the same
  `../paper-pipeline/references/writing-craft.md`, so guidance and grading never diverge.
- `paper-adversarial-review` / `pc-panel-review` — run those for scientific defects; run this for readability. Complementary axes, not redundant.
- `render-paper` — build the PDF/PNGs first so you grade what the reviewer will actually see.

## Provenance
Built from the **AISec 2026 GateBench** polish run (2026-07): the author's verdict was "wall of text and
jargon that doesn't drive home how crazy the situation is — real humans will be reading this." The rubric
was grounded by dissecting Peyton Jones / McEnerney / Gopen & Swan and honestly grading exemplars
(Attention = impact-not-prose; Trusting Trust / Carlini / Greshake = the real craft models), then applied
as the instrument that graded the rewritten paper.
