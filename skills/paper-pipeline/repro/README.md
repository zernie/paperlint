# repro/ — raw runs behind the pipeline's own measurements

Every number this directory's evals report has its raw log here. The rule is the repo's: a claim
whose run lives only in a scratchpad is not reproducible, and the scratchpad is erased at the end of
the session.

| file | what it backs | headline |
|---|---|---|
| `2026-08-07-language-eval-raw.log` | `pipeline-language.eval.mjs`, the full designed run | 32 matched pairs × 3 trials × 2 languages = 192 runs. EN 75/96 (78.1%) vs RU 58/96 (60.4%), −17.7pp; paired sign test 13v2, 17 tied, **p = 0.0074**. Effect present in BOTH translation directions. |
| `2026-08-07-language-eval-pilot.log` | the same file's one-case pilot | `tighten-paper` at 2 trials, run before committing quota to 192 |
| `analyze-language-eval.py` | the statistics for the above | Parses the raw log and recomputes everything. Statistics live HERE, downstream of the instrument, so the eval cannot print a number that confirms its own hypothesis. Run: `python3 analyze-language-eval.py 2026-08-07-language-eval-raw.log` |
| `2026-08-07-description-language-control.log` | `description-language.eval.mjs`, control arm | 12 **fresh** matched pairs × 3 trials × 2 languages = 72 runs. RU 11/36 (31%) vs EN 9/36 (25%). 🔴 **The gap did not appear — and both arms collapsed** from 78%/60% to a quarter. This killed the bilingual-description intervention before it was built. |
| `2026-08-07-fork-check.log` | the `context: fork` pilot | `cold-read-diff` en 67→75 / ru 67→67; `map-prior-work` en 67→75 / ru 75→75. No regression, which is the point — the risk was that forking changes what the model selects. |
| `2026-08-07-fork-check2.log` | `context: fork` rollout check | `paper-adversarial-review`, the only one of the five rolled-out skills covered by an eval |
| `2026-08-08-framing-vs-vocabulary-raw.log` | `framing-vs-vocabulary.eval.mjs`, main 2×2 | 3 skills × 4 cells × 4 prompts × 3 trials = **144 runs, 0 errored**. AH 64% (23/36) · AL 44% (16/36) · SH 61% (22/36) · SL 11% (4/36). Vocabulary main effect **35pp**, framing **18pp**. 🔴 **ONE** competitor misfire in 144 runs; SL is **86% SILENT**. |
| `2026-08-08-framing-vs-vocabulary.json` | per-run rows for the above | Every run's TARGET/OTHER/SILENT bucket, measured overlap, lexical argmax, and which competitor fired instead. The bucket field is the signal neither earlier eval recorded. |
| `2026-08-08-framing-vs-vocabulary-oracle.log` | the same file's `--mode oracle`, the C control | 48 closed-book picks over all 37 descriptions, no harness, no skills installed. AH **12/12** · AL 8/12 · SH **12/12** · SL **3/12** (6 answered NONE). Harness sits 14–39pp below the oracle in *every* cell. |
| `2026-08-08-framing-vs-vocabulary-oracle.json` | per-pick rows for the above | Each prompt's oracle pick vs the intended skill. |
| `2026-08-08-grade-paper-writing-ablation-raw.log` | `grade-paper-writing-ablation.eval.mjs`, arms A0–A5 | 6 arms × 8 prompts (the parent's AH+SH, verbatim) × 3 trials = **144 runs, 0 errored**. A0 baseline **54% (13/24)** · A1 short 50% · A2 no-subordination 50% · A3 no-negation 54% · A4 no-machinery 46% · A5 renamed **25%**. Every description-text arm inside noise (±~20pp at n=24). |
| `2026-08-08-grade-paper-writing-ablation-A6-raw.log` | the same file, arm A6 added later | persona-only description (225 chars), 24 runs. **42% (10/24)** vs A1's rubric-only 50% — the pair does not separate the skill's two halves. |
| `2026-08-08-grade-paper-writing-ablation.json` | per-run rows for both of the above | 56 prompt-rows across 7 arms: TARGET/OTHER/SILENT bucket, measured overlap, description length, competitors fired instead. |
| `2026-08-08-grade-paper-writing-ablation-oracle.log` | the same file's `--mode oracle`, all 7 arms | 56 closed-book picks. 7/8 or 8/8 on every arm **except A5 at 0/8** — and on 7 of those 8 the oracle answered `grade-paper-writing`, a name absent from the roster it was shown. |
| `2026-08-08-grade-paper-writing-ablation-oracle.json` | per-pick rows for the above | Each arm × prompt: the oracle's pick vs the arm's intended id. |
| `2026-08-08-grade-paper-writing-ablation-setupdiff.log` | `--mode setupdiff`, **free** | The mechanical answer to "is the ablation's harness the same as the parent's": options, fixture block, `fired` predicate and `firedSkills` helper all identical; all 7 arm dirs 37 skills with every frontmatter sha256-identical to the real one bar the deliberate mutation. Plus the parent-vs-A0 row-by-row. |
| `2026-08-08-parent-replication.mjs` | the replication driver | Runs `framing-vs-vocabulary.eval.mjs` **itself** with two asserted patches (main loop → this skill + AH/SH; output path), everything else untouched, against the real `.claude/skills`. Written because the ablation's control contradicted the parent. |
| `2026-08-08-parent-replication-gpw.log` | that driver's run | 🔴 **The parent's own code returns AH 9/12 + SH 3/12 = 12/24 (50%)** hours after the same code returned 3/12 + 2/12 = 5/24 (21%). |
| `2026-08-08-parent-replication-gpw.json` | per-run rows for the above | The parent's own row schema, so it diffs directly against `2026-08-08-framing-vs-vocabulary.json`. |

## How to read these, and the trap in them

**The two evals disagree, and the disagreement is the finding.** Same three skills, same fixture,
same method:

```
prompts that NAME the action      ("paper got bloated, what to cut?")   78% EN / 60% RU
prompts that describe a SITUATION ("text won't fit, need to decide
    what to sacrifice and where to move it")                          25% EN / 31% RU
```

A factor of two to three. The second set was written deliberately to share **no vocabulary** with the
skill descriptions — because a prompt reusing a description's words measures how well the description
was copied, not whether it works. Remove the shared vocabulary and recall falls off a cliff.

So the control does **not** refute the language finding: at 25–31% both arms sit on the floor and a
6pp difference there has no power behind it. What it establishes is bigger and less welcome — these
skills mostly fire when the user happens to use the description's own verb.

**Do not compare a number from one log against a number from the other as if they were the same
measurement.** They share a method and differ in the one variable that turned out to dominate.

## 2026-08-08 — the disagreement above, explained

`framing-vs-vocabulary.eval.mjs` crossed the two factors the disagreement confounded (every
"names the action" prompt was *also* high-overlap) and recorded, for the first time, **what fired
instead**. Result, in one line:

> The selector fires when it has **either** the description's vocabulary **or** an explicit request
> for the deliverable. It collapses only when it has neither — which is how people type.

- **The symptom-vs-action framing hypothesis is refuted.** Pure symptom statements written in the
  description's own words (`SH`, 61%) fire as well as explicit requests (`AH`, 64%) — 83% vs 83%
  once the one dead skill is excluded. Descriptions already name symptoms; that is not what is
  missing.
- **Ambiguity is refuted too, in the form it was posed.** If the oblique prompts were losing to
  plausible rivals, competitors would be taking the runs. They are not: **1 misfire in 144 runs**,
  and 86% of the collapsed cell resolves *no skill at all*. Nothing competes; nothing matches.
- **But the descriptions really are under-determining.** A closed-book reader handed all 37
  descriptions also collapses on those prompts (3/12, six NONE). So the gap is **coverage**, not
  ambiguity — different defect, different fix.
- **Unexplained and possibly bigger:** the harness runs 14–39pp below that closed-book reader in
  *every* cell, including the ones the reader gets 12/12. A third of the easiest prompts resolve
  nothing. Size measured here; cause not.

Full reading, caveats, and what it still cannot settle: the header of
`../framing-vs-vocabulary.eval.mjs`. **No `SKILL.md` was changed on the strength of this run.**

## 🔴 2026-08-08, later the same day — the "dead skill" premise did not replicate

`grade-paper-writing-ablation.eval.mjs` set out to explain WHY `grade-paper-writing` fired only
12% of the time, by mutating its description one factor at a time (7 arms × 8 prompts × 3 trials).
Its **control arm broke the premise instead**:

```
grade-paper-writing, the parent's own eight AH+SH prompts, same fixture, same 36 competitors
  parent, this morning                                3/12 AH · 2/12 SH   =  5/24   21%
  ablation control A0, hours later, same description  7/12 AH · 6/12 SH   = 13/24   54%
  THE PARENT'S OWN CODE, re-run, real .claude/skills  9/12 AH · 3/12 SH   = 12/24   50%
```

The third line is why this is not a setup bug: it is `framing-vs-vocabulary.eval.mjs` itself,
patched only to run one skill and two cells, against the real skills directory. `--mode setupdiff`
separately proved the two harnesses identical option by option and hash by hash.

- **Every description-text arm is flat** — short −4pp, no-subordination −4pp, no-negation 0pp,
  no-machinery −8pp, persona-only −12pp, against a ±20pp interval. The cause was not in the text.
- **The one arm outside noise is an artifact.** Renaming the skill (description byte-identical)
  cost 29pp and collapsed the oracle to 0/8 — because **six other descriptions name
  `grade-paper-writing`** (`cold-read-diff`, `draft-paper`, `harden-paper`,
  `paper-adversarial-review`, `pc-panel-review`, `tighten-paper`) and the reader follows the
  cross-reference to a skill that no longer exists. A rename here is not a local edit.
- **What did reproduce:** the closed-book oracle scores 7–8 of 8 on every non-artifact arm while
  the harness delivers 42–54% on the same text. That 25–45pp deficit is the parent's point 5, and
  no description edit touched it.

⚠️ **The 12% figure is quoted as measured fact inside `harden-paper` and `pc-panel-review`**
(commit `38a17ef`). The advice there — invoke the skill by name instead of relying on selection —
survives at 50%; the number does not. Neither file was edited on the strength of this run either.

Full reading and the confounds, including the un-pre-registered arm-order one:
the header of `../grade-paper-writing-ablation.eval.mjs`.

## ⚠️ These logs are gitignored — force-add them

`.gitignore` line 73 is `*.log`, meant for LaTeX build artifacts. It silently swallows every raw log
in this directory. The table above says "every number has its raw log here"; git tracks **none** of
the `.log` files, so a fresh clone has the claims and not the evidence — exactly the artifact loss
this directory exists to prevent. New logs must be added with:

```
git add -f .claude/skills/paper-pipeline/repro/<name>.log
```

The `2026-08-08-*` logs were added this way. The four `2026-08-07-*` logs are still untracked and
should be force-added the next time someone touches this directory.

## Cost

Billed to a Claude subscription, $0 metered; ~$0.14 API-equivalent per run. The 192-run design cost
~$26.59. That is why the pilot exists and why the `after` arm of the description A/B was never run.
