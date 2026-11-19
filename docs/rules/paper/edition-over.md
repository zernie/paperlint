# paper/edition-over

**Level:** warn · **Reads:** the paper's `paperlint.json`, its venue preset's `deadlines`, the shipped
presets, and the clock · **Reported on:** the first line of the paper's `PIPELINE-STATUS.md`

## What it catches

Every deadline the paper's edition preset records is in the past: the edition is over. A venue
preset is one edition (`paperlint:icse-2028`), and a bare series is never "the latest edition", so a
paper keeps its edition until its `paperlint.json` names another. This rule is how the paper hears
that the edition ended, once per lint, with the newer editions of the same series that paperlint
ships.

## Why

A paper set for an edition whose deadlines have all passed was submitted (and is waiting for, or has,
a decision), or is aimed at a cycle that closed. Either way the next step is a decision the author
makes — the next edition, or another venue — and paperlint never makes it by switching the rules
under the paper on an upgrade.

## Examples

Failing — `{ "extends": "paperlint:aidc-2026", "kind": "regular" }`, linted after the camera-ready
deadline of AIDC 2026:

```text
papers/agent-rule-drift/PIPELINE-STATUS.md
  1:1  warning  AIDC 2026 is over: every deadline its preset records has passed, the last
                (camera-ready) at 2026-11-09T11:59:59Z. paperlint ships no newer edition of it yet;
                if the paper goes elsewhere, point "extends" at that venue  paper/edition-over
```

When a newer edition ships, the message names it: «paperlint ships a newer edition:
paperlint:icse-2028 — if the paper goes there, point "extends" at it».

Passing:

- a deadline of the edition is still ahead;
- the edition's preset records no deadline (`paperlint:agenticdev-2026`): nothing says when it ends;
- a template family (`paperlint:acm-sigconf`), no `extends`, or one that does not resolve
  (`pdf/profile` says so).

## Options / preset fields

No rule options. It reads the preset's `deadlines` (`docs/configuration.md#deadlines`) and the year
of each shipped preset's id. The clock is read once per lint by `paperlint lint`.

## What it does not check

- A deadline the paper's own `cycles` record but the preset does not.
- Whether the paper was in fact submitted, accepted or withdrawn: `cycles` says that, and
  `cycle/record` checks it.

## How to fix

Point `extends` at the edition the paper goes to next, or at another venue. A paper that stays with
the finished edition on purpose — it was accepted there, and the repository is its record — turns
the rule off in its `paperlint.json`:

```json
{
  "extends": "paperlint:aidc-2026",
  "kind": "regular",
  "rules": { "paper/edition-over": "off" }
}
```
