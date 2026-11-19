// Compiled to SKILL.md by `vigiles compile`. Edit THIS file, never the markdown.
//
// Adopted 2026-08-17 (batch 3). Body carried over VERBATIM so the compiled diff shows
// only what the compiler adds. No `disallowedTools` fence yet — the field landed on
// `SkillSpec` in vigiles branch `claude/skill-disallowed-tools` and is not in a release
// this repo installs, so writing one here would not compile.
import { experimental_skill } from "vigiles/spec";
import type { Flow } from "../../scripts/pipeline.ts";
import coldReadDiff from "../cold-read-diff/SKILL.md.spec.ts";
import tightenPaper from "../tighten-paper/SKILL.md.spec.ts";

export default experimental_skill({
  name: "pc-panel-review",
  description:
    'Use when asking "what would the program committee decide?" / "simulate the reviewers" / "what\'s this paper\'s accept probability?" / "red-team this paper" / "what would Reviewer 2 attack?" on a drafted paper + artifact. Spawns N independent reviewers with DISTINCT lenses (one actually RUNS the artifact, one is a skimming genre/register reviewer, one is the hostile Reviewer 2), then synthesizes a PC-chair meta-review into an accept/reject prediction reported as min/median/max, a calibrated probability, and consensus must-fixes (or none). Takes tighten-paper\'s structural verdict and cold-read-diff\'s whole-paper report as inputs — the panel cannot feel reader fatigue on its own. The third and last step of the final review. Also runs one seat alone: the hostile seat for a fast red-team, or the VENUE-FIT seat for a CFP-fit spot-check. NOT a writing grade (grade-paper-writing) or the submit checklist (harden-paper).',
  tools: [
    "Read",
    "Write",
    "Grep",
    "Glob",
    "Bash",
    "WebSearch",
    "WebFetch",
    "Agent",
    "Skill",
  ],
  body: `
# pc-panel-review — model the whole PC, not one reviewer

> The whole PC (N independent lenses incl. an artifact-runner) + a chair meta-review, run once as the
> last step of the final review (\`paper-pipeline\`, "The final review"). One seat run alone is a
> spot-check: the **hostile seat** (step 3) for a fast red-team, or **Venue-fit mode** (below) for a
> named venue's CFP rubric. A single seat is recorded as \`single review\`, never as the panel.

A real decision is made by **2–4 reviewers with different priorities + a meta-review** that weighs
consensus over any single voice. This skill runs that. The payoff over a single review: a **must-fix
is what ≥2 independent reviewers flag** — that filters real blockers from one reviewer's hobbyhorse —
and at least one reviewer **executes the artifact**, which surfaces paper↔artifact mismatches no
prose-only read can.

## How to run it

1. **Get the venue rubric + bar** (fetch the CFP; quote the criteria). Calibrate to the *track*: a
   WIP/short/workshop bar rewards promise and discussion value; a full-paper/top-tier bar demands
   completeness. Do not import top-tier standards into a WIP review.
   **Then load the venue's measured bar** per \`paper-pipeline/references/venue-bar.md\`: read
   \`<papers-root>/venues/<venue>/summary.md\` when it exists and hand it to every reviewer seat and to
   the chair; each rigour finding states the paper's position against its denominators. Without it,
   the report opens with "main-conference bar assumed" and the accept probability carries that flag.
2. **Collect the two readability/structure artifacts.** Before any reviewer spawns, there must exist
   for THIS draft: (a) the **structural verdict** from \`tighten-paper\` (length / sag / TMI / cut
   plan), and (b) the **whole-paper cold-read report** from \`cold-read-diff --whole\`. In the final
   review they are its first two steps; outside it, invoke both by name with the Skill tool first.

   Why these inputs: a frontier-LLM reviewer knows every term and cannot feel reader
   fatigue, so a panel scoring on its own felt read will score a bloated, unreadable paper high
   (proven: ~88% accept on a paper the human reader found exhausting). These two artifacts are the
   panel's only legitimate source for the readability/structure signal.
   *(Scorecard: this gate is row **\`panel\`**, and it declares **\`structure\`** (tighten-paper) + the
   cold-read report as its required inputs.)*
3. **Pick 3 (or 4) reviewer lenses** that a real PC for THIS venue would field. One is fixed; the rest
   come from the menu, by fit:
   - **Genre/register reviewer — one seat on every panel, at every venue.** Its prompt has one
     owner, \`skills/cold-read-diff/scripts/readers.ts\` (the reviewer; \`cold-read.js --venue\` prints
     it). It reads as a skimming PC member does, and judges whether the paper reads like one at this
     venue. Give it the abstract, the introduction and the conclusion as text and the venue's name, nothing else.
   - **Hostile reviewer (Reviewer 2) — one seat on every panel.** It wants to reject the paper and
     says why, fairly and specifically. It states the one contribution in one sentence, as a reviewer
     would paraphrase it, and whether that is enough for this venue and paper type (a reusable method
     or benchmark survives review; "tool Y is bad" reads as a blog post). It hunts: every sentence
     stronger than the evidence (absolutes, causal claims from correlational data, a title that
     promises more than the body); methodology holes (missing baseline, sample size, confounds,
     cherry-picked tasks, misused statistics, construct validity); threats to validity the authors did
     not list (adaptive attackers, one model or dataset, a convenience sample); obvious uncited prior
     work and an unstated delta over the nearest neighbour; desk-reject risks (length, template,
     de-anonymising self-citations or repo links, unreadable figures, tables that contradict the text);
     and tone (naming small hobbyist projects as broken; prefer aggregate numbers and one named
     example). Its form adds the strongest available reframing of the contribution. It does not
     fabricate citations ("verify" when unsure), and if the paper is strong it says so: no weakness is
     a valid answer.
   - **Methods/stats skeptic** — sample size, construct validity, multiple comparisons, overclaims,
     whether the CIs support the claims, and **whether every confirmatory claim rests on a study
     decided before its run**. Run \`npx paperlint studies index <paper-dir>\` and give this reviewer the index in
     \`repro/README.md\` (each study's \`mode\`, \`decision\` and \`first output\`) beside the paper: a
     claim of a tested prediction on an exploratory study, on one whose decision reads \`not
     committed\`, or on one whose first output is not after its decision is a soundness finding, and
     so is a "pre-registered" or "decided before" the table does not support; the reviewer names it.
   - **Domain practitioner** — relevance to the CFP, novelty vs the nearest prior work, does the
     finding change behavior, generalizability, fairness/tone toward anyone named.
   - **Artifact / reproducibility reviewer (MANDATORY if an artifact is attached)** — *actually
     \`cd\` into the artifact and run it*; verify every headline number reproduces; re-run the order
     check the paper's decided-before claims rest on (\`npx paperlint lint\` on a full clone); read the
     code for
     circularity (echoing stored fields vs recomputing); grep all files (incl. data + compiled
     caches) for anonymization leaks; scope the badge (Available / Functional / Reproduced).
   - **Prior-reviews reviewer (MANDATORY when the attempt before this one was rejected with
     reviews)** — the rejection's \`"desk": false\` outcome in \`paperlint.json\` names the points file
     (\`outcome.points\`). \`cycle/prior-reviews-answered\` already decides that every point has an
     answer and that each \`where\` is a \`\\section\` of the paper; do not re-count that. Give this
     reviewer the points file beside the paper, and it judges what no rule can: whether the section an
     answer names really answers the quoted point, and whether a \`declined\` reason would satisfy the
     reviewer who raised it. Each answer that does not is a must-fix, named by its point id.
   - **Security/ethics reviewer** (security venues) — threat model soundness, responsible disclosure,
     punching-down risk.
   - **Novelty/related-work reviewer** — is the delta over the nearest neighbor explicit; obvious
     uncited work.
4. **Spawn them in PARALLEL, each on a separate model instance** (e.g. Fable via subagent), each blind
   to the others — independence is the whole point. Give each: the paper (\`.tex\`/PDF), the artifact
   path, the quoted rubric, its lens, **and the two step-2 artifacts (tighten-paper structural verdict +
   cold-read report)** — the genre/register reviewer gets only its three sections.
   Force a filled review form (below).

   🔴 **No reviewer is shown a previous round** — not its scores, not its reviews, not "the panel
   gave 3.25 last time", not a list of what changed since. A reviewer who is told the last score
   anchors on it (*"up from the 3.25 the earlier rounds reported"*), and the rounds then converge on
   each other instead of on the paper. Comparing rounds is the chair's job, after the reviews land.
5. **Synthesize the meta-review yourself** (PC chair) once all land — see output.

## Each reviewer returns a review form
- Per-criterion score on the venue's scale (map to 1–5 if unstated), one line each, grounded.
- Overall rec (Reject … Strong Accept) + confidence (1–5).
- **Readability's implicit drag — model the halo effect, DRIVEN BY THE COLD-READ REPORT, not felt
  judgment.** A real reviewer who finds the paper a slog silently loses confidence in the *science* and
  lowers the OVERALL score, while writing "methodology concerns" in the box — the penalty rarely shows
  up as an explicit "clarity" mark. Each reviewer must let prose/structure quality move their overall
  rec and confidence — but the SOURCE of that signal is the handed-in **cold-read report +
  tighten-paper verdict**, never the reviewer's own felt read: a frontier LLM knows every term and
  cannot experience reader fatigue, so its felt judgment systematically under-fires. If the inventory
  shows high stall density / walls, or the structural verdict says bloated, the overall score takes a
  real hit even when every explicit criterion passes. Never score a slog as if it read cleanly — that
  is the gap between this sim and a real PC.
- Top 3 issues for PC discussion, ranked, with severity (blocker/major/minor).
- Any must-fix before *they'd* accept (or "none").
- Artifact reviewer only: run outcome (does it execute? every number reproduce? PASS/FAIL per check),
  anonymization verdict, badge scope.
- One-line meta: does this belong at this venue?

## The meta-review (PC-chair synthesis) — the actual deliverable
- **Score table:** each reviewer × each criterion + overall + confidence, at a glance, and under it
  the overall score's **min / median / max** across reviewers — never a mean alone, which hides the
  one low review that decides a workshop.
- **Predicted decision:** for a **workshop**, name the **MIN** as the risk: a workshop PC with three
  reviews and a short discussion rarely overrules a reject. For a conference, the rec the PC
  discussion converges on, weighted by confidence, with the min named beside it. Either way, a
  **calibrated accept probability** for this venue and edition. The prediction is the report; it is
  not a condition for stopping (the final review closes after one panel, whatever the scores).
- 🔴 **One reviewer is not a panel.** A run with fewer than three reviews and a meta-review — a
  Venue-fit spot-check, a single re-review, a panel whose other seats did not return — is recorded as
  what it is (\`venue-fit\`, \`single review\`), never in the scorecard's \`panel\` row. A single
  review recorded as a panel verdict is how a paper reaches submission on an 88% that three real
  reviewers turned into a reject.
- **Consensus must-fixes:** issues **≥2 reviewers independently raised** — these are the real ones,
  proposed to the author, who decides each. "None" is a valid result.
- **Single-reviewer flags:** noted, triaged (fix if cheap, else defer to camera-ready).
- **Split calls:** where reviewers genuinely disagree, and which way the chair leans + why.

## The ceiling plan, when the author asks what holds the score down

Classify each prong of the ceiling with exactly these three labels.

| label | means | what the panel owes |
|---|---|---|
| **TEXT** | an edit closes it — the evidence already exists and the paper fails to join it up, frame it, or show the reader what the alternative would look like | the actual sentence or paragraph to write, and where it goes |
| **EXPERIMENT** | only new measurement closes it | what would have to be run, and a rough cost, so the decision to skip is informed |
| **IMMOVABLE** | it is what the work *is* — the scope, the population, the yield | say so plainly, so nobody re-opens it next round |

**Why the labels and not prose.** "This is a fact about the work" is the cheapest thing a reviewer can
write and the hardest to argue with, so it is where an unwilling author hides. Forcing a label makes
the claim falsifiable: *TEXT* invites "then write it", and *IMMOVABLE* invites "is it really?".

**Two failure shapes to check yourself against**, both observed on \`the reference paper\`:

- **A number reported as a rate when it is a floor.** "8 contradictions in 1,836 repositories" read as
  a small phenomenon; the same paper measured its own extractor's recall at under half, and never
  joined the two. That is TEXT, not EXPERIMENT.
- **A position on a ladder given without the rungs above it.** "Ours reaches rung three of four" reads
  as a shortfall until the paper says what rungs one and two would require and that nobody has built
  them. Also TEXT.

## Rules
- **Independence is non-negotiable** — never let reviewers see each other's reviews before the
  meta-review; shared context collapses the panel into one voice.
- **Consensus > volume.** One reviewer with ten nits loses to two reviewers naming the same blocker.
- **The artifact reviewer must actually run the code**, not read about it — that lens exists to catch
  what prose review can't (dead links, circular self-checks, paper↔artifact number mismatches, leaks).
- Judge against the venue's ACTUAL bar; reward fit/discussion-value for workshops.
- Report the run honestly — if the artifact fails or a number doesn't reproduce, that IS the finding.
- Don't fabricate the CFP or citations; fetch/verify.
- **Review-ratchet rule — when the panel's must-fixes include an overclaim, inline-hedging is the LAST
  resort.** Tighten → cut → move to Threats → only then hedge. Full rule:
  \`paper-pipeline/references/review-ratchet.md\`.

## Venue-fit mode (single-lens spot-check — the merged \`venue-review-sim\`)
When a full panel is overkill and you just want to predict **"given THIS venue's criteria, bar, and
culture, would a real reviewer accept it, and what scores?"**, run **one** venue-fit reviewer scoring
the specific CFP rubric — the fast fit-prediction lens (this absorbs the former standalone
\`venue-review-sim\` skill). It answers a different question than the defect hunt: fit-to-CFP and matching
the venue's expectation (a WIP workshop short paper vs a top-tier full paper) decide most workshop
outcomes, often more than raw defect count.

Run it:
1. **Fetch the venue's actual review criteria** — the CFP topics, paper types, stated review criteria,
   workshop goals, blind model. Quote the exact criteria. If none stated, use the venue-class default
   (workshops: relevance / originality / technical quality / clarity; security venues add threat-model
   soundness + ethics). Do NOT fabricate the CFP — fetch it; say when you fall back to the default.
2. **Adopt the reviewer persona for THAT venue** — a PC member who knows the sub-field, cares about the
   workshop's goals (e.g. "foster discussion", "bridge research–practice"), and calibrates to the paper
   TYPE (a short/WIP/position paper is judged for promise and discussion value, NOT the completeness
   demanded of a full paper — don't reject a WIP for "only 2 tools" if the venue invites WIP).
3. **Use a separate model as the reviewer** (e.g. Fable via subagent) so the author isn't grading
   itself. Give it the full paper text + the quoted CFP criteria.

Output — fill the venue's review form:
- **Per-criterion score** on the venue's scale (map to 1–5 if unstated), one for EACH stated criterion,
  each with a one-line justification grounded in the paper.
- **Overall recommendation** (Accept / Weak Accept / Borderline / Weak Reject / Reject) + **reviewer
  confidence** (low/med/high).
- **Fit-to-CFP**: which listed topics it hits, and whether the framing foregrounds them (a
  trustworthiness/verification workshop wants that word in the abstract).
- **Type-appropriateness**: is it pitched right for its track (WIP/vision/position/short vs full)? Call
  out over-reach for a short paper or an under-sold real contribution.
- **What the PC discussion would say** — the 2–3 meta-review sentences that decide it, as a PC chair
  would summarize.
- **Minimum changes to flip a borderline to accept** — the specific, venue-relevant edits (often:
  foreground the on-topic framing, right-size claims to the track, add the one obviously-expected
  citation) — NOT a full defect list.
- **Predicted outcome + probability**, calibrated to the venue's selectivity and edition (first-edition
  workshops are more welcoming; established ones more competitive).

Rules: judge against the venue's ACTUAL bar and goals, not an abstract ideal; reward fit and
discussion-value for workshops, reserve full-paper rigor for full-paper tracks; be honest about
reject-risk without rubber-stamping. For the real decision, escalate to the full panel below.

## Compose with
- \`paper-pipeline\` — owns the final review; the panel is its last step.
- Append each panel's result to the paper's review ledger
  (\`papers/research/<date>-fable-rereview-<venue>.md\`) so accept-probability progression is tracked
  across rounds.

## The reproduce loop (why this beats a prose review)
This is "double-blind review as a real venue does it, WITH reproduction." The artifact-runner reviewer
is the difference-maker on both runs so far: it doesn't judge the paper's numbers, it re-derives them.
The panel runs once. A confirming panel runs only when the author asks for it — same lenses, FRESH
reviewers, told nothing about the previous round; the chair, not the reviewers, sets the new reviews
beside the old ones and checks that each earlier must-fix is gone. There is no second confirmation.

## Provenance (two papers, battle-tested)
- **AgenticDev 2026** (2026-07-12): 3 lenses (stats / practitioner / artifact-runner) + chair. Caught
  what two prior single-lens rounds missed — a paper↔artifact mismatch ("raw 140-run data" vs shipped
  per-arm aggregates) and a mislabeled "paired" test, both flagged by ≥2 reviewers. Round→confirm:
  ~85%→90%.
- **AISec 2026 @ CCS** (2026-07-13): same shape at a harder (top-tier security) bar. The artifact-runner
  ran all four harnesses AND stress-tested the release gate (planted a leak, confirmed it caught it);
  the ethics reviewer caught the release-vs-paper anonymization contradiction (the released artifact
  named 46 maintainers) — the single highest reject-vector, invisible to a paper-only read. After the
  fixes + a confirm round, all three moved to Accept (~87–88%, from Weak-Accept/conditional/leak-risk).
  Lesson: the two things that most move a security paper — an ethics/disclosure contradiction and a
  reproduction/anonymization leak — live in the ARTIFACT, so the artifact-runner + an ethics lens are
  non-optional at security venues.`,
});

export const flow = {
  stage: "review",
  handsTo: () => [],
  calls: () => [tightenPaper, coldReadDiff],
} satisfies Flow;
