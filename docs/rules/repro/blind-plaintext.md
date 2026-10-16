# repro/blind-plaintext

**Level:** error · **Reads:** `repro/studies.json`, each study's `plan.json` and `sealed.json`, and
the files under a blind study's folder · **Reported on:** the first line of the paper's
`PIPELINE-STATUS.md`, once per file

## What it catches

A blind study that is still sealed, with a plaintext result in the tree. A study is blind when its
plan's `mode` is `blind` — for a study whose outputs must exist before the decision; the default is
to decide first ([`repro/outputs-before-decision`](outputs-before-decision.md)). It is still sealed
until its `sealed.json` says `unsealed`. Every file under its folder that the mode's `outputs` match
is then a finding:

```json
{
  "mode": {
    "kind": "blind",
    "outputs": ["data/outcome/**", "RESULTS.md"],
    "recipients": ["age1…"],
    "unseal_after": {
      "file": "repro/P1-S01-outcome/exclusions.md",
      "note": "exclusions frozen"
    }
  }
}
```

with `repro/P1-S01-outcome/RESULTS.md` on disk. A `sealed.json` that cannot be read is a finding too,
and is never read as unsealed; so is a decision file (`unseal_after.file`, relative to the paper)
that the outputs match — it would be sealed with the results.

## Why

A blind study's outcomes are computed by a runner in the same workspace where the people deciding
exclusions work. A plaintext result there can be opened by anyone deciding, and nothing would record
that it was. `paperlint studies seal` encrypts the results to the plan's recipients and removes the
plaintext; this rule is the automatic block for the time between: a commit or a CI run that lints
the paper fails while a plaintext result exists. The design is
[`docs/design/sealed-studies.md`](../../design/sealed-studies.md).

It reads the disk, not git: a plaintext in the workspace defeats the blinding whether or not it is
committed, and an ignored file is as readable as a tracked one.

## Examples

Failing:

```text
papers/example/PIPELINE-STATUS.md
  1:1  error  `repro/P1-S01-outcome/RESULTS.md` is a plaintext result of the blind study `P1-S01`,
              which is still sealed: its plan's `mode.outputs` match it, and its `sealed.json` does
              not say unsealed. What to do: run `npx paperlint studies seal <paper-dir> P1-S01` — it
              encrypts the file to the plan's recipients and removes the plaintext. Never read it first.
Rule repro/blind-plaintext: https://github.com/zernie/paperlint/blob/main/docs/rules/repro/blind-plaintext.md  repro/blind-plaintext
```

Passing: the same study after `paperlint studies seal` — `RESULTS.md.age` and `sealed.json` beside
the plan, no `RESULTS.md`; or a study whose mode is not `blind`.

## Options / preset fields

No rule options. The study declares what is sealed in its plan's `mode`.

## What it does not check

- Files outside the study's folder: outputs are relative to it, and the plan refuses a glob that
  leaves it.
- The study's own files — `plan.json`, `README.md`, `sealed.json`, the decision file when it lies in
  the folder, any `*.age` — even when a glob such as `**` would match them.
- Whether the ciphertexts are the ones sealed: that is `paperlint studies verify`, which needs no key.
- Whether anyone read a plaintext before it was sealed.

## How to fix

```sh
npx paperlint studies seal papers/example P1-S01
git add papers/example/repro/P1-S01-outcome/sealed.json papers/example/repro/P1-S01-outcome/*.age
```

For an unreadable manifest, restore it from git:
`git checkout -- papers/example/repro/P1-S01-outcome/sealed.json`.
