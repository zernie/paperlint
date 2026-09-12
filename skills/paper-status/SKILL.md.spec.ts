// Compiled to SKILL.md by `vigiles compile`. Edit THIS file, never the markdown.
//
// Adopted 2026-08-17 as part of the second batch. The body is the previous SKILL.md
// VERBATIM, so the compiled diff shows only what the compiler adds. No `disallowedTools`
// fence yet: the field exists on `SkillSpec` as of the branch `claude/skill-disallowed-tools`
// but is not in a release `mine` installs, so adding it here would not compile.
import { experimental_skill } from "vigiles/spec";

export default experimental_skill({
  name: "paper-status",
  description: "Answer \"what's the status of the paper?\" in one pass — MEASURE what is measurable (page count from the real build, git state, which gates were run against the CURRENT text), then read the judgement rows, then print blockers worst-first split into mine and the author's. Use whenever the author asks «что по статье / статус / что осталось / готово ли», at the start of a session touching a paper, or before deciding what to work on next. Not a review skill — it reports state, it does not grade, cut, or fix.",
  tools: ["Bash", "Read", "Grep", "Glob"],
  body: `
# paper-status — state, measured before it is narrated

## Run me

🔴 FIRST, before any other step:

\`\`\`
node .claude/skills/paper-pipeline/scripts/announce.mjs paper-status <paper-dir>
\`\`\`

An advisory pass cannot be observed failing — silence is both its error state and its normal
state — so starting is an event, and events get written down.

The author asks «что там по статусу?» constantly, and the answer keeps coming from the wrong place: my
memory of the session, which drifts, or a 200-line scorecard he cannot skim. Both fail the same way —
**they narrate state instead of measuring it.**

Grounding failure, 2026-08-04 (\`compile-rules-2026\`, day before deadline): a status line in chat said
the review panel was running. It had never been launched. Another said the paper was 8 pages while the
real build said 9 and BLOCKED — steering a whole day of cuts by the wrong instrument. Both would have
been caught by running two commands instead of recalling two facts.

## The rule this skill exists to enforce

**Anything a command can answer is not allowed to come from memory or from prose.** Measure first,
read the scorecard second, and mark clearly which is which. A claim in \`PIPELINE-STATUS.md\` is a claim
about the past; the build is the present.

## 🔴 The second rule: status is PUSHED, never waited for

The corpus owner, 2026-08-05: *«мне приходится постоянно спрашивать статус статьи и тебя направлять, чтобы ты мне
говорил, что мы можем делать дальше»*. Building a skill that answers when asked fixed the wrong half —
the work he was complaining about is **the asking**, and a pull-only skill leaves all of it with him.

So on any turn that touched a paper, the reply ends with **three lines, unprompted**:

1. **where it stands** — the build's own verdict line, page count, deadline countdown;
2. **the single next action, with an owner** — not a menu. If it is mine, it is already started or
   started in the same reply. If it is his, it says exactly what to click.
3. **what is stale** — a gate whose verdict predates the current text, named.

Three failures make this a rule rather than a preference, all in one session:
- I finished a page-fit cut and stopped, so he asked what the status was;
- I left artifact hosting on his side of the split for a day and a half while the credential to clear
  it sat in the environment (see \`credential-available\` in \`pipeline-check.mjs\`);
- three consecutive panels returned Weak Accept and the ceiling they named was never the next task,
  because nothing turned "here is the score" into "here is what to do about it".

**Never end a paper turn on a completed sub-task alone.** "Fits in 8 pages" is a measurement, not a
status; the status is what that measurement makes possible next.

**Enforcement leg.** \`pipeline-check.mjs\` prints its banner **unconditionally**, including when it has
zero findings — deadline countdown, verdict row, and \`➡️ NEXT\`. It runs from \`paper-status-gates.sh\`
on every edit to a paper source, so the state arrives without anyone pulling it. If that banner and
this section ever disagree, the banner is a measurement and this is prose: believe the banner.

## How to run it

### 1. Measure (no reading yet)

\`\`\`bash
cd <paper-dir>
bash repro/build-submission.sh 2>&1 | grep -Ei 'body pages|VERDICT|Overfull|undefined|anonymity'
git status --porcelain                      # uncommitted work
git log --oneline @{u}..HEAD                # unpushed commits
\`\`\`

- **The build is the only page-count authority.** If the repo has an approximate measurer, do not use
  it and say so. In this project \`measure.sh\` was gutted on 2026-08-04 for exactly this reason.
- Report the build's own verdict line verbatim. Do not paraphrase \`BLOCKED\` into "nearly there".

### 2. Detect stale gates — the part memory always gets wrong

A gate is stale if the paper changed after the gate ran. Check it mechanically, not by recall:

\`\`\`bash
git log -1 --format=%cd --date=short -- paper.md          # when the text last moved
ls -la reviews/ | tail -20                                # when each gate last reported
\`\`\`

Compare against the dates in \`PIPELINE-STATUS.md\`. If the paper moved after a gate's date, that
gate's verdict **does not describe the current paper** — say so explicitly, and say what changed since.
An accept-probability from a superseded draft is not evidence about this one; carrying it forward is
the single most common way a status report lies.

If the project ships a checker (\`.claude/skills/paper-pipeline/scripts/pipeline-check.mjs\`), run it.

### 3. Read the judgement rows — from BOTH checklists, they answer different questions

The project already carries the checklists this skill should report against. Do not invent a new list
and do not report from one of them alone:

| source | the question it answers | what to pull |
|---|---|---|
| **\`<paper-dir>/PIPELINE-STATUS.md\`** | were the QUALITY stages run, and what did they conclude | per-stage \`☑\`/\`◐\`/\`☐\`/\`⚠\`, dates, the one-line submit-ready verdict |
| **\`<paper-dir>/SUBMIT-CHECKLIST.md\`** | does it comply with the VENUE's format, and is the submission mechanics understood | page limit, template, blind model, mandatory sections, portal URL, whether a supplementary-upload field exists, the deadline converted to the author's own zone |
| **\`.claude/hooks/paper-skills-nudge.hook.ts\`** | which gates EXIST at all | the canonical pre-submit gate list — use it to spot a gate nobody has ever run, which no scorecard row will show because the row was never added |
| \`<paper-dir>/CLAIMS.md\` | what may still be claimed | 🔴 retired claims — flag if the current text asserts one |
| \`<paper-dir>/CLAUDE.md\` | what this venue rewards | only when it changes what to do next |

🔴 **Both checklists must be green before upload, and they fail differently.** A paper can pass every
quality gate and still be unsubmittable (no active account, no supplementary field so the artifact
needs external hosting, deadline misconverted from AoE). Reporting only the quality side is how a
"ready" paper misses its deadline. The compliance side usually contains the blockers that are *his*,
which is exactly why they belong at the top of the output.

### 4. Print it, in this shape and this order

Short. He is asking because he wants to decide what to do next, not to read a report.

1. **One line: can it be submitted right now?** The build verdict plus the hard blockers, nothing else.
2. **Blockers, worst first, split by owner** — 🔴 his (accounts, hosting, anything needing a human or a
   login) vs 🔵 mine (text, gates, artifacts). His come first: he can start them while I work.
3. **Gates** (\`PIPELINE-STATUS.md\`), each marked ✅ ran against current text · ⚠️ ran against an older
   text (name what changed) · ☐ never run. Cross-check against the hook's canonical gate list so a
   gate with no row at all shows up as ☐ rather than vanishing.
4. **Format compliance** (\`SUBMIT-CHECKLIST.md\`) — one line: green, or the specific item that is not.
   Page limit and blind model come from the measured build, not from the checklist's memory of them.
5. **What moved since he last asked**, three lines maximum.
6. **The deadline, in his timezone**, and what is on the critical path to it.

## Record the verdict

🔴 LAST step, once the deliverable exists:

\`\`\`
node .claude/skills/paper-pipeline/scripts/ledger.mjs record paper-status <paper-dir> FINDING <count> <report-path>
node .claude/skills/paper-pipeline/scripts/ledger.mjs record paper-status <paper-dir> ABSTAINED <reason> "<one line>"
\`\`\`

This skill reports state and does not judge the paper, so what it records is about the **status run**:
**FINDING** — \`<count>\` blockers printed, \`<report-path>\` the status output.
**ABSTAINED** — \`no-witness\`: the status run measured everything it can and printed zero blockers.
\`crashed\`: the build did not run, so nothing was measured.

🔴 \`crashed\` is the one outcome that must never be narrated as a status. This skill exists because
state was being narrated instead of measured; a status report built on a build that did not happen
is that same failure with a fresh timestamp on it. Under the old vocabulary this was \`ERROR\`, which
sat in the same column as a verdict about the paper — it does not any more.

🔴 **There is no PASS**, so "zero blockers" cannot be stored. Print it, and let the reader draw the
conclusion from an empty blocker list they can see.

## Rules

- **Never report a gate as run because I intended to run it.** Predicting a background agent's result,
  or calling a queued task "running" when nothing was launched, is the failure this skill was written
  after. If a task was not launched, the honest line is "not started".
- **Owner-split is not decoration.** A blocker only he can clear (an account, an upload, a phone call)
  belongs at the top, because every hour it sits is an hour of pure schedule loss.
- **Numbers, not adjectives.** "8/8 pages, fits" not "about right"; "78 stalls over 8 pages against a
  threshold of 2" not "readable enough".
- **Say what is NOT known.** A gate never run is a real answer and more useful than an optimistic one.
- 🔴 **Send the built PDF with the report, every time, without being asked** (\`SendUserFile\`, from the
  outdir the report's page count came from — never an older copy). The corpus owner, 2026-08-05: *«и пдф отдавать
  я часто прошу»*. He reads the paper, not the scorecard; a status report that makes him ask for the
  artifact costs a round trip for nothing. The caption states the build time and the page count, so
  the file cannot be mistaken for an earlier one.
- 🔴 **Never let "the gates are stale" be heard as "the measurements are stale."** They are different
  objects and conflating them destroys trust in real data: a *measurement* is an experiment on the
  tool or corpus and stays valid until the tool changes; a *gate* is a judgement of the paper text and
  expires the moment the text moves. Name which one you mean, every time. On 2026-08-05 a one-word
  slip here made a four-hour experiment sound like wasted work.
- Do not fix anything while reporting. Status and work are different turns — mixing them is how the
  status stops being trustworthy.

## Compose with

- \`paper-pipeline\` — owns the stage contract this reads.
- \`harden-paper\` — the decision to submit; this only reports the inputs to it.
- \`handoff\` — end-of-session preservation; this is the start-of-session counterpart.

## Provenance

Built 2026-08-04, the day before the \`compile-rules-2026\` deadline, after the author asked for paper status
for the fourth time in one session and pointed out it should be a command: *«я так часто это
спрашиваю… должен быть скилл»*. He was right, and the two things the skill measures first are the two
things chat had most recently gotten wrong.`,
});
