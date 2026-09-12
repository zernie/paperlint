/**
 * pipeline-edges — the ONE declaration of which scorecard row feeds which gate.
 *
 * WHY THIS FILE EXISTS. The dependencies between pipeline skills are already enforced: every paper's
 * `PIPELINE-STATUS.md` has a `Requires` column in its `### GATES` table, and `pipeline-check.mjs`
 * reads it and reports `gate-missing-input` / `gate-stale-input` / `unknown-input`. The machinery is
 * right. What was hand-copied is the DECLARATION — each new paper retypes the cells, so a paper can
 * drop an edge and the checker will then cheerfully confirm a gate that never had its input. That is
 * not a hypothetical: on 2026-08-08 the live `<paper-a>` scorecard had `structure` requiring
 * only `render`, while `argument-arc/SKILL.md` says in its own words that it runs *before*
 * `tighten-paper`.
 *
 * WHY ONE TABLE HERE AND NOT A `requires:` FIELD IN EACH SKILL'S FRONTMATTER. The join key is the
 * SCORECARD ROW ID (`structure`, `writing`, `panel`, …) — that is what the status files and the
 * checker already speak — and a row id is not a property of a skill:
 *   - one skill owns two rows: `plan-paper-timeline` owns `access` and `schedule`; `map-prior-work`
 *     owns `priorwork` (SETUP sweep) and `priordelta` (CONTINUOUS delta); `argument-arc` owns `frame`
 *     (frame) and `arc` (arc). Frontmatter keyed by skill cannot say which of its rows an edge lands on.
 *   - one row has no skill at all: `claims` is "Fable diff", a protocol in `references/writing-craft.md`.
 * Frontmatter would therefore need a second table mapping skills to rows, i.e. this table plus a
 * layer. So: one table, keyed the way the rest of the system is keyed.
 *
 * 🔴 WHY THE IDS ARE WORDS AND NOT TWO LETTERS (renamed 2026-08-09). The join key used to be a
 * two-letter code (`St`, `Wc`, `Pn`, …). That space was exhausted and had already collided: in
 * `<paper-a>/PIPELINE-STATUS.md`, `Cr` was BOTH `cold-read-diff` (in the 06.08 gate log)
 * and `Camera-ready` (in `### AFTER`) — one join key, two rows, and the checker merges rows by id.
 * A second collision was live and silent: the row id `Id` (research-ideate) is exactly the table's
 * own header word, so `parseStatus` dropped that row on every paper as if it were a header. Both are
 * unrepresentable once the ids are words: `coldread` ≠ `cameraready`, and `idea` ≠ `id`.
 *
 * SCOPE, deliberately narrow. Only rows in the `### GATES` section appear here, because `Requires` is
 * a GATES column — SETUP/LOOP/CONTINUOUS rows have nowhere to declare an input, so an edge into them
 * is unexpressible and listing it would just be prose. The real ones found in the audit are recorded
 * in `UNEXPRESSED` below rather than dropped.
 *
 * ADMISSION RULE (why an edge is here and not in `NOT_EDGES`): the owning skill states a REQUIREMENT
 * ("required input", "blocked on", "STOP and run those first", "mandatory") or an ORDERING ("run it
 * before X", "run X first") in normative prose — a `Run me` / axis / when-to-run section. An entry in
 * a `## Compose with` list is a suggestion and does NOT qualify, even when it contains the word
 * "first". Every edge carries the sentence that admitted it, so the judgement stays auditable.
 *
 * This is a table and a loop on purpose. There is no graph engine here, and there should not be one:
 * a dozen edges do not need transitive closure, cycle detection or topological sorting, and building
 * those is how a table nobody can read stops being maintained.
 */

