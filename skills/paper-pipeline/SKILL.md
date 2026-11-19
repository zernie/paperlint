---
name: paper-pipeline
description: The orchestrator for writing a research paper end-to-end, from idea to accepted-and-extended. START HERE when writing/hardening a paper (AgenticDev, AISec, and future ones) and want the whole lifecycle driven, not one step. Routes to the stage skills — research-ideate, find-venue, plan-paper-timeline, build-benchmark, draft-paper, verify-citations, the review skills, submit-paper (+ venue cards), camera-ready, extend-paper — and owns the shared references.
allowed-tools: [Read, Write, Edit, Grep, Glob, Bash, WebSearch, WebFetch, Agent, Skill]
---

<!-- vigiles:sha256:e8c62571f7f8dd02 compiled from skills/paper-pipeline/SKILL.md.spec.ts -->

# paper-pipeline — the conductor for the whole organism

Editing the paper's text after an approved copy exists (`paperlint versions approve`): declare each change in `versions/<cycle>/changes.yaml`, `paperlint versions diff` shows what was lost (EXPERIMENTAL; `docs/rules/cycle/changes-since-approved.md`). With an approved copy, `submission … --save` refuses while the source differs from it; approve it first (the author does, never the agent).

This is the entry point. Each lifecycle stage is its own skill; this routes through them in order and
owns the shared reference docs the others cite.

## Shared references (single source of truth — all skills cite these)
- `references/artifact-checklist.md` — the self-checking reproduction artifact.
- `references/anonymization.md` — the double-blind deny-list + hygiene (and its reverse at camera-ready).
- `references/writing-craft.md` — how well-written papers read (craft rules);
  cited by `draft-paper`, `rewrite-unclear` and `tighten-paper`.
- `references/review-ratchet.md` — how to fix a caught overclaim (tighten → cut → Threats → hedge);
  cited by `pc-panel-review` and `harden-paper`.
- `references/pipeline-status-template.md` — the per-paper **readiness scorecard** (which stages ran,
  grades, open findings, submit-ready verdict). Copied into `<paper-dir>/PIPELINE-STATUS.md`.
- `references/acl-venue-rules.md` — what holds at **every** ACL-family venue and workshop: the
  page-limit map, the appendix rule and the trap inside it, Limitations/Ethics as free-but-restricted
  space, anonymity, OpenReview mechanics. Fetch once, not per paper. Venue-specific facts stay in the
  venue's card, `presets/<venue>.md` in the package. The ACM and IEEE templates have family cards
  beside their presets, `presets/acm-sigconf.md` and `presets/ieee-conference.md`.

## The readiness scorecard (which boxes are checked)
Stages run in subagents and report into chat, which evaporates — so "did everything run?" becomes
unanswerable. Fix: every paper carries a **`<paper-dir>/PIPELINE-STATUS.md`** (template in
`references/pipeline-status-template.md`), the durable colocated source-of-truth for *which stages ran,
their grade/result, what's open,* and a one-line **submit-ready verdict**. Rules:
- **When any stage runs (here or in a subagent), update its row in the same commit** — status, date,
  result, open findings, artifact link. The scorecard is only trustworthy if it's kept live.
- **Never inflate:** a stage not run *this* cycle is `☐`, even if a prior submission ran it — don't
  borrow credit you can't point to. Approximate/from-memory grades get `≈`.
- **"Is paper X ready / what's checked?"** = read this file (verdict + any `☐`/`◐`/`⚠` rows), don't
  reconstruct from chat.
- Distinct from `SUBMIT-CHECKLIST.md` (venue-format compliance); both must be green before upload.

## Four kinds of work, four shapes

