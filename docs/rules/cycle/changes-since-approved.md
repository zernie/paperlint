# cycle/changes-since-approved

> **EXPERIMENTAL.** A quick version: the file names, the entry shape and the messages may change.
> What differs from the proper version is marked `TODO(...)` in `src/changelist.ts` and
> `src/changes-rule.ts`.

**Level:** optional, off until a paper turns it on (`error` is the intended level) · **Reads:**
`paper.tex`, `versions/<cycle>/approved.tex` and `versions/<cycle>/changes.yaml` of the open (or
accepted) attempt · **Reported on:** `paper.tex`

## What it catches

The paper has an approved copy (`npx paperlint versions approve`) and the draft has moved on. Then:

- a number or a `\cite` key that is in the approved text and not in the draft, and that no entry of
  `changes.yaml` lists under `drops`;
- a `changes.yaml` that is not YAML or breaks its shape (below), including a `cut` without
  `reader_loses`.

Silent without cycles, without an approved copy, and when nothing of the approved text is gone.
The paragraphs that are gone are the warning of the sibling rule,
[`cycle/changes-since-approved-coverage`](changes-since-approved-coverage.md).

## Why

An edit that shortens a paper tends to remove a number or a citation along the way, and the author
finds out from a reviewer. Declaring each removal beside the version it is measured against makes
the loss a line in a file the author read, not a surprise in a diff.

## The changelist

`versions/<cycle>/changes.yaml`, next to `approved.tex`:

```yaml
- type: cut # rewrite | add | correct | move | markup | cut | raw
  before: "We measured 63 repositories."
  why: the sample size is in the abstract
  reader_loses: nothing the abstract does not say
  drops: ["63", "smith24"] # optional: numbers and \cite keys this change removes
```

`type` is declared, not checked. `before` is text from `approved.tex`, a paragraph or part of one.
`reader_loses` is required for `cut`. Quote decimals with a trailing zero in `drops` (`"3.50"`): YAML reads an unquoted `3.50` as `3.5`. `paperlint versions diff` shows what the draft lost.

## Turning it on

```json
{ "rules": { "cycle/changes-since-approved": "error" } }
```

## What it does not check

- Whether an entry is true, or its `type` right.
- A number outside the body's prose, except those typeset by `\num`, `\SI`, `\qty` and their range forms, and numbers inside inline math; cite keys are read from every citation command, captions included.
- Whether a paragraph that is still there says the same thing.