/** row id → { skill (for the message), requires: { input row id → the sentence that admitted it } } */
export const CANONICAL_INPUTS = {
  structure: {
    skill: "tighten-paper",
    requires: {
      render: 'render-paper/SKILL.md: "that page count is the hard input the `tighten-paper` structure gate is blocked on"',
      arc: 'argument-arc/SKILL.md: "Run it *before* them" (them = tighten-paper, grade-paper-writing) — "cutting words inside a broken arc is how a session burns a day"',
    },
  },
  writing: {
    skill: "grade-paper-writing",
    requires: {
      draft: "the template's own cell: the writing grade reads the current draft",
      arc: 'argument-arc/SKILL.md: "Before `tighten-paper` / `grade-paper-writing` / `pc-panel-review` on any draft whose thesis has changed since those gates last ran"',
      structure: 'tighten-paper/SKILL.md: "Run it BEFORE those on a bloated draft — no point polishing sentences in a section that should be cut"; harden-paper/SKILL.md: "Order matters: STRUCTURE before SENTENCES. Run axis 0 FIRST."',
    },
  },
  panel: {
    skill: "pc-panel-review",
    requires: {
      structure: 'pc-panel-review/SKILL.md: "there must exist for THIS draft … the **structural verdict** from `tighten-paper` … If either doesn\'t exist yet, STOP and run those skills first."',
      writing: 'pc-panel-review/SKILL.md: "there must exist for THIS draft: (a) the **persona stall inventory** from `grade-paper-writing`"',
    },
  },
  claims: {
    skill: "Fable diff",
    requires: {
      draft: "the template's own cell: the diff is against the pre-pass draft baseline",
      writing: 'grade-paper-writing/SKILL.md: "**After applying sentence fixes, run the `claims` claim-preservation diff** … This step is mandatory after EVERY rewrite, not optional."',
    },
  },
  harden: {
    skill: "harden-paper",
    requires: {
      panel: 'harden-paper/SKILL.md axis 1: "run `paper-adversarial-review` (quick) and, as the final decision gate, `pc-panel-review`"',
      structure: 'harden-paper/SKILL.md axis 0: "**Structure / editorial (run FIRST)** — run **`tighten-paper`**"; paper-pipeline/SKILL.md: "Its structure and writing axes are the **re-run/confirm** pass, not the first invocation."',
      writing: 'harden-paper/SKILL.md axis 8: "run **`grade-paper-writing`** … Without it this axis silently does not run"',
      cites: 'harden-paper/SKILL.md axis 4: "**Citations** — run `verify-citations`" under "## The axes (run all; each is a gate)"',
      priordelta: 'map-prior-work/SKILL.md, the `priordelta` row: "**Whenever the contribution\'s framing moves**, and again before `harden-paper`."',
    },
  },
  submit: {
    skill: "submit-paper",
    requires: {
      harden: 'submit-paper/SKILL.md: "Harden first: `pc-panel-review` (incl. its venue-fit mode), `paper-adversarial-review`, `render-paper`."',
      access: 'paper-pipeline/SKILL.md GATES table, Submit: "🔴 **The `access` row green.**"',
    },
  },
};

/**
 * Orderings that are REAL but have nowhere to be declared: they end in a SETUP or LOOP row, and only
 * GATES rows carry a `Requires` cell. Kept here so the audit is complete and so nobody re-derives
 * them and then invents a column for them.
 */
export const UNEXPRESSED = [
  ['schedule ← venue', 'plan-paper-timeline/SKILL.md: "`find-venue` — the source of the four CFP dates this skill consumes; run it first."'],
  ['access ← venue', "same sentence: the portal and its form are venue facts, so the venue is picked first."],
  ['draft ← study', 'draft-paper/SKILL.md: "**FAIL** — it declined to draft because a required input was missing: no numbers from build-benchmark"'],
  ['priorwork ← idea', 'paper-pipeline/SKILL.md SETUP: map-prior-work runs "right after `research-ideate` says go"'],
];

/**
 * Claims read during the audit and JUDGED TOO WEAK to be an edge, with the sentence that made the
 * call hesitate. Recorded because "we looked and decided no" and "we never looked" are
 * indistinguishable afterwards, and the first is only worth anything if it is written down.
 */
export const NOT_EDGES = [
  ['panel ← arc',
   'argument-arc/SKILL.md: "Before `tighten-paper` / `grade-paper-writing` / `pc-panel-review` **on any draft whose thesis has changed since those gates last ran**." — conditional, and panel already requires structure and writing, which both require arc, so declaring it adds no enforcement.'],
  ['writing ← render',
   'grade-paper-writing/SKILL.md: "`render-paper` — build the PDF/PNGs first so you grade what the reviewer will actually see." — it is an entry in the `## Compose with` list and about fidelity of grading, not a block. `tighten-paper` states its render dependency in normative prose; this one does not.'],
  ['harden ← siblings',
   'harden-paper/SKILL.md axis 3: "For every genuine sibling found, run **`analyze-sibling-paper`**" — conditional on a sibling existing, and `siblings` is itself a trigger row that is n/a on a paper with no close neighbour.'],
  ['harden ← venuebar',
   'study-accepted-papers/SKILL.md: "`harden-paper` — the multi-axis pre-submit gate; this skill **feeds it** the venue-specific axis" — a compose-with, and harden\'s own axis list never calls it.'],
  ['harden ← siblings (via analyze-sibling-paper)',
   'analyze-sibling-paper/SKILL.md: "Compose with … harden-paper (its nearest-neighbor-scoop axis calls this)" — a compose-with sentence in a description, mirrored by the conditional above.'],
  ['structure ← draft',
   'tighten-paper/SKILL.md description: "The developmental / editorial pass on a **DRAFTED** paper" — states a precondition on the object, not on a scorecard row, and no sentence orders it against `draft`.'],
  ['writing ← panel / claims ← panel / harden ← claims (the chain read off the GATES table order)',
   'paper-pipeline/SKILL.md: "Ordered, and the order is real: every one refuses to run without the output of the one before it." — the same table\'s own `Requires (hard)` column contradicts it (Writing craft requires "The current draft", not the structure verdict). Rhetoric about the table, not a declaration; the column is the declaration.'],
];