Work is grouped by **how it runs**, and only the groups that are genuinely ordered carry an order.

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
| **Orient** | — | Read `<papers-root>/HANDOFF.md` + `<papers-root>/research/README.md`. Never restart from scratch. |
| **Validate the idea** | **`research-ideate`** | Is it a reusable method (survives review) in your lane? Go/no-go + the MVP finding. |
| **Map the competition** ‖ | **`map-prior-work`** | 🔴 **Who already did this?** Multi-angle sweep; date each hit against your submission (5 months = prior, not concurrent); triage by which layer of your claim it threatens; deep-read the dangerous ones. Output: **what you can still claim** + a related-work skeleton. *Added 2026-07-27 after a five-month-older paper surfaced at T−10 days on a finished draft.* |
| **Pick the venue** ‖ | **`find-venue`** | Rank by archival weight (peer-reviewed + indexed) × fit × accept-odds × deadline × remote. |
| **Learn what the venue rewards** | **`study-accepted-papers`** (mode A idea, B design) | 🔴 **What does this venue REWARD, before the study is designed?** The venue's award winners against its ordinary accepted papers over 5–7 years (plus award papers on the topic at other venues, labelled apart), coded for substance as well as form, written as **requirements for the study**: what the oracle under the headline is, which belief stated on record the claim targets, which factor is a column. The corpus goes to `<papers-root>/venues/<venue>/`, shared by every paper for that venue; the stage is row `venuebar`. **The same skill comes back once text exists** (mode C draft: the strong-accept scorecard, M1–M10, in `PIPELINE-STATUS.md`; mode D final: the abstract and introduction). The skill always asks which mode. Venue format facts go in its preset (`presets/<venue>.jsonc` in the package, or the project's own) and the venue card beside it (`presets/<venue>.md`); confirm family rules (`references/acl-venue-rules.md`). *Promoted to its own step 2026-08-03: every judgement of a paper's quality had come from instruments this pipeline itself generated, with no external grounding. Moved to modes on 2026-10-12 (#207): run only on a draft, its main findings arrived after they could change the design.* |
| 🔴 **Can you physically submit?** | **`plan-paper-timeline`** | **The step that owns the question no stage used to own.** Create the portal account NOW; drive the profile to **ACTIVE**, not "pending moderation"; confirm the form's fields and the artifact-hosting requirement. OpenReview moderation runs **up to two weeks**, and an author with no institutional email has no expedite route. Scorecard row `access`. *Added 2026-08-03, when this was the sole critical-path item on a finished paper at T−4 days: the science was done and there was nowhere to put it.* |
| **Schedule it** | **`plan-paper-timeline`** | Deadlines → calendar with buffers, in the author's own zone (AoE − 12h ≠ your clock). Space papers apart. |
| 🔴 **State the claim** | **`argument-arc`** (frame mode) | **One paragraph: what will this paper claim, and what would have to be true?** Before any run. The frame decides which results matter, and reframing after the data is collected is how experiments get thrown away — observed on `compile-rules-2026`, and the reason `argument-arc` has a rebuild mode at all. Costs a paragraph; saves a study. Scorecard row `frame`. |

## LOOP — iterates until it settles

No numbers. Nothing here happens once, and nothing here is "next".

```
        study ──────────► draft
     build-benchmark    draft-paper
          ▲                 │
          │                 ▼
      argument-arc ◄──── the arc
     (rebuild mode)     5.5 verdict
```

- **`build-benchmark`** — a design that inverts the pitfall; honest stats; a self-checking artifact
  (`references/artifact-checklist.md`).
- **`run-agent-grid`** — when the study is a grid of agent runs (units × arms × seeds, one agent CLI
  run per cell): the registry and the author's approval gate every counted run, a sandbox and secret
  probe, a smoke per model, a locked and resumable driver, an overlap audit, finished runs committed.
  Between the design and the analysis.
- **`label-agent-runs`** — when the runs are in and before any outcome number: a codebook fixed
  first, the automatic classifier only a pre-sort, every uncertain run read and labelled by hand, a
  blind second rater with its agreement, labels frozen after the analysis.
- **`build-label-page`** — when the study needs a person to label items (gold labels, a blind review):
  a phone page with a shared answer store, the answers exported into the study's `data/`.
- **`draft-paper`** — section skeleton + the accept-and-get-cited properties
  (`references/writing-craft.md`).
- **`argument-arc`** — 🔴 **does the draft carry the reader to ONE conclusion?** One sentence per
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
| any `\cite` added or moved | **`verify-citations`** | An edit on the last day adds a citation the last run never saw. "We checked last cycle" does not count — the project rule, and it was numbered as a one-shot anyway. |
| a genuine sibling surfaces | **`analyze-sibling-paper`** | Deep-read, scoop/delta, saved in `<paper-dir>/siblings/`. |
| the contribution's framing moves | **`map-prior-work`** (delta mode) | A cheap re-sweep. ⚠️ If a rival first surfaces during citation checking, the SETUP sweep was skipped and you are reshaping the contribution under deadline. |
| any `.tex` edit | `npx paperlint build` + the render gate (`docs/render.md` in the package), page count | **Not a stage — a command.** Build, then look at every page with a figure for what the log cannot flag (label collisions inside a figure, legibility, misaligned sub-figures) before believing anything about the paper; send the page images to the author with what changed since the last build. 🔴 **Rendering is continuous; ACTING on the page count is not** — see the rule below. |
| the deadline approaches | the `access` row | Re-check that the profile is still ACTIVE and the portal still opens. External state rots without telling you. |

## GATES — late, expensive, each blocked on a named input

Ordered, and the order is real: every one refuses to run without the output of the one before it.

