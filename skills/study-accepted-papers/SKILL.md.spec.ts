// Compiled to SKILL.md by `vigiles compile`. Edit THIS file, never the markdown.
//
// Adopted 2026-08-17 (batch 3). Body carried over VERBATIM so the compiled diff shows
// only what the compiler adds. No `disallowedTools` fence yet — the field landed on
// `SkillSpec` in vigiles branch `claude/skill-disallowed-tools` and is not in a release
// this repo installs, so writing one here would not compile.
import { experimental_skill } from "vigiles/spec";

export default experimental_skill({
  name: "study-accepted-papers",
  description:
    'Mine a target venue\'s ACCEPTED-paper corpus to learn what makes papers STRONG there, then turn that into concrete strengthening levers for your own draft — the move from a plain "Accept" toward "Strong Accept". Fetch 8-12 real recently-accepted papers at the venue (ACM DL / IEEE Xplore / venue program pages / arXiv), prioritizing the same paper-type and topic as yours (measurement/benchmark/SoK/security-critique), and for each extract WHAT MADE IT STRONG (adaptive evaluation, explicit threat model, reusable released artifact, real-world grounding, a memorable framing/coined handle, a released dataset, honest limitations). Cross-read the venue CFP + PC-chair research tastes + any best-paper criteria. Then diff your draft against those patterns and emit ranked levers split into CHEAP (framing/prose/citation, safe before a deadline) vs EXPENSIVE (new experiments/data). Use when a paper is drafted and you want venue-specific polish grounded in what actually lands there — NOT generic writing advice. Distinct from find-venue (picks WHERE), research-ideate (validates the idea), and pc-panel-review / paper-adversarial-review (red-team YOUR draft): this one studies the VENUE\'s own bar. Compose with those + harden-paper + verify-citations + extend-paper.',
  context: "fork",
  tools: [
    "Read",
    "Write",
    "Edit",
    "Grep",
    "Glob",
    "Bash",
    "WebSearch",
    "WebFetch",
    "Agent",
  ],
  body: `
# study-accepted-papers — learn the venue's bar from its own accepted corpus, then lever your draft up

## Run me

🔴 FIRST, before any other step:

\`\`\`
node .claude/skills/paper-pipeline/scripts/announce.mjs study-accepted-papers <paper-dir>
\`\`\`

An advisory pass cannot be observed failing — silence is both its error state and its normal
state — so starting is an event, and events get written down.

Reviewers don't score in a vacuum — they score against the papers that got in last cycle. This skill
makes that reference standard explicit: pull the venue's **actually-accepted** papers of your type,
extract the concrete properties that separated the strong ones from the weak-accepts, and diff your
draft against them to produce **specific, sourced levers** — not "add more rigor" but "AISec strong
accepts in this lane all carry an adaptive-attacker evaluation; yours has static mutation only — here's
the cheap version you can add and the expensive version you can't."

It answers a different question than the neighboring skills:
- \`find-venue\` → *where* should this go? (ranks venues)
- \`research-ideate\` → is the *idea* worth doing? (go/no-go on the contribution)
- \`pc-panel-review\` / \`paper-adversarial-review\` → what's wrong with *my draft*? (red-team your text)
- **\`study-accepted-papers\` → what does it take to be *strong* at THIS venue, judged by its own accepted papers?**

Grounding: the authorship criterion — why a *strong* accept at an indexed venue is
worth more to the dossier than a borderline one — reviewer enthusiasm shows up in the acceptance and in
letters), and the venue data card \`../submit-paper/references/venues/<venue>.md\` if one exists.

## Step 1 — pin the venue's stated bar (fetch, don't guess)

\`WebFetch\` the current CFP and, if separate, the reviewer-guidelines / call-for-benchmark-papers page.
Capture what the venue *says* it rewards, in its own words:
- **Track requirements** — e.g. a benchmark track that demands a functional artifact link, a named
  reusable benchmark, a metric definition, a leaderboard. Missing a *required* element of your track is
  a desk-reject, never a weak-accept — check these first.
- **Stated review criteria / scoring rubric** — novelty vs systematization vs reproducibility weighting.
- **Best-paper / distinguished-artifact criteria** if published — these name the top-end bar directly.
- **PC chairs + steering committee + recent PC** — look up their research areas. A PC heavy on
  adversarial-ML will punish a non-adaptive evaluation; a PC heavy on systems will want real deployment
  grounding. Taste is a real, findable signal.

## Step 2 — pull the corpus. **Measure ALL of it; deep-read 8-12.**

🔴 **Two tiers, and the first one is not optional.** The single most valuable output of this skill is
a *denominator* — "33 of 34 accepted papers have at least one figure", "confidence intervals appear
in 1 of 34", "control arms in 0 of 34". **A sample of 8-12 cannot produce a denominator.** It gives
you impressions; the whole point of this skill is to replace impressions with the venue's own
distribution.

| tier | how many | what you get |
|---|---|---|
| **measure** | **all of them** | figure count · table count · page count · section word counts · greps for confidence intervals, statistical tests, control/placebo arms, artifact URLs · abstract length. Mechanical, scriptable, cheap. |
| **deep-read** | **8-12**, chosen by relevance | contribution, what made it strong, framing, how limitations are handled. Judgement, expensive. |

**How many is "all"?** A workshop's accepted volume is **30-60 papers** — download the lot, it costs
minutes and a few hundred MB. For a main conference (1000+), "all" means *all in your track or topic*,
capped at ~100, and **you must state what you capped and why** — a silently truncated corpus produces
denominators that are quietly wrong.

**Cross tier with archival status before calibrating.** Oral/spotlight/poster and archival/non-archival
are different axes, and they interact: at REALM 2025 most orals were **non-archival**, so the honest
"what a strong archival paper looks like" set was **six** papers, not eleven. Calibrating against the
wrong subset is worse than not calibrating.

**Do not quote an acceptance rate unless the venue publishes the submission count.** Accepted counts
are public; submitted counts usually are not. An invented rate is the kind of number that gets
repeated for weeks — it was, on \`compile-rules-2026\`, by this pipeline, until the corpus pass
checked.

🔴 **Save the corpus WITH the paper, not in a scratchpad.** See "Where the output lives" below. A run
that returns only prose has destroyed its own evidence.

\`WebSearch\` / \`WebFetch\` the venue's recent proceedings (ACM DL, IEEE Xplore, the venue program pages,
or arXiv copies). For the **deep-read** tier select **8-12 actually-accepted papers**, prioritizing:
1. Same **paper type** as yours (measurement / benchmark / SoK / empirical-critique / defense-eval).
2. Same **topic lane** (for a security venue: LLM/agent security, guardrail evaluation, jailbreak
   robustness, "X is security theater"-style critiques).
3. Any **best-paper / award / highly-cited** ones — these are the calibrated top of the distribution.

For **each** paper, extract not just the contribution but **what made it strong** — the property a
reviewer would have written in the "strengths" box:
- adaptive / adversarial evaluation (an *adaptive attacker*, not just static perturbation);
- an explicit, scoped **threat model** stated up front;
- a **reusable, released artifact / dataset** (not a one-off script);
- **real-world grounding** (real incidents, real deployed tools, a real corpus vs hand-built toys);
- a **memorable framing or coined handle** that makes the paper travel (and get cited);
- **baseline comparisons** against the obvious prior defenses/benchmarks;
- **honest, self-aware limitations** that pre-empt the reviewer's objection.

Record each as a row: \`title | year | contribution | what made it STRONG\`. Never invent a paper or a
citation — if you can't verify it exists, drop it or mark it VERIFY.

## Step 3 — diff your draft against the pattern

Lay your draft's properties beside the strong-accept pattern from Step 2. For every property the strong
papers share that yours lacks or does weakly, that's a **lever**. Rank levers by how much *this venue's*
PC weights the axis (from Step 1's chairs/rubric), not by generic importance. For a security venue,
weight **adaptive evaluation** and **threat-model clarity** heavily — they are the usual difference
between 4/5 and 5/5, and the usual reason an empirical security paper is held at weak-accept.

## Step 4 — split levers CHEAP vs EXPENSIVE (respect the deadline and the anti-cram rule)

Every lever gets tagged:
- **CHEAP** — framing, prose, a reordered abstract, a coined handle, an explicit threat-model paragraph,
  a missing-but-expected citation, promoting an existing number into the abstract, making an already-run
  robustness result read as "adaptive". Safe to land days before a deadline.
- **EXPENSIVE** — needs new experiments, a bigger/external corpus, an actual adaptive-attacker study, a
  new baseline run. These usually **do NOT belong in a near-done paper under deadline pressure** — the
  anti-cram rule (two clean accepted works beat one overstuffed one) means an
  expensive lever is normally an **\`extend-paper\` task for the follow-on**, not a pre-deadline edit.
  Say so explicitly; don't let a tempting expensive lever destabilize a shippable Accept.

## Output

1. **Venue-bar summary** — what this venue rewards, its track requirements, its PC's taste (2-4 lines,
   each sourced).
2. **Strong-accepted-paper table** — \`title | year | contribution | what made it STRONG\`, with URLs.
3. **Ranked levers for your draft** — each: the gap, the strong-paper precedent it's drawn from,
   CHEAP/EXPENSIVE tag, and the concrete edit (or the extend-paper deferral). Most-impactful first.
4. **Citation gaps** — specific real papers (arXiv id / DOI) a reviewer at this venue would expect and
   ding you for missing, each with why. Hand these to \`verify-citations\`.
5. **Corpus-level distribution** — the denominators, each traceable to the measurement file: how many
   papers have a figure and the median count, how many report confidence intervals, how many run a
   statistical test, how many have a control or placebo arm, section-length norms, abstract-length
   range. **These are what change decisions**, because they say whether your draft is normal, an
   outlier, or quietly ahead.

## 🔴 Where the output lives — three homes, and all three are required

A run that returns only a write-up has destroyed its own evidence. Observed on \`compile-rules-2026\`
2026-08-03: the pass measured 34 PDFs and returned excellent prose, and what survived into the repo
was **two scripts, 16 KB**. The corpus, the extracted text and the measurement table were in a
scratchpad that gets wiped. Every denominator in the write-up was, an hour later, unverifiable.

| home | what goes there | why there |
|---|---|---|
| **\`<paper-dir>/venue-corpus/\`** | \`measurements.json\` (one row per paper — the denominators' source) · \`text/*.txt\` (extractions: the quotable primary source) · the fetch/measure scripts · \`MANIFEST.md\` | data. **PDFs are NOT committed** — they regenerate from the proceedings; record the IDs and the command instead. Text extractions ARE committed: a few MB, and they are what makes a quote re-checkable. |
| **\`<paper-dir>/reviews/<date>-study-accepted-<venue>.md\`** | the full analysis: per-paper reading, the whole lever list, the reasoning | the record. **The EXPENSIVE levers are the \`extend-paper\` roadmap** and are worthless if they evaporate. |
| 🔴 **\`<paper-dir>/CLAUDE.md\`** | **the 3-5 findings that change decisions while writing**, plus an explicit "what NOT to do" | **it auto-loads whenever anyone works on this paper.** A finding in \`reviews/\` is read when someone goes looking; a finding here is read *every time the draft is edited*. That is the difference between knowing the venue's bar and applying it. |

Then link all three from \`PIPELINE-STATUS.md\` (**\`venuebar\`** row — "venue bar / levers", in SETUP).

**What belongs in \`<paper-dir>/CLAUDE.md\` and what does not.** It is not a summary of the analysis —
it is the operative subset: the structural mismatch to fix, the strength being under-sold, the norm
being violated, and the **things previously believed that the corpus disproved** (those are the most
valuable lines in the file, because without them the pipeline re-derives the wrong belief). Keep it
short enough that it survives being loaded into every session.

## Record the verdict

🔴 LAST step, once the deliverable exists:

\`\`\`
node .claude/skills/paper-pipeline/scripts/ledger.mjs record study-accepted-papers <paper-dir> FINDING <count> <report-path>
node .claude/skills/paper-pipeline/scripts/ledger.mjs record study-accepted-papers <paper-dir> ABSTAINED <reason> "<one line>"
\`\`\`

**FINDING** — \`<count>\` is the number of levers, \`<report-path>\` the ranked CHEAP/EXPENSIVE list.
Add \`--blocking\` when the draft is missing something the track *requires* (an artifact link, a named
benchmark, a metric definition): a desk-reject, never a weak accept, and worth the loudest thing
this skill can say.
**ABSTAINED** — \`no-witness\`: the corpus was read and no lever came out of it. \`input-missing\`: the
venue publishes no accepted papers to mine.

🔴 **There is no PASS**, and the reason is visible here. "The draft already sits at the venue's bar"
is only meaningful next to the corpus it was measured against — *33 of 34 accepted papers*, not
*most of them* — and a stored acquittal carried that denominator nowhere. Put the corpus size in the
\`ABSTAINED\` note and in the report; without it the row is an impression with a machine-readable
label on it.

## Rules
- **Fetch real accepted papers.** Never fabricate a title, author, or "what made it strong". Unverifiable → drop or mark VERIFY.
- **A lever-proposed citation is not written into the \`.tex\`/bib until \`verify-citations\` confirms it** (real
  arXiv-id/DOI + correct author/title/venue). If added provisionally, mark \`% VERIFY\` at the cite site; a
  surviving \`% VERIFY\` at submit is a bug. Order: propose → verify → then add — never propose → add.
- **"Accepted" is the reference, but "strong" is the target** — don't just describe what got in; isolate what got in *enthusiastically*. Awards and heavy citation are your calibration for the top end.
- **Venue-specific, not generic.** A lever only counts if it's grounded in this venue's rubric, PC taste, or its own accepted papers. Generic "tighten the writing" is out of scope (that's \`grade-paper-writing\` / \`tighten-paper\`).
- **Security venues:** treat adaptive-attacker evaluation and an explicit threat model as first-class — they are the most common weak-accept→strong-accept axis and the most common reviewer complaint.
- **Respect the anti-cram rule.** Flag expensive levers as extension material by default; protect a shippable Accept from deadline-driven destabilization.
- Convert any newly-surfaced deadline to the author's own zone and hand it to \`plan-paper-timeline\`.

## Compose with
- \`harden-paper\` — the multi-axis pre-submit gate; this skill feeds it the venue-specific axis (what *this* PC rewards) that a generic hardening pass misses.
- \`pc-panel-review\` / \`paper-adversarial-review\` — run those to red-team the draft; run this to learn the bar the red-team should hold it to. Complementary, not redundant.
- \`verify-citations\` — consumes the Step-4 citation gaps.
- \`extend-paper\` — the natural home for every EXPENSIVE lever this skill surfaces.
- \`submit-paper\` venue data card (\`submit-paper/references/venues/<venue>.md\`) — save durable venue-bar findings there as data, not as a new skill per venue.
- the paper's \`<paper>/paperlint.json\` (\`{ "extends": "paperlint:<venue>", "kind": "<kind>" }\`) — which venue preset the \`pdf/*\` rules check the built PDF against; a venue with no shipped preset extends a family (\`paperlint:acm-sigconf\`) or the project's own \`./venues/<name>.jsonc\`. Findings about the venue's page limit or format belong in that preset, with their source quote.

## Provenance
Built from the **AISec 2026 @ ACM CCS** polish run (2026-07): the "Safety Theater in Agentic Coding /
GateBench" paper sat at ~Accept (pc-panel ~0.72), and the task was to find what would push it toward a
strong accept without cramming new contributions before the 2026-07-24 deadline. The workflow that
produced the levers — pull AISec's accepted measurement/benchmark security papers, isolate the
adaptive-evaluation + threat-model + reusable-artifact pattern that the strong ones share, then split
fixes into cheap-prose vs expensive-experiment — is exactly what this skill encodes.`,
});
