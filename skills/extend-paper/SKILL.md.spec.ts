// Compiled to SKILL.md by `vigiles compile`. Edit THIS file, never the markdown.
//
// Adopted 2026-08-17 (batch 3). Body carried over VERBATIM so the compiled diff shows
// only what the compiler adds. No `disallowedTools` fence yet — the field landed on
// `SkillSpec` in vigiles branch `claude/skill-disallowed-tools` and is not in a release
// this repo installs, so writing one here would not compile.
import { experimental_skill } from "vigiles/spec";

export default experimental_skill({
  name: "extend-paper",
  description: "Turn an accepted workshop / short paper into a second, stronger publication at a higher-prestige indexed venue — the \"body of work\" a strong dossier needs, not a one-hit paper. Covers the ≥30% new-material rule, the never-dual-submit rule, what genuinely counts as new content, and picking + timelining the upgrade venue. Use after a paper is accepted and you want the follow-on publication. Compose with find-venue, plan-paper-timeline, camera-ready, research-ideate.",
  tools: ["Read", "Write", "Grep", "Glob", "WebSearch", "WebFetch", "Skill", "Bash(node .claude/skills/paper-pipeline/scripts/announce.mjs:*)", "Bash(node .claude/skills/paper-pipeline/scripts/ledger.mjs:*)"],
  body: `
# extend-paper — workshop/short paper → a second, stronger publication

## Run me

🔴 FIRST, before any other step:

\`\`\`
node .claude/skills/paper-pipeline/scripts/announce.mjs extend-paper <paper-dir>
\`\`\`

An advisory pass cannot be observed failing — silence is both its error state and its normal
state — so starting is an event, and events get written down.

One accepted paper is a data point; two related papers climbing in prestige is a **trajectory**, and
"sustained acclaim" is what a body-of-work review actually rewards. Workshop→conference and
conference→journal extensions are a standard, expected move — venues invite them. The catch: an
extension is *new work that subsumes the old*, not the same paper resubmitted. This skill is how to do
it legitimately.

## The two hard rules
- **≥30% new material.** Most venues (and ACM/IEEE self-plagiarism policy) require an extension to add
  substantial new content — the common bar is roughly a third genuinely new. Not reformatting, not more
  words: new experiments, new analysis, new data. Cite the original workshop paper explicitly and state
  in the intro what's new ("this paper extends our workshop paper [X] with …").
- **Never dual-submit.** One venue at a time, full stop. The workshop paper is done and indexed; the
  extension goes to exactly one new venue and waits for its decision before going anywhere else.
  Simultaneous submission of the same/overlapping work is an ethics violation that can get both papers
  retracted — a dossier-killer.

## What actually counts as new material
Pick the axis where the workshop paper was thin and build it out for real:
- **More coverage** — more tools / venues / models / languages measured (a 3-tool study → 12 tools).
- **A deeper analysis axis** — add a dimension the short paper only gestured at (cost *and* latency,
  a failure taxonomy, an ablation over the method's knobs).
- **A field study or user study** — take the lab measurement into a real deployment / real developers.
- **The residual-bug fix built out** — the "future work" / limitation you named in Threats to Validity
  becomes a full contribution (you designed the fix; now implement + evaluate it).
- **A stronger artifact** — a benchmark others can run and cite, not just a repro of your own numbers.

If you can't honestly point to which ≥30% is new, it's not an extension yet — go back to
\`research-ideate\` and find the new contribution first.

## Pick the upgrade venue
Run **find-venue** — the target is a higher-prestige *indexed* home than the workshop, matched to the
paper type:
- A **measurement / evaluation** paper → **MSR** (Mining Software Repositories) or **NeurIPS
  Datasets & Benchmarks** — venues that reward reusable measurement contributions.
- A **benchmark / security** paper → a full security conference (the tier above the workshop it started
  at), where the artifact is the headline.
- Prefer venues that **explicitly invite journal/conference extensions** (many workshops, AgenticDev
  included, say so in their CFP) — the extension path is sanctioned there.
Verify the target's CFP the same way \`find-venue\` does: fetch it, confirm it accepts extensions of prior
short papers, and check its self-plagiarism / overlap policy.

## Timeline it (and space it out)
Run **plan-paper-timeline** against the upgrade venue's deadline, then deliberately **space the
submissions**. A burst of papers clustered right before an external filing deadline reads as
manufactured, not sustained — a documented reason for refusal, not a stylistic worry. Aim the extension to land a few months after the first paper's
acceptance so the record shows steady output over time, one ORCID tying every version together.

## Record the verdict

🔴 LAST step, once the deliverable exists:

\`\`\`
node .claude/skills/paper-pipeline/scripts/ledger.mjs record extend-paper <paper-dir> FINDING <count> <report-path>
node .claude/skills/paper-pipeline/scripts/ledger.mjs record extend-paper <paper-dir> ABSTAINED <reason> "<one line>"
\`\`\`

**FINDING** — \`<count>\` open items before the extension is legitimate; \`<report-path>\` is the plan.
Add \`--blocking\` when the ≥30% cannot honestly be pointed at, which sends the work back to
\`research-ideate\`.
**ABSTAINED** — \`no-witness\`: a legitimate extension is scoped — ≥30% genuinely new material, one
named venue, no dual submission — and nothing is open. \`blocked\`: there is no accepted base paper
to extend.

🔴 **There is no PASS**, and here that matters more than anywhere: the tempting move at this moment
is to resubmit the same paper with a new title, and a stored "legitimate" would have been exactly
the paperwork for it. The blocking finding is what the pipeline is watching for; nothing else is.

## Compose with
- **find-venue** — choose the higher-prestige indexed target and confirm it welcomes extensions.
- **plan-paper-timeline** — schedule the new experiments + write-up against the target deadline.
- **research-ideate** — if the ≥30% new contribution isn't obvious yet, find it here first.
- **camera-ready** — the accepted, de-anonymized, DOI'd base version you're extending from.

## Provenance
The AgenticDev 2026 "Measuring the Wrong Number" workshop paper's **planned** extension to **MSR 2027**
(deadline ~Oct 23, 2026) or **NeurIPS 2027 Evaluations & Datasets** (~May 2027) — a second, stronger,
higher-prestige indexed publication that turns one accepted paper into a body of work. AgenticDev's CFP
explicitly invites journal extensions; the same ORCID links the workshop paper and its extension.`,
});