| Gate | Skill | Requires (hard) |
|---|---|---|
| **Final review** | **`tighten-paper`** → **`cold-read-diff`** `--whole` → **`pc-panel-review`** | A rendered PDF and a page count. Once, in that order, then closed: the next section. Sentences the readers flag are rewritten by **`rewrite-unclear`**. |
| **Claim preservation** | Fable diff (`claims`) | The pre-pass baseline. Run after **every** aggressive rewrite, before committing. |
| **Harden** | **`harden-paper`** | The closed final review. The submit checklist: `npx paperlint lint`, then the items no rule decides (threat model and ethics, the artifact and its numbers, the headline table). It takes the final review's reports and does not run them again. |
| **Submit** | **`submit-paper`** (+ the venue card) | 🔴 **The `access` row green.** Portal mechanics, PDF-only, artifact hosted anonymously, "ready for review" marked. |

## AFTER — only reachable by acceptance

**`camera-ready`** — de-anonymize; public repo + archival DOI; complete disclosure. Then
**`extend-paper`** — extend (≥30% new) to a higher-prestige venue, the "second, stronger publication."

**Which review skill?** `pc-panel-review`: the full panel + meta-review predicts the accept/reject
**decision**, and a red-team request runs it (its hostile seat is Reviewer 2); the **venue-fit seat**
alone is a spot-check for a CFP-fit score.

