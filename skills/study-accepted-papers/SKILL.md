---
name: study-accepted-papers
description: "Mine a target venue's ACCEPTED-paper corpus to learn what makes papers STRONG there, then PROPOSE strengthening levers for the author's draft — the move from a plain \"Accept\" toward \"Strong Accept\". Reads the venue card's `accepted` block for its sources (asks the author when it is empty); measures every accepted paper of the last two editions on the current template and deep-reads 8-12 closest to the draft; when reviews are not public, builds a strong-vs-ordinary contrast (award lists as the proxy, an ordinary set of the same editions and type, the same per-paper fields) and classifies each field as separates / table stakes / does not separate / refuted, with counts and honesty about small n. Then lays the draft beside both sets and proposes ranked levers, CHEAP (framing/prose/citation) vs EXPENSIVE (new experiments/data); the author decides which apply. Use when a paper is drafted and you want venue-specific levers grounded in what actually lands there — NOT generic writing advice. Distinct from find-venue (picks WHERE), research-ideate (validates the idea), and pc-panel-review / paper-adversarial-review (red-team YOUR draft): this one studies the VENUE's own bar. Compose with those + harden-paper + verify-citations + extend-paper."
context: fork
allowed-tools: [Read, Write, Edit, Grep, Glob, Bash, WebSearch, WebFetch, Agent]
---

<!-- vigiles:sha256:e2a85c4259afec5e compiled from skills/study-accepted-papers/SKILL.md.spec.ts -->

# study-accepted-papers — learn the venue's bar from its own accepted corpus, then propose levers

Reviewers don't score in a vacuum — they score against the papers that got in last cycle. This skill
makes that reference standard explicit: pull the venue's **actually-accepted** papers, measure all of
them, find what separates the ones the venue rated highest from the ones it merely accepted, and lay
the author's draft beside both to **propose specific, sourced levers** — not "add more rigor" but
"5 of 7 award papers at this venue release an archival artifact, against 1 of 8 ordinary ones; yours
promises one for the camera-ready."

