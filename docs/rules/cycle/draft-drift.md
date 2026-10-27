# cycle/draft-drift

**Level:** warn · **Reads:** `paper.tex` (with the files the last build spliced in), `paperlint.json`
(`cycles`), `versions/<open cycle>/submitted.tex` · **Reported on:** the first line of `paper.tex`

## What it catches

The last cycle is open, its `submitted.tex` is frozen, and `paper.tex` differs from it. The message
says by how much: the lines added and removed, as a line diff counts them.

## Why

`paper.tex` is always the draft; the frozen `submitted.tex` is what the venue's reviewers read. Between
the upload and the decision the draft keeps moving — towards the next venue, or answering what the
reviewers are likely to ask — and that is expected. What is not expected is to forget it: a reply to a
reviewer that quotes line numbers, or a rebuttal that quotes a sentence, has to quote the frozen file.
The warning keeps the distance visible. ESLint has no info level, so it is a warning: it prints and
does not fail the run.

## Examples

Reported — the open cycle `open-2027` froze `submitted.tex`, and `paper.tex` changed since:

```text
papers/my-paper/paper.tex
  1:1  warning  paper.tex has moved on from `versions/open-2027/submitted.tex`, the version under
                review at paperlint:acm-sigconf: 18 lines added, 18 removed — expected while the draft
                heads for its next venue; …  cycle/draft-drift
```

Silent: `paper.tex` as frozen; no open cycle; or no frozen `submitted.tex` yet.

## Options / preset fields

No rule options. A paper that does not want the reminder turns it off in its `paperlint.json`:
`"rules": { "cycle/draft-drift": "off" }`.

## What it does not check

- Which of the changes matter: a changed number and a reflowed paragraph count the same.
- A paper split into several files is compared as the last build assembled it; when the build's record
  is out of date (`paper/sources-fresh` says so), only `paper.tex` itself is compared.

## How to fix

Nothing to fix while the draft heads elsewhere. To answer the reviewers of the open cycle, quote
`versions/<cycle>/submitted.tex`.
