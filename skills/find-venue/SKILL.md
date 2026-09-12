---
name: find-venue
description: "Discover and rank real venues for a given paper, scored by authorship credit not just prestige. Fetch candidate CFPs (WebSearch/WebFetch), capture deadline / page limit / paper-type fit / indexing (ACM DL / IEEE Xplore / archival vs non-archival) / double-blind / remote-attendance / selectivity, then rank by credit-weight (peer-reviewed + indexed + parent-venue prestige) × topic fit × accept-probability × deadline feasibility × remote-friendliness. Emit a comparison table and a keep/switch recommendation. Encodes: workshop newness does NOT hurt authorship; non-archival workshops rank LOW; the prestige move is to EXTEND the accepted paper later, not hold out. Compose with research-ideate (upstream), plan-paper-timeline, the submit-paper venue data cards (submit-paper/references/venues/<venue>.md), and extend-paper."
allowed-tools: [Read, Write, Grep, Glob, WebSearch, WebFetch, Agent, Bash(node .claude/skills/paper-pipeline/scripts/announce.mjs:*), Bash(node .claude/skills/paper-pipeline/scripts/ledger.mjs:*)]
---

<!-- vigiles:sha256:d1efcdc10319e6a3 compiled from skills/find-venue/SKILL.md.spec.ts -->

# find-venue — rank real venues by what earns the credit, then keep or switch

## Run me

🔴 FIRST, before any other step:

```
node .claude/skills/paper-pipeline/scripts/announce.mjs find-venue <dir>
```

An advisory pass cannot be observed failing — silence is both its error state and its normal
state — so starting is an event, and events get written down.

The `<dir>` argument is **optional in spirit**: this skill can run before a paper directory exists, so
pass whichever directory the work lives in, or `.`. The ledger row is written either way, and a plain
dot is more honest than an invented path.

Takes a paper (or the candidate venue *types* from `research-ideate`) and finds the best real place to
submit it. "Best" here means **best for the publication record**, which is not the same as most prestigious —
an indexed workshop you can actually hit beats a top conference whose deadline already closed. This
skill produces a ranked table and a keep/switch call; it does NOT do the submission mechanics (that's
`submit-paper` + the venue card).

Grounding: the authorship criterion — why archival + indexed is the whole game.

## Gather candidates (fetch, don't guess)

`WebSearch` / `WebFetch` the open CFPs for the paper's topic + the current cycle. For EACH candidate
capture, from the actual CFP page:
- **Deadline** (in AoE; convert to your local time for feasibility).
- **Page limit** and required format (ACM sigconf / IEEE / other) — a full-paper limit vs a
  short/WIP/workshop limit changes what you must produce.
- **Paper-type fit** — does the CFP call for measurement/benchmark/short/WIP/full papers of this shape?
- **Indexing** — the single most load-bearing field. Does acceptance land in **ACM DL / IEEE Xplore /
  archival proceedings** (counts for authorship) or is it **non-archival** (talk-only, no indexed
  proceedings — does NOT count)?
- **Double-blind?** — determines anonymization work (see `anonymization.md`).
- **Remote attendance** — can the author present/attend without international travel?
- **Selectivity / prestige** — the parent venue's tier (workshop @ CCS/ASE/FSE inherits weight).

## Rank

Score each candidate by:

```
rank = credit-weight × topic-fit × accept-probability × deadline-feasibility × remote-friendliness
```

- **credit-weight** = (peer-reviewed? — required) × (indexed/archival? — required) × parent-venue
  prestige (a bonus, not a gate). **Non-archival ⇒ credit-weight ≈ 0** — it earns no authorship credit,
  so it sinks to the bottom no matter how nice the CFP reads.
- **topic-fit** — how squarely the paper matches the CFP scope (a stretch fit raises reject risk).
- **accept-probability** — realistic odds given the paper's maturity and the venue's bar.
- **deadline-feasibility** — can the paper (and artifact) be ready by the deadline? A great venue you
  miss is a zero.
