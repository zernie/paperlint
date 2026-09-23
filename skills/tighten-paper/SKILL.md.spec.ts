// Compiled to SKILL.md by `vigiles compile`. Edit THIS file, never the markdown.
//
// Adopted 2026-08-17 (batch 3). Body carried over VERBATIM so the compiled diff shows
// only what the compiler adds. No `disallowedTools` fence yet — the field landed on
// `SkillSpec` in vigiles branch `claude/skill-disallowed-tools` and is not in a release
// this repo installs, so writing one here would not compile.
import { experimental_skill } from "vigiles/spec";

export default experimental_skill({
  name: "tighten-paper",
  description:
    "Use when a paper \"feels long / bloated / overly complex / hard to read / doesn't deliver its point / the middle drags\" — or after review rounds deposited hedge-mass. The developmental / editorial pass on a DRAFTED paper: what a real human editor thinks reading it cover to cover — the ONE point, does every section earn its place, can it be SKIMMED, is it too long for its contribution, which sections are TMI that belong in the artifact/appendix, does the conclusion pay off the intro's promise. Produces a structural verdict + a concrete cut / fold / merge / reorder plan — NOT sentence fixes. Its verdict is a required INPUT to pc-panel-review and a hard gate in harden-paper. NOT sentence craft or a writing grade (grade-paper-writing), NOT jargon stalls (the persona stall pass), NOT scientific defects (pc-panel-review / paper-adversarial-review). Run it BEFORE those on a bloated draft — no point polishing sentences in a section that should be cut.",
  tools: [
    "Read",
    "Write",
    "Edit",
    "Grep",
    "Glob",
    "Agent",
    "Bash(node .claude/skills/paper-pipeline/scripts/announce.mjs:*)",
    "Bash(node .claude/skills/paper-pipeline/scripts/ledger.mjs:*)",
  ],
  body: `
# tighten-paper — the developmental edit

## Run me

🔴 FIRST, before any other step:

\`\`\`
node .claude/skills/paper-pipeline/scripts/announce.mjs tighten-paper <paper-dir>
\`\`\`

An advisory pass cannot be observed failing — silence is both its error state and its normal
state — so starting is an event, and events get written down.

Sentence-level passes make a wall of text into readable text. They do **not** tell you the wall shouldn't be there
at all. This pass is the editor who reads the whole paper once and asks: *is this the right paper, at the right
length, delivering the right point?* Its deliverable is a **cut/fold/merge/reorder plan and a length verdict**, not
reworded sentences.

**Run it as a persona subagent too** (see \`paper-pipeline/references/writing-craft.md\` — the persona mechanic): an
editor persona who reads the whole thing once, fast, the way a busy reviewer skims before deciding. A frontier model
grading section-by-section never feels the *cumulative* drag; a persona reading cover-to-cover does.

## 🔴 Run this ONCE, at the end — never after each addition

The failure this rule exists for is not hypothetical; it is what produced the worst score
\`the reference paper\` ever received. The body sat exactly at its 8-page limit, so every content
addition pushed it to 9, and each time prose came out to get back — around fifty times, sixty
characters at a go, always inside whichever section had just been edited. No single cut was wrong. The
sum of them took the transitions, the pronoun antecedents and the honest half of the conclusion, and
four blind readers independently scored clarity 2/5.

**So: content work runs over the limit deliberately.** This pass happens when the content has settled,
with the whole draft in view — which is the only vantage from which you can *move* a section rather
than shave a clause. A tighten pass performed inside a single section, under pressure from a page
counter, is not this skill; it is the damage this skill exists to undo.

If you are invoked while the author is still adding material, say so and decline the pass. The right
answer is "not yet", not a smaller cut.

## 🏗 START WITH THE MECHANICAL LEG — run \`structure.mjs\` (added 2026-08-05)

\`\`\`
node .claude/skills/tighten-paper/structure.mjs <paper.md>              # whole paper
node .claude/skills/tighten-paper/structure.mjs <paper.md> --section=3  # one section
\`\`\`

🔴 **THE SCRIPT NO LONGER FINDS ANYTHING — it is an INVENTORY (2026-08-26).** All sixteen of its
checks moved into ESLint rules (\`eslint-rules/paper-structure.mjs\`). The findings you used to read
here now come from:

\`\`\`
npx eslint --no-config-lookup --config eslint.config.mjs <paper.md>
\`\`\`

⚠️ Do NOT pass \`--flags-only\`. It is kept only because two harnesses assert on its silence, and it
prints nothing and exits 0 whatever the paper looks like. Measured 26.08 on \`the reference paper\`:
\`--flags-only\` printed 0 lines while ESLint on the same bytes reported **6 structural findings**
(subsection-size ×2 · section-lead · free-section-size ×2 · block-ungraded). A mode that cannot
speak is not a check, and reading its silence as "clean" is the defect this pipeline is named for.

What the inventory prints, and why it stays a script: the outline **in order** — every heading, its
own words, its total with subsections, its share of the body, and the \`carries:\`/\`score:\`/\`verdict:\`
note the section wrote about itself, printed beside its weight. That comparison is the whole point
and a linter cannot make it: a finding has nowhere to put a table.

🔴 **Why this exists, and why word counts alone mislead.** Asked whether a paper short-changed its
contribution, per-section word counts said no — the contribution had 38% more words than related
work — and that was true and useless. The shape showed the defect: three of eight top-level sections
owned **0, 28 and 38** words before their first subsection. Nothing in the toolchain asked that
question, because every metric was per-sentence or per-document and none was per-section. The author's
word for the result was a "salad" — a jumbled mix — and he was right while the numbers said fine.

**What the script does NOT decide, and you must:** the ORDER, the NAMES, and whether a section earns
its place. Those are judgement, and pretending otherwise would be the failure this whole pipeline
exists to prevent.

## 🔤 JUDGE THE HEADINGS AS A SET, NOT ONE AT A TIME (2026-08-05)

Print every heading in order and read them as a table of contents, with nothing else. **A stranger
should be able to reconstruct the argument from the headings alone.** Two rules:

- **A heading names a thing** — a linter, a configuration, a repository, a build, a constraint —
  never an abstraction (*answers · kinds · moves · demotion · what X removes*). Two headings that a
  reader called "VAGUE AF" and "why not mention the linter??" survived **six** consecutive passes,
  because every pass looked only at the section it happened to be editing. Nobody ever looked at the
  set.
- **A heading that names two jobs means the section has two jobs.** *"Why the prose stays, and what
  the construction costs"* is two different questions under one number, and that is visible from the
  heading alone before you read a word of it.

## 🔀 JUDGE THE ORDER (2026-08-05)

Ask what reading order a stranger actually needs, then check whether the paper delivers it. The
specific failure to look for: **the result the venue cares about most, arriving last and smallest.**
On \`the reference paper\` the workshop was about agents, all 34 of its previously accepted papers had a
model or agent under measurement, and the paper's only agent section was 4% of the body, placed after
two sections of caveats. Measure this — do not intuit it. If you propose a reorder, price it: say
which cross-references break and how many.

## What good papers are like (the bar)
- **One point.** A strong paper says ONE thing and everything serves it. You can state its contribution in a single
  sentence, and every section visibly advances that sentence.
- **Tight beats long.** Filling the page limit is not a virtue — the best measurement/security papers are often
  *under* it. Length signals insecurity as often as rigor. Cut everything the reader doesn't need to be *convinced*.
- **Skimmable.** The argument comes through from title + abstract + section headings + figure captions + first
  sentence of each paragraph alone. Structure carries the story; prose fills it in.
- **The paper convinces; the artifact exhausts.** The paper keeps only what a reader needs to believe the claim.
  Every per-case breakdown, every "we also checked X," every exhaustive validation sub-table → artifact/appendix.

## The seven editorial questions (run in order)
1. **The one-sentence point.** Write the paper's contribution in ONE sentence. If you can't, or it takes three —
   that's the core problem, name it. Then check: does every section advance THAT sentence? List any that don't.
2. **The skim test.** Read ONLY title, abstract, all headings, figure/table captions, and the first sentence of each
   paragraph. Does the full argument come through? Where does skimming leave you lost or surprised? Those are
   structure failures (a heading that doesn't state its point, a paragraph whose lead sentence buries the finding).
3. **Length / verbosity audit.** Is the paper longer than it needs to be to make its point? Go section by section:
   for each, ask *does removing this weaken the ARGUMENT?* If no → cut or fold to the artifact. Flag TMI: exhaustive
   validation lists, defensive "we also ran X," per-case enumerations, methodology detail a reader takes on trust.
   Give a concrete target ("§5 is ~1.5pp; it needs ~0.6pp — keep the two-way validation *claim* + one number, fold
   the rest to the artifact").
4. **The middle sag.** Papers drag in the middle when they ENUMERATE instead of ARGUE — a pile of parallel
   sub-findings with no through-line. For the middle sections: is each one advancing the argument, or is it a data
   dump the reader wades through? Recommend consolidating parallel findings and leading each with its point.
5. **Complexity budget.** Is the paper more elaborate than its contribution warrants? A simple strong finding buried
   under heavy machinery reads as over-engineered. Could the same point be made more simply / with fewer moving
   parts / fewer coined terms? Name the machinery that isn't earning its keep.
6. **Structural coherence — audit the SECTION SKELETON, not just the flow.** Section structure grows organically
   and accretes cruft; check the top-level skeleton for these specific symptoms and propose a merged one:
   - **Thin setup sprawl:** 3+ short sections before the first result that are all "here's the thing and how we
     measured it" (e.g. separate *battery* + *corpus* + *method* sections). MERGE into one setup section with
     subsections — a reader shouldn't hit four throat-clears before the payoff.
   - **A sprawling Results section** (6–9 subsections in a flat list) → REGROUP into ~3 subsections **named for the
     argument's steps** (e.g. the spelling→grammar→effect ladder), not for the experiments.
   - **A "What actually works" / "Discussion of implications" section that duplicates** the results + discussion —
     usually added because the point wasn't landing elsewhere. FOLD it into the results' close or Discussion.
   - **Redundancy:** any point/stat/definition stated in 2+ sections — full once (first use), one-clause
     back-reference after.
   Output the CURRENT skeleton and a proposed CLEAN one (fewer, better-organized sections). A typical clean shape:
   Intro · Background/threat · **one merged setup** · Results (subsections = argument steps) · Discussion ·
   Related work · Ethics · Conclusion.
   **But fewer sections ≠ walls of text.** Lean means *organized*, not monolithic: every merged/long section KEEPS
   subsections and bold run-in heads — they're the wall-breakers (see writing-craft.md's wall-check). Don't trade a
   choppy 11-section paper for an 8-section paper of unscannable blocks.
7. **The payoff check.** Does the conclusion deliver the exact thing the intro promised — no more (no new claims), no
   less (no anticlimax)? Do intro and conclusion agree on what the paper is about?

## Aggression — the default verdict for a sentence is DELETE
The failure this skill keeps hitting is **timidity**: it concludes "the skeleton is clean, nothing major to cut"
and trims lightly, so the paper stays at the page limit and still *feels* fat (GateBench 2026-07-25: the author
called it "fat for no reason" after a pass that cut almost nothing and left it 10pp). Fix the posture:
- **Clean skeleton ≠ tight paper.** A perfectly-organized section list can still be 30–40% fat prose. "No whole
  section to cut" is **NOT a stopping condition** — go INSIDE each section and cut at the paragraph and sentence
  level. A tightening pass whose conclusion is "structure is already clean" has not done its job.
- **Burden of proof is on the words, not the editor.** Do not ask "can I justify removing this?" Ask "does this
  sentence change what the reader BELIEVES or can DO?" If not — cut. The default verdict for any sentence is
  DELETE unless it visibly advances the one-point.
- **Each section justifies its LENGTH, not just its existence.** Existence-justified but 2× too long is still a
  fail. Budget each section from its job (threat model ~0.5pp not 1.5; related-work ~0.75pp; a discussion that
  re-states results ~0). Over budget → cut to budget.
- **The fat inventory (hunt these in every section):** background the reader already knows; "we also ran/checked
  X" reassurance; per-case enumerations (→ artifact); hedge-stacks (→ one scope sentence); a sentence that
  restates the previous one in new words; throat-clearing lead-ins ("It is worth noting that…"); any paragraph
  whose deletion the ARGUMENT would not notice.
- **Measured, not vibes.** Report before→after LINES (or words) per section and total. **A tightening pass that
  does not move the line count materially DID NOT HAPPEN** — say so and cut harder. On a paper that "feels fat,"
  −20–30% of body prose is a normal result, not an extreme one.
- **"It's all load-bearing numbers" is the SECOND timid excuse — reject it too** (the first is "the skeleton is
  clean"). A paragraph can be FULL of protected numbers/cites and STILL be over-explained. Load-bearing protects
  the CLAIM + its number — NOT the three sentences that motivate, teach, and restate it around them. Method:
  extract the claim+number into ONE tight sentence, cut the surrounding explanation. **Dense ≠ uncuttable** — a
  measurement paper's fat HIDES as explanation of real numbers, which is exactly why "it's all numbers" lets it
  survive a lazy pass (GateBench 2026-07-25: a pass cut only 5% hiding behind this; the author correctly pushed
  back that whole sections were over-explained, not just number-dense).
- **"Fold to the artifact" is the PRIMARY length lever for a measurement/benchmark paper — not a last resort.**
  FIRST verify the artifact exists and recomputes the numbers (it usually does for these papers). Then per-case
  breakdowns, secondary analyses, exhaustive robustness sub-results, ablation walkthroughs, and every "we also
  checked X" MOVE there: keep the headline number + one pointer ("the artifact's per-guard matrix reports the
  rest"), cut the in-paper walkthrough. This is NOT dropping a claim by omission — the public artifact recomputes
  it. **A dense benchmark paper that folds NOTHING to its own artifact has not been tightened.** Make a fold list
  first, before any sentence-level cutting.
- **Length is calibrated to CONTRIBUTION WEIGHT, not to the page limit.** A moderate finding + a moderate-complexity
  benchmark does not need to sit at the limit; being over-length for the weight of the contribution is itself a
  defect — it reads as padding even when each sentence is individually "true." Right-size to the contribution's
  natural length, then stop. Ask: "for how big this finding actually is, how many pages does it deserve?" — and cut
  to THAT, not to the ceiling.
- **Apply it — don't defer it (see caveats for why this is safe).** When invoked to TIGHTEN (not merely audit for
  harden/pc-panel input), APPLY the prose/TMI cuts directly and report the measured delta. A plan with no applied
  cuts is only acceptable for a pure pre-review audit; "tighten this, it's fat" means CUT.

## 🔴 Write the per-section verdict INTO the paper, not just into chat

A verdict that lives in a chat log is gone by the next session, and the next session then re-derives
it or ignores it. **Every section and subsection gets a one-line verdict comment immediately above its
heading**, in the paper source, stamped with the date and the skill that produced it:

\`\`\`
<!-- TIGHTEN 2026-08-06 · score 8/10 · verdict: KEEP · 190w
     carries: tools get close but none resolves a NAMED rule against a committed config
     because: it is the only place the tool-ecosystem gap is closed; a reviewer who skips it
              asks "hasn't this been done" and gets no answer -->
<!-- TIGHTEN 2026-08-06 · score 5/10 · verdict: SHORTEN -89w · 210w
     carries: why a linter for the rules file cannot work
     because: the point lands in two sentences; the rest re-establishes what §2 already did -->
<!-- TIGHTEN 2026-08-06 · score 2/10 · verdict: MOVE→artifact · 45w
     carries: nothing the reader must hold to judge the contribution -->
\`\`\`

🔴 **Before assigning any \`MOVE→\` verdict, read \`paper-pipeline/references/body-vs-appendix.md\`.**
It holds the one rule that decides where a block lives — quoted from the ACL/ARR guidelines, not
invented — plus the ordered list of what to cut first when the body overruns, and the asymmetric
case that matters most: **a qualification narrowing a number in the body belongs in the body**,
however tight the page count. Moving it out does not fix the overclaim, it hides it.

**Three fields, all three required, on every heading — and in an appendix, on every bolded block.**

| field | what it means |
|---|---|
| \`score: N/10\` | how much **a reviewer's decision to accept** depends on this. NOT how interesting it is, not how hard it was, not how much you like it |
| \`verdict:\` | one of **KEEP · SHORTEN −Nw · MOVE→§x/appendix/artifact · MERGE→§x · CUT** |
| \`carries:\` | the belief it holds, in one clause. If you cannot write it, that IS the finding and the verdict is not KEEP |

🔴 **Why a score, when there was already a justification.** A free-text note is a section arguing its
own case, and a section always wins that argument: there is no scale to rank it against its
neighbours, and no slot in which the answer can come out negative. Over one paper, 23 such notes were
written and **not one ever concluded "cut me"**. Author, 2026-08-06, reading the built PDF:
*"reading the paper gives the impression — hmm, is this section really needed"* — the notes had asserted
value on every page and compared nothing.

The pairing is the mechanism: **a low score beside a KEEP verdict is a visible contradiction**, and
\`structure.mjs\` reports it. Prose cannot contradict itself; a number can.

**Calibration, so the scale does not drift to "everything is an 8":**
- **9–10** — remove it and a reviewer cannot assess the contribution. The claim, its evidence, its price.
- **7–8** — removing it costs a reviewer's confidence: the honest bound, the nearest competitor, the cost.
- **5–6** — a reader who already believes you wants it. Full protocols, per-item tables. This is an
  **appendix** score, not a body score.
- **3–4** — real work, nobody asks for it. Its home is the artifact.
- **0–2** — duplicates something reachable, or was written for an argument the paper no longer makes.

**Anything scoring below 5 that sits in the BODY is a page-limit bug**, and the verdict says where it goes.

🔴 **The scale does not apply to integrity content, and a low score there is never a reason to cut.**
Attribution, ethics and disclosure statements, licence and availability notes, correction records,
and the admission of a limitation all score low by construction — no reviewer's accept/reject
depends on them. That is what they are *for*. Score them honestly and **write \`verdict: KEEP\`
anyway**, with the reason.

Observed 2026-08-06, first run of this format: a block crediting a section title's metaphor to a
named Supreme Court dissent scored 2/10 and came back \`CUT\`, described as "a courtesy footnote, not
evidence". Deleting the credit while keeping the borrowing is not a saving. The pass was applying
the scale exactly as written, which made it a defect in the scale.

🔴 **A \`MOVE\` or \`CUT\` verdict on an appendix block is INVALID unless the note says what points at
the block.** State the pointer, or state that a search found none — and if one exists, the verdict
is KEEP until the pointer is rewritten first. This is not a nicety: an executed MOVE leaves the body
saying "see Appendix B" and Appendix B saying nothing, which reads as thorough and sends the reader
into a hole. Worse than the words it saved.

Measured, first run of the format: the pass proposed **686 words of cuts across nine blocks, and
every one had to be reversed.** Four were pointed at from the body or Limitations. One held the only
citation of a reference — moving it would have left an uncited entry in the bibliography, which the
pass itself noted and proposed anyway. One was the working behind a bound that had been promoted
into the abstract that morning, so "unreached" was true when the pass started and false when it
finished. One was a population reconciliation, in a paper whose single loudest complaint is that its
populations are never related. Two were the block that *points at the artifact*, and an attribution.

**Nine for nine is not bad luck, it is a missing input.** A pass that grades blocks one at a time
cannot see what points at them, so it will keep proposing exactly these cuts. Hand it the
reachability map, or require the pointer check in the note — the second is cheaper and it is what
this rule does.

**Same day, two more verdicts had to be overruled**, both \`SHORTEN\` on subsections a word threshold
had flagged, both scored 7/10 and 9/10, and in both the verdict was derived *from the threshold*
rather than from reading the text — one of them on a passage carrying a standing note that says the
fix there is expansion, not compression. **A size finding says LOOK HERE. It does not say what to
do.** A pass returning SHORTEN on high-scoring sections it has not re-read is doing arithmetic, and
its verdicts should be treated as unread.

Rules for these comments:
- **Every section AND every appendix block.** Demanding one note per heading asks nothing of an
  appendix, which is one heading with thirty-five arguments under it — and that is exactly where
  unpriced prose accumulates, because nothing there costs a page.
- **Stale beats absent, but not by much.** A comment whose date precedes the last substantive edit to
  its section is stale; re-grade it rather than trusting it.
- **A verdict nobody executed is a note, not a decision.** \`structure.mjs\` reports blocks still
  carrying a non-KEEP verdict — a paper full of unexecuted CUTs is worse than one never graded,
  because it reads as decided.
- They are working notes: stripped before typesetting, like every other \`<!-- -->\` block.
- The chat summary still gets written — but it is the *derivative*, and the paper is the record.

## 🧱 Enforce subsections — a section without them is a wall

**A section that runs past roughly 700 words or five paragraphs with no \`###\` under it is a wall**,
and a wall is where TMI hides: nothing announces what each part is for, so nothing can be judged
individually and nothing gets cut. Readers skim headings; if a section offers none, its middle is
invisible.

For every such section, either propose the subsection split (one heading per belief the reader carries
out, named by the belief and not by the topic) or explain why the section is genuinely one indivisible
argument. Introductions and conclusions are the usual legitimate exceptions; a results or related-work
section almost never is.

Mechanical leg: \`paper-lint\`'s \`checkPaperWalls()\` reports oversized unsubsectioned sections on the Stop
pass, so this does not depend on someone remembering to run the skill.

## Output — the verdict AND the applied cuts
Produce:
- **The one-sentence point** (as you could best extract it) + whether the paper delivers it clearly (yes / buried / no).
- **Length verdict:** is it too long? by roughly how much? Is it at the page limit because it's full of argument, or
  because it's padded?
- **The cut/fold/merge/reorder plan:** a ranked list — for each: section, action (CUT / FOLD-TO-ARTIFACT / MERGE
  with X / REORDER / TIGHTEN), why, and rough length saved. Lead with the highest-impact.
- **The middle-sag diagnosis** and the fix (consolidate these findings, lead each with its point).
- **Skim-test failures** (headings/lead-sentences that don't carry the argument).

## Record the verdict

🔴 LAST step, once the deliverable exists:

\`\`\`
node .claude/skills/paper-pipeline/scripts/ledger.mjs record tighten-paper <paper-dir> FINDING <count> <report-path>
node .claude/skills/paper-pipeline/scripts/ledger.mjs record tighten-paper <paper-dir> ABSTAINED <reason> "<one line>"
\`\`\`

**FINDING** is the normal row — \`<count>\` is the number of CUT / FOLD / MERGE / REORDER actions in
the plan and \`<report-path>\` is the plan itself. Add \`--blocking\` when the paper is over its limit
and the plan cannot get it under.
**ABSTAINED** — \`no-witness\`: a cover-to-cover read produced no action at all, which on a real draft
should be rare. \`blocked\`: the declined pass of the section above — content is still being added, so
there was nothing to read whole.

🔴 **This is the check with the documented history of never saying no**: a tightening pass once
returned KEEP on 80 of 81 sections and still counted as run. It is also one of the three failures
that deleted \`PASS\` — the word made "I read it all and nothing moved" indistinguishable from "I did
not really read it". \`status.mjs\` reports a check that has never recorded a finding, on the
mutation-testing principle that a test which kills no mutant is not a test. So an \`ABSTAINED
no-witness\` here owes a note saying what was read and why nothing moved.

The mechanical half of this skill files separately, under \`tighten-paper/structure\` — one check, one
row. Do not record a \`structure.mjs\` result here.

## Compose
Run this FIRST on a draft that "feels bloated" — before grade-paper-writing / the stall pass / pc-panel, because
polishing sentences in a section that should be folded to the artifact is wasted work. After the plan is applied,
THEN run the sentence-level passes on what remains. On a page-limited paper, this pass is also what *buys* the space
a sentence-level readability pass needs (cut a TMI section → the core mechanism gets room to breathe).

## Honesty / scope caveats
- **Separate the two risk classes — they are NOT the same, and conflating them is what makes this pass timid.**
  (1) **Prose/TMI cutting** — deleting fat sentences, folding enumerations to the artifact, collapsing hedge-stacks,
  re-voicing academic sentences plainly — removes words that don't change what the reader believes. **LOW risk;
  apply it aggressively even the day of the deadline.** Timidity here IS the failure, not the safe choice.
  (2) **Skeleton surgery** — merging, reordering, or deleting whole sections — can destabilize a done paper. **THIS
  is the deadline judgment call:** propose it, get author sign-off, hold for camera-ready if unsure. Never let
  caution about (2) suppress (1) — a "hold big cuts for later" reflex applied to *prose* fat is exactly how a
  "feels fat" paper survives a tightening pass unchanged. Don't silently do (2); do (1) hard.
- "Fold to the artifact" only works if the artifact actually exists and can hold it — verify (ties to the
  availability check in \`harden-paper\`).
- Cutting changes claims by omission. Anything cut/folded still gets the claim-preservation diff (the \`claims\` row) — a
  removed hedge or caveat is a claim change.`,
});
