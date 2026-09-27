# paper-pipeline/scripts — did the check run, against what, and what did it say

Four files record paper-pipeline skill runs and compute the status view that replaced the
hand-maintained `PIPELINE-STATUS.md` table. Alongside them live the harnesses that plant a defect in
each mechanical gate and check the gate says no (see **Harnesses**, added 2026-08-07).

> **📍 Moved here 2026-08-15 from `.claude/pipeline/`.** The top-level directory was distributed:
> everything with one owner went to it. Here this is the paper-pipeline family —
> `ledger` · `announce` · `status` · `run-mechanical` plus nine checkers that already lay
> here, and **their tests, which until that day lay in another top-level directory**. That is,
> colocation was missing precisely where we preach it: checker in the skill, its harness — outside.
>
> What remained without an owner (shared library of 24 skills, `markdown.mjs`) —
> in [`.claude/lib/`](../../../lib/README.md), also there the breakdown of four forms of reference, from which
> path-based search sees only one.

| file           | what it is for                                                                                                                                                                                                                                                                                                              |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ledger.mjs`   | The append-only run ledger. `record()` writes one JSON line carrying a FINDING or an ABSTENTION **plus a hash of the paper and a hash of the skill's own source**. `status()` derives FRESH / STALE-PAPER / STALE-SKILL / NEVER-RUN from those hashes against the bytes on disk. Everything else is derived from this file. |
| `announce.mjs` | `node .claude/skills/paper-pipeline/scripts/announce.mjs <skill> <paper-dir>` — prints a two-line banner to stderr and writes an `ABSTAINED started` row. Called by a skill as its first step.                                                                                                                              |
| `status.mjs`   | The computed status view. No field here can be set by a human.                                                                                                                                                                                                                                                              |
| `runs.jsonl`   | The ledger itself. Append-only; do not edit by hand.                                                                                                                                                                                                                                                                        |

## The one command

```
node .claude/skills/paper-pipeline/scripts/status.mjs <papers-root>/<paper>
```

## Three properties, each one a defect we actually shipped

1. **Staleness is computed, never declared.** A run is fresh only if the paper hashes to what it
   hashed when the check ran. Nobody ticks a box, so nobody forgets to un-tick one.
2. **The checker's own source is part of the key.** Improve a skill and its old answers go stale —
   they were answers from a different tool. This is what `make` cannot do and why its staleness
   answers could not be trusted here.
3. **A check that has never said no is reported as suspect.** From mutation testing: a test that
   kills no mutant is not a test. A tightening pass once returned KEEP on 80 of 81 sections and
   still counted as run.

## 🔴 There is no `PASS` constructor (2026-08-10)

Five failures were observed on this pipeline. Three were defects of the CHECKING APPARATUS rather
than of any manuscript, and they are one fact wearing three coats:

1. a gate was recorded as passed while the input it needs did not exist;
2. a check that had never once returned a negative counted as a working check;
3. five model reviewers from one vendor agreeing was recorded as an acquittal.

Each is a stored value meaning _nothing was wrong_, written by a process with no evidence for it and
thereafter indistinguishable from one that had some. So the value is gone. **A run records exactly
two things:**

| constructor | must carry                                                                            | means                                                  |
| ----------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `FINDING`   | a `<count> ≥ 1` **and a report path that exists** (`--blocking` if it stops the pass) | something is wrong, and here is where to read about it |
| `ABSTAINED` | a `<reason>` from a closed set                                                        | no judgement was produced, and here is why             |

Reasons: `started` · `no-witness` · `input-missing` · `blocked` · `crashed`.

**"Nothing was wrong" is not a value that can be written down.** It is the ABSENCE of findings,
derived at read time by whoever is asking — who then owns the inference. A completed clean run
records `ABSTAINED no-witness`, which is not a pass with better manners: it says the check ran and
has **no witness** for the negative answer.

### Prior art, both halves of it

- **SARIF** (OASIS Standard 2.1.0, §3.27.9) defines `kind: "pass"` verbatim as _"The rule … was
  evaluated, and no problem was found"_, and the only REQUIRED property of a `result` is `message` —
  `locations` is optional, so a conformant acquittal can name no place, no span and no artifact.
  🔴 **Do not write that industry lacks abstention.** `kind: "open"` sits in the same paragraph
  (_"insufficient information to decide whether a problem exists"_) and its NOTE 1 draws exactly our
  trichotomy. Our position is **"delete pass"**, never "add abstain". Established `[A]` against the
  OASIS text and its JSON schema in
  `the author's private research notes` §5.
