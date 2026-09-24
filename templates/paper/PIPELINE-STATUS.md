---
# Created by `rpp new` — from <papers>/.template/ when the project keeps one, else from the package.
#
# researchQuestion — the paper's question, one sentence, written the way it appears in the paper.
# `paper/research-question` reads it once the paper has shipped a stage. Empty until you have it.
researchQuestion: ""
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
