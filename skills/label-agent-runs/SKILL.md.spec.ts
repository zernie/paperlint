import { experimental_skill, file, prose } from "vigiles/spec";
import { COMMANDS } from "./scripts/labels-commands.ts";

export default experimental_skill({
  name: "label-agent-runs",
  description:
    'Label the outcomes of an agent experiment grid so the labels survive review: a codebook fixed before the first label (each label with a definition and a borderline example), the automatic classifier used only as a pre-sort, every run without artifact-level evidence read in full and labelled by hand, auto-vs-hand disagreements reported, a blind second rater on a different model with agreement (Cohen\'s kappa, percent with a CI), labels kept as data and never edited after the analysis without a dated note. Use after the runs of a grid are in and before any outcome number is computed: "label the runs", "the classifier missed some outcomes", "second rater", "inter-rater agreement on the transcripts". Ships labels.js (validate, agree). Composes with run-agent-grid (upstream), build-label-page (the hand-labelling page) and build-benchmark (the analysis).',
  tools: ["Read", "Write", "Edit", "Grep", "Glob", "Bash", "Agent"],
  body: prose`
# label-agent-runs — turning finished agent runs into outcome labels a reviewer can trust

After \`run-agent-grid\` has produced the runs, every outcome number in the paper comes from a label.
This skill is the procedure for producing those labels: what is fixed before labelling, what may be
decided by a script, what must be read by a person, how a second rater is run, and how the labels
are kept. \`build-benchmark\` turns the labels into statistics; \`build-label-page\` is the page a person
labels on.

Each rule names the failure behind it and what holds it — a refusal in ${file("skills/label-agent-runs/scripts/labels.ts")} (run as the compiled \`scripts/labels.js\`) or
**prose only**. Formats (codebook, label file, notes, rater instruction):
[\`references/formats.md\`](references/formats.md).

\`\`\`bash
node \${CLAUDE_SKILL_DIR}/scripts/labels.js ${COMMANDS.validate} labels.tsv --codebook codebook.json --ledger attempts.jsonl
node \${CLAUDE_SKILL_DIR}/scripts/labels.js ${COMMANDS.agree} auto.tsv hand.tsv
\`\`\`

Exit codes: 0 valid or reported · 1 a finding · 2 usage.

## 1. The codebook comes first

- Before the first label: every outcome label with a **definition** and a **borderline example** (the
  case nearest the line, and which side it falls on). A codebook written while labelling bends to the
  runs already seen.
- **Held by:** \`${COMMANDS.validate}\` refuses a codebook that is not committed, differs from its committed
  version, lacks a definition or a borderline example for a label, or was first committed after the
  label file; and a label the codebook does not define. A codebook change after labelling started is
  a dated addendum, and the affected runs are re-labelled.

## 2. The automatic classifier is a pre-sort, not a label

- An automatic outcome detector misses classes. The case that produced this rule: a detector of
  "the agent handed the decision back to the user" keyed on a question mark, and missed most of the
  deferrals in one grid — they were phrased as statements ("I'll leave that decision to you.").
- **Mechanically certain** means artifact-level evidence decides the outcome: the task's check passes
  or fails on the committed state, the required file exists or does not. Only those runs keep the
  automatic label.
- **Every other run is read in full** — the final message AND the action sequence (the tool calls,
  in order) — and labelled by hand. Use \`build-label-page\` when there are more than a handful.
- **The disagreements between the pre-sort and the hand labels are reported**, with counts per
  label, not folded away: they are the measured error of the classifier.
- **Held by:** \`validate --ledger\` refuses a label file that misses a completed run, or labels a cell
  with no completed run; \`agree auto.tsv hand.tsv\` lists every disagreement. **Prose only:** that
  the uncertain runs were actually read.

## 3. A finished run still gets a check of what changed outside the task

- A run that completed its task can also have changed what it was not asked to touch (deleted a
  test, edited a fixture, rewrote a config). Before a "solved" label stands, list what the run
  changed outside the task's paths:

  \`\`\`bash
  git -C <working-copy> diff --name-only <base> HEAD -- . ':(exclude)<task path>'
  \`\`\`

  Anything listed is read and either explained in the notes or reflected in the label.
- **Prose only.**

## 4. A second rater, blind, on a different model

- A second rater labels **the same runs**: a different model from the first rater's, given **the same
  instruction byte for byte** (one committed file; record its hash in the notes), and **blind** to the
  first labels — it receives the runs' messages and actions, never another rater's label.
- Report agreement: Cohen's kappa and percent agreement with its 95% interval, over n, with the
  disagreements. Resolve disagreements by re-reading the run, and record each resolution in the notes.
- A person may replace **one** rater, never all of them: at least one rater stays independent of the
  person who wrote the codebook.
- **Held by:** \`${COMMANDS.agree}\` refuses two files that label different cells, and computes n, percent with a
  Wilson interval, kappa (or says it is undefined when only one label occurs), and every
  disagreement. **Prose only:** blindness, the different model, the identical instruction.

## 5. Labels are data, and frozen after the analysis

- The labels live in a TSV with the header \`agent model cell label\` (tab-separated), one row per
  run, beside a notes file. Every relabel gets a note under a dated heading (\`## YYYY-MM-DD\`) naming
  the cell and quoting the run verbatim (a \`>\` line) — the quote is the evidence for the label.
- Once an analysis has read the labels, they are not edited without such a note.
- **Held by:** \`validate --analysed-at <rev> --notes notes.md\` refuses every cell whose label differs
  from the revision the analysis read and is not named in a dated section with a quote. Tag the
  revision when the analysis runs (\`git tag analysis-<date>\`).

## What to report

The codebook (and its revision), the share of runs labelled automatically vs by hand, the
pre-sort's disagreements with the hand labels, the second rater's agreement (kappa, percent with CI,
n), and every relabel after the analysis with its note.

## Compose with

- **run-agent-grid** (upstream) — the runs, the attempt ledger and the cell ids the labels use.
- **build-label-page** — the page a person labels on, and the export into the study's \`data/\`.
- **build-benchmark** — the statistics computed from the labels.
`,
});
