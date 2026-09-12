// Compiled to SKILL.md by `vigiles compile`. Edit THIS file, never the markdown.
//
// Adopted 2026-08-17 (batch 3). Body carried over VERBATIM so the compiled diff shows
// only what the compiler adds. No `disallowedTools` fence yet — the field landed on
// `SkillSpec` in vigiles branch `claude/skill-disallowed-tools` and is not in a release
// this repo installs, so writing one here would not compile.
import { experimental_skill } from "vigiles/spec";

export default experimental_skill({
  name: "draft-paper",
  description: "Use when the numbers exist and it's time to WRITE the paper — \"draft the paper\", \"turn these findings into a submission\", \"write the abstract/intro/threats\". Gives the section skeleton of a measurement/benchmark paper plus what gets it accepted AND cited — precise claim-sizing (including an explicit \"what we do NOT claim\"), a construct-validity frame, an honest threats-to-validity section that turns limitations in your favor, and one memorable stat that travels. Encodes the two theses that carried real measurement papers (\"measuring the wrong number\", \"safety theater\"). NOT for grading finished prose (grade-paper-writing) or structural editing (tighten-paper) — this is the generative counterpart. Compose with build-benchmark (numbers), grade-paper-writing (prose QA), render-paper, verify-citations, then the review skills.",
  tools: ["Read", "Write", "Edit", "Grep", "Glob", "Agent", "Skill", "Bash(node .claude/skills/paper-pipeline/scripts/announce.mjs:*)", "Bash(node .claude/skills/paper-pipeline/scripts/ledger.mjs:*)"],
  body: `
# draft-paper — prose that survives review and gets cited

## Run me

🔴 FIRST, before any other step:

\`\`\`
node .claude/skills/paper-pipeline/scripts/announce.mjs draft-paper <paper-dir>
\`\`\`

An advisory pass cannot be observed failing — silence is both its error state and its normal
state — so starting is an event, and events get written down.

A measurement paper lives or dies on two things reviewers actually reward: a **reusable method/norm**
they can apply to the next system, and **claim-sizing so precise it can't be attacked**. Numbers alone
are a blog post. This skill turns \`build-benchmark\`'s output into that kind of draft.

The bar is not "is the result true" — it's "will a stranger cite this in two years." That happens when
you gave them a *way to measure something* or a *bound they can quote*, not a verdict on one tool.

## Section skeleton (measurement/benchmark paper)
Write in this order; it's also roughly the read order a reviewer skims.

🔴 **Decide body vs appendix as you write, not when the page limit forces it** —
\`paper-pipeline/references/body-vs-appendix.md\`. A page limit with no rule behind it evicts whatever
was written last, which is reliably the honest qualification nobody had room for. The rule in one
line: the body carries everything a reviewer's decision depends on, and **a bound that narrows a
number in the body stays in the body**.

1. **Abstract** — the ONE contribution, sized. Problem → the method/insight → the single headline
   number → what it means. Tight (see "Scope the abstract" below).
2. **Introduction + contributions** — the gap (what everyone measures / assumes today and why it's
   wrong or unmeasured), then a bulleted **contributions** list. Each contribution is a *thing you
   built or established* (a method, a benchmark, a bound, a norm), not "we ran experiments."
3. **Background + threat model** (security) / **Setup** (non-security) — define terms, the system under
   study, and — for security — the explicit threat model (attacker goals/capabilities/knowledge). A
   fuzzy threat model is the fastest reject at a security venue.
4. **Method** — the reusable core. How the measurement/benchmark is *constructed* so someone else can
   run it on a different target. This is the part that gets cited; give it the most care.
5. **Results** — the numbers from \`build-benchmark\`, each tied to a claim. Report ranges/CIs, not
   rounded maxes. One figure or table carries the paper — make it legible standalone.
6. **Threats to validity** — construct / internal / external, honestly (see below). This section is a
   trust signal, not a confession.
7. **Related work** — position against the *nearest* neighbor explicitly ("X measures A; we measure B
   because A is the wrong number"). Credit generously; that's where the framing lands.
8. **Ethics** (security papers) — responsible disclosure, who could be harmed, punching-down check.
   Point to \`paper-pipeline/references/anonymization.md\` before naming any real system/maintainer.
9. **Conclusion** — restate the method and the one insight; no new claims.
10. **Availability** — the anonymized artifact link (see \`submit-paper\`). Reviewers reward a runnable
    artifact more than another paragraph.

## What makes it ACCEPTED and CITED
- **A reusable method/norm over a one-off result.** "Tool Y scores 40%" dies; "here's how to measure
  Z, and by it Y scores 40%" survives, because the method outlives Y. Frame every result as an instance
  of a general procedure.
- **A crisp, generalizable bound or insight** the reader can quote without your paper open — one
  sentence they'll paraphrase back to you in review. That sentence is the abstract's spine.
- **Precise claim-sizing.** Say exactly how big the claim is and no bigger. Include an explicit
  **"What we do NOT claim"** paragraph — it pre-empts Reviewer 2's whole attack surface and reads as
  rigor, not weakness. (Both real papers have one; it's the highest-leverage paragraph in the draft.)
- **A construct-validity frame.** State plainly what quantity you're measuring and why it's the *right*
  quantity — "measuring the wrong number" only works if you've defined the right one. Make the mapping
  from concept → metric explicit; that's what separates a benchmark from a leaderboard.
- **An honest threats section that turns limitations in your favor.** Every limitation you name first,
  bounded, is one a reviewer can't wield against you. "N is small, so we claim a lower bound not a
  point estimate" converts a weakness into a scoped claim. Don't hide; scope.
- **One memorable stat or figure that travels.** Pick the single number/image that survives out of
  context (a tweet, a related-work sentence in someone else's paper). Everything else supports it.
- **Credit-the-humans tone.** Dunk on the *claim or the metric*, never the authors. "The field measures
  X; X is the wrong number" — not "prior work is naive." Punching down reads as insecurity and invites
  a hostile review; generous framing invites a citation.

## Scope the abstract tightly
The abstract sells ONE contribution and ONE headline number. Do **not** cram every hedged sub-result —
each extra qualified number dilutes the one that matters and invites nitpicks before the reviewer
reaches the method. Hedge in Results/Threats, not the abstract. If you can't say the contribution in one
sentence, you haven't found it yet — go back to the method. Structure it against the five-move template
(context → gap → approach → one number → so-what) in \`../paper-pipeline/references/writing-craft.md\`, which
also holds the craft rules and the writing rubric \`grade-paper-writing\` grades against — write toward the
grade.

## Run the prose through the PAPER suite's QA (do not skip — and do not use the blog skills)
Before any review pass, run the draft through the paper-side prose QA — it catches what a self-read won't:
- **\`grade-paper-writing\`** — the 9-dim rubric + the PERSONA cold-read stall pass (a committed
  non-academic persona, per-section — the localized "wait, what does that even mean?" axis authors are
  blind to). Its avoid-list grep also strips the AI-writing tropes (hedge-stacking, "it's worth
  noting", limp connectives, fake balance) that make a draft read unserious to a human PC.
- **\`../paper-pipeline/references/writing-craft.md\`** — write toward the rubric; its
  register-calibration buckets decide which jargon to keep / gloss / rename for the venue's actual reader.

**Boundary:** the site repo's \`writing-quality\` + \`audience-test\` skills are for **blog posts only**.
For papers they duplicate — and are superseded by — \`grade-paper-writing\` + writing-craft's persona
pass (the blog skills lack the persona fix, so they under-fire on paper prose). Never route paper
prose QA to them.

## Record the verdict

🔴 LAST step, once the deliverable exists:

\`\`\`
node .claude/skills/paper-pipeline/scripts/ledger.mjs record draft-paper <paper-dir> FINDING <count> <report-path>
node .claude/skills/paper-pipeline/scripts/ledger.mjs record draft-paper <paper-dir> ABSTAINED <reason> "<one line>"
\`\`\`

This skill generates rather than judges, so what it records is about the run, not about the paper.

**FINDING** — it declined to draft because a required input was missing: no numbers from
\`build-benchmark\`, or an empty \`frame\` paragraph from \`argument-arc\`. \`--blocking\`, always, because
drafting past it produces prose about numbers that do not exist.
**ABSTAINED** — \`no-witness\`: sections were written and the generator has nothing to report about
the paper. Put the drafted sections in the note; they are the deliverable, not evidence of a defect.

🔴 **Design smell, stated plainly: this gate will almost always record an abstention**, and
\`status.mjs\` will flag it as one that has never returned a finding. Leave the flag standing — it is
telling the truth. A generator is not a gate, and the only honest negative it can produce is the
refusal above. If a run ever ends with prose written from numbers that do not exist, that is a
\`FINDING --blocking\` and must be recorded as one rather than quietly upgraded.

🔴 Deleting \`PASS\` did not fix this skill and was never going to: the old vocabulary let it write
down "I produced sections" as though that were an answer about the manuscript, and the new one
simply refuses to. The generator is still not a gate. \`draft-paper/population-map\` — a real check —
is the row that can say no about this skill's output.

## Compose with
- **\`build-benchmark\`** — its numbers/CIs are the Results section's raw material; never hand-type a
  number that isn't in its output (that's how paper↔artifact mismatches get born).
- **\`grade-paper-writing\`** (+ \`../paper-pipeline/references/writing-craft.md\`) — the paper-side prose
  QA, above. (Site-repo \`writing-quality\` / \`audience-test\` = blog posts only.)
- **\`render-paper\`** — compile + eyeball pages 1–2 once prose is in.
- **\`verify-citations\`** — every cite in Related Work must exist AND say what you claim.
- Then the review loop: **\`paper-adversarial-review\`** → **\`pc-panel-review\`** (venue-fit mode for a
  quick fit score, then the full panel as the gate).

## Provenance (two real papers)
- **AgenticDev 2026 @ ASE — "Measuring the Wrong Number."** The thesis IS the construct-validity frame:
  the field optimizes a metric that isn't the thing anyone cares about. The method (how to measure the
  *right* number) is the contribution; the tool verdict is just the demonstration. Its "what we do NOT
  claim" paragraph and lower-bound-not-point-estimate threats framing are what moved it through review.
- **AISec 2026 @ ACM CCS — "Safety Theater."** A security-venue measurement paper: a defense that
  *looks* like safety without measurably being it. Needs the explicit threat model + ethics/disclosure
  sections above, and dunks on the *defense pattern*, never the maintainers who shipped it — the
  credit-the-humans rule is load-bearing at a top-tier security venue where a hostile framing draws a
  hostile review. Both papers win on precise claim-sizing and an honest threats section, not on the
  size of the effect.`,
});