- **Certifying algorithms** — McConnell, Mehlhorn, Näher & Schweitzer, _Computer Science Review_
  5(2):119–161, 2011 — is the ancestor: BOTH answers carry a witness ("bipartite" → a 2-colouring,
  "not bipartite" → an odd cycle). 🔴 **Our discipline is strictly WEAKER than theirs and must say
  so rather than borrow the credit:** we witness only the finding. `no-witness` is the honest name
  for what we have when a check comes back empty.

### What happens to the old rows

`runs.jsonl` holds real rows carrying `PASS`, `FINDINGS`, `FAIL`, `ABSENT` and `ERROR`. **The file
is not rewritten** — editing history so it agrees with today's design is the same move as ticking a
box in the old status table.

**Nor are those rows translated.** A silent reinterpretation is precisely the class of defect this
refactor removes: map an old `PASS` onto `ABSTAINED no-witness` and a row asserting "nothing was
wrong" comes back out of the reader wearing the new vocabulary's honesty without having earned it.
So a legacy row keeps a kind of its own, `LEGACY`, and its original word verbatim in
`legacyVerdict`. `LEGACY` is deliberately **not** in `KINDS`: it can be read and never written.

- it counts as a RUN — someone did run something, and pretending otherwise is its own lie;
- a legacy `FINDINGS`/`FAIL` row still surfaces its count and report path, because those rows carry
  evidence and discarding evidence is the destructive direction (the same reasoning that writes a
  broken `FINDING` row before failing the run);
- a legacy `PASS`/`ABSENT`/`ERROR` row carries **nothing** forward. The status view prints it as
  `legacy:PASS` under a heading that says so. Note that real PASS rows sometimes carry a count
  (`sweep-design-space`, `findings: 8`) and that count meant _survivors_, not defects — it is not
  read as a finding count. Re-run the check to get an answer in a live vocabulary.

## 🔴 One check, one row (2026-08-10)

**The ledger was keyed on the SKILL, but the thing that produces a verdict is the CHECK.** `status()`
reduces a key's rows with `runs[runs.length - 1]` — correct across repeated runs of one check,
catastrophic across two. Two mechanical checks filed under one skill name took turns being the
answer: a clean run of the second erased a finding of the first from every derived view, while the
ledger file itself still honestly held both lines.

The key is now `skill` + `check`, written `skill/check` (or just `skill` for a skill with one
check). `EXPECTED_GATES` entries are checks, not skills.

The cost had been paid in unwired checks: `repro/arm_permutation.py` and `repro/delivered_pdf.py`
were left out of `run-mechanical.mjs` precisely because their natural owner is `build-benchmark` and
`check-provenance.mjs` was already sitting on that row. Both are wired in now, and all three appear
side by side:

```
🟢 build-benchmark/check-provenance  FRESH  • 13 found
🟢 build-benchmark/arm-permutation   FRESH  abstained:no-witness
🟢 build-benchmark/delivered-pdf     FRESH  abstained:no-witness
```

Legacy rows have no `check`, so they key on the bare skill name and do **not** merge into a new
check's row — another consequence of not reinterpreting them.

## How a skill is wired (all 22 paper skills)

Each `SKILL.md` carries exactly two blocks:

- **`## Run me`**, right after the title — the `announce.mjs` call, first thing. An advisory pass
  cannot be observed failing, because silence is both its error state and its normal state; so
  starting is an event and events get written down.
- **`## Record the verdict`**, the last step of the procedure — the `ledger.mjs record` call, in one
  shape across all 22 files:

  ```
  node .claude/skills/paper-pipeline/scripts/ledger.mjs record <skill> <paper-dir> FINDING <count> <report-path>
  node .claude/skills/paper-pipeline/scripts/ledger.mjs record <skill> <paper-dir> ABSTAINED <reason> "<one line>"
  ```

  Each block then says, in its own words, what a finding is for that skill and which abstentions it
  can honestly reach. `draft-paper` carries the one admission in the suite: it generates rather than
  judges, will abstain nearly always, and says so — `skill-checks.mjs` asserts that paragraph is
  still there, because an explained limitation deleted becomes an unexplained never-finding check.

An announce row with no terminal row after it is itself a finding: the skill began and never
finished. Neither row present means it did not run, whatever any status file claims.

## Two things to know before you trust the table

- `EXPECTED_GATES` in `status.mjs` is the table. A check that records rows and is absent there
  writes rows nobody sees. Add a new skill AND its mechanical checks; `unlistedGates()` catches the
  omission after the fact, and `pipeline-corpus.harness.mjs` catches it before.
- `ledger.test.mjs` and every harness redirect `PIPELINE_LEDGER` to a temp file **before**
  importing `ledger.mjs`. Save-and-restore is not isolation; it lost that race on its first day.

## Harnesses (2026-08-07)

Property 3 above says a gate that has never returned a negative verdict is _suspect_. These turn
that suspicion into evidence or into a bug report: each one plants the exact defect a gate claims to
catch, asserts the gate fires, and asserts it stays **quiet on the clean case** — because a checker
that fires on correct text is muted within a day, which is worse than one that misses.

