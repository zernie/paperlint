# Author in the loop — the skills assist, the author decides

Status: **design only, nothing built.** Written 2026-10-11 against `main` at `b4a3dc3`. No skill,
hook or rule described below exists yet unless the text says it does; §1 is an audit of what the
skills do today, and everything after it is a proposal.

## 0. The problem, in one paragraph

paperlint is public, and so are its 25 skills. Read today, several of them describe a tool that
writes the paper and a human who is present: one says "it's time to WRITE the paper", one applies
cuts "directly", one "makes the submit/no-submit decision", one coins the paper's memorable phrase,
and one treats an author's objection as "the failure this section exists to catch". That is not how a paper using
paperlint is supposed to be made, and it is not how the skills should behave. **The author decides
and is the author; the skills research, check, measure and propose.** Concretely, the skills should:

1. stop at the moments where a decision belongs to the author, ask a specific question with options
   and a recommendation, and not go past it alone;
2. write proposals, not edits, for anything that changes what the paper claims or how it says it;
3. where a skill relies on a model's labels or judgements, first have the author answer a sample
   blind and report how far the model agrees with the author — the same validation a paper
   applies to its own instruments;
4. record every author decision as data in the paper folder, so the paper's history shows the
   human's choices.

### The class behind the individual defects

Two shapes recur across the audit below, and fixing them one sentence at a time would leave both in
place:

- **One word, two meanings.** In the skills, "the author" sometimes means the human ("Ask the author
  for it if there is any doubt", `argument-arc`) and sometimes the drafting model ("never let the
  author grade itself", `paper-pipeline`; "so it's not the author grading itself",
  `paper-adversarial-review`). A skill that calls the model "the author" will act like one.
- **No seam between a recommendation and its application.** A verdict and the edit that executes it
  are one step today (`tighten-paper`: "APPLY the prose/TMI cuts directly"; `harden-paper`:
  "find → fix → re-verify, don't just list"). There is no point in the flow where the author's
  choice is a required input, so nothing can check that it was made.

The patterns in §2 put the seam back, and §5 makes the seam checkable by a hook and a lint rule
rather than by prose — prose in a skill is the weakest rung of this repository's own ladder.

## 1. Audit — every decision the 25 skills make

Legend.
**Today:** _decides_ — the skill makes the call and acts on it · _asks_ — it already stops for the
author · _silent_ — the skill does not say who decides, so the model does.
**Should be:** _author decides_ — the author chooses; the skill recommends · _author confirms_ —
the skill proposes one option, the author says yes or no · _tool decides, logged_ — mechanical or
low-stakes; the skill acts and records what it did.

### 1.1 The ten calls the skills make today that belong to the author

Ranked by how much of the paper each one decides, times how often the skill runs (frequency is
taken from each skill's own trigger text — "after every prose edit", "once, before any drafting" —
not from measured usage, which this repository does not have).

| #   | skill                                      | decision                                                                                                                                                         | today                                                                                                                           | should be                                                                                        |
| --- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 1   | `tighten-paper`                            | which sentences, paragraphs and sections leave the paper                                                                                                         | decides — "the default verdict for a sentence is DELETE", "APPLY the prose/TMI cuts directly"                                   | author decides, on proposals (P2); skeleton surgery stays author confirms, as today              |
| 2   | `pc-panel-review`                          | which reviewer findings get fixed, and whether a deadline justifies not fixing one                                                                               | decides — "Consensus must-fixes … apply before submitting"; an author citing the deadline against a TEXT prong is "the failure" | author decides per finding (P1); the skill states its disagreement once and records it (P4)      |
| 3   | `harden-paper`                             | how strong each claim is (softening absolutes, rewriting the delta), which references to drop for page fit, and whether to submit                                | decides — "find → fix → re-verify", "Soften to …", "Trim the reference list", "makes the submit/no-submit decision"             | author decides (P1, P2); mechanical gates stay tool decides, logged                              |
| 4   | `harden-paper` (axis 11)                   | the paper's coined handle, its one quotable statistic, the "first taxonomy / benchmark of X" framing, a line of dry humour                                       | decides — the levers are "landed" and reported                                                                                  | author decides from offered candidates (P1)                                                      |
| 5   | `draft-paper`                              | the paper's prose: contributions list, "What we do NOT claim", threats framing, the one stat that travels                                                        | decides — "it's time to WRITE the paper"; the skill is "the generative counterpart"                                             | author decides; the skill proposes sections from the author's recorded claims (P2, P4)           |
| 6   | `argument-arc` (frame) + `build-benchmark` | the stated claim the study is designed around                                                                                                                    | silent on who writes the `frame` row; `build-benchmark` proceeds on any non-empty `frame`                                       | author decides; `build-benchmark` refuses unless the frame is an author decision in the log (P4) |
| 7   | `research-ideate`                          | go / no-go on the idea, and the "sharpest framing" sentence that seeds the draft                                                                                 | decides — "Returns a go / no-go verdict"; the framing sentence "is the seed for `draft-paper`"                                  | author decides from a recommendation and 2–3 candidate framings (P1)                             |
| 8   | `grade-paper-writing`, `cold-read-diff`    | the rewrite of each flagged sentence; whether a rewrite preserved the claim                                                                                      | decides — "Apply the fixes"; claim preservation is judged by a second model only                                                | author decides on proposals (P2); the claims diff is shown to the author with the proposal       |
| 9   | `study-accepted-papers`                    | the 3–5 "findings that change decisions while writing", incl. "what NOT to do", written into the paper's agent instructions; the per-paper "what made it strong" | decides — written into `<paper-dir>/CLAUDE.md`, which loads into every later session; model judgements used as data unvalidated | author confirms the steering lines (P1); author sample on the per-paper judgements (P3)          |
| 10  | `camera-ready`, `osf-artifact-upload`      | folding in meta-review comments; the author block and acknowledgements; publishing the repository, minting a DOI, replacing the reviewer-visible artifact        | decides — "Do those edits now, not 'later'"; `osf-artifact-upload` pushes a new artifact version with no confirmation step      | author decides per comment; author confirms every outward act (P1), recorded by the harness (P4) |

### 1.2 The full table, skill by skill

