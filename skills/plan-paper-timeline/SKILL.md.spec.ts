// Compiled to SKILL.md by `vigiles compile`. Edit THIS file, never the markdown.
//
// Adopted 2026-08-17 (batch 3). Body carried over VERBATIM so the compiled diff shows
// only what the compiler adds. No `disallowedTools` fence yet — the field landed on
// `SkillSpec` in vigiles branch `claude/skill-disallowed-tools` and is not in a release
// this repo installs, so writing one here would not compile.
import { experimental_skill } from "vigiles/spec";

export default experimental_skill({
  name: "plan-paper-timeline",
  description:
    "Turn a venue's CFP dates into a scheduled, buffered plan on the Google Calendar — build the timeline backwards from the AoE submission deadline (harden + panel-review + artifact + anonymized host all land BEFORE it), create calendar events in the author's own time zone for submit-day / deadline / camera-ready, and apply the FILING-SPACING rule so multiple papers don't cluster in the month before a planned external filing. Use right after find-venue hands you real deadlines and before you start drafting. Compose with find-venue (deadline source) and submit-paper.",
  tools: [
    "Read",
    "Write",
    "Grep",
    "Glob",
    "mcp__Google_Calendar__list_events",
    "mcp__Google_Calendar__search_events",
    "mcp__Google_Calendar__create_event",
    "mcp__Google_Calendar__update_event",
    "Bash(node .claude/skills/paper-pipeline/scripts/announce.mjs:*)",
    "Bash(node .claude/skills/paper-pipeline/scripts/ledger.mjs:*)",
  ],
  body: `
# plan-paper-timeline — CFP dates → a buffered, filing-aware schedule

## Run me

🔴 FIRST, before any other step:

\`\`\`
node .claude/skills/paper-pipeline/scripts/announce.mjs plan-paper-timeline <paper-dir>
\`\`\`

An advisory pass cannot be observed failing — silence is both its error state and its normal
state — so starting is an event, and events get written down.

A deadline is not a plan. This skill converts the four dates every CFP gives you — **submission (AoE),
notification, camera-ready, event** — into calendar events with the buffers that actually keep a
submission from slipping, and sequences *multiple* papers so the cadence reads as sustained acclaim,
not a pre-filing burst.

## 0. 🔴 CAN YOU PHYSICALLY SUBMIT? — do this in the FIRST week (scorecard row \`access\`)

**This skill owns the question no other unit of work owned**, and it is the one that bites. It is not
about the paper. It is about whether, on submit-day, there is anywhere to put it. Everything below in
this skill schedules *work*; this schedules *access*, and access has a lead time you do not control.

*Added 2026-08-03, after this was the sole critical-path item on a finished paper at **T−4 days**: the
science was done, the artifact was built, and the account could not submit.*

Concrete steps, all of them today, none of them deferrable:

1. **Create the portal account** (OpenReview / HotCRP / EasyChair / the venue's own). Not "find the
   URL" — create the account.
2. **Drive the profile to ACTIVE.** 🔴 *"Pending moderation" is not an account you can submit from.*
   Fill in every field moderation looks at — full name, affiliation history with dates, an ORCID or
   DBLP/homepage link, and prior publications if the portal imports them; a sparse profile is what
   gets queued rather than approved. Then **check back and confirm the state flipped**, and
   **record the ISO date it went ACTIVE in the \`access\` row**, not just a tick.
3. **Confirm the form's fields** — open the actual submission form and read it. Title, abstract
   (character cap?), track/type selector, subject areas, conflicts-of-interest, mandatory
   declarations (GenAI/LLM use, ethics, dual-use), authors' order, and whether upload alone counts as
   submitted or a separate **"ready for review"** click does.
4. **Confirm whether a supplementary-upload field EXISTS.** If it does not, the artifact needs an
   **external anonymous host** (OSF view-only link / 4open) plus a \`\\url{}\` in Availability — and that
   host has to be minted before submit-day, not on it. This is a real branch in the plan, not a detail.
5. **Re-check as the deadline approaches.** External state rots without telling you: a profile can be
   flagged, a portal can open late or change its form. The CONTINUOUS trigger on the \`access\` row exists
   for exactly this.

**The lead time, stated plainly:** portal moderation runs **up to two weeks**, and an author with **no
institutional email has no expedite route** — no support queue jump, no "I'm on a deadline" exception.
That is why \`access\` is scheduled in the first week rather than the last: it is the one item where the
only remedy for being late is having started earlier.

\`pipeline-check.mjs\` reports an \`access\` row still \`☐\` inside the moderation window as a finding, and
\`submit-paper\` is hard-blocked on \`access\` being green.

## 1. Build the timeline backwards from the AoE deadline
Everything that must be done *before* you can submit gets its own slot ending before the deadline —
never "the day of." Working back from the submission AoE date, reserve, in this order:

- **Draft frozen** — prose done, \`verify-citations\` clean. Earliest.
- **Harden** — \`paper-adversarial-review\` → \`pc-panel-review\` venue-fit mode, fix blockers, re-render.
  Loops; give it room.
- **Panel review** — \`pc-panel-review\` (multi-reviewer + artifact-runner) as the final gate. 1–2 days.
- **Artifact built + hosted anonymously** — build the self-checking artifact and mint the OSF/4open
  anonymized link (see \`submit-paper\` + \`paper-pipeline/references/artifact-checklist.md\`). This step
  reliably eats more time than expected; put it before, not on, submit-day.
- **Submit-day = one day before AoE.** The real submission happens here, with slack for a HotCRP
  surprise (no supplementary field, a re-paste, a "ready for review" step you forgot). Never plan to
  submit on the deadline itself.

Rule of thumb: if the CFP is <2 weeks out, the artifact + panel review are what you cut scope on, not
the claim-sizing.

## 2. The AoE nuance (don't lose a day to it)
CFP deadline dates are **Anywhere-on-Earth (UTC−12)**. A deadline written "15 Jul AoE" does *not* expire
at your local midnight on the 15th — it expires when the last spot on Earth leaves the 15th:

\`\`\`
15 Jul 23:59 AoE  =  16 Jul 11:59 UTC  ≈  16 Jul ~17:00 local, in a UTC+5 zone
\`\`\`

So the calendar date on the CFP is effectively the **next day at home**. This is slack, not a plan —
treat submit-day as the day before the *printed* date regardless, and let the AoE hours be your safety
margin, not your runway.

## 3. Create the calendar events (in the author's own zone)
Use \`mcp__Google_Calendar__create_event\` for three anchors per paper. 🔴 **Read the zone, do not
assume it** — it is the \`timezone\` carrier, and it is the author's, not the pipeline's:

\`\`\`
node -p "((p) => p.paperlint ?? p['research-paper-pipeline'])(require('./package.json'))?.timezone ?? 'UTC'"
\`\`\`

The example below shows the default, \`UTC\`; substitute whatever that command prints.
Title them so the venue and the phase are unmistakable at a glance:

- **\`<Venue> — SUBMIT\`** on submit-day (one day before the printed AoE date). This is the one you act on.
- **\`<Venue> — deadline (AoE)\`** on the printed date, as a hard backstop.
- **\`<Venue> — camera-ready\`** on the camera-ready date (from the CFP), so acceptance doesn't ambush you
  in a busy week.

\`summary\`, \`startTime\` **and \`endTime\`** are all required — the API rejects the call without the end
time, and a deadline anchor has no natural duration, so give it an hour and move on. Exact shape:

<!-- harness:prescribed-call create_event -->
\`\`\`json
{
  "summary": "AISec 2026 — SUBMIT",
  "startTime": "2026-07-23T10:00:00",
  "endTime": "2026-07-23T11:00:00",
  "timeZone": "UTC"
}
\`\`\`

Optionally add **notification** and **event/workshop** days as markers with \`"allDay": true\` — which
does not excuse you from \`startTime\`/\`endTime\`; they are still required and are read as midnight. Keep
the two review/host milestones (§1) as your own working reminders; the three above are the immovable ones.

> The block above is not decoration. \`plan-paper-timeline.effects.harness.mjs\` parses it out of this
> file and replays it against a stand-in server carrying the REAL API's schema, so a prescription this
> section gets wrong fails in the harness rather than on a live run. Edit it like code.

## 4. FILING-SPACING rule (the reason this skill exists)
Where the papers are the authorship pillar of some external filing — a grant, a tenure packet, an
immigration petition — **do not let multiple submissions or acceptances cluster in the month before
that filing.** A burst of activity right before a deadline reads as *manufactured* rather than
*sustained*, and that is a documented reason for refusal, not a stylistic worry. A steady cadence with
recent-but-not-crammed activity reads far better.

When scheduling paper N against papers already on the calendar and a known/likely filing date:
- Spread submission and (projected) notification dates across months; avoid two acceptances landing in
  the same pre-filing window.
- If two CFPs force a cluster, stagger which one you *extend* later (workshop → conference) so the
  second, stronger publication lands in a later month on purpose.
- Prefer a paper with an earlier, safely-past deadline over one that would pile onto the filing month.

## 5. Record the verdict

🔴 LAST step, once the deliverable exists:

\`\`\`
node .claude/skills/paper-pipeline/scripts/ledger.mjs record plan-paper-timeline <paper-dir> FINDING <count> <report-path>
node .claude/skills/paper-pipeline/scripts/ledger.mjs record plan-paper-timeline <paper-dir> ABSTAINED <reason> "<one line>"
\`\`\`

**FINDING** — \`<count>\` slots have no buffer, or collide with another paper's pre-filing window;
\`<report-path>\` is the plan. Add \`--blocking\` when the deadline cannot be met from here.
**ABSTAINED** — \`no-witness\`: the backwards plan is on the calendar, \`access\` is green and no slot
is tight. \`input-missing\`: \`find-venue\` has produced no dated deadline to plan against.

This is the one skill whose blocking finding is a fact about the calendar rather than about the
paper: portal moderation runs up to two weeks and an author with no institutional email has no
expedite route, so one recorded today is still true tomorrow no matter how good the science gets.

🔴 **There is no PASS**, so "the plan is on the calendar" is not storable here. Put the event ids in
the \`ABSTAINED\` note — markdown is the source of truth and the calendar is its projection, and a row
with neither is a claim about a calendar nobody opened.

## Scorecard rows this skill owns
Two, and they fail differently — see \`paper-pipeline/references/pipeline-status-template.md\`:
- **\`access\`** — *can you physically submit?* (§0). Account · profile ACTIVE since \`<ISO>\` · portal
  reachable · form fields known · artifact-host requirement known. \`submit-paper\` is blocked on it.
- **\`schedule\`** — the schedule itself (§1–§4): the buffered backwards plan and its calendar events.

## Compose with
- **\`find-venue\`** — the source of the four CFP dates this skill consumes; run it first.
- **\`submit-paper\`** (+ the venue subskill) — what submit-day actually executes; this skill just makes
  sure the runway before it exists, **and that the account it executes through is already ACTIVE**.

## Provenance
This session scheduled two real papers with spacing rather than back-to-back: **AgenticDev 2026 @ ASE**
(submission 15 Jul, notify 21 Aug, camera-ready 28 Aug, workshop 12 Oct) and **AISec 2026 @ ACM CCS**
(submission 24 Jul). Nine days apart, deliberately staggered so notifications and any camera-ready work
don't collapse into one pre-filing month — the FILING-SPACING rule applied in practice, not in theory.`,
});
