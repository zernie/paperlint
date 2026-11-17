# cycle/changes-since-approved-coverage

> **EXPERIMENTAL.** A quick version; see [`cycle/changes-since-approved`](changes-since-approved.md),
> which has the changelist format and the open items.

**Level:** optional, off until a paper turns it on (`warn` is the intended level) · **Reads:**
`paper.tex`, `versions/<cycle>/approved.tex`, `versions/<cycle>/changes.yaml` · **Reported on:**
`paper.tex`

## What it catches

A paragraph of the approved text that is not in the draft verbatim, and that no entry of
`changes.yaml` covers: no entry has a `before` that is inside the paragraph or that contains it
(compared as the reader sees the text and as it is written, whitespace collapsed).

Silent without cycles, without an approved copy, and when every paragraph of it is still there.

## Why

A paragraph that was rewritten or cut without a line in the changelist is a change nobody declared.
It is a warning because a rewrite that keeps the sense can leave a `before` the author did not
think to write down.

## Turning it on

```json
{ "rules": { "cycle/changes-since-approved-coverage": "warn" } }
```

## What it does not check

Whether the covering entry describes what was done to the paragraph.
