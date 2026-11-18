---
name: grade-paper-writing
description: Grade how a paper reads and fix it sentence by sentence. Use when asked if a paper reads well or to grade the prose, or when the writing is a wall of text, jargon-heavy, or reads like a blog post. Returns 1–5 scores, the sentences cold readers could not follow, and a rewrite for each. Not for cuts (tighten-paper), one edited paragraph (cold-read-diff), scientific flaws (paper-adversarial-review, pc-panel-review), submit readiness (harden-paper) or what the venue rewards (study-accepted-papers).
allowed-tools: [Read, Write, Edit, Grep, Glob, Agent, Skill]
---

<!-- vigiles:sha256:3b7ab2948419e923 compiled from skills/grade-paper-writing/SKILL.md.spec.ts -->

# grade-paper-writing — grade how the paper READS, then fix it sentence by sentence

Editing the paper's text after an approved copy exists (`paperlint versions approve`): declare each change in `versions/<cycle>/changes.yaml`, `paperlint versions diff` shows what was lost (EXPERIMENTAL; `docs/rules/cycle/changes-since-approved.md`).

The review skills hunt scientific defects; `study-accepted-papers` scores the contribution on the
strong-accept scorecard. Neither tells you the paper is a slog to read. This skill does exactly that: it
grades the **writing craft** against how the best-written papers actually read, and turns each low score
into a concrete, sentence-level fix. Its target failure mode is the common one — *"a wall of text and jargon that
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

`repro/tools/build-submission.sh` produces the PDF; `render-paper` turns pages into images. Judge from
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
2. **Run the cold-read stall pass FIRST — the full specification is above, under "The stall pass — specification".**
   It was previously a pointer to a reference section that did not exist, which is why the pass drifted
   into "log where I stumbled" and stopped catching the class it exists for.
3. **Score all ten dimensions 1–5** using the anchors in the reference, on the **absolute scale** defined
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
4. **For every dimension scoring ≤3, name the specific offending sentence or section** and write the fix —
   not "tighten the prose" but the rewritten sentence, or "move the point from ¶3 to ¶1", or "gloss
   `operation-normalized` in plain words at first use." Fixes must be applyable, not vibes.
4a. **Grade #10, register distance, against the venue's own papers, section by section — not against
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
5. **Find the paper's three-move opportunities:** what held assumption could open it? what is its single
   most visceral concrete instance (lead with that, not the mean)? what one sentence should the reader
   quote? If the draft is missing any, that's the highest-leverage fix.
6. **Flag the two prose traps by name:** (a) Attention-style dense contribution-less prose used where the
   audience does NOT already care; (b) hedge-stacking ("may possibly in some cases potentially") — replace
   each pile with one precise scope sentence.
7. 🔴 **Run `prose-lint.mjs` on the paper and treat every FLAG as a finding, not as context:**

   ```
   node ${CLAUDE_SKILL_DIR}/prose-lint.mjs <paper-dir>/paper.tex             # the report
   node ${CLAUDE_SKILL_DIR}/prose-lint.mjs --headings <paper-dir>/paper.tex  # the headings as a set
   ```

   It measures the prose a reader sees — the files the last build read spliced in, no preamble,
   comments, floats or inline `.bib` — so its rates are the paper's, not the source file's — and, on
   its own line, the figure captions that float outside that prose, flagging a caption sentence over
   40 words or a caption over 100. Run
   `npx paperlint build` first: with no current build record it reads `paper.tex` alone and says so. The skill is what must ACT on it.
   Its thresholds are sourced; a FLAG means the text sits above a published human or machine
   baseline, which is a defect with a number attached, not an opinion.
   Two entries in `THRESHOLDS` exist because this skill previously ran five times without either
   firing: the `"not X, but Y"` density had **no threshold at all** and printed as a neutral line
   while standing at 50.8 per 10,000 words against an LLM baseline of 7.8, and the lexicon missed
   both variants a reader spotted by eye — the bare inversion (*"Reading the file is not the weak
   point; judging it is"*) and the appositive that reaches headings (*"Admission, not translation"*).
   A number printed without a threshold is prose; that is this project's own thesis, and the linter
   was violating it.

7a. 🔴 **A lint fix that costs meaning is a REGRESSION, and no linter can see it.** The metrics above
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

8. 🔴 **Put `WORST-SECTION: <section>` on the FIRST LINE of the report.** Machine-readable, one
   section, lowercase, no decoration, so the next round can compare it with the last report. This exists because the abstract
   was named worst **five consecutive times**, was faithfully recorded in the scorecard all five
   times, and was never once the next task. A review loop that only appends findings converges on a
   paper whose defects are all thoroughly documented and none of them fixed. **Naming the worst
   section is not the deliverable — a fix for it, or a recorded decision to ship with it, is.**

9. **Run the avoid-list grep (mechanical).** Grep the source for the slop / web-slang / filler / hype words
   in `../paper-pipeline/references/writing-craft.md` → "The avoid-list", and report every hit with its line number and a
   replacement. These are scrutinize-words, not absolute bans — but each hit is a readability debit against
   dimension #6 (Jargon) and the north star — readable by the target reader, in the venue's register. (This session's miss that motivated
   it: "listicle" survived into a submitted-ready AISec draft.)
10. **Wall-of-text sweep (see `writing-craft.md` → "The wall-of-text check").** Flag any paragraph running
   >~15 source lines / ~150 words or covering >3 sub-points — a visual wall the reader's eye slides off
   (distinct from stall density). Prescribe the fix: break into run-in-headed chunks. Caps dimension #4.
11. **Conclusion & quotability sweep (explicit — see `writing-craft.md` → "The conclusion & quotability
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
3. **Sentence-level fix list** — for every ≤3 dimension: the offending text → the concrete rewrite/move.
   Ordered by leverage (the fix that most improves how it reads first).
4. **The three-move audit** — the assumption to open on, the visceral instance to lead with, the one
   repeatable sentence — supplied or flagged as missing.
5. **A one-paragraph verdict** — is this a pleasant read for a busy, skeptical reviewer yet, and the single
   change that would move it most.
6. **SAVE the report colocated — don't let it evaporate.** A grade run in a subagent reports into a
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

## What the rubric missed — read before grading #5, #6, #10 and the abstract and conclusion

The citation tricolon, contrast framing, a caveat welded into its claim, phrases that point at an unstated alternative, the stricter scale for the abstract and the conclusion, and what is not mechanizable: each with the paper it was found on and the rule it left, in [`references/case-history.md`](references/case-history.md).

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
