# Formats — codebook, label file, notes, rater instruction

`labels.js` is `scripts/labels.js` in this skill.

## Codebook — `codebook.json`, committed before the first label

```json
{
  "labels": [
    {
      "id": "solved",
      "definition": "The task's own check passes on the committed state, and nothing outside the task changed.",
      "borderline": "The check passes, but the run also edited a fixture the task did not name: not solved until the edit is explained."
    },
    {
      "id": "deferred",
      "definition": "The run stops and hands the decision back to the user instead of acting.",
      "borderline": "\"I'll leave that choice to you.\" — a statement, no question mark: deferred."
    },
    {
      "id": "failed",
      "definition": "The run ends without the task done and without handing the decision back.",
      "borderline": "Times out mid-edit: failed, unless the attempt is a harness error in the ledger."
    }
  ]
}
```

`validate` requires every label to have `id`, `definition` and `borderline`.

## Label file — TSV

```
agent	model	cell	label
cli-a	model-a	unit-017/control/1	solved
cli-a	model-a	unit-017/treatment/1	deferred
```

- Exactly this header, tab-separated, four fields per row.
- `cell` is `<unit>/<arm>/<seed>`; `agent` and `model` match the `agent` and `model` fields of the
  run-agent-grid ledger, so `validate --ledger` can check that each row is a completed run and each
  completed run has a row.
- One file per source: `auto.tsv` (the pre-sort), `hand.tsv`, `rater-b.tsv`, and the final
  `labels.tsv` the analysis reads.

## Notes — `notes.md`

```markdown
## 2026-01-05

unit-017/control/1: solved → deferred. Re-read the final message:

> I've prepared both options; I'll leave the final call to you.
```

A relabel after the analysis is accepted by `validate --analysed-at` only when its cell appears in a
section under a `## YYYY-MM-DD` heading that also holds a `>` quote line.

## Rater instruction — one committed file, used byte for byte

The same file goes to every rater; record `sha256sum rater-instruction.md` in the notes. It holds:
the codebook (pasted, not summarised), what the rater receives for each run (the final message and
the ordered action list), the output format (one label per run, no other text), and nothing about
the arms, the hypothesis or another rater's labels.