**The author decides; this skill researches, counts and proposes.** It never edits the paper, and it
never writes a lever into the paper's instructions without the author's yes (paperlint's "author in
the loop" design). It runs as a forked subagent, so it cannot stop to ask mid-run: it ends with its open
questions as a list (§ "Questions for the author"), and the main thread asks them.

It answers a different question than the neighboring skills:
- `find-venue` → *where* should this go? (ranks venues)
- `research-ideate` → is the *idea* worth doing? (go/no-go on the contribution)
- `pc-panel-review` / `paper-adversarial-review` → what's wrong with *my draft*? (red-team your text)
- **`study-accepted-papers` → what does it take to be *strong* at THIS venue, judged by its own accepted papers?**

Grounding: why a *strong* accept at an indexed venue is worth more to a body of work than a borderline
one — reviewer enthusiasm shows up in the acceptance and in letters — and the venue's card
(`presets/<venue>.md` and its preset `presets/<venue>.jsonc` in the paperlint package, or the
project's own `./venues/<name>.jsonc`).

## Step 0 — read the venue card's `accepted` block first

The venue preset carries, as data, where the venue's accepted papers are (`accepted` in
`venue-profile.schema.json`): the accepted list per edition (`list`, a URL with `{year}`), the DBLP
stream (`dblp`), the editions and the template each used (`editions`, with `current_template`), the
proxies for a strong review score with their limits (`strong`), and what blocks automated access
(`access`). **Use it instead of re-deriving the sources.**

- **Filled** (MSR's is): take the sources from it, and say in the write-up which entries you used.
  A URL that no longer answers, or a new award list, is a proposed patch to the block, not a silent
  workaround.
- **Empty (`{}`) or absent**: say so in the write-up, find candidate sources (the venue's program
  pages, DBLP, its award pages and hall of fame), and **put them to the author as a question** —
  "these are the sources I found; use them?" with the list and a recommendation. Then write the
  block the author agreed to as a patch to the preset (`<paper-dir>/proposals/<date>-accepted-<venue>.patch`),
  for the author to apply or send upstream. Do not edit a shipped preset in `node_modules`.

If the preset carries a `shape` (MSR's does), the `pdf/venue-shape` rule already compares the built
paper's words, figures, tables, abstract and references with the venue's accepted papers, by the same
counter on both sides. Cite those numbers rather than re-measuring them with a different counter.

## Step 1 — pin the venue's stated bar (fetch, don't guess)

`WebFetch` the current CFP and, if separate, the reviewer-guidelines / call-for-benchmark-papers page.
Capture what the venue *says* it rewards, in its own words:
- **Track requirements** — e.g. a benchmark track that demands a functional artifact link, a named
  reusable benchmark, a metric definition, a leaderboard. Missing a *required* element of your track is
  a desk-reject, never a weak-accept — check these first.
- **Stated review criteria / scoring rubric** — quote them; they name the axes a lever must move.
- **Best-paper / distinguished-paper criteria** if published — these name the top-end bar directly.
- **PC chairs + steering committee + recent PC** — look up their research areas. A PC heavy on
  adversarial-ML will punish a non-adaptive evaluation; a PC heavy on systems will want real deployment
  grounding. Taste is a real, findable signal.

## Step 2 — pull the corpus. **Measure ALL of it; deep-read 8-12.**

🔴 **Two tiers, and the first one is not optional.** The single most valuable output of this skill is
a *denominator* — "33 of 34 accepted papers have at least one figure", "confidence intervals appear
in 1 of 34", "control arms in 0 of 34". **A sample of 8-12 cannot produce a denominator.**

| tier | default | what you get |
|---|---|---|
| **measure** | **every accepted paper of the last two editions of the same track on the current template** (`accepted.editions`, `current_template: true`); above ~100 papers, cap by topic and **state the cap and why** | figure, table and page counts · words · abstract length · greps for confidence intervals, statistical tests, agreement (κ), control/placebo arms, artifact URLs (an archival DOI vs a repository link). Mechanical, scriptable, cheap. |
| **deep-read** | **8-12**, closest to the draft by paper type, then topic | contribution, what made it strong, framing, how limitations are handled. Judgement, expensive. |

An edition on another template (MSR 2026 was ACM, 2025 and 2027 IEEE) is measured only for the
judgement tier: its page and word counts belong to a different layout.

**Fetch order, per paper**: the venue's program page (title, authors, badges) → DBLP (a stable list
with DOIs) → an **open PDF** (arXiv, open access, the authors' page) → ACM DL / IEEE Xplore last (they
block automated sessions; `accepted.access` says how). **Report obtained / total** — "34 of 47 PDFs" —
and list the papers you could not get. A silently shorter corpus gives quietly wrong denominators.

**Cross tier with archival status before calibrating.** Oral/spotlight/poster and archival/non-archival
are different axes: at a workshop where most orals were **non-archival**, the honest "strong archival
paper" set was six papers, not eleven. Calibrating against the wrong subset is worse than not
calibrating.

**Do not quote an acceptance rate unless the venue publishes the submission count.** Accepted counts
are public; submitted counts usually are not, and an invented rate gets repeated for weeks.

For **each deep-read paper** record what a reviewer would have written in the "strengths" box:
adaptive / adversarial evaluation; an explicit, scoped threat model; a reusable released artifact or
dataset; real-world grounding (real incidents, deployed tools, a real corpus); a memorable framing or
coined handle; baselines against the obvious prior work; honest limitations that pre-empt the
objection. Never invent a paper or a citation — unverifiable means drop it or mark it VERIFY.

## Step 3 — strong against ordinary: the contrast set

"Accepted" is the reference; "strong" is the target. When the venue publishes its reviews (OpenReview),
use the scores. When it does not (HotCRP venues: MSR, ICSE, FSE …), **there are no scores, only
proxies — say so in the first line of the write-up**, and rank the proxies you have:

| proxy | what it stands for | its limit |
|---|---|---|
| distinguished / best paper awards, **the last 5-10 years** (`accepted.strong`) | the papers the PC rated highest | an edition with no published list hides its winners among the ordinary papers — leave that edition **out** of the ordinary set |
| an award with another jury or criterion (FOSS impact, artifact awards) | a different value (usefulness to a community) | not the PC's review |
| most-influential-paper / foundational awards | what the field valued ten years on | not what reviewers rated that year |
| special-issue invitations ("best papers invited to …") | the PC's top picks | the invitation lists are rarely public |
| authors saying publicly a paper was rejected here and accepted elsewhere | the weak end | usually none found — **report "none found"**, never guess |

Without the weak end, the contrast measures **award ↔ accepted**, not accepted ↔ rejected; say that
this is the boundary the result speaks to.

**Two sets, the same extraction for both.** The strong set: every award paper of the chosen editions.
The contrast set: ordinary accepted papers of the **same editions, same paper type, same topic area**,
chosen by a rule you state before reading them (and say the choice could move each count by one or
two). Extract, per paper, with a quote for each cell:

| field | what to record |
|---|---|
| research questions | how many, labelled or not |
| scale | the data's size, in the paper's own words |
| ground truth | human labels with agreement (κ, α), an execution oracle, or none |
| breadth | ecosystems / languages / datasets |
| intervention | a controlled experiment on top of the observation, or not |
| artifact | archival DOI (Zenodo, Software Heritage) · repository link · none — as the PDF states it |
| threats | words, and whether by kind |
| headline number | the one the abstract carries |
| implications | who the paper tells what to do |
| positioning | "a gap" vs "a belief of the field, tested" vs "a method or a pitfall of the field itself" |
| shape | figures, tables, words (the measure tier's numbers) |

**Classify every field by counts, never by impression** — "4 of 5 award papers vs 1 of 8 contrast":

- **separates** — clearly more often in the strong set. Give the counts, and Fisher's exact p where
  it helps, as a signal.
- **table stakes** — common in **both** sets (5/5 and 7/8). Not a lever toward strong: the floor of an
  ordinary accepted paper. A draft *below* it has a problem worse than missing an award.
- **does not separate** — no difference, or the other way round. Name it: these are the levers *not*
  to spend time on.
- **refuted** — looked like a separator in one edition and vanished in the award history of earlier
  years. **Check every separator against at least one more edition's award list** before reporting
  it; one year's coincidence (a title shape, a word) is the commonest false lever.

**Honesty about small numbers.** Five award papers against eight contrast papers is a description,
not a law. State how many fields were compared; with ten or more, no p survives a correction for
multiple comparisons, so every separator is a **signal**. Name the **counterexamples** — a contrast
paper that has every separating trait and no award — and say in so many words that no trait is
sufficient. Mark each claim with how it is known: read on the primary source, read secondhand, your
classification, or your inference. End the write-up with "where I may be wrong".

## Step 4 — the draft beside both sets: proposed levers, the author decides

Lay the draft's fields beside the two sets (same table, same rules). Every **separating** field the
draft lacks is a candidate lever; every **table-stakes** field it lacks is a floor problem, reported
first. Rank by how consistently the field separates and by how much this venue's stated rubric (Step
1) weights it — not by generic importance.

Tag each lever:
- **CHEAP** — framing, prose, a reordered abstract, an explicit threat-model paragraph, a missing but
  expected citation, an existing number promoted into the abstract, a table turned into a figure from
  numbers already in hand, an archival DOI for an artifact that exists. Safe days before a deadline.
- **EXPENSIVE** — new experiments, a bigger or second corpus, human labels, a new baseline. Under
  deadline pressure these usually belong to `extend-paper`, not to a near-done paper: two clean
  accepted papers beat one overstuffed one. Say so.

Each lever is a **proposal**: the gap, the counts it rests on, the precedent papers, CHEAP/EXPENSIVE,
and what the change would be. Wording changes go as a patch the author accepts hunk by hunk, never as
edits. **Which levers apply is the author's decision** — the list goes to the author as a question
(below), with a recommendation, and the answer is recorded in the review file: taken, deferred to
`extend-paper`, or declined, with the author's reason.

## Output

1. **Venue-bar summary** — what this venue rewards, its track requirements, its PC's taste (2-4 lines,
   each sourced).
2. **Proxy statement** — which proxies for "strong" exist, which failed, and what boundary the
   contrast speaks to.
3. **The two tables** — strong set and contrast set, field by field, with URLs and quotes.
4. **Separates / table stakes / does not separate / refuted** — each with counts.
5. **Proposed levers** — ranked, each as in Step 4; most consistent first.
6. **Citation gaps** — real papers (arXiv id / DOI) a reviewer here would expect, each with why. Hand
   these to `verify-citations`.
7. **Corpus-level distribution** — the denominators, each traceable to the measurement file, and the
   count of PDFs obtained out of the total.
8. **Questions for the author** — the open decisions, each with options and a recommendation: the
   sources for an empty `accepted` block, the levers to take, the steering lines for
   `<paper-dir>/CLAUDE.md`.

## 🔴 Where the output lives — three homes, and all three are required

A run that returns only a write-up has destroyed its own evidence: a measured corpus whose texts and
table sat in a scratchpad left every denominator unverifiable an hour later.

| home | what goes there | why there |
|---|---|---|
| **`<paper-dir>/venue-corpus/`** | `measurements.json` (one row per paper — the denominators' source) · `text/*.txt` (extractions: the quotable primary source) · the fetch/measure scripts · `MANIFEST.md` (sources, obtained/total, what the counters miss) | data. **PDFs are NOT committed** — record their URLs and the command instead. Text extractions ARE committed: they make a quote re-checkable. |
| **`<paper-dir>/reviews/<date>-study-accepted-<venue>.md`** | the full analysis: proxies, both tables, the classification, the levers, the author's decisions | the record. **The EXPENSIVE levers are the `extend-paper` roadmap** and are worthless if they evaporate. |
| **`<paper-dir>/CLAUDE.md`** | **the 3-5 findings that change decisions while writing**, plus "what NOT to do" — **only the lines the author confirmed** | it loads whenever anyone works on this paper, so it steers every later session. Propose the lines; write them after the author's yes. |

Then link all three from `PIPELINE-STATUS.md` (**`venuebar`** row — "venue bar / levers", in SETUP).

The steering lines are not a summary: the floor the draft misses, the strength it under-sells, and the
**beliefs the corpus disproved** — the most valuable lines, because without them the pipeline
re-derives the wrong belief. Short enough to survive being loaded into every session.

## Rules
- **Fetch real accepted papers.** Never fabricate a title, author, or "what made it strong". Unverifiable → drop or mark VERIFY.
- **Proxies are named, counts are given.** "Strong" without a named proxy, or a lever without "k of n vs k of m", is an impression.
- **A lever-proposed citation is not written into the `.tex`/bib until `verify-citations` confirms it**
  and the author takes the lever. Order: propose → verify → the author decides → add.
- **Venue-specific, not generic.** A lever counts only if it is grounded in this venue's rubric, PC taste, or its own accepted papers. Generic "tighten the writing" is out of scope (that's `grade-paper-writing` / `tighten-paper`).
- **Security venues:** treat adaptive-attacker evaluation and an explicit threat model as first-class — the most common weak-accept→strong-accept axis and the most common reviewer complaint.
- **Respect the anti-cram rule.** Flag expensive levers as extension material by default.
- Convert any newly-surfaced deadline to the author's own zone and hand it to `plan-paper-timeline`.

## Compose with
- `harden-paper` — the multi-axis pre-submit gate; this skill feeds it the venue-specific axis.
- `pc-panel-review` / `paper-adversarial-review` — they red-team the draft; this skill sets the bar they hold it to.
- `verify-citations` — consumes the citation gaps.
- `extend-paper` — the home of every EXPENSIVE lever.
- the venue card and preset (`presets/<venue>.md`, `presets/<venue>.jsonc`, or the project's own `./venues/<name>.jsonc`) — its `accepted` block is this skill's starting point, and durable venue facts go back there as a proposed patch, never as a new skill per venue. Its `shape`, measured by `scripts/measure-venue-shape.ts` in paperlint's repository, is what `pdf/venue-shape` judges a built paper against.
- the paper's `<paper>/paperlint.json` (`{ "extends": "paperlint:<venue>", "kind": "<kind>" }`) — which venue preset the `pdf/*` rules check the built PDF against.

## Provenance
Built from the **AISec 2026 @ ACM CCS** polish run (2026-07): the "Safety Theater in Agentic Coding /
GateBench" paper sat at ~Accept (pc-panel ~0.72), and the task was to find what would push it toward a
strong accept without cramming new contributions before the deadline. The contrast-set step comes
from a later run at a venue with no public reviews, where the question "what separated the papers
rated highest from the rest?" had no procedure here and needed a hand-written brief (#200).
