# cycle/submitted-frozen

**Level:** error · **Reads:** the paper's `paperlint.json` (`cycles`) and its `versions/` folder ·
**Reported on:** the first line of `PIPELINE-STATUS.md`

## What it catches

A cycle with `"submission": { "id": … }` — a PDF went to the venue's portal — and no
`versions/<cycle>/submitted.pdf`.

## Why

What the reviewers read is the one version an author has to be able to show again: a reviewer's
page and line numbers point into it, and a camera-ready starts from its source. Before this rule a
paper could record a submission on an open cycle, keep no frozen copy, and `paperlint lint` said
nothing; the only record of the text under review was a branch commit, which squash merges and
`git gc` destroy.

Since this rule, `paperlint submission new --save` and `submission update --save` freeze the exact
PDF they send, with the source it was built from, so the rule fires only for an upload made another
way (by hand on the portal, or before paperlint froze on send).

## Examples

Failing — `paperlint.json` has

```json
{
  "cycles": [
    {
      "id": "open-2027",
      "venue": { "kind": "preset", "extends": "paperlint:acm-sigconf" },
      "opened": "2026-09-09",
      "submission": { "id": 7 }
    }
  ]
}
```

and `versions/open-2027/` is empty:

```text
papers/my-paper/PIPELINE-STATUS.md
  1:1  error  cycle «open-2027» has submission 7 on the portal, and `versions/open-2027/submitted.pdf`
              is not there: what the reviewers read is not frozen. …  cycle/submitted-frozen
```

Passing: the same cycle with `versions/open-2027/submitted.pdf` on disk; or a cycle with no
`submission` yet (still preparing).

## Options / preset fields

No rule options.

## What it does not check

- The source beside the PDF, the lock, the folder's names — [`versions/layout`](../versions/layout.md) does.
- That the frozen PDF is the one the portal holds: `paperlint submission show` compares sha256s.

## How to fix

Send with `npx paperlint submission update <paper> --save`: it freezes what it sends. For an upload
made before, put the PDF the portal holds at `versions/<cycle>/submitted.pdf` (`submission show`
prints its size and sha256 to check against), the source it was built from as `submitted.tex`, and
run `npx paperlint versions lock <paper>`.
