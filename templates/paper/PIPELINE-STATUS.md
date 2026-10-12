---
# Created by `paperlint new` — from <papers>/.template/ when the project keeps one, else from the package.
#
# There is no `stages` field yet, on purpose: a new paper has shipped nothing and owes nothing.
# When it reaches a stage, add the record — its shape is in docs/rules.md of the package.
---

# PIPELINE-STATUS — {{name}}

Venue: <venue> · Deadline: <ISO date, AoE converted to the author's own zone> · Blind: <double/single> · State: <drafting/submitted #N/accepted>
Updated: <ISO>

**Readiness verdict:** <one line — submit-ready? if not, the WORST failing gate first. Any failing
gate caps "ready"; an accept probability alone is not a verdict.>

**Gates at a glance (worst first — mark any failing gate ✗):** readability(persona stalls) <density/verdict> · structure(tighten-paper) <verdict> · claims-honest(claims) <clean?> · defects(panel) <accept-prob/decision> · writing <NN/60> · content(venue bar) <run?/levers>

## Plan / now

The paper's live plan: this file is the paper's one live-state file, so the plan lives here, not in a
`PLAN.md` beside it (`paper/folder-layout` reports one). Rewrite this section as the plan changes; a
decision's history goes to `research/` as a dated record.

- **Now (<ISO date>):** <what is being worked on, and the next step>
- **Decisions in force:** <the decision — who made it, ISO date, link to the record>
- **Schedule:** <ISO date — milestone, in the author's own zone>

## Venue-bar scorecard (M1–M10)

Filled by `study-accepted-papers`: mode C scores every row, mode D checks M2 and M4 again. What each
mechanism is, and what it is not, is that skill's `references/mechanisms.md`. The verdicts live only
here; the dated report in `reviews/` keeps the reasoning and points here.

Status: `pass` · `partial` · `fail` · `—` (not scored). A `fail` names an owner and either a plan or
`accept ceiling: <why>`.

| #   | mechanism                                       | status | evidence (file:line) | owner | plan or accept ceiling |
| --- | ----------------------------------------------- | ------ | -------------------- | ----- | ---------------------- |
| M1  | a non-model oracle under the headline           | —      | —                    | —     | —                      |
| M2  | the claim is aimed at a belief stated on record | —      | —                    | —     | —                      |
| M3  | the construct is the claim                      | —      | —                    | —     | —                      |
| M4  | the denominator in the claim sentence, no drift | —      | —                    | —     | —                      |
| M5  | a negative or "X alone" claim shape             | —      | —                    | —     | —                      |
| M6  | the generalised-over factor is a column         | —      | —                    | —     | —                      |
| M7  | the phenomenon measured directly                | —      | —                    | —     | —                      |
| M8  | a reusable thing the field pays for once        | —      | —                    | —     | —                      |
| M9  | relevance to every reviewer on the PC           | —      | —                    | —     | —                      |
| M10 | where the paper's own result loses              | —      | —                    | —     | —                      |

## Stages

### SETUP

| id         | Work                              | Skill                 | Status | Date | Result                                                                                            | Open      |
| ---------- | --------------------------------- | --------------------- | ------ | ---- | ------------------------------------------------------------------------------------------------- | --------- |
| idea       | Validate idea                     | research-ideate       | ☐      | —    | —                                                                                                 | —         |
| priorwork  | Map competitors                   | map-prior-work        | ☐      | —    | —                                                                                                 | siblings/ |
| venue      | Pick venue                        | find-venue            | ☐      | —    | —                                                                                                 | —         |
| venuebar   | Venue bar / levers                | study-accepted-papers | ☐      | —    | —                                                                                                 | —         |
| **access** | 🔴 **Can you physically submit?** | plan-paper-timeline   | ☐      | —    | account · profile ACTIVE since <ISO> · portal reachable · form fields known · artifact host known | —         |
| schedule   | Schedule + calendar               | plan-paper-timeline   | ☐      | —    | —                                                                                                 | —         |
| **frame**  | **Claim stated before the runs**  | argument-arc (frame)  | ☐      | —    | one paragraph: what will this paper claim?                                                        | —         |

### LOOP

| id    | Work             | Skill           | Status | Date | Result | Open |
| ----- | ---------------- | --------------- | ------ | ---- | ------ | ---- |
| study | Study + artifact | build-benchmark | ☐      | —    | —      | —    |
| draft | Draft            | draft-paper     | ☐      | —    | —      | —    |
| arc   | Argument arc     | argument-arc    | ☐      | —    | —      | —    |

### CONTINUOUS

Date = when it last ran. If that predates the current text, the pass is stale — the checker says so.

| id         | Trigger               | Skill                     | Status | Date | Result                | Open      |
| ---------- | --------------------- | ------------------------- | ------ | ---- | --------------------- | --------- |
| cites      | any \cite added/moved | verify-citations          | ☐      | —    | —                     | —         |
| siblings   | a sibling surfaces    | analyze-sibling-paper     | ☐      | —    | —                     | siblings/ |
| priordelta | framing moved         | map-prior-work (delta)    | ☐      | —    | —                     | —         |
| render     | any source edit       | render-paper + page count | ☐      | —    | <N> pages / limit <M> | —         |

### GATES

| id        | Gate               | Skill               | Requires                                     | Status | Date | Result | Open |
| --------- | ------------------ | ------------------- | -------------------------------------------- | ------ | ---- | ------ | ---- |
| structure | Structure          | tighten-paper       | render, arc                                  | ☐      | —    | —      | —    |
| writing   | Writing craft      | grade-paper-writing | draft, arc, structure                        | ☐      | —    | —      | —    |
| panel     | Review decision    | pc-panel-review     | structure, writing                           | ☐      | —    | —      | —    |
| claims    | Claim preservation | Fable diff          | draft, writing                               | ☐      | —    | —      | —    |
| harden    | Harden (all axes)  | harden-paper        | panel, structure, writing, cites, priordelta | ☐      | —    | —      | —    |
| submit    | Submit             | submit-paper        | harden, access                               | ☐      | —    | —      | —    |

**Harden sub-axes** (`harden` is an orchestrator — track its axes so `◐` is legible):
structure(=structure) ☐ · threat-model ☐ · ethics/dual-use ☐ · page/word-fit ☐ · de-anon hygiene ☐ · citability ☐ · artifact-runs-clean ☐ · writing(=writing) ☐

### AFTER

| id          | Work         | Skill        | Status | Date | Result          | Open |
| ----------- | ------------ | ------------ | ------ | ---- | --------------- | ---- |
| cameraready | Camera-ready | camera-ready | n/a    | —    | pre-acceptance  | —    |
| extend      | Extend       | extend-paper | n/a    | —    | post-acceptance | —    |
