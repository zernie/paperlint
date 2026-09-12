// Compiled to SKILL.md by `vigiles compile`. Edit THIS file, never the markdown.
//
// Adopted 2026-08-17 (batch 3). Body carried over VERBATIM so the compiled diff shows
// only what the compiler adds. No `disallowedTools` fence yet — the field landed on
// `SkillSpec` in vigiles branch `claude/skill-disallowed-tools` and is not in a release
// this repo installs, so writing one here would not compile.
import { experimental_skill } from "vigiles/spec";

export default experimental_skill({
  name: "paper-adversarial-review",
  description: "Use when asking \"red-team this paper\" / \"what would Reviewer 2 attack?\" / \"find the weaknesses before I submit\" — ONE fast hostile-but-fair review of a paper draft. Surfaces overclaims, methodology holes, missing baselines/citations, novelty concerns, threats to validity, and desk-reject risks, with concrete fixes, led by a multi-axis 1–5 scorecard whose card composes into a pc-panel-review panel. NOT the multi-reviewer accept/reject decision (pc-panel-review), a writing grade (grade-paper-writing — this skill consumes its stall inventory rather than re-grading prose), or the full pre-submit gate (harden-paper). Especially for security and agentic-coding measurement papers.",
  context: "fork",
  tools: ["Read", "Write", "Grep", "Glob", "Agent", "Skill", "Bash(node .claude/skills/paper-pipeline/scripts/announce.mjs:*)", "Bash(node .claude/skills/paper-pipeline/scripts/ledger.mjs:*)"],
  body: `
# paper-adversarial-review — be the reviewer who wants to reject it

> **Which review skill?** \`paper-adversarial-review\` (you are here) = one hostile reviewer, fast defect
> hunt. \`pc-panel-review\` = the whole PC (N independent lenses incl. an artifact-runner) + a chair
> meta-review — the real pre-submission GATE, run LAST; its **venue-fit mode** is the one-reviewer
> CFP-fit score (formerly \`venue-review-sim\`). Reach for an atom (this, or venue-fit mode) for a quick
> spot-check; run the panel for the decision.

## Run me

🔴 FIRST, before any other step:

\`\`\`
node .claude/skills/paper-pipeline/scripts/announce.mjs paper-adversarial-review <paper-dir>
\`\`\`

An advisory pass cannot be observed failing — silence is both its error state and its normal
state — so starting is an event, and events get written down.

Purpose: catch what a real peer reviewer will hit, while it's still fixable. Peer review is
**read, not run** — reviewers judge the *text, figures, and reported numbers*, rarely execute code.
So the paper must be self-contained and airtight on its face. This skill simulates the skeptical
reviewer and returns an actionable critique.

## How to run it
Prefer a **separate model as the reviewer** (e.g. Fable via a subagent) so it's not the author
grading itself. Give the reviewer the full paper text (Read the \`.tex\`/\`.md\`/PDF) and the target
venue + paper type (short/full/position/benchmark). Ask for the structured output below.

## The review must cover (ranked by how often it kills a paper)

1. **"So what / is this enough?" (contribution & novelty).** State the single contribution in one
   sentence. Is it enough for *this venue and paper type*? Distinguish: a **methodology/benchmark**
   contribution (a reusable way to measure X) vs a **result** ("tool Y is bad") — the former survives
   review, the latter reads as a blog post. If the paper is really "X doesn't work," is the
   *method/finding* generalizable beyond the one target? Name the weakest framing and the strongest
   available reframing.
2. **Overclaims.** Every sentence stronger than the evidence. Hunt for: absolutes, causal claims from
   correlational data, "always/never," headline numbers not backed by the reported stats, a title that
   promises more than the body delivers. For each hit, propose the fix by the **review-ratchet rule** —
   tighten → cut → move to Threats → only then inline-hedge, and run \`tighten-paper\` after the round to
   strip what it deposited. Full rule: \`paper-pipeline/references/review-ratchet.md\`.
3. **Methodology holes a reviewer will poke.** Missing baseline, sample size / power, confounds,
   cherry-picked tasks, unfair comparison, statistics misused (n, variance, multiple comparisons),
   reproducibility gaps. For measurement papers: construct validity — are you measuring what you claim?
4. **Threats to validity — are they honest and complete?** What did the authors *not* list that a
   reviewer will? Adaptive attackers, generalization, single-model/single-dataset, convenience sample.
5. **Related work gaps.** What obvious prior work is uncited? Would a reviewer say "this was already
   done by ___"? Is the delta over the nearest neighbor explicit?
6. **Presentation / desk-reject risks.** Over/under length, format (ACM/IEEE), anonymization for
   double-blind (self-citations, repo links, "our tool X" naming that de-anonymizes), figures
   unreadable, tables inconsistent with text, TMI/self-indulgent passages that waste a short paper's
   space.
6b. **Readability's implicit drag (the halo effect) — CONSUME the persona inventory, don't re-run the
   pass.** A reviewer who finds the paper a slog loses confidence in the *science* and marks it down
   overall, usually citing "methodology" rather than "writing." This skill's unique job here is to model
   that drag on the OVERALL score — NOT to judge readability by its own read: a frontier reviewer knows
   every term and cannot experience reader fatigue, so an inline cold-read (no persona, no per-section
   chunking, no mechanical triggers, no hard caps) systematically under-fires — exactly the config that
   once waved a bloated paper through. Take \`grade-paper-writing\`'s PERSONA stall inventory + scorecard
   as the input — **if none exists for this draft, spawn \`grade-paper-writing\` first** — and state how
   much the writing, per that inventory (stall density, walls, spec-sheet paragraphs), would drag a
   real reviewer's overall score. Bad writing is a silent score-killer, not just a desk-reject flag.
7. **Ethics / responsible-disclosure / tone** (security & measurement papers). Naming small hobbyist
   projects as "insecure/broken" = punching down + disclosure risk → prefer aggregate stats + one
   representative named example. Dunk on the *claim*, credit the *humans*. Flag any hater-tone.

## Output format
- **Scorecard (lead with this) — every axis, 1–5, one-line why each.** A graded card, not just prose, so
  a weak axis is visible at a glance (e.g. "Readability 2/5 — abstract is a stat-wall, point arrives on
  p.3"). Score all of: **Novelty/contribution · Technical rigor/methodology · Evidence strength** (stats,
  sample size, baselines; for security: adaptive-attacker eval + threat model) **· Positioning/related
  work** (delta over nearest neighbor) **· Readability/prose** (pull from \`grade-paper-writing\`'s rubric)
  **· Reproducibility/artifact · Honesty/claim-scoping** (overclaim vs hedged) **· Presentation/desk-reject
  risk**. End with an **Overall 1–5**. Keep the same 1–5 scale the other skills use so cards compose into a
  \`pc-panel-review\` panel; the lowest 1–2 axes are the real story, not the average.
- **Verdict leaning:** (strong accept / weak accept / borderline / weak reject / reject) + one-line why.
- **The one contribution, in one sentence** (as a reviewer would paraphrase it — often less than the authors think).
- **Top 5 weaknesses, ranked**, each: the attack (how a reviewer phrases it) → severity → concrete fix.
- **Line/section-level nits** (overclaims, TMI, inconsistencies) as a checklist.
- **Missing citations** (specific, real — do not invent).
- **Strongest reframing** if the contribution is undersold or misframed.
- **What to cut** (for length / TMI) and **what to add** (for soundness).

## Record the verdict

🔴 LAST step, once the deliverable exists:

\`\`\`
node .claude/skills/paper-pipeline/scripts/ledger.mjs record paper-adversarial-review <paper-dir> FINDING <count> <report-path>
node .claude/skills/paper-pipeline/scripts/ledger.mjs record paper-adversarial-review <paper-dir> ABSTAINED <reason> "<one line>"
\`\`\`

**FINDING** — \`<count>\` is the number of ranked weaknesses, \`<report-path>\` the review with its
scorecard. Add \`--blocking\` when the leaning is reject, or there is a live desk-reject risk.
**ABSTAINED** — \`no-witness\`: the hostile read found nothing. \`blocked\`: there was no rendered
draft to attack.

🔴 **There is no PASS, and this skill is the reason the word was dangerous.** A hostile read that
found nothing either met a very good paper or was not hostile, and the old vocabulary wrote the
same word for both. \`no-witness\` says the true thing — this reader has no witness for the paper
being sound — and leaves the second possibility standing where it belongs, in view.

Record the weakness count, not the Overall 1–5. The average is exactly what this skill tells its own
reviewer to distrust — the lowest one or two axes are the story.

## Rules
- Be adversarial but *fair* and *specific* — "weak" is useless; "the 65% claim in the abstract isn't
  supported because the pooled bill is −1%, reword to X" is useful.
- Do **not** fabricate citations or facts. If unsure a paper exists, say "verify."
- Undersell nothing to spare feelings; the point is to fail it now, not at the venue.
- If the paper is genuinely strong, say so — don't manufacture problems.

## Compose with
- \`grade-paper-writing\` — the Readability/prose axis of the scorecard defers to its 9-dim rubric; run it for the sentence-level fixes behind a low readability score.
- \`pc-panel-review\` — this atom's scorecard is one reviewer's card; the panel aggregates N of them (same 1–5 scale) into the decision.
- The venue CFP (fit/format). Prose QA for papers routes to \`grade-paper-writing\` + \`paper-pipeline/references/writing-craft.md\` — NOT the site repo's \`writing-quality\` / \`audience-test\` skills (those are for blog posts only; the paper suite's persona pass supersedes them here).`,
});