| skill                      | decision                                                                    | today                                                                | should be                                 | why                                                                                                         |
| -------------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `paper-pipeline`           | which stage or skill runs next                                              | decides ("want the whole lifecycle driven")                          | tool decides, logged                      | routing is reversible and cheap; crossing into `submit-paper` is not, and is gated there                    |
| `paper-pipeline`           | apply the panel's consensus fixes, then re-run                              | decides                                                              | author decides per fix                    | same decision as `pc-panel-review`; one owner (P1 lives there, the pipeline points at it)                   |
| `paper-pipeline`           | ship a defensible Accept now vs keep improving                              | decides ("A defensible Accept shipped on time beats a risky Strong") | author decides                            | a trade between the author's time, risk and ambition; the skill can recommend                               |
| `paper-pipeline`           | text pass vs evidence pass                                                  | asks ("ask which one you want")                                      | author decides                            | already right; keep                                                                                         |
| `paper-pipeline`           | commit and push after each stage                                            | decides                                                              | tool decides, logged                      | mechanical and reversible                                                                                   |
| `paper-status`             | the single next action — "If it is mine, it is already started"             | decides                                                              | author confirms                           | contradicts the same skill's "Do not fix anything while reporting"; a status turn reports, the author picks |
| `research-ideate`          | go / no-go                                                                  | decides                                                              | author decides                            | whether to spend months on an idea is the author's call                                                     |
| `research-ideate`          | the sharpest framing (the contribution sentence)                            | decides                                                              | author decides                            | it becomes the paper's thesis; offer 2–3, the author picks or writes their own                              |
| `research-ideate`          | the research lane, the MVP finding, the minimum severity that suffices      | decides                                                              | author confirms                           | judgements about the author's own line of work                                                              |
| `map-prior-work`           | the claim sentence "We are first to ___" (step 1)                           | silent                                                               | author decides                            | the claim is the author's; the skill can split it into layers                                               |
| `map-prior-work`           | triage of each rival (SCOOPED / OVERLAP / ADJACENT / IRRELEVANT)            | decides                                                              | tool decides, logged + author sample (P3) | model labels that move a claim need an agreement figure before they do                                      |
| `map-prior-work`           | prior vs concurrent                                                         | decides, from dates                                                  | tool decides, logged                      | a date fact, as the skill already says                                                                      |
| `map-prior-work`           | HOLDS / HOLDS NARROWED with a replacement sentence "ready to paste"         | decides the wording                                                  | author decides (P2)                       | narrowing a claim is a change of claim                                                                      |
| `map-prior-work`           | "Do not delegate the claim decision. A subagent maps; you decide"           | silent — "you" is the orchestrating model                            | author decides                            | the right rule addressed to the wrong party                                                                 |
| `analyze-sibling-paper`    | is our delta real or cosmetic (judged by an adversarial model)              | decides                                                              | author confirms                           | the author sees the steelmanned scoop and the model's verdict, then decides                                 |
| `analyze-sibling-paper`    | MUST CITE / SHOULD CONSIDER / NOT RELEVANT per reference                    | decides                                                              | author confirms (MUST CITE); P3 when many | adding a citation is the author's statement about the field                                                 |
| `analyze-sibling-paper`    | the positioning clause, or an escalation                                    | decides ("the exact clause … to apply")                              | author decides (P2)                       | an escalation reshapes the contribution                                                                     |
| `sweep-design-space`       | the defect state and the hard filters, written before generating            | decides                                                              | author confirms                           | the filters decide which designs die; two minutes to read                                                   |
| `sweep-design-space`       | which surviving candidate is recommended                                    | decides                                                              | author decides                            | retirement reasons are already recorded — a precedent for P4                                                |
| `find-venue`               | keep or switch venue                                                        | recommends, then "an explicit keep or switch verdict"                | author decides                            | where a paper goes is the author's choice                                                                   |
| `find-venue`               | the ranking weights (prestige, remote attendance, odds, feasibility)        | silent                                                               | author confirms                           | the weights are the author's preferences, not facts                                                         |
| `find-venue`               | writing `extends` / `kind` into `paperlint.json`                            | silent                                                               | author confirms                           | follows from the venue decision; one question                                                               |
| `study-accepted-papers`    | which 8–12 papers are deep-read                                             | decides                                                              | tool decides, logged                      | selection rule is stated; the log keeps it reviewable                                                       |
| `study-accepted-papers`    | "what made it strong", per paper                                            | decides                                                              | P3 on 3 papers                            | model judgements used as the venue's bar                                                                    |
| `study-accepted-papers`    | which levers to take; CHEAP / EXPENSIVE; deferring to an extension          | decides                                                              | author decides                            | spending effort before a deadline is the author's trade                                                     |
| `study-accepted-papers`    | the steering lines in `<paper-dir>/CLAUDE.md`                               | decides                                                              | author confirms                           | they load into every later session and steer all writing                                                    |
| `plan-paper-timeline`      | creating calendar events                                                    | decides                                                              | author confirms                           | it writes to the author's own calendar                                                                      |
| `plan-paper-timeline`      | the spacing rule: which paper to delay or extend                            | decides                                                              | author decides                            | depends on plans the skill cannot see                                                                       |
| `plan-paper-timeline`      | submit-day = one day before the printed AoE date                            | decides                                                              | tool decides, logged                      | a safe default the author can override                                                                      |
| `build-benchmark`          | refuses to design without a `frame`                                         | asks (a hard refusal)                                                | keep, keyed on the decision log           | the refusal is right; a non-empty row is not proof the author wrote it                                      |
| `build-benchmark`          | the study design: arms, tools, trial counts                                 | decides                                                              | author confirms                           | the design is the paper's method                                                                            |
| `build-benchmark`          | the statistical test and correction                                         | decides                                                              | tool decides, logged                      | methodological defaults; a deviation is put to the author                                                   |
| `build-benchmark`          | labels, codes or transcriptions a model produces over the corpus            | silent                                                               | P3                                        | the paper's numbers rest on them                                                                            |
| `build-benchmark`          | narrowing the claimed population when one source exceeds ~50%               | decides                                                              | author decides                            | a change of claim                                                                                           |
| `argument-arc`             | the frame paragraph (frame mode)                                            | silent                                                               | author decides                            | the claim the study is built around; the skill can draft candidates                                         |
| `argument-arc`             | the one-sentence conclusion "in the author's own words"                     | asks, "if there is any doubt"                                        | author decides, always                    | the condition makes the model the judge of when to ask                                                      |
| `argument-arc`             | which sections merge, move, die                                             | asks ("Show the outline to the author BEFORE editing anything")      | author confirms                           | already right; the model for P1                                                                             |
| `draft-paper`              | all section prose                                                           | decides                                                              | author decides (P2)                       | the author writes or adopts the text                                                                        |
| `draft-paper`              | the contributions list; "What we do NOT claim"                              | decides                                                              | author decides                            | these are the claims                                                                                        |
| `draft-paper`              | naming real systems or maintainers (ethics)                                 | silent                                                               | author decides                            | a disclosure decision                                                                                       |
| `cold-read-diff`           | applying the rewrites (step 5)                                              | decides                                                              | author decides (P2)                       | prose and meaning                                                                                           |
| `cold-read-diff`           | marking a finding `wontfix`                                                 | silent                                                               | author decides, logged                    | `review/frontmatter` already has the field; who set it is not recorded                                      |
| `render-paper`             | typesetting fixes for overfull boxes (`\seqsplit`, `p{}` columns, `\small`) | decides                                                              | tool decides, logged                      | typesetting, not content — but `\small` can touch format rules, so it is logged                             |
| `render-paper`             | preamble workarounds (`\microtypesetup{expansion=false}`)                   | decides                                                              | tool decides, logged                      | mechanical                                                                                                  |
| `tighten-paper`            | prose and TMI cuts                                                          | decides ("Apply it — don't defer it")                                | author decides (P2)                       | cutting changes claims by omission, as the skill itself says                                                |
| `tighten-paper`            | skeleton surgery (merge, reorder, delete sections)                          | asks ("propose it, get author sign-off")                             | author confirms                           | already right                                                                                               |
| `tighten-paper`            | declining the pass while the author is still adding material                | decides                                                              | author confirms                           | the skill should say "not yet" and let the author overrule                                                  |
| `tighten-paper`            | the `score:` / `verdict:` comments written above every heading              | decides                                                              | tool decides, logged + P3 on the scale    | comments never reach the PDF; the 0–10 scale is calibrated against the author on a sample                   |
| `grade-paper-writing`      | the scores                                                                  | decides                                                              | tool decides, logged                      | an assessment, not an edit                                                                                  |
| `grade-paper-writing`      | sentence rewrites, register rewrites (3a), avoid-list swaps                 | decides (a "fix pass works straight off it")                         | author decides (P2)                       | prose and meaning                                                                                           |
| `grade-paper-writing`      | WORST-SECTION: "a fix for it, or a recorded decision to ship with it"       | asks, partly                                                         | author decides, logged                    | already names an author decision; P4 gives it a place                                                       |
| `grade-paper-writing`      | claim preservation after a rewrite                                          | decides (a second model's diff)                                      | author confirms                           | a model checking a model is the self-grading shape the suite names elsewhere                                |
| `paper-adversarial-review` | scorecard, verdict leaning, what to cut and add                             | recommends (no `Edit` in its tools)                                  | tool decides, logged                      | already proposal-only                                                                                       |
| `pc-panel-review`          | accept probability, the min / median / max                                  | decides                                                              | tool decides, logged                      | an assessment                                                                                               |
| `pc-panel-review`          | consensus must-fixes; single-reviewer flags "fix if cheap"                  | decides                                                              | author decides                            | each fix changes the paper                                                                                  |
| `pc-panel-review`          | the ceiling plan's TEXT / EXPERIMENT / IMMOVABLE labels                     | decides, and treats an author's deadline objection as the failure    | author decides, the skill argues once     | the labels are useful; overriding the author is not                                                         |
| `harden-paper`             | applying `tighten-paper`'s plan before any sentence work (axis 0)           | decides                                                              | author confirms                           | same as `tighten-paper`                                                                                     |
| `harden-paper`             | softening absolutes, rewriting the delta (axes 2, 3)                        | decides                                                              | author decides (P2)                       | claim strength                                                                                              |
| `harden-paper`             | dropping a citation that cannot be verified                                 | decides                                                              | author confirms                           | removing a source can change a claim's support                                                              |
| `harden-paper`             | citability levers (axis 11)                                                 | decides                                                              | author decides                            | the paper's voice and the phrase others will quote                                                          |
| `harden-paper`             | trimming references for page fit                                            | decides                                                              | author decides                            | who gets credited                                                                                           |
| `harden-paper`             | the ready / not-ready verdict                                               | decides ("makes the submit/no-submit decision")                      | author decides; the skill reports gates   | the vector of gates is the skill's; submitting is the author's                                              |
| `harden-paper`             | de-anonymization, page fit, template checks                                 | decides                                                              | tool decides, logged                      | mechanical                                                                                                  |
| `harden-paper`             | "items only the author can close"                                           | asks                                                                 | author decides                            | already right; keep                                                                                         |
| `verify-citations`         | `% VERIFY` markers; correcting `.bib` metadata to the registry's record     | decides                                                              | tool decides, logged                      | facts from an authority; the diff is shown                                                                  |
| `verify-citations`         | "If a claim needs support you don't have … soften the claim"                | decides                                                              | author decides                            | claim strength                                                                                              |
| `verify-citations`         | the delta sentence; the one obviously-expected citation                     | decides                                                              | author decides (P2)                       | positioning against a neighbour                                                                             |
| `verify-citations`         | "says what you attribute to it"                                             | decides                                                              | P3 on a sample of cites                   | a model judging faithfulness                                                                                |
| `submit-paper`             | the last look at the exact PDF before upload                                | asks ("Upload once they say they have looked")                       | author confirms, logged                   | already right; not recorded                                                                                 |
| `submit-paper`             | form values: affiliation, country, conflicts ("usually checks none")        | decides (prescribes values)                                          | author decides                            | personal and legal declarations                                                                             |
| `submit-paper`             | hosting the artifact; marking "ready for review"                            | decides                                                              | author confirms                           | outward, seen by reviewers                                                                                  |
| `submit-paper`             | freezing the uploaded PDF in `versions/`                                    | decides                                                              | tool decides, logged                      | mechanical, already enforced by a rule                                                                      |
| `submission-portal`        | `--save` to the real submission                                             | asks ("never run it without the author's explicit yes")              | author confirms, recorded by the harness  | the strongest checkpoint in the suite; the yes is not recorded anywhere                                     |
| `osf-artifact-upload`      | pushing a new artifact version                                              | decides                                                              | author confirms                           | replaces what reviewers download                                                                            |
| `camera-ready`             | folding in meta-review comments                                             | decides ("Do those edits now")                                       | author decides per comment                | each one changes the paper                                                                                  |
| `camera-ready`             | author block, acknowledgements, funding                                     | decides                                                              | author decides                            | personal facts                                                                                              |
| `camera-ready`             | disclosure to maintainers, publishing the repository, minting the DOI       | decides                                                              | author decides, then confirms each act    | outward and irreversible                                                                                    |
| `camera-ready`             | the last look at the final PDF                                              | asks                                                                 | author confirms, logged                   | already right                                                                                               |
| `extend-paper`             | which ≥30% is new; the upgrade venue; the timing                            | decides ("Pick the axis")                                            | author decides                            | the next paper's contribution                                                                               |

**Where the suite already asks**, and is the model the patterns copy: `submission-portal` (dry run,
then an explicit yes, never `--save` without it), `argument-arc` step 5 (the outline before any
edit), `tighten-paper` (sign-off for skeleton surgery), `submit-paper` §5 and `camera-ready` §5 (the
author looks at the exact PDF first), `harden-paper`'s list of items only the author can close,
`paper-pipeline`'s text-pass vs evidence-pass question, and in the record formats: a `cycles`
override in `paperlint.json` needs a reason and evidence, and a review finding can be `wontfix`.
None of these records **who** decided or **what was offered**.

## 2. Four patterns

Four, not more: each answers a different question, and none can be expressed as another.

| pattern                      | the question it answers                                       |
| ---------------------------- | ------------------------------------------------------------- |
| P1 author checkpoint         | may the skill go on?                                          |
| P2 proposal, not edit        | what changes in the paper's text?                             |
| P3 independent author sample | may a model's labels stand in for the author's?               |
| P4 decision log              | what did the author decide, when, and what were they offered? |

### P1 — Author checkpoint

**When it applies.** Every row marked _author decides_ or _author confirms_ in §1. Three kinds:

- **claim** — anything that sets or changes what the paper claims or how strongly: the frame, the
  contribution sentence, a narrowed claim, an escalation after a scoop, softening an absolute;
- **direction** — go / no-go, venue, which levers or fixes to take, ship now vs improve;
- **outward act** — anything others will see or that cannot be taken back: `submission update
--save`, an artifact upload, a calendar event, a public repository, a DOI, an email to maintainers.

**The interaction.**

1. The skill stops and asks **one specific question**, through Claude Code's question tool
   (`AskUserQuestion`), never as a line buried in a long reply.
2. It offers **two to four options**, each with what it costs, and marks **one as recommended with
   the reason**. "Decline" or "something else" is always one of them.
3. For an outward act, the options carry the exact artifact: the PDF's sha256, the file list, the
   event's date and zone.
4. It **does not proceed** until the answer comes. No answer in the turn ends the turn with the
   question open and the paper unchanged.
5. If the author picks against the recommendation, the skill says once what that costs, records it
   (P4), and follows the author. It does not ask again in the same run.

**What gets recorded.** The question, the options with the recommended one marked, the answer, the
time, and the skill — one P4 record per checkpoint.

**Cost to the author.** 30 seconds to two minutes per checkpoint. Budget: at most three checkpoints
per skill run; related questions are asked together. A skill that needs more is asking about things
that should be _tool decides, logged_.

**A constraint to design around.** Seven skills run as a forked subagent (`context: fork`:
`analyze-sibling-paper`, `build-benchmark`, `cold-read-diff`, `map-prior-work`,
`paper-adversarial-review`, `study-accepted-papers`, `sweep-design-space`). The design assumes a forked
skill **cannot** ask the author mid-run — unverified; it is the first thing the spike in §5 measures.
A forked skill therefore ends with its open decisions as a list, and the main thread asks them.

### P2 — Proposal, not edit

**When it applies.** Any change to the paper's prose that is not mechanical: rewrites from
`grade-paper-writing` and `cold-read-diff`, cuts from `tighten-paper`, claim and delta rewrites from
`harden-paper`, `map-prior-work` and `analyze-sibling-paper`, section text from `draft-paper`,
meta-review fixes in `camera-ready`.

**Where mechanical edits stay fine** — _tool decides, logged_, applied directly and listed in the
log: `paperlint lint --fix` (three rules), typesetting fixes that change no words, `% VERIFY`
markers, `.bib` fields corrected to the registry's record, the anonymization class options, and the
skills' own `%` working comments (`% TIGHTEN …`), which never reach the PDF. The test for "mechanical":
**would the paper's reader see a different claim, a different sentence, or a different credit?** If
yes, it is a proposal.

**The interaction.**

1. The skill writes the change as a patch, one hunk per independent proposal, to
   `<paper>/proposals/<date>-<skill>-<n>.patch`, each hunk with a one-line reason and the finding it
   answers (stall class, reviewer, rule).
2. For every hunk that touches a sentence holding a number, a citation or a hedge, the skill shows
   the claims-preservation result next to it — number kept, hedge kept, claim neither softened nor
   strengthened — so the author judges the proposal and the check together.
3. The author accepts, rejects or edits each hunk; whole sections can be accepted at once.
4. The skill applies only the accepted hunks (`git apply` on the accepted set) and re-runs what the
   change invalidates (`cold-read-diff` on the result, the build).

`tighten-paper`'s posture survives intact: the **proposal** stays aggressive ("Burden of proof is on
the words"), and the author makes the cut. Timidity in what is proposed is still the failure the
skill names; applying without the author is the failure this document names.

**What gets recorded.** Per hunk: accepted, rejected or edited, and the hunk's id and file — one P4
record per batch, listing the hunks.

**Cost to the author.** 20–40 seconds a hunk. A full `tighten-paper` pass with 30 proposals is about
10–15 minutes, about 5 with section-level acceptance. The repository's own measurement puts the
pass itself at 34 minutes of model time (`paper-pipeline`, "What each stage actually costs").

### P3 — Independent author sample

This is the same check a paper using paperlint is expected to make when it relies on a model's
judgement: before the model's output is used, compare it with a human's on a sample the human
labelled without seeing the model's answers.

**When it applies.** Whenever a skill uses a model's labels or judgements as data, or as the basis for
a claim:

| skill                   | the model's output                              | default k                 |
| ----------------------- | ----------------------------------------------- | ------------------------- |
| `build-benchmark`       | labels, codes or transcriptions over a corpus   | 30 items                  |
| `map-prior-work`        | rival triage (SCOOPED / OVERLAP / ADJACENT / …) | 10 candidates             |
| `study-accepted-papers` | "what made it strong" per accepted paper        | 3 papers                  |
| `verify-citations`      | "says what you attribute to it"                 | 10 citations              |
| `tighten-paper`         | the 0–10 `score:` per section                   | 5 sections                |
| `grade-paper-writing`   | stall classes on a section                      | 1 section (its sentences) |

**The interaction.**

1. **The author sets the threshold first** (P1, recorded): for example, "the lower bound of the 95%
   interval on agreement is at least 0.8". It is set before any label is seen, so the result cannot
   move it.
2. The skill draws k items at random from the population (stratified when the model's labels are
   unbalanced), records the seed, N and k, and writes `<paper>/agreement/<id>/sample.csv` with the
   items and an **empty** label column. The model's labels go to `model.csv`, which the skill does
   not show or quote until the author has finished.
3. The author labels the sample, in a file or in batches of questions, in randomized order.
4. The skill computes and shows: **percent agreement with a Wilson 95% interval** as the headline;
   **Cohen's κ** (nominal), weighted κ or Krippendorff's α (ordinal or multi-label), with a bootstrap
   interval, as the second number — and names the prevalence effect when classes are unbalanced,
   where κ can be low while agreement is high; the confusion matrix; and **every disagreement**,
   item by item.
5. The author adjudicates each disagreement (whose label was right, and why), recorded.
6. Only then: if the threshold holds, the model's labels are used, and the figure goes into the paper.
   If it does not, the options are put to the author (P1): revise the prompt or codebook and draw a
   **fresh** sample — never re-score the old one — label everything by hand, or drop the claim that
   depends on it.

**What goes into the paper.** The agreement figure, its interval, k and N, computed from the files by
the artifact and registered as a quantity in `repro/numbers.tsv`, so the sentence in the method
section cannot drift from the data (`paper-pipeline`, "a number correct on both axes and wrong
anyway"). For example: _"The first author labelled a random sample of 30 of the 412 items without
seeing the model's labels; the model agreed on 27 (90%, 95% CI 74–97%; κ = …)."_

**What it validates — and what it does not.** It validates **delegating** to the model: that the
model labels as this author would. It does **not** establish the construct's reliability: the author
wrote the codebook, and `build-benchmark` already says that agreement with the person who wrote a
scheme measures trainability, not reliability. A paper that claims reliability still needs the
independent second rater `build-benchmark` requires. The skill says this in the report.

**Sample size, honestly.** With k = 30 and 27 agreements the Wilson interval is 0.74–0.97; with
k = 50 and 45 agreements, 0.79–0.96; with k = 10 and 9, 0.60–0.98. Thirty is the smallest default
whose interval is narrow enough to act on; the small k's in the table above are calibration checks,
reported as such, not agreement claims for the paper.

**What gets recorded.** `agreement/<id>/`: `sample.csv`, `model.csv`, `author.csv`,
`report.json` (seed, N, k, metric, value, interval, threshold and the decision id that set it,
the adjudication of each disagreement), plus a P4 record for the threshold and for the outcome.

**Cost to the author.** About 15–30 minutes for k = 30 categorical items at 30–60 seconds each;
about 5 minutes for the calibration checks. Once per labelling run; it is redone only when the
prompt, the codebook or the population changes.

### P4 — Decision log

**When it applies.** Every P1 answer, every P2 batch, every P3 threshold and outcome, and every
_tool decides, logged_ action.

**The format — data, not prose.** `<paper>/decisions.jsonl`, append-only, one record per line,
validated against a JSON Schema the same way `review/frontmatter` validates a review's findings:

```json
{
  "id": "d-2026-10-11-003",
  "at": "2026-10-11T09:14:03Z",
  "kind": "claim",
  "skill": "map-prior-work",
  "question": "The sweep found a prior system with the same construction. Narrow the claim?",
  "options": [
    {
      "label": "Narrow to the measurement layer",
      "recommended": true,
      "why": "construction is prior work; the measurement is not"
    },
    { "label": "Keep the claim as written", "why": "" },
    { "label": "Drop the paper", "why": "" }
  ],
  "chosen": "Narrow to the measurement layer",
  "by": "author",
  "note": "",
  "evidence": "siblings/2026-10-11-sweep.md",
  "recorded_by": "hook:record-decision"
}
```

`kind` is one of `claim · direction · outward · proposal · sample-threshold · sample-outcome ·
mechanical`. `by` is `author` or `tool`. `recorded_by` says what wrote the line.

**Who writes it.** For author decisions, **not the model**. The drafting model recording its own
approvals is the self-grading shape `paper-pipeline` already forbids for reviews. The proposal:

- a PostToolUse hook on the question tool writes the record from the question the model asked and
  the answer the author gave — the harness, not the model, holds the pen;
- the existing PreToolUse guard (`paper-edit-guard`, which already refuses Bash writes to paper
  sources) is extended to refuse model writes to `decisions.jsonl`, by Edit and Write as well as Bash;
- `by: tool` lines (_tool decides, logged_) are written by the skill, and are allowed to be.

This is tamper-evident, not tamper-proof: a model determined to forge a line can still find a way to
write a file, and git keeps the change. The log makes the author's choices visible and checkable; it
does not make them unforgeable. Said plainly so no one reads more into it.

**What it gives the paper.** A history of the human's choices, next to the git history of the text,
and a base for the venue's AI-use statement. The ACSAC 2026 policy that `paperlint:aidc` points to
asks authors who used LLMs for editing to state that "all outputs were inspected by the authors"; the
log is the record that sentence summarizes — proposals offered, accepted, rejected, agreement
figures. It shows what was decided, not how carefully; it supports the statement, it does not
replace the author's judgement in writing it.

**Cost to the author.** Zero to write; about two minutes to read before writing the AI-use statement.

## 3. Wording audit

What the public text says the tool is. Each row: where, the sentence, the proposed replacement. None
is applied in this change. **Wording lands together with the behaviour it describes** — rewording a
skill to "proposes" while it still edits would be this repository's rule 7 in reverse ("do not
describe what you have not opened"). The one exception is W7, which is inaccurate **today**.

| #   | where                                                                                                         | today                                                                                                                                                                                 | proposed                                                                                                                                                                                                                                          |
| --- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| W1  | README, first line                                                                                            | "Write a research paper in LaTeX from idea to camera-ready, and catch what gets it sent back before you submit."                                                                      | "You write the paper; paperlint checks it from idea to camera-ready and catches what gets it sent back before you submit."                                                                                                                        |
| W2  | README, the skills bullet                                                                                     | "Skills for Claude Code — optional, covering the whole pipeline: the idea, the venue, the study, the draft, the reviews, submission."                                                 | "Skills for Claude Code — optional assistants for every stage: they research, review and propose; you decide what goes into the paper."                                                                                                           |
| W3  | README, pipeline table                                                                                        | "4 draft — a first draft, then a tighter one"                                                                                                                                         | "4 draft — section plans and proposed edits you accept or reject, then a cut plan"                                                                                                                                                                |
| W4  | README, skills list                                                                                           | "A first draft from your results."                                                                                                                                                    | "A section skeleton and proposed text for your results, which you accept, rewrite or reject."                                                                                                                                                     |
| W5  | README, skills list                                                                                           | "A ready / not ready verdict before you submit, worst problem first."                                                                                                                 | "Every pre-submission gate, worst problem first, so you can decide whether to submit."                                                                                                                                                            |
| W6  | README, skills section                                                                                        | (nothing on who decides)                                                                                                                                                              | add after rollout: "A skill stops and asks you before anything that is yours to decide, and records your answer in the paper folder."                                                                                                             |
| W7  | README, FAQ "Does it change my paper?"                                                                        | "Only `paperlint lint --fix`, and only three rules …" — **false today**: `tighten-paper`, `grade-paper-writing`, `cold-read-diff`, `harden-paper` and `camera-ready` edit `paper.tex` | now: "The linter: only `lint --fix`, three rules. The skills: some edit `paper.tex` when you ask for a pass — read the diff before you commit." After rollout: "… the skills write proposals and change `paper.tex` only where you accepted one." |
| W8  | docs/skills.md, `research-ideate`                                                                             | "a go / no-go on the idea, with the reason …"                                                                                                                                         | "a go / no-go recommendation on the idea, with the reason … — the call is yours"                                                                                                                                                                  |
| W9  | docs/skills.md, `map-prior-work`                                                                              | "… and what you can still claim"                                                                                                                                                      | "… and which of your claims still hold, so you can decide what to claim"                                                                                                                                                                          |
| W10 | docs/skills.md, `analyze-sibling-paper`                                                                       | "… and the sentence that answers it"                                                                                                                                                  | "… and a proposed sentence that answers it"                                                                                                                                                                                                       |
| W11 | docs/skills.md, `plan-paper-timeline`                                                                         | "the deadlines worked backwards, as events in your calendar"                                                                                                                          | "the deadlines worked backwards, as calendar events created once you approve them"                                                                                                                                                                |
| W12 | docs/skills.md, `build-benchmark`                                                                             | "a study design with honest statistics …"                                                                                                                                             | "a proposed study design with honest statistics, for you to approve before any run, …"                                                                                                                                                            |
| W13 | docs/skills.md, `draft-paper`                                                                                 | "a first draft from your results: claims sized, threats to validity written"                                                                                                          | "a section skeleton and proposed paragraphs built on your claims and results — you set the claims and their strength"                                                                                                                             |
| W14 | docs/skills.md, `argument-arc`                                                                                | "an outline where each section follows from the one before"                                                                                                                           | "a proposed outline where each section follows from the one before, shown to you before any edit"                                                                                                                                                 |
| W15 | docs/skills.md, `grade-paper-writing`                                                                         | "a writing grade, with the sentence to fix for each point"                                                                                                                            | "a writing grade, with a proposed rewrite for each point"                                                                                                                                                                                         |
| W16 | docs/skills.md, `pc-panel-review`                                                                             | "a simulated program committee: several reviews, a decision and the must-fixes"                                                                                                       | "a simulated program committee: several reviews, a predicted decision, and the fixes two or more reviewers raised"                                                                                                                                |
| W17 | docs/skills.md, `harden-paper`                                                                                | "ready or not ready to submit, worst problem first"                                                                                                                                   | "every pre-submission gate, worst problem first, so you can decide whether to submit"                                                                                                                                                             |
| W18 | docs/skills.md, `camera-ready`                                                                                | "the final version: authors back, the artifact public with a DOI, any disclosure done first"                                                                                          | "the steps to the final version — authors back, the artifact public with a DOI, any disclosure first — each outward step once you confirm it"                                                                                                     |
| W19 | `research-ideate` description                                                                                 | "Decide whether a research idea is worth doing at all"                                                                                                                                | "Help the author decide whether a research idea is worth doing at all"                                                                                                                                                                            |
| W20 | `research-ideate` description                                                                                 | "Returns a go / no-go verdict with the sharpest framing …"                                                                                                                            | "Returns a go / no-go recommendation and two or three candidate framings for the author to choose from …"                                                                                                                                         |
| W21 | `map-prior-work` description                                                                                  | "emit a verdict on WHAT YOU CAN STILL CLAIM"                                                                                                                                          | "report which layers of the author's claim still hold, with a narrowed wording the author accepts or rewrites"                                                                                                                                    |
| W22 | `map-prior-work` body, Rules                                                                                  | "Do not delegate the claim decision. A subagent maps; you decide what the paper claims."                                                                                              | "A subagent maps; the author decides what the paper claims, from the verdict and the evidence."                                                                                                                                                   |
| W23 | `analyze-sibling-paper` description                                                                           | "to decide the \"isn't this just X?\" question"                                                                                                                                       | "to answer the \"isn't this just X?\" question for the author"                                                                                                                                                                                    |
| W24 | `analyze-sibling-paper` description                                                                           | "the exact cite + positioning clause (or a scoop escalation) to apply"                                                                                                                | "a proposed cite + positioning clause, or a scoop flagged for the author"                                                                                                                                                                         |
| W25 | `plan-paper-timeline` description                                                                             | "create calendar events in the author's own time zone"                                                                                                                                | "propose calendar events in the author's own time zone, and create them once the author approves"                                                                                                                                                 |
| W26 | `build-benchmark` description                                                                                 | "Design and run the empirical study behind a measurement paper"                                                                                                                       | "Help design and run the empirical study the author has framed"                                                                                                                                                                                   |
| W27 | `draft-paper` description                                                                                     | "Use when the numbers exist and it's time to WRITE the paper — \"draft the paper\", \"turn these findings into a submission\" …"                                                      | "Use when the numbers exist and the author is writing the paper — … Proposes a section skeleton and paragraphs built on the author's recorded claims …"                                                                                           |
| W28 | `draft-paper` description                                                                                     | "this is the generative counterpart"                                                                                                                                                  | "this is the proposing counterpart"                                                                                                                                                                                                               |
| W29 | `argument-arc` description                                                                                    | "Build or repair the paper's argument architecture"                                                                                                                                   | "Propose or repair the paper's argument architecture, shown to the author before any edit"                                                                                                                                                        |
| W30 | `tighten-paper` description                                                                                   | "Produces a structural verdict + a concrete cut / fold / merge / reorder plan"                                                                                                        | "Produces a structural verdict + a cut / fold / merge / reorder plan as proposals the author accepts"                                                                                                                                             |
| W31 | `tighten-paper` body                                                                                          | "Apply it — don't defer it"                                                                                                                                                           | "Propose all of it — don't trim the proposal; apply what the author accepts"                                                                                                                                                                      |
| W32 | `grade-paper-writing` title                                                                                   | "grade how the paper READS, then fix it sentence by sentence"                                                                                                                         | "grade how the paper READS, then propose a fix for each sentence"                                                                                                                                                                                 |
| W33 | `cold-read-diff` body, step 5                                                                                 | "Apply the fixes"                                                                                                                                                                     | "Propose the fixes"                                                                                                                                                                                                                               |
| W34 | `pc-panel-review` description                                                                                 | "synthesizes a PC-chair meta-review into an accept/reject decision"                                                                                                                   | "synthesizes a PC-chair meta-review into a predicted accept/reject decision"                                                                                                                                                                      |
| W35 | `pc-panel-review` description                                                                                 | "consensus must-fixes"                                                                                                                                                                | "consensus fixes (raised by two or more reviewers) for the author to accept or decline"                                                                                                                                                           |
| W36 | `pc-panel-review` body                                                                                        | "Consensus must-fixes: … apply before submitting."                                                                                                                                    | "Consensus fixes: … put to the author before submitting, each with the reviewers' reasons."                                                                                                                                                       |
| W37 | `pc-panel-review` body                                                                                        | "If the author invokes it against a TEXT prong, that is the failure this section exists to catch."                                                                                    | "If the author declines a TEXT prong, record the decision and the reason, and say once what it costs."                                                                                                                                            |
| W38 | `harden-paper` description                                                                                    | "this calls all of those and makes the submit/no-submit decision"                                                                                                                     | "this calls all of those and reports every gate; the author makes the submit decision"                                                                                                                                                            |
| W39 | `harden-paper` body                                                                                           | "find → fix → re-verify, don't just list"                                                                                                                                             | "find → propose (or fix, if mechanical) → re-verify, don't just list"                                                                                                                                                                             |
| W40 | `harden-paper` body                                                                                           | "Mechanical submission gates (do these yourself — don't punt to the author)"                                                                                                          | "Mechanical submission gates (the assistant runs these and shows the result)"                                                                                                                                                                     |
| W41 | `camera-ready` description                                                                                    | "turn the anonymized-for-review paper into the de-anonymized camera-ready"                                                                                                            | "guide the author from the anonymized-for-review paper to the de-anonymized camera-ready"                                                                                                                                                         |
| W42 | `camera-ready` body                                                                                           | "Do those edits now, not \"later.\""                                                                                                                                                  | "Put each must-fix comment to the author now, not \"later.\""                                                                                                                                                                                     |
| W43 | `extend-paper` description                                                                                    | "Turn an accepted workshop / short paper into a second, stronger publication"                                                                                                         | "Plan with the author how an accepted workshop / short paper becomes a second, stronger publication"                                                                                                                                              |
| W44 | `paper-status` description                                                                                    | "split into mine and the author's"                                                                                                                                                    | "split into the assistant's and the author's"                                                                                                                                                                                                     |
| W45 | `paper-status` body                                                                                           | "If it is mine, it is already started or started in the same reply."                                                                                                                  | "If it is the assistant's, it is offered as the next step." (also removes the contradiction with "Do not fix anything while reporting")                                                                                                           |
| W46 | `paper-pipeline` description                                                                                  | "The orchestrator for writing a research paper end-to-end … want the whole lifecycle driven, not one step"                                                                            | "Guides the author through a research paper end to end … when the author wants each stage offered in turn, not one step"                                                                                                                          |
| W47 | `paper-pipeline` body, Rules                                                                                  | "Fable (a separate model) is always the reviewer — never let the author grade itself."                                                                                                | "A separate model is always the reviewer — never let the drafting model grade its own text."                                                                                                                                                      |
| W48 | `paper-adversarial-review` body                                                                               | "so it's not the author grading itself"                                                                                                                                               | "so the model that drafted the text is not grading it"                                                                                                                                                                                            |
| W49 | `paper-status`, `cold-read-diff`, `grade-paper-writing`, `paper-pipeline`, `pc-panel-review`, `tighten-paper` | 26 lines call the author "he", "his", "him" — in rules ("the author is least able to judge his own repair") and in provenance notes; 5 more are a reader persona                      | "the author", "they" — a public package addresses any author                                                                                                                                                                                      |

**49 wording changes** (W1–W49): 7 in the README, 11 in `docs/skills.md`, 31 in skill descriptions and
bodies (W49 counts once, for 26 lines).

Two rules keep the wording from drifting back:

- **One glossary line, in `paper-pipeline/SKILL.md.spec.ts`**: _the author_ is the human; _the
  drafting model_ writes proposals; _the reviewer model_ is the separate model that reviews.
- **A static check in `lib/skill-checks.mjs`** naming the self-grading phrasings ("author grade(s)
  itself", "author grading itself") as findings. It reads the spec, which is the output here — the
  text **is** the subject, so this is not the source-grep `docs/testing.md` forbids.

## 4. Prior art — what was fetched

Only what was opened on 2026-10-11; a page that did not open says so.

- **GitHub Copilot code review** ([docs](https://docs.github.com/en/copilot/concepts/agents/code-review)):
  "By default, Copilot's reviews do not count toward required approvals for the pull request";
  "You can apply suggested changes with a couple of clicks"; "Always validate Copilot's feedback
  carefully." A review bot comments and suggests; a human applies and approves. Approval by the bot
  is opt-in and in preview. → P1, P2.
- **Google Docs suggesting mode** ([help](https://support.google.com/docs/answer/6033474)): suggested
  edits appear in a new colour, deletions crossed out, and "The owner of the file will get an email
  about your suggestions and can decide whether to keep them." The proposal and the decision are two
  steps with two owners. → P2.
- **Grammarly** ([engineering blog on accepting multiple suggestions](https://www.grammarly.com/blog/engineering/accepting-multiple-suggestions/)):
  even bulk acceptance kept a per-correction undo — "They might realize that they didn't want to
  accept a particular suggestion" — and success was counted as a suggestion "accepted in bulk (and
  did not revert … later)". Section-level acceptance in P2 follows this, with per-hunk records.
- **Prodigy review** ([docs](https://prodi.gy/docs/review)): model outputs are added "as-if they were
  done by an annotator", reviewers can "focus on the examples where annotators disagree", and the
  docs warn that auto-accepting agreement means "you may risk accepting examples where both models
  make a mistake but agree". → P3's rule that every disagreement is shown, and its caution that
  agreement is not correctness.
- **Label Studio** ([task agreement](https://docs.humansignal.com/guide/stats)): agreement metrics are
  an Enterprise feature ("tier: enterprise"); the Members dashboard "Displays a member and model
  agreement matrix", and a task's score is "the mean of all control-tag scores" by default. Annotator
  vs model agreement is a standard report in labelling tools; the open-source edition does not
  compute it, which is part of why P3 computes its own.
- **ASReview LAB** ([about](https://asreview.readthedocs.io/en/latest/lab/about.html)): "the user acts
  as the 'oracle' to make labeling decisions"; "the human provides the labels. This is called
  Researcher-In-The-Loop (RITL)"; "You can also validate labels provided by other screeners or AI
  models." A screening tool for systematic reviews that ranks and never decides. → the framing for
  the whole suite.
- **Cochrane MECIR standards** ([C39–C42](https://www.cochrane.org/authors/handbooks-and-manuals/mecir-manual/standards-conduct-new-cochrane-intervention-reviews-c1-c75/performing-review-c24-c75/selecting-studies-include-review-c39-c42)):
  C39 (mandatory) — "Use (at least) two people working independently to determine whether each study
  meets the eligibility criteria … and define in advance the process for resolving disagreements",
  because duplication "reduces both the risk of making mistakes" and "the possibility that selection
  is influenced by a single person's biases"; C41 (mandatory) — "Document the selection process in
  sufficient detail". → P3's blind sample and pre-set threshold; P4.
- **Shankar et al., "Who Validates the Validators?"** ([arXiv:2404.12272](https://arxiv.org/abs/2404.12272), 2024):
  "LLM-generated evaluators simply inherit all the problems of the LLMs they evaluate, requiring
  further human validation"; their EvalGen has people grade a subset of outputs to select evaluators
  that match human judgement; and they observe criteria drift — "users need criteria to grade
  outputs, but grading outputs helps users define criteria." → P3, and why P3 lets the author revise
  the codebook and re-sample fresh items rather than re-score.
- **ACL 2023 policy on AI writing assistance** ([blog](https://2023.aclweb.org/blog/ACL-2023-policy/)):
  assistance that only polishes "the author's original content" needs no disclosure; when "new ideas
  - new text" both come from a model, "we would discourage such use in ACL submissions"; and code
    assistance "does not obviate the requirements of authors to ensure the correctness of their methods
    and results." The line the policy draws — polishing the author's content vs generating the content —
    is the line between P2's mechanical edits and proposals.
- **ACSAC 2026 AI usage policy** ([page](https://www.acsac.org/2026/submissions/ai/), the policy
  `paperlint:aidc` cites): "authors bear full responsibility for the correctness, originality, and
  integrity of their work"; an LLM-generated method "must be validated by the authors"; editorial use
  is declared with "all outputs were inspected by the authors to ensure accuracy and originality." → P3
  for the first, P4 for the second.
- **Not opened:** ACM's authorship policy page
  (`acm.org/publications/policies/new-acm-policy-on-authorship`) returned HTTP 403 to both WebFetch and
  curl; nothing here relies on it.

## 5. Design — where each pattern is enforced, and rollout

### 5.1 The rungs

Prose in a skill is the lowest rung of this repository's ladder, and the skills record why:
`analyze-sibling-paper` notes that "the previous version of this rule already said 'read the paper,
not the abstract' in prose and that did not stop it happening". So each pattern is placed as high as
it can go:

| pattern     | enforced by                                                                                                                                                   | rung                                      |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| P4          | `decisions.jsonl` parsed against a JSON Schema at lint time (`decision/record`, an error, beside `review/frontmatter`)                                        | parsed at the boundary                    |
| P1, outward | the PreToolUse hook refuses the agent's `submission update --save` unless a `by: author` `outward` record holds the sha256 of the PDF being sent              | impossible by construction, for the agent |
| P1, claim   | `decision/required`: a stage declared in `PIPELINE-STATUS.md` (`submitted`, `camera-ready`) needs `claim`, `direction` (venue) and `outward` (submit) records | lint rule                                 |
| P1, frame   | `build-benchmark` refuses without a `frame` decision record, not merely a non-empty row                                                                       | skill + lint rule                         |
| P2          | proposals are files; the skill applies only hunks named in a `proposal` record                                                                                | skill, checked by test                    |
| P3          | `agreement.mjs` produces `report.json`; `agreement/report` judges it (threshold record precedes the outcome; k, N, seed, interval present)                    | script produces facts, ESLint judges      |

The CLI is not gated: a human running `paperlint submission update --save` by hand already decided.
The hook scopes the gate to the agent, so rule 11 ("installing and using paperlint must be as smooth
as possible") holds for people.

**Rejected, one line each.**

- _"Ask the author" lines in every SKILL.md, alone_ — prose is not policy, here or anywhere in this
  repository.
- _A global "confirm everything" mode_ — checkpoint fatigue; mechanical fixes stay automatic, and
  a checkpoint budget (three per run) forces the split.
- _The model writes the decision log_ — the drafting model recording its own approvals.
- _Git commits or trailers as the record_ — squash and `gc` destroy them; the repository already
  rejected commit references for frozen versions for that reason.
- _A new `paperlint decide` command_ — the record is a config-like file the hook writes; this
  repository's prior art says a new verb is usually a missing declaration.

**What it does not cover, said plainly.** An author who accepts everything unread — the log shows it,
nothing prevents it. Decisions made in free chat outside the question tool. A model writing the log
by some route the guard does not see (tamper-evident, not tamper-proof). And P3 validates the model
against the author, not the construct.

**Blast radius.** The 25 `skills/*/SKILL.md.spec.ts` (and their compiled `SKILL.md`), `README.md`,
`docs/skills.md`, `hooks/paper-edit-guard.hook.mjs`, a new recorder hook, `plugin/hooks/hooks.json`,
three new ESLint rules with pages under `docs/rules/` and cases in `src/rule-cases.test.ts`,
`lib/skill-checks.mjs`, `paper-pipeline/references/pipeline-status-template.md`, and `paperlint new`
(it writes an empty `decisions.jsonl`).

### 5.2 Spike first — three unknowns, each a measurement

1. **Does a PostToolUse hook on `AskUserQuestion` receive the author's answer**, and in what shape? A
   characterization harness, in the style of `plan-paper-timeline.effects.harness.mjs`, pinned to the
   observed CLI version.
2. **Can a forked skill (`context: fork`) ask the author at all?** P1's "forked skills return open
   decisions to the main thread" rests on the answer being no.
3. **Can the recorder run under vigiles' capability-restricted hook runtime**, which allows imports
   only from `vigiles/hook`, or must it be plain CLI code behind `paperlint hook record-decision`?

If (1) is no, P4's author records fall back to the skill writing them from the answer it received,
`recorded_by: skill`, and §2's "not the model" paragraph is withdrawn rather than left standing.

### 5.3 Rollout order

Ranked by frequency (each skill's own trigger text) times how much it decides today (§1.1).

| phase | what                                                                                                                                                                                                                                                                               | why first                                                                                   |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 0     | W7 (the FAQ, false today). The spike (§5.2). `decisions.jsonl` schema + `decision/record`. The recorder hook and the guard extension.                                                                                                                                              | a correction owed now; everything else writes to the log                                    |
| 1     | `tighten-paper`, `grade-paper-writing`, `cold-read-diff` → P2. `pc-panel-review`, `harden-paper` → P1 for fixes and the submit decision. Glossary + W30–W40, W47–W49.                                                                                                              | run after every substantial edit or every prose edit, and edit `paper.tex` directly today   |
| 2     | Claim-setting: `research-ideate`, `argument-arc` (frame), `map-prior-work`, `analyze-sibling-paper`, `draft-paper` → P1, P2; `build-benchmark` keyed on the frame record; P3 + `agreement/report` in `build-benchmark` and `map-prior-work`. `decision/required`. W8–W14, W19–W29. | run once per paper, but decide the paper's claim                                            |
| 3     | Outward acts: `submission-portal` (records its yes), `osf-artifact-upload`, `plan-paper-timeline`, `submit-paper` form values, `camera-ready`, `extend-paper` → P1 + the hook gate. W18, W41–W43.                                                                                  | rare, but irreversible                                                                      |
| 4     | The rest of P3 (`study-accepted-papers`, `verify-citations`, `tighten-paper` scale). `paper-status`, `paper-pipeline` wording (W44–W46). README W1–W6.                                                                                                                             | lowest frequency × decision weight; the README last, once the behaviour it describes exists |

### 5.4 Tests that prove a checkpoint cannot be skipped

Per `docs/testing.md`: red first, assert the whole value, test what the code does — never that a
`SKILL.md` contains "ask the author" — and both halves of every check.

| tier                                           | test                                                                                                                                                                   | both halves                                                                      |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| integration (`src/rule-cases.test.ts`)         | `decision/record`: a malformed line, an unknown `kind`, an `outward` record with `by: tool` → reported with id, severity, line                                         | a valid log → silent                                                             |
| integration                                    | `decision/required`: `PIPELINE-STATUS.md` declares `submitted` with no `outward` submit record → error on the status file                                              | the same paper with the record → silent                                          |
| integration                                    | `agreement/report`: an outcome whose threshold record comes after it in the log, or without k / N / seed / interval → error                                            | a complete report with the threshold first → silent                              |
| unit                                           | `agreement.mjs`: Cohen's κ and Wilson intervals on textbook tables (whole value); a fixed seed draws the same sample; refuses a `sample.csv` that carries model labels | the same inputs, correct → the exact report object                               |
| harness (`hooks/hooks.harness.ts`, `runHook`)  | PreToolUse Bash `npx paperlint submission update papers/p --save` with no matching record → RC 2 and the reason                                                        | the same command with a record whose sha256 matches the built PDF → RC 0, silent |
| harness                                        | PreToolUse Edit / Write / Bash to `papers/p/decisions.jsonl` → denied                                                                                                  | an Edit to `papers/p/paper.tex` → allowed                                        |
| harness                                        | the recorder: a PostToolUse payload for the question tool with an answer → exactly one appended record, compared whole                                                 | a payload with no answer → nothing written                                       |
| effects (`runHarnessTest`, scripted model, $0) | the question tool exists in the run, and each checkpointing skill's declared tools permit it — a characterization, like `plan-paper-timeline.effects.harness.mjs`      | pins the CLI version; fails loudly when the surface changes                      |
| eval (paid, manual, a measurement not a gate)  | a real model with `tighten-paper` and a simulated author who never answers → no Edit to `paper.tex`, no `git apply`, the run ends with the open question               | the same run with an author who accepts two hunks → exactly those two applied    |
| mutation (`design-first` step 7.3)             | delete the hook's deny branch → the `--save` harness goes red; drop `decision/required` from the registry → `rule-cases` goes red by name                              | restore → green                                                                  |

What these do **not** prove, by construction: that a real model asks at the right moment in a
conversation the tests did not script. The hook and the rules make skipping a checkpoint fail
loudly at the outward act and at the stage; the eval measures how often the model asks before that,
and is reported as a rate, with its n.