| harness                                        | gate under test                                                                     | what is planted                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------------------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `gates.harness.mjs`                            | `structure.mjs`, `prose-lint.mjs`, `ledger.mjs`, `status.mjs`, `run-mechanical.mjs` | unjustified section · a sentence carrying five independent claims · an answer about a rewritten paper · a gate that records nothing · **`PASS` reaching the ledger** · an abstention with a free-text reason · a finding with no evidence, dead evidence, or evidence whose count disagrees · **a sibling check's clean run erasing a finding** · two checks sharing one row key · a status view that prints ✅ or the word PASS · a retired-vocabulary row read as a current answer · **a CLI flag that is advertised and unparsed**                                                                                               |
| `population-map.harness.mjs`                   | `population-map.mjs`                                                                | owns its self-test (13 cases, run as a **subprocess**) + the CLI wiring the self-test never touches                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `provenance.harness.mjs`                       | `check-provenance.mjs`                                                              | a number from the `annotated` arm cited as "exactly as committed" · a bolded figure with no provenance row                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `artifact-coverage.harness.mjs`                | `artifact-coverage.mjs`                                                             | a bundle with no data for the section the abstract leads with · an index promising a path that is not shipped · and, in the REVERSE direction, **a result that exists on disk and that neither the paper nor the released index mentions** — plus the ignore set that decides which of those count: an allowance applied, an allowance printed with its reason, a `ships-as:` claim whose bundle path has gone, a row naming a directory that no longer exists, and **the whole ignore ledger printed on a run with no findings**                                                                                                   |
| `generated-code.harness.mjs`                   | `generated-code.mjs`                                                                | an analysis script that draws randomness and never seeds it · one that hard-codes an absolute path · one that reads and then overwrites its own input (literal and `argv` forms). Plus every quiet case, which is where this checker lives or dies: a seed threaded through `--seed`, a lowercase Express route, a third party's relative path, a read-here-write-there script, a variable name reused across two loops — and the released bundle, which `check-anon.sh` cat. 5 owns and this one must not enter                                                                                                                    |
| `pipeline-check.harness.mjs`                   | `pipeline-check.mjs`                                                                | six defects, **one at a time**, asserting the exact finding set. 🔴 Since 2026-08-26 here only checks whose input is OUTSIDE the file (git · clock · `reviews/` · `process.env`); sixteen others moved to `eslint-rules/pipeline-status.mjs` and are checked by `eslint-rules/pipeline-status.harness.mjs`                                                                                                                                                                                                                                                                                                                          |
| `paper-lint.harness.mjs`                       | `paper-lint.mjs`                                                                    | text moving under an unchanged scorecard · appendix outweighing the body · a shaved passage                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `round-diff.harness.mjs`                       | `paper-pipeline/scripts/round-diff.mjs`                                             | a section changed outside the round's declaration (and one added, and one **removed**) · a cite and a bare bibliography entry arriving mid-round · a numeric literal arriving mid-round, with restating an existing one asserted FREE · the body over its budget · **three rounds compounding past the sum of their budgets while the open round is inside its own** · hedge density rising · a `touches:` list covering the paper · a base that does not resolve · edits with every round closed. Plus the clean case: a legal round must produce total silence                                                                    |
| `delivered-pdf.harness.mjs`                    | `repro/delivered_pdf.py`                                                            | a quantity deleted from the built page · **a superscript minus lost in typesetting, compiled and read back** · a value moved away from its claim · an occurrence whose prose the extractor lost · a missing, unreadable and stale PDF · and all six normalisation rules, one assertion each                                                                                                                                                                                                                                                                                                                                         |
| `bound-numbers.harness.mjs`                    | `repro/paper_numbers.py`, `md2submission.py`, `latex-build.sh`                      | a digit in a `\newcommand` name · two registry keys mangling to one macro · an unescaped `%` in the generated values · a converter handling the digits again · a missing `\input` · an unbound name that must stop the build with **no PDF** · a failing pass that leaves its PDF on disk. Plus the CONTROL: a hand-typed literal still compiles, **asserted** so nobody writes that this makes a wrong number unrepresentable                                                                                                                                                                                                      |
| `textidote.harness.mjs`                        | `repro/textidote_check.py` (TeXtidote v0.9)                                         | a misspelling planted into real prose from the paper, live through the pinned jar · a coinage with a committed row staying silent in the same run · the flagged span truncated by one letter · the caret row leaking into the message · each of the three exclusions (`{{macro}}`, `` `code` ``, the reference list) · **an appendix AFTER `## References` still being judged** · a key that stops discriminating by rule, by word, or by case · a tolerated row moved 40 lines down and indented · the tolerated set, its reasons and the stale rows going unprinted · a missing jar or JRE answering with an empty findings array |
| `uncited-refs.harness.mjs`                     | `repro/uncited_refs.py` (`checkcites`)                                              | a bibliography entry no `\cite` points at, planted into a copy of the real build · a finding that names only the bibtex key and not the work · **`checkcites` absent, asserted against the same fixture that DOES report a finding when it is present** · a paper that was never built · a bibliography that could not be read becoming a finding named after the missing file                                                                                                                                                                                                                                                      |
| `<skill>/<skill>.harness.mjs` (×22, colocated) | **one SKILL.md each**, via `skill-checks.mjs`                                       | frontmatter that is not YAML · a `name:` disagreeing with its directory · a wired block naming a script that is not there · a block filing under a **sibling's** name · a Bash command its own `allowed-tools` forbids · a ledger-only skill regressed to bare `Bash` · **a block that documents no FINDING** · a block still instructing a retired constructor · an `ABSTAINED` with no named reason                                                                                                                                                                                                                               |
| `pipeline-corpus.harness.mjs`                  | the **SET** of skills                                                               | a gate row pointing at a directory that does not exist · a duplicate key in `EXPECTED_GATES` · a wired skill absent from the gate table · an exclusion that has rotted (skill gone, or no longer wired)                                                                                                                                                                                                                                                                                                                                                                                                                             |