- **remote-friendliness** — remote-OK is a real weight here, not a footnote.

### Facts to encode while ranking
- **Workshop newness does NOT hurt the authorship criterion.** A brand-new workshop's indexed
  proceedings count the same; venue prestige only matters at final merits, never for authorship. Do not
  down-rank a venue just for being new.
- **Non-archival workshops rank LOW for authorship** — no indexed proceedings, no credit. A great talk
  slot with no DOI is worth little to the dossier.
- **Prestige is a later move, not a hold-out.** Do NOT sit on a finished paper waiting for a fancier
  venue. Ship to the best-fit archival venue open now, then **EXTEND** the accepted paper (≥30% new) to
  a higher-prestige venue as a *second, stronger* publication — see `extend-paper`. Two indexed papers
  (workshop → conference) beat one that missed its window.

## Output

1. **Comparison table** — one row per candidate: venue, parent, deadline (AoE + local), page limit,
   type fit, **indexed? (Y/N + where)**, double-blind, remote, selectivity, computed rank.
2. **Keep/switch recommendation** — the top-ranked venue with the one-line reason, and (if the paper
   already has a target) an explicit **keep** or **switch** verdict against it. Note the intended
   `extend-paper` upgrade target for later.

## Record the verdict

🔴 LAST step, once the deliverable exists:

```
node .claude/skills/paper-pipeline/scripts/ledger.mjs record find-venue <dir> FINDING <count> <report-path>
node .claude/skills/paper-pipeline/scripts/ledger.mjs record find-venue <dir> ABSTAINED <reason> "<one line>"
```

🔴 **There is no PASS.** A shortlist is a set of findings about the world, not a certificate that
the venue question is settled.

**FINDING** — the sweep produced a ranked shortlist with an explicit keep/switch call; `<count>` is
the number of candidates ranked and `<report-path>` the comparison table. Add `--blocking` when
nothing open clears the peer-reviewed + indexed gate — a real answer, and not an empty run.
**ABSTAINED** — `no-witness`: CFPs were read and no candidate could be ranked either way.
`input-missing`: there is no paper description to match venues against.

Record the whole table's path, not just the winner. The next sweep starts from the candidates that were
dropped and why, and a verdict with no table behind it cannot be re-checked when a deadline moves.

## Rules
- Fetch every CFP fact from the real page; never invent a deadline, page limit, or indexing status.
- Indexed + peer-reviewed is a gate, not a tiebreaker — a non-archival venue cannot win on charm.
- Don't hold a finished paper hostage to prestige; ship archival now, extend later.
- A missed deadline is a zero — weight feasibility honestly against the paper's real readiness.
- Convert deadlines to your local time so `plan-paper-timeline` can schedule against them.

## Compose with
- `research-ideate` (upstream) — consumes its candidate venue *types* and sharpest framing.
- `plan-paper-timeline` — feed it the chosen deadline to back-plan the work.
- `submit-paper` venue data cards (`submit-paper/references/venues/<venue>.md`, e.g. `agenticdev.md`,
  `aisec.md`) — the winner gets a venue-specific data card with its HotCRP quirks; save a new one per
  venue as plain data, not a new skill.
- `extend-paper` — the prestige-upgrade target this skill names but defers.

## Provenance
The **AgenticDev 2026 @ ASE** venue decision was made by a **9-agent analysis** that checked every open
venue against this exact rubric. It **kept AgenticDev** — nothing open beat it on fit × archival ×
timeline: NeurIPS Eval had already **closed**, and FSE/MSR each needed a **full paper** (wrong type /
too much scope for the deadline). The prestige upgrade was deliberately deferred to an **extension to
MSR/NeurIPS 2027**, not a switch — proving the rule: ship the best-fit archival venue open now, extend
later. **AISec 2026 @ ACM CCS** confirmed the archival-weight logic at a top-tier security bar. Both
papers are indexed proceedings; neither was down-ranked for the workshop's newness.