**Four grading axes — don't confuse them.** A draft is judged on four independent axes, each its own
skill: 🔴 **argument architecture** — does the whole thing carry the reader to one conclusion
(`argument-arc`, in the LOOP; the axis that failed on `compile-rules-2026` precisely because it was
nobody's) · **content strength** — does the contribution clear *this venue's* bar (`study-accepted-papers`,
from the venue's own award winners: in SETUP as requirements for the study, and again on the draft as the strong-accept scorecard, M1–M10) ·
**scientific defects** — what a hostile reviewer attacks (`pc-panel-review`)
· **clarity** — can a reader with no context say what each sentence claims (`cold-read-diff`, in the
final review). A paper can ace one and fail another — check all four.
**The arc axis comes first**, because tightening length and polishing sentences inside a broken arc is
how a day disappears and the same paper ships.

**Panel vs harden — not rival gates, they're sequential.** `pc-panel-review` predicts what the PC does.
`harden-paper` is the submit checklist: the lint run, the final review's reports, and the few items no rule
decides. Order is
**final review → harden → submit**.

## The final review — once, in this order, then closed

The one place this order is written; every other skill points here.

1. **`tighten-paper`** — the structural verdict and the proposed cuts. It applies nothing.
2. **`cold-read-diff`** `--whole` — the whole paper in chunks of at most 15 paragraphs, two blind readers
   per chunk; no reader sees more than its chunk.
3. **`pc-panel-review`** — one panel, with the reports of steps 1–2 as its inputs.

- **Each pass runs once.** "No findings" from any of them is a valid result and ends that pass.
- **The author decides each finding once**, and the pass's report records it: `fixed`, `rejected`, or
  `waived by the author: <reason>`. Fixes are applied in one write: a sentence through
  `rewrite-unclear`, a cut on his yes. A decided finding is not raised again in this review.
- **Blockers** stop submission until `fixed` or `waived by the author: <reason>`; `rejected` is not
  open to them. Two kinds: a scientific must-fix in the panel's meta-review, and a readability
  hard-fail: a wall paragraph, a spec-sheet paragraph (numbers stacked with no reading of them), or a
  heading in coined jargon, whether `tighten-paper` or a cold read (`CANNOT PARSE`, `VAGUE HEADING`)
  found it.
- **At most one confirmation, and only when the author asks for it:** he names the pass, and it runs once
  on what changed. No pass schedules another, and none reruns because a score is low.
- **Then the review is closed,** whatever the scores; an undecided blocker stays open into the checklist.
  Mark the `panel` row of
  `PIPELINE-STATUS.md` `☑ closed <date>`. Ordinary edits, a re-approval (`versions approve`) and a
  gate older than the text do not reopen it; only the author does, by asking for a new final review.
  What is left goes to `harden-paper`, then `submit-paper`.
- **After close, a cold read of an edit runs only when the author asks.** No skill schedules one.

## 📝 Text pass vs evidence pass — two independent axes, ask which one you want

Every gate but one belongs to one axis. **Sort by what invalidates it**, not by what it reads:

| axis | invalidated by | gates |
|---|---|---|
| **TEXT** — does the argument land? | a change to the **prose**: any edit, cut, reorder (until the final review is closed) | `structure` tighten-paper · `coldread` cold-read-diff · `arc` argument-arc · the prose lenses of `panel` pc-panel-review |
| **EVIDENCE** — is it true? | a change to the **data, code, or artifact** | `cites` verify-citations · `artifact` the artifact-runner lens · the numeric half of `harden` harden-paper |
| **BOTH** — did a rewrite change a claim? | a **prose rewrite after its recorded result**, or a data change | `claims` claim-preservation |

**Why this matters more than it looks.** The two axes expire on completely different clocks. Rewriting
a paragraph invalidates every TEXT gate and `claims`, and no EVIDENCE gate. Re-running an experiment
invalidates the EVIDENCE gates and `claims`. Conflating them produces both classic wastes: re-verifying numbers nobody touched, and — worse
— trusting a readability verdict on prose that has since been rewritten.

**Text-only final review** (the numbers did not move since they were checked): run it with the panel's
artifact lens **explicitly disabled**, and hand each agent the sentence *"assume every number is correct and already verified — do
not re-derive anything; judge the writing, the structure and the argument."* Roughly halves the wall
clock and removes the single most expensive stage.

**Evidence-only pass** is the mirror: a new experiment landed, the prose around it is stable. Run `claims`
and the artifact-runner; skip readability entirely.

🔴 **State which pass you ran, in the scorecard row and in the reply.** A gate row that does not say
which axis it covered will be read as covering both — which is how a paper ends up believed to be
checked on a dimension nobody looked at.

### 🔢 The one defect neither axis can see

A number can be correct on both axes and still be described in the wrong arm's words (the 22 of the
annotated arm reported as "exactly as committed"). No pass on either axis sees it. Write a registered
quantity as a name (`{{corpus.n}}`, rendered with jinja2), not as digits, with a guard that the
paragraph names its arm and the sentence does not claim another. The construction, the tools tried
and the red-team holes: `docs/design/paper-pipeline-history.md` in the package.

## 🔴 The page limit is a SUBMISSION gate, not an EDIT gate

**The rule.** Content work runs OVER the limit on purpose. Compression is **one pass, at the end**,
when the content has settled — with a whole-draft view, so it can move a section instead of shaving a
clause. Going over during drafting is not a problem to fix; it is the normal state of a paper that is
still growing.

**The trigger to catch yourself:** you just added something, ran the page count, saw it over, and
started looking for words to remove **in the section you were just editing**. That is the failure, in
progress. The page count is information for the end of the work, not an alarm during it.

**What is still continuous:** rendering, and looking at pages 1–2. Seeing the number is fine. Acting
on it is what waits.

🔴 **Length is paid in ONE pass: the final review's `tighten-paper` step.** If the page limit is
binding, **move** rather than delete (Limitations and Ethics do not count toward ACL page
limits). The trap in that move is real and named in `references/acl-venue-rules.md`: relocating a caveat
while its flattering number stays in the body is exactly the asymmetry reviewers punish.

**A gate that never ran is a hole, not churn.** A `☐` `panel` or `harden` row means the final review
or the checklist has not run on this paper; it runs once. If a real
objection is out of scope, name it in Threats to Validity (adversarial reviewers read Threats first; an
honest limitation reads as strength).

**A `☐` in GATES is a hole. A `☐` in CONTINUOUS is worse** — it means the check exists, ran once, and
has been silently stale ever since. That is the shape of every failure this pipeline has actually had.

## ⏱️ What each stage costs

Measured wall clock per stage (one machine, one paper; re-measure rather than inherit): `docs/design/paper-pipeline-history.md` in the package.

**What the shape tells you, which matters more than the rows.**

- **The final review is measured in tens of minutes** (`tighten-paper` 34 min, `pc-panel-review` 17 min). It runs once, not after each edit.
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
  itself): `pc-panel-review` reviewers, disputed `verify-citations` verdicts.
- **Heavy generation / synthesis** → the session's main model (**Opus**): `draft-paper`,
  `build-benchmark` design, `extend-paper`, `research-ideate`.
- **Cheap bulk fetch / extraction** → **Haiku** (or Sonnet): `study-accepted-papers` corpus pull,
  `plan-paper-timeline`.
- **No model at all (mechanical)** → `verify-citations`'s `../verify-citations/scripts/verify-cites.mjs` reducer,
  `harden-paper`'s `check-*.sh` linters, `paperlint build`.
- **Judge panels use DIVERSE models, not N copies of one** → `pc-panel-review`:
  mix Opus + Fable + Sonnet so independent lenses catch what redundancy can't.

Override per call when a stage clearly needs otherwise; this is the default, not a straitjacket.

## Rules
- **Fable (a separate model) is always the reviewer** — never let the author grade itself.
- **Never fabricate** a citation, number, or result. Mark `% VERIFY` and check (`verify-citations`).
- **Commit + push after each stage**, keep the tree clean (resume-safe across `/compact`); update
  `<papers-root>/research/README.md` in the same commit as any new research file (its CLAUDE.md enforces this).