These two are the only ones aimed at the **skills** rather than the scripts they call, which
is what `vigiles audit`'s `Tested` metric actually counts — "34 surfaces with no vigiles test/eval"
was never about `structure.mjs`. It also fails differently: a script with a bad path crashes, a
**skill** with a bad path is read by a model that quietly does something adjacent and reports success.
Its non-vacuity proof is `lib/skill-checks.test.mjs` — a copy of the shipped skills with defects
planted on the copy, checked against both `checkSkill` (pipeline skills) and `checkProseSkill`
(skills without the pipeline). Run it with `npx vitest run lib/skill-checks.test.mjs`; CI runs it
too.

> **2026-09-26 — hand-written per-checker mutation batteries are REMOVED (#52).** Do not write a
> `*.mutations.mjs`; see a new test fail before the fix and assert whole values instead (the
> repository's CLAUDE.md, § Testing).

Five rules, each learned by getting it wrong here:

1. **Assertions run at module top level.** `vigiles test` imports the file and treats "did not
   throw" as a pass. An exported `tests` object runs nothing and prints ✓ — verified on a file whose
   only assertion was `assert.equal(1, 2)`.
2. **Fixtures live in a temp dir, and the ledger is redirected** with `PIPELINE_LEDGER` _before_
   importing `ledger.mjs`. Save-and-restore is not isolation; it loses the race on the first crash.
3. **Run them by explicit path.** `npx vigiles test` with no arguments finds **nothing** here: its
   glob does not descend into dot-directories. Every harness is therefore named explicitly in
   the `hooks` job of `.github/workflows/ci.yml` — one not named there does not run, and its
   silence looks exactly like having nothing to say. Add the line in the same commit as the file.
4. **Prove non-vacuity by SEEING IT FAIL, never by reading.** An assertion you cannot see fail is
   an assertion you have not tested. `skill-checks.mjs` (then `skills.harness.mjs`) shipped its first draft with a record-block
   slicer matching `^#` against an already-sliced string; `^` hit offset 0, every block came back as
   the single character `#`, one assertion then fired on all 21 skills while its neighbour checked
   nothing at all. Both were invisible on inspection and obvious on the first planted defect.
5. **A red harness is a finding, not a broken test — and the finding is allowed to close.**
   **RED now (2026-08-07):** `skill-checks.mjs` (then `skills.harness.mjs`), on four skills (`tighten-paper`,
   `analyze-sibling-paper`, `study-accepted-papers`, `find-venue`) whose frontmatter is not valid
   YAML — an unquoted `description:` containing `": "`. Any consumer with a real YAML parser reads
   **no** `allowed-tools` on those four, so they inherit every tool: the exact state the 2026-08-03
   audit existed to end. Fix: quote the four values.
   **CLOSED:** `gates.harness.mjs` was red on `structure.mjs` being silent in `--flags-only` about a
   body section with no `carries:` note. `structure.mjs` now pushes that finding and the harness is
   green — verified by running it, not by reading it. This paragraph asserted the opposite for a
   while after the fix landed, which is the same lie the hand-maintained status table used to tell:
   **when this README and a harness disagree, run the harness and believe it.**
   The mechanics either way: a failing assertion is deferred to the end of its file so the rest of the
   suite still runs, and every step in the CI job carries `if: always()` so a known-red step cannot
   mask the harnesses after it.
