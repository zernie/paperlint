// Compiled to SKILL.md by `vigiles compile`. Edit THIS file, never the markdown.
//
// Adopted 2026-08-17 (batch 3). Body carried over VERBATIM so the compiled diff shows
// only what the compiler adds. No `disallowedTools` fence yet — the field landed on
// `SkillSpec` in vigiles branch `claude/skill-disallowed-tools` and is not in a release
// this repo installs, so writing one here would not compile.
import { experimental_skill } from "vigiles/spec";

export default experimental_skill({
  name: "analyze-sibling-paper",
  description:
    "Deep-analyze a specific related / competing / concurrent paper — reading the ACTUAL paper, not its abstract — to decide the \"isn't this just X?\" question before a reviewer asks it: what it really does, whether it's prior or concurrent work, the strongest scoop a reviewer could claim, whether your delta is REAL or merely cosmetic, and the exact cite + positioning clause (or a scoop escalation) to apply. Saves the analysis to the paper's research folder and surfaces action points. Use whenever a paper close enough to yours surfaces — via verify-citations' nearest-neighbor, a reviewer's \"this was already done\", your own lit search, or an arXiv alert. Distinct from verify-citations (confirms a cite is real + one-line delta) and study-accepted-papers (mines a venue's accepted corpus for levers); this one does the deep per-competitor overlap/scoop analysis. Compose with verify-citations (feeds it neighbors), harden-paper (its nearest-neighbor-scoop axis calls this), and extend-paper (a scooped angle can become the extension's pivot).",
  context: "fork",
  tools: [
    "WebSearch",
    "WebFetch",
    "Read",
    "Write",
    "Grep",
    "Glob",
    "Bash",
    "Agent",
  ],
  body: `
# analyze-sibling-paper — settle "isn't this just X?" before a reviewer does

## Run me

🔴 FIRST, before any other step:

\`\`\`
node .claude/skills/paper-pipeline/scripts/announce.mjs analyze-sibling-paper <paper-dir>
\`\`\`

An advisory pass cannot be observed failing — silence is both its error state and its normal
state — so starting is an event, and events get written down.

The \`<paper-dir>\` argument is **your** paper, not the sibling — the row belongs to the paper being
defended. The sibling is named by \`<report-path>\` when the verdict is recorded.

When a paper close to yours surfaces, the wrong move is to cite it from its abstract and move on — that
leaves a scoop risk you can't see and a reviewer can. This skill reads the *actual* competitor, judges
whether your contribution genuinely differs, and produces a saved analysis with concrete action points
(the exact positioning clause to add, or — if it's a real scoop — an escalation, not a clause).

Grounding: the original-contribution criterion (a paper a
reviewer thinks is a repackaging earns no authorship credit even if accepted). Composes with
\`verify-citations\` (which surfaces the nearest neighbors) and \`harden-paper\` (whose scoop axis calls this).

## When it fires
Any paper a reviewer could point at and say "this was already done." Triggers: a nearest-neighbor from
\`verify-citations\`; a reviewer/panelist's "isn't this just X?"; a citation you're about to add that's
suspiciously close; an arXiv alert in your lane. When in doubt, run it — the cost of a 20-minute read is
far below the cost of a "novelty concern" reject.

## How to run it

1. **Deep-read the ACTUAL paper, not the abstract.** \`WebFetch\` the arXiv/ar5iv/DOI page and read
   abstract → intro → method → claims (as much as is accessible). An abstract hides exactly the overlap
   that matters. Try the fetch routes in order — \`arxiv.org/abs/<id>\` for metadata, \`arxiv.org/html/<id>v1\`,
   \`ar5iv.labs.arxiv.org/html/<id>\`, then the PDF — and **a 403/404 on one route is not "inaccessible"**;
   switch channel before concluding. **Record what you actually read** in the card's frontmatter as
   \`read: full | abstract | none\`, and name in a \`**Read:**\` line the sections you covered and the
   ones you could not — an abstract-only verdict is PROVISIONAL and must say so.
   🔴 **Verify the abstract's numbers against the body.** They disagree more often than you would expect,
   and a disagreement is itself a finding worth recording.

2. **Mine their REFERENCE LIST — mandatory, not optional.** A close sibling's bibliography is a map of
   your field drawn by someone who just surveyed it, and it is frequently worth more than the paper's own
   findings. Extract every entry, then diff against your own reference list and emit three sets:
   **in both** (count only) · **in theirs, not in ours, and relevant** — each with a verdict
   *MUST CITE* (a reviewer would fault you for missing it) / *SHOULD CONSIDER* / *NOT RELEVANT* ·
   **in ours, not in theirs** (does the gap show you are looking where they are not, or that you cited
   something obscure?). Be strict: most entries will be NOT RELEVANT, and saying so is the useful part.
   🔴 **The highest-value find in the whole skill is a MUST CITE entry that is itself a scoop** — a paper
   in their bibliography doing what you do. Look for it deliberately and state plainly if there is none.
   Every *MUST CITE* must be **confirmed by fetching its arXiv/DOI page** before it enters your text
   (\`verify-citations\` rule: a title is not real until a fetch says so) — mark each CONFIRMED-BY-FETCH or
   NOT-CONFIRMED.
3. **Classify by contribution TYPE** — system/defense · measurement · benchmark · framework · SoK ·
   position. Two papers can share a *concept* and still not collide if their contribution types differ (a
   *system* that assumes "rules can't catch semantics" and a *measurement* that proves it across a
   deployed ecosystem are different contributions). Type is the first lever of a real delta.
4. **Timing: prior vs concurrent.** Compare its arXiv/publication date to your submission.
   **Prior work** (clearly earlier) — you must engage and build on it; failing to cite is a reject.
   **Concurrent** (roughly within a few months) — acknowledge it, but you are NOT obligated to have built
   on it, and workshop/venue norms treat it as parallel discovery. State which, with dates.
5. **Steelman the scoop.** Write the strongest "isn't this just X?" a hostile reviewer could make,
   quoting the sibling. If you can't make it hurt, you haven't understood the overlap.
6. **Judge the delta — brutally.** Is your distinct contribution real and reviewer-proof, or only
   cosmetic/scope ("same idea, different object")? **Use an adversarial model (a Fable subagent) for this
   step** — you will flatter your own delta; it won't. A scope-only distinction on a shared core idea is a
   yellow flag; a different contribution type + a result the sibling doesn't have is a green one.
7. **Emit action points.** One of:
   - **Cite + position** (the common case): the exact 1–2 sentence clause to add. If the overlap is
     *conceptual*, acknowledge the shared idea **head-on** — "X observes this split; we measure it across
     the deployed ecosystem and show the corner is reachable." Owning it reads as scholarship; hiding it
     reads as not knowing the field, which is worse.
   - **Escalate** (rare but real): if it's prior work with the same contribution, a clause won't save you
     — reframe your contribution around what genuinely remains, or route the un-scooped angle to
     \`extend-paper\`. Flag this LOUDLY; it's a novelty problem, not a citation fix.

## Required shape of the saved card — two sections are machine-checked

The card is not free-form:

- **\`read:\` in the frontmatter** — \`full\`, \`abstract\` or \`none\`: how much of the full text you
  actually read. \`paperlint lint\` checks it (\`sibling/frontmatter\`, a warning on a card without it).
  It exists because "I read the paper" is the single easiest thing to skip while producing a card that
  looks complete. The \`**Read:**\` line under it names which sections.
- **\`## Sibling's References\`** — their bibliography mined and diffed against yours (step 2), with the
  MUST CITE / SHOULD CONSIDER / NOT RELEVANT verdicts.

\`\`\`yaml
---
title: "Smith et al. 2025 — <title>"
read: abstract # full | abstract | none
---
\`\`\`

## Save + surface — COLOCATED with the paper (mandatory — do not leave it in context)
Each paper's competitive landscape lives **with that paper**, not in a shared research folder: write the
analysis to **\`<paper-dir>/siblings/YYYY-MM-DD-<name>.md\`** (e.g. \`papers/<paper>/siblings/…\`) and keep
a **\`<paper-dir>/siblings/README.md\`** index listing every sibling + its one-line verdict (scoop-safe /
must-fix-clause / escalate). Colocation is the rule: when you open the paper's dir you should see its rivals
and their verdicts right there, and they travel with the paper to camera-ready and rebuttal. Include: what
it does, contribution type, timing (prior/concurrent + dates), the steelmanned scoop, the delta verdict,
and the action points (with the exact clause text to add/replace). Per the save-research rule, a competitor
analysis that lives only in a chat is lost the moment the session ends — and it's exactly what you'll need
again at rebuttal. **A close sibling with no file in \`<paper-dir>/siblings/\` is an unfinished analysis.**

## Record the verdict

🔴 LAST step, once the deliverable exists:

\`\`\`
node .claude/skills/paper-pipeline/scripts/ledger.mjs record analyze-sibling-paper <paper-dir> FINDING <count> <report-path>
node .claude/skills/paper-pipeline/scripts/ledger.mjs record analyze-sibling-paper <paper-dir> ABSTAINED <reason> "<one line>"
\`\`\`

**FINDING** — \`<count>\` is the number of action points the card produced (positioning clauses plus
*MUST CITE* entries), \`<report-path>\` is the saved card, which names the sibling. Add \`--blocking\`
for a genuine scoop, which the skill already treats as an escalation rather than a clause.
**ABSTAINED** — \`no-witness\`: the sibling was read in full and the delta needs no text to change.
\`blocked\`: the sibling's full text could not be obtained, so only its abstract was seen — which is
explicitly not an analysis and must never be recorded as one.

🔴 **There is no PASS.** "The delta is real" read identically whether the sibling had been read
whole or skimmed, and this skill's own first rule is that an abstract-only delta is not a verdict.
\`no-witness\` and \`blocked\` now say which happened.

One row per sibling analysed, filed under its own \`--check=<sibling-slug>\`; several finding rows
against one paper is the normal shape here, not a check that keeps failing. Before 2026-08-10 they
would have overwritten one another.

## Rules
- **Read the paper, not the abstract.** An abstract-only "delta" is not a verdict — and the card must
  say so: \`read: abstract\` in its frontmatter, and which parts in its \`**Read:**\` line.
- **Mine their references.** A sibling analysis that never opened the sibling's bibliography is half done;
  the scoop you missed is more likely to be in their reference list than in their results.
- **Classify by contribution type** before judging overlap — it's the difference between a shared concept and a collision.
- **Prior vs concurrent is a date fact, not a vibe** — state the dates.
- **Own conceptual overlaps head-on**; a reviewer who spots an unacknowledged twin assumes you didn't read the field.
- **A genuine scoop is an escalation, not a clause** — don't paper over a novelty problem with a sentence.
- **Judge the delta with an adversarial model**, not your own optimism.
- **Save the analysis to the repo** and index it.

## Compose with
- \`verify-citations\` — surfaces the nearest-neighbor works; hand each genuine sibling to this skill.
- \`harden-paper\` — its nearest-neighbor-scoop axis (axis 3) calls this for each close competitor.
- \`study-accepted-papers\` — venue-corpus levers (different axis: the venue's bar, not a specific rival).
- \`extend-paper\` — a scooped angle, or the un-scooped remainder, can become the next paper's pivot.

## Provenance
Built from the **AISec 2026 GateBench** run: \`verify-citations\` flagged **AgentTrust** (yang2026agenttrust,
arXiv:2606.08539) as making the same lexical-vs-semantic split the paper's spelling→grammar→effect framing
builds on — the sharpest "isn't this just X?" in the paper. Citing it from the abstract was not enough to
know whether the framing was a repackaging; only a deep read of the actual paper, classified by
contribution type (their trust-*system* vs our *measurement + benchmark + existence result*) and dated
against submission, could settle the delta and produce the head-on positioning clause. That is exactly
the workflow this skill encodes.

**Extended 2026-07-29** — *What Breaks When LLMs Code?* (arXiv:2605.30777) was cited into the
\`the reference paper\` introduction **from its abstract**, and a card was written saying so. Two gaps
surfaced immediately: the full text was never read (so the "no scoop" verdict rested on an abstract),
and its reference list — assembled by authors who had just screened 68,816 papers across 22 venues —
was never opened at all. Both are now steps 1–2, and both are machine-checked in the saved card, because
the previous version of this rule already said "read the paper, not the abstract" in prose and that did
not stop it happening. Prose isn't policy.`,
});
