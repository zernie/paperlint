// Compiled to SKILL.md by `vigiles compile`. Edit THIS file, never the markdown.
//
// Adopted 2026-08-17 (batch 3). Body carried over VERBATIM so the compiled diff shows
// only what the compiler adds. No `disallowedTools` fence yet — the field landed on
// `SkillSpec` in vigiles branch `claude/skill-disallowed-tools` and is not in a release
// this repo installs, so writing one here would not compile.
import { experimental_skill } from "vigiles/spec";

export default experimental_skill({
  name: "paper-pipeline",
  description:
    "The orchestrator for writing a research paper end-to-end, from idea to accepted-and-extended, with every stage graded for the credit it earns a body of work. START HERE when writing/hardening a paper (AgenticDev, AISec, and future ones) and want the whole lifecycle driven, not one step. Routes to the stage skills — research-ideate, find-venue, plan-paper-timeline, build-benchmark, draft-paper, render-paper, verify-citations, the review skills, submit-paper (+ venue cards), camera-ready, extend-paper — and owns the shared references.",
  tools: [
    "Read",
    "Write",
    "Edit",
    "Grep",
    "Glob",
    "Bash",
    "WebSearch",
    "WebFetch",
    "Agent",
    "Skill",
  ],
  body: `
# paper-pipeline — the conductor for the whole organism

This is the entry point. Each lifecycle stage is its own skill; this routes through them in order and
owns the shared reference docs the others cite. **These papers are written to COUNT as credentials** —
every stage is graded against \`references/credit-criteria.md\`, not abstract "impact." The personal half
of that — who is filing what, and when — stays in the author's own private notes, never in a public repo.

## Shared references (single source of truth — all skills cite these)
- \`references/credit-criteria.md\` — which criteria a paper feeds; where venue quality bites; the
  decisions credit value forces on the pipeline.
- \`references/artifact-checklist.md\` — the self-checking reproduction artifact.
- \`references/anonymization.md\` — the double-blind deny-list + hygiene (and its reverse at camera-ready).
- \`references/writing-craft.md\` — how well-written papers read (craft rules + exemplar lessons + the
  gradeable 9-dim writing rubric); cited by \`draft-paper\`, \`grade-paper-writing\`, and \`harden-paper\`.
- \`references/review-ratchet.md\` — how to fix a caught overclaim (tighten → cut → Threats → hedge)
  and why every review round must be paid back with a \`tighten-paper\` pass; cited by
  \`paper-adversarial-review\`, \`pc-panel-review\`, \`harden-paper\`.
- \`references/pipeline-status-template.md\` — the per-paper **readiness scorecard** (which stages ran,
  grades, open findings, submit-ready verdict). Copied into \`<paper-dir>/PIPELINE-STATUS.md\`.
- \`references/acl-venue-rules.md\` — what holds at **every** ACL-family venue and workshop: the
  page-limit map, the appendix rule and the trap inside it, Limitations/Ethics as free-but-restricted
  space, anonymity, OpenReview mechanics. Fetch once, not per paper. Venue-specific facts stay in
  \`submit-paper/references/venues/<venue>.md\`. (No equivalent yet for ACM or IEEE — write one when
  the next paper goes there.)

## The readiness scorecard (which boxes are checked)
Stages run in subagents and report into chat, which evaporates — so "did everything run?" becomes
unanswerable. Fix: every paper carries a **\`<paper-dir>/PIPELINE-STATUS.md\`** (template in
\`references/pipeline-status-template.md\`), the durable colocated source-of-truth for *which stages ran,
their grade/result, what's open,* and a one-line **submit-ready verdict**. Rules:
- **When any stage runs (here or in a subagent), update its row in the same commit** — status, date,
  result, open findings, artifact link. The scorecard is only trustworthy if it's kept live.
- **Never inflate:** a stage not run *this* cycle is \`☐\`, even if a prior submission ran it — don't
  borrow credit you can't point to. Approximate/from-memory grades get \`≈\`.
- **"Is paper X ready / what's checked?"** = read this file (verdict + any \`☐\`/\`◐\`/\`⚠\` rows), don't
  reconstruct from chat.
- Distinct from \`SUBMIT-CHECKLIST.md\` (venue-format compliance); both must be green before upload.
- 🔴 **Enforcement leg (prose-isn't-policy), and it is a script, not a paragraph.**
  \`scripts/pipeline-check.mjs\` reads this file on every paper edit and reports the failures that
  actually happened on real papers: a CONTINUOUS check whose last run predates the current text, a GATE
  that ran without its required input, **a \`Requires\` cell that omits an edge the pipeline declares**
  (the canonical set is \`scripts/pipeline-edges.mjs\`, with the admitting sentence per edge), a study
  that ran with no stated claim, the \`access\` row not green inside the moderation window, and a verdict
  line that is just an accept probability. Run it directly
  with \`node .claude/skills/paper-pipeline/scripts/pipeline-check.mjs <paper-dir>\`; it is wired into
  \`.claude/hooks/paper-status-gates.sh\` and asserted in \`.claude/hooks/hooks.harness.mjs\`.
  **The grading itself stays judgment** (that is the skills' job) — only the mechanically checkable
  parts are compiled. *Added 2026-08-03, the day three hooks in this repo were found to have been dead
  for weeks: an advisory that is never exercised is indistinguishable from one that works.*

  🔴 **As of 2026-08-26, this file is read by TWO things.** Sixteen checks over it live as
  \`@eslint/markdown\` rules in \`eslint-rules/pipeline-status.mjs\` (run:
  \`npx eslint <paper-dir>/PIPELINE-STATUS.md\`; five of them are \`error\`), while
  \`scripts/pipeline-check.mjs\` holds six whose input lies OUTSIDE the file — git, the clock, the
  \`reviews/\` directory, \`process.env\`. The classification of all 22 lives in the
  author's private notes (\`<papers-root>/research/2026-08-26-klassifikatsiya-pipeline-check.md\`).

  ⚠️ The paragraph above lived for a day NOT HERE but directly in \`SKILL.md\` — i.e. in the
  generated file. The very first \`vigiles compile\` (27.08) ate it, and it was not a human who
  noticed but an agent whose compile had just erased someone else's edit. **An edit to \`SKILL.md\`
  without \`.spec.ts\` is an edit with an expiration date: the next compile.**

## 🗺️ Where every check actually runs — and where it can be walked around

\`\`\`
   YOU EDIT                    YOU COMMIT                YOU BUILD              YOU PUSH
      │                            │                         │                      │
      ▼                            ▼                         ▼                      ▼
 ┌──────────────┐          ┌────────────────┐       ┌────────────────┐    ┌────────────────┐
 │ PostToolUse  │          │  .githooks/    │       │ build-         │    │ GitHub Actions │
 │ paper-lint   │ BLOCKS   │  pre-commit    │REFUSES│ submission.sh  │    │ paper-gates    │
 │  pre >55 wds │          │                │       │                │    │                │
 │ paper-lint   │ nudges   │  numbers gate  │       │  numbers gate  │REFUSES  numbers+self│
 │  post        │          │                │       │                │    │                 │
 │   prose-lint │          │  prose-lint    │ nudge │  page count    │    │  prose-lint     │
 │   SHAVE      │          │  self-test if  │       │  overfull      │    │  check-anon     │
 │   numbers    │          │   you touched  │       │  unresolved    │    │  verify-cites   │
 │  paper-edit- │ BLOCKS   │   a gate       │       │   refs         │    │  provenance     │
 │   guard      │  bash    │  harness if    │       │  dropped glyphs│    │  scorecard      │
 └──────────────┘          │   you touched  │       │  anon grep     │    │  harness        │
        │                  │   a hook       │       └────────────────┘    │  LaTeX build    │
        │                  │  RAW DNA       │REFUSES        │             └────────────────┘
        │                  └────────────────┘               │                     │
        │                          │                        │                     │
   watches EVENTS            watches STATE            watches OUTPUT        watches EVERYTHING
   (Edit/Write fired)        (what is staged)         (the actual PDF)       (after the fact)
        │                          │
        │                          │
   🕳 BYPASSABLE:              🛡 NOT bypassable by that route: it does not care
   write from Bash and            HOW the bytes got there. However you wrote the
   no event fires, so             file, you still have to commit it.
   every PostToolUse
   check silently
   does not run.
\`\`\`

**Read the bottom row, it is the whole point.** Each column watches a different KIND of thing, and
that is why they are not three copies of one check:

- **Editor hooks watch events.** Fast, and the only layer that can stop a bad edit *before* it lands.
  Bypassable by construction — an event that never fires cannot be checked, and writing the file from
  Bash produces no event. Documented in \`papers/CLAUDE.md\`, open since 2026-08-04.
- **The git hook watches state.** Immune to that whole class, because it reads what is staged and has
  no opinion about how it got staged. This is the layer that was missing, and the one to reach for
  when an editor check turns out to be walkable-around.
- **The build watches output.** Only it can see page count, overfull boxes, and glyphs pdflatex
  silently dropped — none of which exist until the PDF does.
- **CI watches everything, but after the fact.** Its real job is the slow checks nobody will wait for
  locally (the anonymity self-test copies a 24 MB bundle per leak category) and the self-tests, which
  are what catch a gate that has quietly stopped catching things.

🔴 **A fifth kind, and none of the four columns can see it: does the MODEL call these skills at all?**
Every column above watches something the repository produced — an event, staged bytes, a PDF, a commit.
None watches *selection*: whether a real model, reading 37 competing descriptions, picks \`tighten-paper\`
over \`grade-paper-writing\` when the draft is bloated. A harness test proves a skill works once invoked;
it cannot prove it gets invoked. That needs the real CLI and it costs money, so it is a measurement, not
a gate — \`.claude/skills/paper-pipeline/pipeline-firing.eval.mjs\`, run manually or by the weekly
\`skill-firing\` job (\`workflow_dispatch\` + \`schedule\`, deliberately NOT on push). It installs every skill
in this repo natively so selection is *competitive*, feeds each skill 4 prompts it should fire on plus 4
its colliding sibling owns, and reports recall / false-positive / precision per skill against a committed
baseline. **What it measures drifts without a commit here** — a model update can change routing while
every file stays byte-identical, which is exactly the regression no check in the diagram can see.
Prior art is named in the file header (\`adewale/skill-eval-harness\` does this too); the idea is not ours.

🔴 **Still manual, and no mechanism has been found for it:** the **cold read** — a reader with no
context restating each sentence — is the only check that catches a sentence that is short, true,
threshold-passing and meaningless. It needs a fresh subagent, so no hook can run it. What IS
mechanised is noticing that it is *overdue*: \`pipeline-check.mjs\` reports \`stale-cold-read\` when the
prose changed after the last one.

Install the git hook once per clone: \`git config core.hooksPath .githooks\`.

## 🔴 There is no stage 7. Four kinds of work, four shapes.

**This section replaced a single numbered list running 0 → 12, on 2026-08-03.** That list had a
paragraph on top explaining that the numbers were dependencies rather than turns — and underneath it,
a table numbered straight through, which every reader (including this pipeline's own author) read as a
waterfall. The paragraph was the tell: a document that needs a disclaimer explaining how not to read
it is mis-shaped, and the fix is to change the shape, not to add a second disclaimer. That is the
argument \`compile-rules-2026\` makes about instruction files, applied here.

Three concrete errors the numbering produced, all real:

- **\`verify-citations\` sat at 7**, looking like a one-shot step, while the project rule is that it runs
  every cycle — an edit on the last day adds a \`\\cite\` that "we checked last cycle" does not cover.
- **\`render-paper\` sat at 6**, as a stage. It is a command you run twenty times a day.
- **\`map-prior-work\` sat at 1.5** and its own description told you to re-run it as a cheap delta before
  submit — so it was simultaneously a stage and a continuous check, and the table could only show one.

Work is now grouped by **how it runs**, and only the groups that are genuinely ordered carry an order.

| kind | shape | how to read it |
|---|---|---|
| **SETUP** | ordered | Each genuinely gates the next. Runs once, before the study is malleable. |
| **LOOP** | unordered cycle | Draft ↔ study ↔ arc ↔ review. No numbers, because there are no turns. |
| **CONTINUOUS** | trigger table | Fires when the thing it checks changes. Never "done". |
| **GATES** | ordered by input | Late, expensive, each hard-blocked on a named input. |

---

## SETUP — once, before anything is expensive to change

Ordered, because each really does gate the next. Two pairs run in parallel; that is marked.

| Step | Skill | What it settles |
|---|---|---|
| **Orient** | — | Read \`<papers-root>/HANDOFF.md\` + \`<papers-root>/research/README.md\`. Never restart from scratch. |
| **Validate the idea** | **\`research-ideate\`** | Is it a reusable method (survives review) in your lane, and does it feed the credit criteria? Go/no-go + the MVP finding. |
| **Map the competition** ‖ | **\`map-prior-work\`** | 🔴 **Who already did this?** Multi-angle sweep; date each hit against your submission (5 months = prior, not concurrent); triage by which layer of your claim it threatens; deep-read the dangerous ones. Output: **what you can still claim** + a related-work skeleton. *Added 2026-07-27 after a five-month-older paper surfaced at T−10 days on a finished draft.* |
| **Pick the venue** ‖ | **\`find-venue\`** | Rank by credit-weight (peer-reviewed + indexed) × fit × accept-odds × deadline × remote. |
| **Learn the venue's bar** | **\`study-accepted-papers\`** | 🔴 **What does an ACCEPTED paper look like HERE?** Measure the venue's whole accepted volume, deep-read 8–12 of your contribution type, and extract what made them strong: evidence scale, figures, artifact release, how the abstract is built. File the venue card (\`submit-paper/references/venues/<venue>.md\`) and confirm family rules (\`references/acl-venue-rules.md\`). *Promoted to its own step 2026-08-03: on \`compile-rules-2026\` every judgement of the paper's quality — rubric, persona, simulated panel, accept probability — came from instruments this pipeline itself generated, with no external grounding, and the author had to say so at T−3 days. A closed loop optimises against its own model of a reviewer.* |
| 🔴 **Can you physically submit?** | **\`plan-paper-timeline\`** | **The step that owns the question no stage used to own.** Create the portal account NOW; drive the profile to **ACTIVE**, not "pending moderation"; confirm the form's fields and the artifact-hosting requirement. OpenReview moderation runs **up to two weeks**, and an author with no institutional email has no expedite route. Scorecard row \`access\`. *Added 2026-08-03, when this was the sole critical-path item on a finished paper at T−4 days: the science was done and there was nowhere to put it.* |
| **Schedule it** | **\`plan-paper-timeline\`** | Deadlines → calendar with buffers, in the author's own zone (AoE − 12h ≠ your clock). Space papers apart. |
| 🔴 **State the claim** | **\`argument-arc\`** (frame mode) | **One paragraph: what will this paper claim, and what would have to be true?** Before any run. The frame decides which results matter, and reframing after the data is collected is how experiments get thrown away — observed on \`compile-rules-2026\`, and the reason \`argument-arc\` has a rebuild mode at all. Costs a paragraph; saves a study. Scorecard row \`frame\`. |

## LOOP — iterates until it settles

No numbers. Nothing here happens once, and nothing here is "next".

\`\`\`
        study ──────────► draft
     build-benchmark    draft-paper
          ▲                 │
          │                 ▼
      argument-arc ◄──── the arc
     (rebuild mode)     5.5 verdict
\`\`\`

- **\`build-benchmark\`** — a design that inverts the pitfall; honest stats; a self-checking artifact
  (\`references/artifact-checklist.md\`).
- **\`draft-paper\`** — section skeleton + the accept-and-get-cited properties
  (\`references/writing-craft.md\`).
- **\`argument-arc\`** — 🔴 **does the draft carry the reader to ONE conclusion?** One sentence per
  section (*what does the reader now believe*), then a bottom-up pass asking whether each section makes
  the conclusion harder to escape. Owns **rebuild mode**: the only protocol here for *the frame is
  wrong, start the arc over*. Every other gate assumes a settled draft and patches it. *Added
  2026-07-30 after a full-day rewrite in which the author said five times that the paper threw ideas at
  him and got five local edits back.*

**Leaving the loop** means the arc holds and the numbers are in. Not that the prose is pretty — that
is what the gates are for.

## CONTINUOUS — fires when its input changes, never "done"

These have no position, because a position is what made them look finished. Each is a trigger.

| When this changes | Run | Why it cannot be a stage |
|---|---|---|
| any \`\\cite\` added or moved | **\`verify-citations\`** | An edit on the last day adds a citation the last run never saw. "We checked last cycle" does not count — the project rule, and it was numbered as a one-shot anyway. |
| a genuine sibling surfaces | **\`analyze-sibling-paper\`** | Deep-read, scoop/delta, saved in \`<paper-dir>/siblings/\`. |
| the contribution's framing moves | **\`map-prior-work\`** (delta mode) | A cheap re-sweep. ⚠️ If a rival first surfaces during citation checking, the SETUP sweep was skipped and you are reshaping the contribution under deadline. |
| any \`.tex\` / \`paper.md\` edit | **\`render-paper\`** + page count | **Not a stage — a command.** Render, then eyeball pages 1–2 before believing anything about the paper. 🔴 **Rendering is continuous; ACTING on the page count is not** — see the rule below. |
| the deadline approaches | the \`access\` row | Re-check that the profile is still ACTIVE and the portal still opens. External state rots without telling you. |

## GATES — late, expensive, each blocked on a named input

Ordered, and the order is real: every one refuses to run without the output of the one before it.

| Gate | Skill | Requires (hard) |
|---|---|---|
| **Structure** | **\`tighten-paper\`** | A rendered PDF and a page count. Produces the cut plan + structural verdict. *Before 2026-07-30 this appeared only INSIDE the harden stage — i.e. after the gate that requires it — so a literal reading sent you into a hard-blocked gate.* |
| **Writing craft** | **\`grade-paper-writing\`** | The current draft. Produces the **persona stall inventory**, which the panel cannot run without. |
| **Review decision** | **\`pc-panel-review\`** | 🔴 **Both of the above.** N independent lenses (incl. an artifact-runner that executes the artifact) + a chair meta-review — predicts the PC's accept/reject. Its venue-fit mode is the one-reviewer CFP-fit spot-check. |
| **Claim preservation** | Fable diff (\`claims\`) | The pre-pass baseline. Run after **every** aggressive rewrite, before committing. |
| **Harden** | **\`harden-paper\`** | The panel's verdict. Closes the desk-reject axes a reviewer-sim misses: threat-model, ethics/dual-use, page-fit, citability, double-blind hygiene, artifact-runs-clean. Its structure and writing axes are the **re-run/confirm** pass, not the first invocation. |
| **Submit** | **\`submit-paper\`** (+ the venue card) | 🔴 **The \`access\` row green.** Portal mechanics, PDF-only, artifact hosted anonymously, "ready for review" marked. |

## AFTER — only reachable by acceptance

**\`camera-ready\`** — de-anonymize; public repo + archival DOI; complete disclosure. Then
**\`extend-paper\`** — extend (≥30% new) to a higher-prestige venue, the "second, stronger publication."

**Which review skill?** \`paper-adversarial-review\` = one hostile reviewer, fast defect hunt;
\`pc-panel-review\` = the full panel + meta-review that makes the accept/reject **decision** (its
**venue-fit mode** is the one-reviewer CFP-fit spot-check — formerly the standalone \`venue-review-sim\`).
Use an atom for a quick spot-check; **run the panel for the decision.**

**Four grading axes — don't confuse them.** A draft is judged on four independent axes, each its own
skill: 🔴 **argument architecture** — does the whole thing carry the reader to one conclusion
(\`argument-arc\`, in the LOOP; the axis that failed on \`compile-rules-2026\` precisely because it was
nobody's) · **content strength** — does the contribution clear *this venue's* bar (\`study-accepted-papers\`,
mines the accepted corpus for Accept→Strong levers; in SETUP, before the prose is set) ·
**scientific defects** — what a hostile reviewer attacks (\`paper-adversarial-review\` / \`pc-panel-review\`)
· **writing craft** — does it read like a human wrote it (\`grade-paper-writing\`, the 9-dim rubric in
\`references/writing-craft.md\`; called by \`harden-paper\`). A paper can ace one and fail another — grade all four.
**The arc axis comes first**, because tightening length and polishing sentences inside a broken arc is
how a day disappears and the same paper ships.

**Panel vs harden — not rival gates, they're sequential.** \`pc-panel-review\` is the review DECISION
gate: it predicts what the PC does. \`harden-paper\` is the pre-submit ORCHESTRATOR: it *calls* the review
skills and then closes the desk-reject axes a reviewer-sim doesn't systematically hit (threat-model,
ethics/dual-use, page-fit, citability, double-blind hygiene). Order is **review (decide) → harden (close
every other axis) → submit** — neither is "the one final gate" alone.

## The review round (a cycle inside GATES)
Review → **apply the consensus fixes → re-run the panel to confirm**. The artifact-runner re-executes
the artifact each round. Stop when the panel converges to accept and the artifact reproduces clean —
**don't loop past one confirming round**, and don't chase the last notch into the deadline. A defensible
**Accept shipped on time beats a risky Strong that misses it**.

## 📝 Text pass vs evidence pass — two independent axes, ask which one you want

The author, 2026-08-05 (translated from Russian): *"can we just run the gate on the text? we just
checked the numbers, and now I want to grade the text — assume the numbers are fine."* He is right that these are separable, and
running both when only one is wanted burns an hour for nothing.

Every gate belongs to exactly one axis. **Sort by what invalidates it**, not by what it reads:

| axis | invalidated by | gates |
|---|---|---|
| **TEXT** — does the argument land? | a change to the **prose**: any edit, cut, reorder | \`structure\` tighten-paper · \`writing\` grade-paper-writing · \`arc\` argument-arc · the prose lenses of \`panel\` pc-panel-review |
| **EVIDENCE** — is it true? | a change to the **data, code, or artifact** | \`claims\` claim-preservation · \`cites\` verify-citations · \`artifact\` the artifact-runner lens · the numeric half of \`harden\` harden-paper |

**Why this matters more than it looks.** The two axes expire on completely different clocks. Rewriting
a paragraph invalidates every TEXT gate and no EVIDENCE gate. Re-running an experiment does the exact
reverse. Conflating them produces both classic wastes: re-verifying numbers nobody touched, and — worse
— trusting a readability verdict on prose that has since been rewritten.

**Text-only pass** (the common request, and the right default after a cut, a reorder, or a rewrite where
the numbers did not move): run \`structure\` and \`writing\` in parallel, then \`panel\` with its artifact lens **explicitly
disabled**, and hand each agent the sentence *"assume every number is correct and already verified — do
not re-derive anything; judge the writing, the structure and the argument."* Roughly halves the wall
clock and removes the single most expensive stage.

**Evidence-only pass** is the mirror: a new experiment landed, the prose around it is stable. Run \`claims\`
and the artifact-runner; skip readability entirely.

🔴 **State which pass you ran, in the scorecard row and in the reply.** A gate row that does not say
which axis it covered will be read as covering both — which is how a paper ends up believed to be
checked on a dimension nobody looked at.

### 🔢 The one defect neither axis can see: a number correct on both axes and wrong anyway

**Observed 2026-08-05, on page 1, 29 hours before a deadline.** The abstract read *"147 real rules
files exactly as their projects committed them, 22 fail admission"*. The data has two arms over the
same 147 files: **strict** (files byte-for-byte as committed — nothing fails) and **annotated** (the
same files with the tool's proposed pointers written in — 22 fail). The 22 was from the annotated arm
and was described in the strict arm's words. Five more numbers had the same defect; a sixth was found
later in an appendix by machine, after two people had searched by hand.

**Every gate passed, and each for a good reason.** \`cites\` checks the reference is real. \`claims\` checks the
claim did not grow — and it did not, 22 was always 22. The artifact-runner recomputes the number from
the data and it reconciles, *because the number is correct*. The reading panel takes "unmodified" as a
fact about the world, which is what a reader does. **The defect lives only in the join between a
sentence and a field path, and nothing was holding both.** It is not a TEXT defect and not an EVIDENCE
defect; it is a defect of the edge between them, so no pass on either axis can be made to see it.

**The construction, not another pass.** A registered quantity is not written as digits at all:

\`\`\`
Over {{corpus.n}} real rules files, with the extractor's proposed mapping
taken as if an author had written it, {{annotated.failedContradicted}} fail admission.
\`\`\`

\`<paper>/repro/numbers.tsv\` gives each name its value, the JSON path or **formula** that recomputes
it, and two guards. The build refuses a PDF unless: the name resolves · the value still matches the
data · the **paragraph** names the arm (\`requires\`) · the **sentence** does not claim a different one
(\`forbids\`). Requires and forbids are separate on purpose — the pairing is auditing's, where a control
is tested once for *design* and once for *operating effectiveness*.

**Why paragraph for one and sentence for the other.** *"Every figure in this paragraph is the
counterfactual arm"* is good writing, and a sentence-scoped \`requires\` would forbid it. But *"exactly
as committed"* nine words from the number is the defect itself, so \`forbids\` has to be tight.

**Coverage without a migration.** \`numbers-grandfathered.txt\` lists every quantity that predates the
gate; adding a new raw one fails the build. This is \`ADD CONSTRAINT ... NOT VALID\` — the constraint
binds every row from now on, and the existing rows are *enumerated rather than exempted*, so the file
says out loud how many figures still have no machine-checked path to data. On the paper that has it:
7 guarded, 248 grandfathered. That ratio is a finding, not a score.

**Adopting it in another paper:** copy \`repro/paper_numbers.py\`, \`repro/paper_numbers.selftest.py\` and
the three lines in \`md2submission.py\` that call \`expand()\`; generate the grandfather list from the
current draft; register the numbers a reviewer will actually check first. \`check-provenance.mjs\`
reports \`no-numbers-gate\` for any paper that has not.

🔴 **Do not write the substitution half — it is \`jinja2\`, and \`{{name}}\` is already its syntax.**
Eleven candidates were installed and run on a real markdown-source ACL paper on 2026-08-05. The
result is not a matter of taste:

| candidate | verdict, from an actual run |
|---|---|
| **jinja2** | **adopt.** Our \`{{annotated.failRate}}\` was already valid Jinja2; dotted names are attribute access. Zero characters changed in the paper, byte-identical \`.tex\`. This is Manubot's mechanism, taken without Manubot. Use \`StrictUndefined\`, and move the block/comment delimiters off \`{%\`/\`{#\` if the paper might ever quote a config file |
| **knitr** | equally proven, also byte-identical. Rejected only for putting an R runtime into an artifact that otherwise needs \`python3\` + \`pdflatex\` |
| \`\\newcommand\` + \`numbers.tex\` | works (1 line in the converter); the folk convention, ~12 GitHub hits, all hand-rolled. No package exists |
| **Quarto**, **pandoc lua filters** | ❌ **destroy the paper.** Markdown→markdown is a pandoc AST round-trip: HTML comments become raw blocks and \`[58]\` becomes \`\\[58\\]\`, so every citation renders as literal \`\\textbackslash{}[58]\`. 3,120 diff lines on the real source. No ACL format exists for Quarto either |
| **cog.py** | ❌ line-oriented; cannot substitute mid-sentence |
| **pythontex** | ❌ not in Ubuntu TeX Live at any level, not on PyPI; CTAN zip + \`.ins\` build |
| **showyourwork** | ❌ LaTeX-only, and it manages *figures*, not in-text numbers |
| **Pweave** | ❌ dead — the one candidate with a markdown native format, broken against modern IPython |
| DVC · datalad · papermill | orthogonal and **worth adding**: they pin the data file to the pipeline that made it, a layer below anything here |

**🔴 Computing the value DISSOLVES the freshness problem — do not build a checker for it.** With no
recorded value there is nothing that can go stale, so there is nothing to verify. Adopting jinja2
deleted 137 lines of ours outright: a hand-rolled expression language with an \`eval()\` sandbox, a
renderer guessing which of six formattings the paper meant, a JSON-path walker and the comparison.
Recording-plus-verifying is the trap; computing is the wheel.

**Binding a number to its CONDITION is genuinely unoccupied**, and the reason is structural rather
than an accident of packaging: **every literate-programming tool models the paper as a program that
prints text**, so the prose is opaque *output*, not an input to a check. None of them has a hook
where you could say "and the sentence around this must say *counterfactual* and must not say *as
committed*". The near-misses read the manuscript but never the data — \`statcheck\` recomputes
p-values from statistics printed in the same sentence; \`RegCheck\` compares a paper to a study
registration with an LLM and reports to a human instead of failing a build. Searched and empty:
GitHub repo search (0 results), the Actions marketplace, the pre-commit hook ecosystem, PyPI, and
the Claude skill marketplaces.

🔴 **And it is not a number-keyed table**: the first version keyed rules on the digits, and a paper
printing two unrelated 22s broke it the same hour. Key on the occurrence.

🔴 **Hand the gate to a red team the same day you build it.** This one was, and seven holes came
back, the worst being that the original defect could simply be **retyped as digits** — its value was
grandfathered, so the guard applied to the macro and not to the claim. Every hole is now a case in
\`repro/paper_numbers.selftest.py\` (18/18, including three that must stay **quiet** — a gate that
fires on ordinary writing gets muted, and then its silence reads as coverage).

## 🔴 The page limit is a SUBMISSION gate, not an EDIT gate

**Observed failure, \`compile-rules-2026\`, 2026-08-02/03.** The body oscillated 8 ↔ 9 pages for roughly
fifty iterations. Each time content went in, the page count read 9, and prose came out to get back to
8 — sixty characters at a time. Every individual cut looked harmless. Their sum is the unanimous 2/5
for clarity: the first compression took real repetition, the second had none left and took
transitions, antecedents and the conclusion's honest half. The structural pass named the arithmetic —
780 words of genuine repetition removed, then 880 words in and 480 out, leaving the paper 51 words
*heavier* than before the pass that cut 780.

**The rule.** Content work runs OVER the limit on purpose. Compression is **one pass, at the end**,
when the content has settled — with a whole-draft view, so it can move a section instead of shaving a
clause. Going over during drafting is not a problem to fix; it is the normal state of a paper that is
still growing.

**The trigger to catch yourself:** you just added something, ran the page count, saw it over, and
started looking for words to remove **in the section you were just editing**. That is the failure, in
progress. The page count is information for the end of the work, not an alarm during it. (The author's
own words on catching it, translated from Russian: *"you're cutting the text right away — dunno if that really needs doing immediately."*)

**What is still continuous:** rendering, and looking at pages 1–2. Seeing the number is fine. Acting
on it is what waits.

🔴 **Every round adds text; pay it back — in ONE pass.** Review is a ratchet — fixes are additive, so a
paper that survives three rounds is longer and denser than the one that entered them. On \`compile-rules-2026\` the
body oscillated 8 ↔ 9 pages for ~50 iterations, and the squeezing is what produced the unanimous 2/5 on
clarity: the first compression took real repetition, the second had none left and took transitions,
antecedents and the conclusion's honest half. After each round's fixes, run \`tighten-paper\` — and if the
page limit is binding, **move** rather than delete (Limitations and Ethics do not count toward ACL page
limits). The trap in that move is real and named in \`references/acl-venue-rules.md\`: relocating a caveat
while its flattering number stays in the body is exactly the asymmetry reviewers punish.

**Anti-churn ≠ skipping unrun gates.** "Don't loop past one confirming round" forbids *re-polishing prose
that already passed a gate* — it does NOT license *skipping a gate that never ran*. A \`☐\` row in
\`PIPELINE-STATUS.md\` for **study-accepted-papers, pc-panel-review, or full harden-paper** is an unrun
quality gate, not churn: **if capacity exists, run it before calling the paper done.** (This session
skipped those three under an "anti-churn" rationalization on a submitted paper; when the user forced them,
the pc-panel caught real must-fixes — a release overclaim and an unsupported number — that the skip would
have shipped.) Churn is re-touching FINE prose; a never-run gate is a hole. If a real
objection is out of scope, name it in Threats to Validity (adversarial reviewers read Threats first; an
honest limitation reads as strength).

**A \`☐\` in GATES is a hole. A \`☐\` in CONTINUOUS is worse** — it means the check exists, ran once, and
has been silently stale ever since. That is the shape of every failure this pipeline has actually had.

## ⏱️ What each stage actually costs — MEASURED, not estimated

The author, 2026-08-05, watching a run he could not size (translated from Russian): *"is it worth
writing the timing problem into the pipeline skill?"*. Yes — because the project already forbids guessing here. The rule in the papers tree's own \`CLAUDE.md\`
says an estimate must be decomposed into labour / calendar / result-risk / access and **spiked
rather than guessed**, and the same session it was written I still launched an experiment with no
upper bound and had to cut it four hours later.

Every number below is subagent **wall clock, measured on 2026-08-04/05** while finishing
\`compile-rules-2026\`. They are one machine, one paper, one day — treat them as an order of
magnitude, not a promise. Re-measure rather than inherit.

| stage | measured | note |
|---|--:|---|
| \`verify-citations\`, one reference | **3 min** | sonnet; a fetch and a comparison |
| \`verify-citations\`, eight references | **3 min** | the fetches parallelise; count barely matters |
| a single reconciliation ("do these two numbers agree?") | **4 min** | sonnet, over committed data |
| a second-rater pass over ~20 rows | **8 min** | opens every cited file |
| a process/mechanism research pass (docs + source + issue tracker) | **10 min** | |
| \`pc-panel-review\`, full panel + chair | **17 min** | unchanged for the confirming round |
| \`grade-paper-writing\` incl. the persona cold read | **20 min** | |
| bundling an experiment into the artifact + gate + re-zip | **24–39 min** | scales with directories, not bytes |
| a design/measurement **spike** (feasibility, a handful of cells) | **27 min** | |
| \`tighten-paper\` applied, with a loss letter | **34 min** | includes several build round-trips |
| \`harden-paper\` | **36 min** | the widest gate; it runs the artifact |
| **an experiment with real checkouts and installed dependencies** | **≈4 h for 143 cells** | median cell **76 s**; the outlier by an order of magnitude |

**What the shape tells you, which matters more than the rows.**

- **A full gate cycle — \`tighten\` → \`grade\` → \`panel\` — is about 1.2 hours.** That is cheap enough
  to run after any substantial edit, and there is no excuse for a stale gate on a paper you are
  still touching.
- **Reading, checking and reviewing are all minutes.** Anything whose cost is dominated by fetching,
  parsing or judging text lands in the 3–40 minute band regardless of how important it feels.
- 🔴 **Anything that installs dependencies and runs an agent inside a real checkout is hours, and
  that is the only class that is.** Its cost is *per cell*: rows × arms × seeds × ~76 s. Compute
  that product **before launching**, and say it out loud. 6 rows × 5 arms × 4 seeds = 120 cells ≈
  2.5 h; carrying the same design to 21 rows would have been ≈ 9 h.
- **Therefore: bound experiments by a cell budget, never by "run it and see".** Pick the number of
  rows from the time available, decide up front what a complete balanced design is, and stop at the
  last complete row. A design closed at six rows is a result; a design abandoned at eleven is a mess.

## Model policy (which model runs which stage)
Single home for the whole suite — stage skills point here instead of each re-deciding. Default:
- **Adversarial / red-team / verify a claim** → **Fable** (a separate model; never the author grading
  itself): \`paper-adversarial-review\`, \`pc-panel-review\` reviewers, \`harden-paper\` threat-model +
  citability red-team, disputed \`verify-citations\` verdicts.
- **Heavy generation / synthesis** → the session's main model (**Opus**): \`draft-paper\`,
  \`build-benchmark\` design, \`extend-paper\`, \`research-ideate\`.
- **Cheap bulk fetch / extraction** → **Haiku** (or Sonnet): \`study-accepted-papers\` corpus pull,
  \`plan-paper-timeline\`.
- **No model at all (mechanical)** → \`verify-citations\`'s \`../verify-citations/scripts/verify-cites.mjs\` reducer,
  \`harden-paper\`'s \`check-*.sh\` linters, \`render-paper\` toolchain.
- **Judge panels use DIVERSE models, not N copies of one** → \`grade-paper-writing\`, \`pc-panel-review\`:
  mix Opus + Fable + Sonnet so independent lenses catch what redundancy can't.

Override per call when a stage clearly needs otherwise; this is the default, not a straitjacket.

## Rules
- **Fable (a separate model) is always the reviewer** — never let the author grade itself.
- **Never fabricate** a citation, number, or result. Mark \`% VERIFY\` and check (\`verify-citations\`).
- **Commit + push after each stage**, keep the tree clean (resume-safe across \`/compact\`); update
  \`<papers-root>/research/README.md\` in the same commit as any new research file (its CLAUDE.md enforces this).
- **Two roles, never double-counted:** authoring = the *authorship* criterion; reviewing others at the
  venue (the organizer review-offer email) = the *judging* criterion — a separate credential.

## Provenance
Two real papers this session ran this pipeline end-to-end: **AgenticDev 2026 @ ASE** ("Measuring the
Wrong Number," ~90%, submitted #20) and **AISec 2026 @ ACM CCS** ("Safety Theater," Weak-Accept→~87–88%
after a panel round + confirm). The stage skills and shared refs are distilled from exactly those runs.`,
});
