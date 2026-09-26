// Compiled to SKILL.md by `vigiles compile`. Edit THIS file, never the markdown.
//
// Adopted 2026-08-17. Body VERBATIM from the previous SKILL.md. This is the only one
// of the batch that runs FORKED — `context: "fork"` is what gives a skill a real
// call→return boundary, so it is carried explicitly rather than dropped.
import { experimental_skill } from "vigiles/spec";

export default experimental_skill({
  name: "cold-read-diff",
  description:
    "Send just-changed paper prose to a reader with NO context and ask what each sentence claims — the only check that catches a sentence which is short, true, jargon-free and still meaningless to anyone who does not already know the idea. Run after every prose edit to a paper, before calling the edit done, and before reporting a section as fixed. Scoped to the diff, so it is cheap enough to run every time. Not a writing grade (grade-paper-writing), not a structural pass (tighten-paper), not a defect review.",
  context: "fork",
  tools: ["Bash", "Read", "Agent"],
  body: `
# cold-read-diff — the reader who cannot fake understanding

## Run me

🔴 FIRST, before any other step:

\`\`\`
node .claude/skills/paper-pipeline/scripts/announce.mjs cold-read-diff <paper-dir>
\`\`\`

An advisory pass cannot be observed failing — silence is both its error state and its normal
state — so starting is an event, and events get written down.

## The failure this exists for

On 2026-08-05 the author of \`the reference paper\` found eleven unreadable passages by eye, in a paper
that had passed six writing grades, four structural passes and five review panels. Every one of them
was short, factually correct, free of every word on the jargon list, and inside every mechanical
threshold. Samples, with his reactions:

> *"The state to remove is therefore not the rule but its claim about itself"* — **«wtf»**
> *"these files are filled with constructions nobody built"* — **«wtf»**
> *"Three answers, all of them after the fact"* — **«VAGUE AF»**
> *"Both numbers carry a caveat…"* — **«WTF.»**

They share one property: **they parse only for a reader who already holds the idea.** That is not a
style defect and no metric can see it. Sentence length, number density, hedge share, tic frequency —
all green on every one of these.

## Why the existing pipeline could not catch it

Every reader in it knows too much or cannot read at all:

| reader | holds the idea? | can judge meaning? |
|---|---|---|
| the author | maximally — that is the curse of knowledge | yes |
| the persona subagent | **yes: it is handed the paper and the framing** | yes |
| the review panel | yes | yes |
| \`prose-lint\` | no | **no — it counts patterns** |

The gap between "knows too much" and "cannot read" is exactly where these sentences live. Closing it
needs a reader who is competent and **structurally uninformed**, and the only way to guarantee that
is to withhold the context rather than ask them to ignore it.

## Why the DIFF, and not the paper

A full cold read costs a long agent run, so it gets run once a day, which means prose written after
it ships unread. Scoped to the changed paragraphs it costs a couple of minutes, so it runs every
time — and coverage beats depth here, because the defect is per-sentence.

Scoping also makes the check honest. Hand an agent the whole paper and it reconstructs the idea from
the surrounding text, then reports that the sentence is clear. Hand it three paragraphs and there is
nothing to reconstruct from: if the sentence does not carry its own meaning, the agent cannot invent
one, and its confusion is the finding.

## How to run it

1. **Take the diff.** \`git diff -U0 -- <paper.md>\` since the last commit, or the \`new_string\` of the
   edits just applied. Prose only — skip comments, tables, bibliography.
2. **Spawn ONE agent with no repository context.** Give it the changed paragraphs **as text in the
   prompt**, not as a file path. A path is an invitation to read the neighbours, and reading the
   neighbours is how the check fails silently. \`sonnet\` is the right model: competent, cheap,
   and not the one that wrote the sentence.
3. **Ask exactly two questions per sentence:**
   - *What does this sentence claim? Restate it in your own words.* If restating requires guessing,
     the answer is \`CANNOT PARSE\` plus what stopped them — an undefined term, a pronoun with no
     referent, a number with no denominator, two clauses that do not connect.
   - *Would a reader who stops here understand it?* Yes / No / Only-if-they-know-X.
4. **Ask for the dangerous class explicitly:** *which sentences sound clever but say less than they
   appear to?* Those read fine and carry nothing, and they are the ones a knowing reader waves
   through.
5. **Apply the fixes — as rewrites of the whole thought, never as excisions.** See the rule below.
6. **Re-run on the fix.** An edit is not done until the same kind of reader parses the replacement.
   One confirming round; do not loop past it.

## 🔴 Hand the reader WHOLE PARAGRAPHS, never \`+\` lines

Measured on 2026-08-05, first machine run of this skill: about a third of the reader's stalls were
artefacts of the extract, not defects in the paper — *"\`it\` has no referent"*, *"this sentence is cut
off mid-clause"*, *"those populations have no antecedent"*. The neighbouring sentences simply had not
changed, so they were not in the diff.

Two more things the same run proved:

- **Expand build-time macros first.** The reader saw seven raw \`{{placeholders}}\` and correctly
  reported that every headline number was missing. That is a true statement about the extract and a
  false one about the paper.
- **Strip working comments.** He graded \`<!-- JUSTIFY … -->\` notes as prose because he could not tell
  them apart — and said so, which is itself a finding about the extract.

**So:** take the changed lines, then widen each to its enclosing paragraph, expand macros, drop
comments, and hand the reader continuous prose. The findings that survive that are worth the run; the
ones that do not are noise, and noise is how this check gets muted.

## The report's frontmatter — the findings, as records

The report opens with YAML frontmatter that lists what it found, one record per finding.
\`paperlint lint\` validates it (\`review/frontmatter\`): an **open** finding must name the
pipeline \`cause\` that let it through — fix that, and the text edit falls out of running the
fixed tool.

\`\`\`yaml
---
findings:
  - id: 1
    status: open            # open | fixed | wontfix
    cause: missing-skill    # skill-defect | missing-skill | hook | rule — required when open
    title: "§3 opens on a term the reader has not met"
  - id: 2
    status: fixed
---
\`\`\`

## Record the verdict

🔴 LAST step, once the deliverable exists:

\`\`\`
node .claude/skills/paper-pipeline/scripts/ledger.mjs record cold-read-diff <paper-dir> FINDING <count> <report-path>
node .claude/skills/paper-pipeline/scripts/ledger.mjs record cold-read-diff <paper-dir> ABSTAINED <reason> "<one line>"
\`\`\`

**FINDING** — \`<count>\` is the number of changed sentences the cold reader could not restate (every
\`CANNOT PARSE\` counts), \`<report-path>\` is the \`reviews/*cold-read*.md\` file.
**ABSTAINED** — \`no-witness\`: every changed sentence came back restated correctly.
\`input-missing\`: the diff held no prose to read.

🔴 These two are different answers and the difference is the whole reason the vocabulary is closed:
one says a reader read it and found nothing, the other says there was nothing to hand a reader.
Prose collapses them and the old \`PASS\`/\`ABSENT\` pair only half-separated them, because \`PASS\` also
got recorded when nobody had run a reader at all. There is no \`PASS\` now; the reason is the answer.

## Rules

- 🔴 **No context in the prompt. Ever.** Not the title, not the abstract, not "this is a paper about
  agent rules files". Every sentence of background handed to the reader is a sentence of confusion
  they will no longer report.
- 🔴 **A fix that removes the flagged construction and keeps the compression is not a fix.** Proven
  twice in one hour: *"not through any defect in how we write it, but because that is what English
  is"* → *"that is what English is for"* (tic gone, meaning inverted into nonsense); *"the agent
  turns out not to be the weak link"* → *"The agent obeys"* (three words, zero flags, wrong finding).
  Rewrite the **thought** in plain words. The tic is usually a symptom of a compressed idea, and
  decompressing removes it as a side effect.
- **Length is not the constraint here — meaning is.** If plain language needs more words, take them
  and pay from an appendix, which is outside the page limit. Paying by shortening another sentence
  is what created the problem.
- **\`CANNOT PARSE\` is a result, not a failure of the reader.** Never argue with it. The author's
  ability to understand his own sentence is not evidence about anyone else's.
- **Run it on your own fixes too.** The author is the least qualified judge of whether his repair
  reads, and that is exactly when he feels most certain.

## Enforcement

\`pipeline-check.mjs\` raises \`stale-cold-read\` when the newest \`reviews/*cold-read*.md\` is older than
the paper source, and \`no-cold-read\` when none exists. The date comparison is the whole mechanism:
a cold read that predates the current text describes prose that no longer exists.

## Compose with

- \`grade-paper-writing\` — the batch readability gate; this is its continuous counterpart. That one
  produces a stall inventory over the whole paper; this one asks whether the last edit means anything.
- \`tighten-paper\` — structural cuts. Note the interaction: a tighten pass that pays for an addition
  by shortening sentences elsewhere is precisely what generates work for this skill.
- \`paper-pipeline\` — owns the text-pass / evidence-pass split; this belongs to the text pass.

## Provenance

Built 2026-08-05, the day before the \`the reference paper\` deadline, after the corpus owner read the built PDF and
found eleven unreadable passages in twenty minutes — none of which any automated check had flagged,
and several of which had been introduced that same morning by fixes to other automated checks.`,
});
