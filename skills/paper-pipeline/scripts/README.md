# paper-pipeline/scripts — did the check run, against what, and what did it say

Four files record paper-pipeline skill runs and compute the status view that replaced the
hand-maintained `PIPELINE-STATUS.md` table. Alongside them live the harnesses that plant a defect in
each mechanical gate and check the gate says no (see **Harnesses**, added 2026-08-07).

> **📍 Переехало сюда 2026-08-15 из `.claude/pipeline/`.** Каталог верхнего уровня был расселён:
> всё, у чего есть один владелец, уехало к нему. Здесь это семейство «пайплайн статьи» —
> `ledger` · `announce` · `status` · `run-mechanical` плюс девять чекеров, которые уже лежали
> тут, и **их тесты, которые до этого дня лежали в другом каталоге верхнего уровня**. То есть
> колокации не было ровно там, где мы её проповедуем: чекер в скилле, его харнесс — снаружи.
>
> Что осталось без владельца (общая библиотека 24 скиллов, `markdown.mjs`, движок мутаций) —
> в [`.claude/lib/`](../../../lib/README.md), там же разбор четырёх форм ссылки, из которых
> поиск по пути видит только одну.

| file | what it is for |
|---|---|
| `ledger.mjs` | The append-only run ledger. `record()` writes one JSON line carrying a FINDING or an ABSTENTION **plus a hash of the paper and a hash of the skill's own source**. `status()` derives FRESH / STALE-PAPER / STALE-SKILL / NEVER-RUN from those hashes against the bytes on disk. Everything else is derived from this file. |
| `announce.mjs` | `node .claude/skills/paper-pipeline/scripts/announce.mjs <skill> <paper-dir>` — prints a two-line banner to stderr and writes an `ABSTAINED started` row. Called by a skill as its first step. |
| `status.mjs` | The computed status view. No field here can be set by a human. |
| `runs.jsonl` | The ledger itself. Append-only; do not edit by hand. |

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

Each is a stored value meaning *nothing was wrong*, written by a process with no evidence for it and
thereafter indistinguishable from one that had some. So the value is gone. **A run records exactly
two things:**

| constructor | must carry | means |
|---|---|---|
| `FINDING` | a `<count> ≥ 1` **and a report path that exists** (`--blocking` if it stops the pass) | something is wrong, and here is where to read about it |
| `ABSTAINED` | a `<reason>` from a closed set | no judgement was produced, and here is why |

Reasons: `started` · `no-witness` · `input-missing` · `blocked` · `crashed`.

**"Nothing was wrong" is not a value that can be written down.** It is the ABSENCE of findings,
derived at read time by whoever is asking — who then owns the inference. A completed clean run
records `ABSTAINED no-witness`, which is not a pass with better manners: it says the check ran and
has **no witness** for the negative answer.

### Prior art, both halves of it

- **SARIF** (OASIS Standard 2.1.0, §3.27.9) defines `kind: "pass"` verbatim as *"The rule … was
  evaluated, and no problem was found"*, and the only REQUIRED property of a `result` is `message` —
  `locations` is optional, so a conformant acquittal can name no place, no span and no artifact.
  🔴 **Do not write that industry lacks abstention.** `kind: "open"` sits in the same paragraph
  (*"insufficient information to decide whether a problem exists"*) and its NOTE 1 draws exactly our
  trichotomy. Our position is **"delete pass"**, never "add abstain". Established `[A]` against the
  OASIS text and its JSON schema in
  `the author's private research notes` §5.
- **Certifying algorithms** — McConnell, Mehlhorn, Näher & Schweitzer, *Computer Science Review*
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
  (`sweep-design-space`, `findings: 8`) and that count meant *survivors*, not defects — it is not
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
- `ledger.selftest.mjs` and every harness redirect `PIPELINE_LEDGER` to a temp file **before**
  importing `ledger.mjs`. Save-and-restore is not isolation; it lost that race on its first day.

## Harnesses (2026-08-07)

Property 3 above says a gate that has never returned a negative verdict is *suspect*. These turn
that suspicion into evidence or into a bug report: each one plants the exact defect a gate claims to
catch, asserts the gate fires, and asserts it stays **quiet on the clean case** — because a checker
that fires on correct text is muted within a day, which is worse than one that misses.

| harness | gate under test | what is planted |
|---|---|---|
| `gates.harness.mjs` | `structure.mjs`, `prose-lint.mjs`, `ledger.mjs`, `status.mjs`, `run-mechanical.mjs` | unjustified section · a sentence carrying five independent claims · an answer about a rewritten paper · a gate that records nothing · **`PASS` reaching the ledger** · an abstention with a free-text reason · a finding with no evidence, dead evidence, or evidence whose count disagrees · **a sibling check's clean run erasing a finding** · two checks sharing one row key · a status view that prints ✅ or the word PASS · a retired-vocabulary row read as a current answer · **a CLI flag that is advertised and unparsed** |
| `population-map.harness.mjs` | `population-map.mjs` | owns its self-test (13 cases, run as a **subprocess**) + the CLI wiring the self-test never touches |
| `provenance.harness.mjs` | `check-provenance.mjs` | a number from the `annotated` arm cited as "exactly as committed" · a bolded figure with no provenance row |
| `artifact-coverage.harness.mjs` | `artifact-coverage.mjs` | a bundle with no data for the section the abstract leads with · an index promising a path that is not shipped · and, in the REVERSE direction, **a result that exists on disk and that neither the paper nor the released index mentions** — plus the ignore set that decides which of those count: an allowance applied, an allowance printed with its reason, a `ships-as:` claim whose bundle path has gone, a row naming a directory that no longer exists, and **the whole ignore ledger printed on a run with no findings** |
| `generated-code.harness.mjs` | `generated-code.mjs` | an analysis script that draws randomness and never seeds it · one that hard-codes an absolute path · one that reads and then overwrites its own input (literal and `argv` forms). Plus every quiet case, which is where this checker lives or dies: a seed threaded through `--seed`, a lowercase Express route, a third party's relative path, a read-here-write-there script, a variable name reused across two loops — and the released bundle, which `check-anon.sh` cat. 5 owns and this one must not enter |
| `pipeline-check.harness.mjs` | `pipeline-check.mjs` | six defects, **one at a time**, asserting the exact finding set. 🔴 С 2026-08-26 здесь только проверки, чей вход ВНЕ файла (git · часы · `reviews/` · `process.env`); шестнадцать остальных уехали в `eslint-rules/pipeline-status.mjs` и проверяются `eslint-rules/pipeline-status.harness.mjs` |
| `paper-lint.harness.mjs` | `paper-lint.mjs` | text moving under an unchanged scorecard · appendix outweighing the body · a shaved passage |
| `round-diff.harness.mjs` | `paper-pipeline/scripts/round-diff.mjs` | a section changed outside the round's declaration (and one added, and one **removed**) · a cite and a bare bibliography entry arriving mid-round · a numeric literal arriving mid-round, with restating an existing one asserted FREE · the body over its budget · **three rounds compounding past the sum of their budgets while the open round is inside its own** · hedge density rising · a `touches:` list covering the paper · a base that does not resolve · edits with every round closed. Plus the clean case: a legal round must produce total silence |
| `delivered-pdf.harness.mjs` | `repro/delivered_pdf.py` | a quantity deleted from the built page · **a superscript minus lost in typesetting, compiled and read back** · a value moved away from its claim · an occurrence whose prose the extractor lost · a missing, unreadable and stale PDF · and all six normalisation rules, one assertion each |
| `bound-numbers.harness.mjs` | `repro/paper_numbers.py`, `md2submission.py`, `latex-build.sh` | a digit in a `\newcommand` name · two registry keys mangling to one macro · an unescaped `%` in the generated values · a converter handling the digits again · a missing `\input` · an unbound name that must stop the build with **no PDF** · a failing pass that leaves its PDF on disk. Plus the CONTROL: a hand-typed literal still compiles, **asserted** so nobody writes that this makes a wrong number unrepresentable |
| `textidote.harness.mjs` | `repro/textidote_check.py` (TeXtidote v0.9) | a misspelling planted into real prose from the paper, live through the pinned jar · a coinage with a committed row staying silent in the same run · the flagged span truncated by one letter · the caret row leaking into the message · each of the three exclusions (`{{macro}}`, `` `code` ``, the reference list) · **an appendix AFTER `## References` still being judged** · a key that stops discriminating by rule, by word, or by case · a tolerated row moved 40 lines down and indented · the tolerated set, its reasons and the stale rows going unprinted · a missing jar or JRE answering with an empty findings array |
| `uncited-refs.harness.mjs` | `repro/uncited_refs.py` (`checkcites`) | a bibliography entry no `\cite` points at, planted into a copy of the real build · a finding that names only the bibtex key and not the work · **`checkcites` absent, asserted against the same fixture that DOES report a finding when it is present** · a paper that was never built · a bibliography that could not be read becoming a finding named after the missing file |
| `<skill>/<skill>.harness.mjs` (×22, colocated) | **one SKILL.md each**, via `skill-checks.mjs` | frontmatter that is not YAML · a `name:` disagreeing with its directory · a wired block naming a script that is not there · a block filing under a **sibling's** name · a Bash command its own `allowed-tools` forbids · a ledger-only skill regressed to bare `Bash` · **a block that documents no FINDING** · a block still instructing a retired constructor · an `ABSTAINED` with no named reason |
| `pipeline-corpus.harness.mjs` | the **SET** of skills | a gate row pointing at a directory that does not exist · a duplicate key in `EXPECTED_GATES` · a wired skill absent from the gate table · an exclusion that has rotted (skill gone, or no longer wired) |

These two are the only ones aimed at the **skills** rather than the scripts they call, which
is what `vigiles audit`'s `Tested` metric actually counts — "34 surfaces with no vigiles test/eval"
was never about `structure.mjs`. It also fails differently: a script with a bad path crashes, a
**skill** with a bad path is read by a model that quietly does something adjacent and reports success.
Its non-vacuity proof is a separate file, `skills.mutations.mjs` — 21 planted defects, one per
assertion class, each on a throwaway copy of `.claude/`, plus a control asserting the clean corpus
produces *only* the four known-red YAML findings so no case can pass on noise. Run it by hand after
touching the harness (`node .claude/skills/paper-pipeline/scripts/skills.mutations.mjs`, ~3 s); CI runs it too.

Nine harnesses now carry a mutations file of their own — `delivered-pdf.mutations.mjs` (25 rows), `bound-numbers.mutations.mjs` (12 rows),
`round-diff.mutations.mjs` (28 rows), `ledger.mutations.mjs` (28 rows, covering the 2026-08-10
refactor across both `gates.harness.mjs` and `skill-checks.mjs`), `artifact-coverage.mutations.mjs`
(22 rows), `generated-code.mutations.mjs` (22 rows), `textidote.mutations.mjs` (20 rows) and
`uncited-refs.mutations.mjs` (8 rows). They are run by
hand, not in CI, because each one rewrites a source file dozens of times and takes minutes.

> **2026-08-26 — `verify-refs.mjs` уехал в движок и удалён отсюда** (вместе со своими харнессом и
> мутациями). Замер библиографии теперь `extract-ref-facts.mjs` в этой же папке, суждение — двенадцать
> правил `refs/*` в `eslint-rules/ref-facts.mjs`, мутации — `eslint-rules/ref-facts.mutations.mjs`
> (21 строка). Разбор — `the author's private research notes`.

**2026-08-14 — the engine was split out into `mutation-driver.mjs`; the tables stayed.** Each file
now holds only its cases (which defect, which bytes, which message — data about ITS checker) and
calls `runMutations()`. The reason is not line count: the ten copies of the driver had DRIFTED, and
the protections lived in whichever file happened to earn them. Counted against the committed
versions — the no-op guard (a replacement equal to the original leaves a green harness proving
nothing) was in **4 of 10**; the retry-once on a non-kill was in **1 of 10**; the strict rule that a
mutation must be killed by its OWN named assertion, not merely by *something* going red, was in
**1 of 10**. All ten now have all three. Two dead-path defects were closed on the way: six `ledger`
cases named `skills.harness.mjs`, deleted by the 2026-08-11 colocation, and `vigiles test` on a path
matching nothing exits 0 — so those six reported SURVIVED on every run since (they now go red at
their own assertions, verified by running them). And the end-of-run "restore failed" line had been
firing on `gates.harness.mjs`, which is red **on purpose** — the driver now baselines the harnesses
before touching anything, so that claim means what it says. `skills.mutations.mjs` deliberately
stays outside the engine: it mutates a COPY of `.claude/`, which is right for cases whose subject
IS the skill corpus, and it is the only one CI runs. **The
first run of a mutations file has never yet been clean, and that is the argument for writing one.**
`delivered-pdf`'s first run left five survivors and three wrong-case hits, and unpicking them found
three fixtures that tested nothing they claimed to (a window assertion satisfied by ordering, a
digit-width guard the counter never reached), two mutations that did not mutate, and **one dead rule
in the checker itself** — a table of sixteen Unicode space separators whose removal changed no
verdict, because Python's `\s` already matched every one of them. It was deleted rather than tested.

The two 2026-08-10 files kept the streak, and both findings were about the TEST rather than the
checker. `uncited-refs`'s heading-offset row SURVIVED, which said either that the offset was dead
code or that nothing watched it; reading `checkcites.lua` settled it — line 359 prints `=> <name>`
for an auxiliary file it could not resolve and then CARRIES ON into the report, and LaTeX writes
`\@input{sub.aux}` for every `\include`, so without the offset a partial build makes the wrapper
report `nope.aux` as an uncited bibliography entry. A fabricated finding, in a report somebody
would act on. `textidote`'s run reported `key/rule` as a WRONG-CASE kill three times running, and
each fix exposed the next layer: the key assertions sat after the delta block (so a key defect was
named by the delta's message), then a finding's rule was being read back out of the key (so a key
defect was named by the PARSER's message), then the two warnings in the fixture were in the order
that hides a collapsing key. **And the third fix silently deleted two assertion blocks** — a
scripted reorder dropped the delta and case blocks, the harness stayed green, and the only signal
was the next mutation run reporting `key/case` as SURVIVED. Deleting assertions can never turn a
harness red; nothing but a mutation run can see it.

The two 2026-08-10 arrivals kept the streak, and one of them found a defect in the CHECKER rather
than in a test. `generated-code`'s first run left **three survivors**:

- **A quiet case that was quiet for the wrong reason.** The fixture proving `--seed` in an argparse
  call is recognised drew with `rnd.sample(...)` off a local `random.Random(...)`, which the
  draw pattern does not recognise as a draw at all. So the case passed because *nothing was
  detected*, not because the seed was — neutering the seed rule changed no verdict. This is the
  same shape as `delivered-pdf`'s window assertion satisfied by ordering, and it is invisible on
  inspection: the fixture reads like a correct script, because it is one.
- **🔴 A dead flag in the checker.** The absolute-path rule is written case-sensitive on purpose —
  without it an Express route `/users/export` matches `/Users/`. But the matcher was built with
  `new RegExp(ABS.source + …, 'g')`, which takes the source and **throws the flags away**. Adding
  an `i` to the pattern therefore changed nothing, i.e. a mutation that did not mutate, i.e. the
  property the harness asserted lived nowhere the harness could reach. Fixed by threading
  `ABS.flags` through, which makes the flag load-bearing for the first time.
- **A mutation that could not change the answer.** Loosening the READ side of the in-place rule
  alone can never produce a finding, because the WRITE side still demands a quoted literal and no
  operand can pair. That row now spans both arrays, and says so.

`artifact-coverage`'s 22 rows all killed on the first run, but four killed at a DIFFERENT assertion
than named, and two of those were the expectation string matching a fragment of prose that appears
in more than one message (`"that is the"`) — the `no-witness` defect from `ledger.mutations.mjs`,
committed again three days later. Two rows legitimately kill at an earlier case that asserts the
same property, and each says which, so a future reader does not read it as off-target. One harness
case was also restructured because two rows were landing on a shared assertion: a case that tests
an EXCLUSION should not assert the finding count, or a mutation of the header lands there and hides
which property actually broke.

The reverse leg's own first run on the live paper found a third defect, this time in the port:
matching a directory name with `includes()` acquitted a fixture directory called `a-2026-01-01` on
the strength of the letter "a" appearing in the prose. Substring matching in a cherry-picking
detector fails in the dangerous direction — it invents evidence that a result was mentioned — and
it is now whole-token with a minimum length.

`round-diff`'s first run was six rows wrong out of twenty-six, and one of those was a hole in the
checker rather than in the test: disabling the number-prefix rule in `covers()` changed **no**
verdict, because a substring fallback had been silently doing its work — which also meant
`touches: ["2"]` covered "Section 12" and every heading containing a 2, so a one-character
declaration authorised most of the paper while `overbroad-scope` stayed quiet because the *list* was
short. Two more rows were the test's own fault in the two documented ways: a `find` string written
in its already-mutated form (a mutation that did not mutate), and a fixture that MOVED text between
body and appendix — which keeps the total constant and therefore cannot test the boundary at all.

`ledger.mutations.mjs` kept the streak: five survivors and two wrong-case kills on its first run,
and **every one was a defect in the assertion rather than in the checker.** Two matched a bare word
(`no-witness`, `input-missing`) that the CLI's usage block prints unconditionally, so the refusal
message could have said anything at all. The dead-report-path case asserted only a non-zero exit —
which the next line's `ENOENT` supplies once the check is deleted. The status view's reason
assertion matched the explanatory PARAGRAPH rather than the check's own row, so the reason could
have been stripped from every row and the test stayed green. And the legacy fixture recorded `PASS`
with `findings: 0`, which made "a retired acquittal carries nothing forward" true by accident —
real `PASS` rows carry counts (`sweep-design-space`, 8). One mutation also turned out to be
**inexpressible finely**: disabling only the no-report-path arm makes the next line `resolve()` a
null and throw, so the run goes red for a reason unrelated to the check. That row disables the whole
evidence contract instead and relies on assertion order, which is written down in the row's note.

The `--blocking` flag was found the same way and is worth naming separately, because it is not a
test defect: it shipped **documented in the usage text and in all 22 SKILL.md files while nothing in
the CLI parsed it**. Every skill instructing `--blocking` for its desk-reject case would have
recorded an ordinary advisory finding. That is the repository's oldest failure — a documented
mechanism nothing implements, the same shape as three hooks dead on arrival and a nudge dead for
twelve days — arriving *inside* the refactor written to end it. Block 14 of `gates.harness.mjs` now
asserts every advertised flag from outside the process, in both directions.

⚠️ A mutations file refuses to start on a dirty working tree, because it rewrites the source it is
proving. Commit first. (`ledger.mutations.mjs` touches `status.mjs` and `run-mechanical.mjs`, which
another session may be editing; running it against a copy of `.claude/` with `CLAUDE_PROJECT_DIR`
pointed at the copy works and is how it was last verified.)

Five rules, each learned by getting it wrong here:

1. **Assertions run at module top level.** `vigiles test` imports the file and treats "did not
   throw" as a pass. An exported `tests` object runs nothing and prints ✓ — verified on a file whose
   only assertion was `assert.equal(1, 2)`.
2. **Fixtures live in a temp dir, and the ledger is redirected** with `PIPELINE_LEDGER` *before*
   importing `ledger.mjs`. Save-and-restore is not isolation; it loses the race on the first crash.
3. **Run them by explicit path.** `npx vigiles test` with no arguments finds **nothing** here: its
   glob does not descend into dot-directories. Every harness is therefore named explicitly in
   `.github/workflows/paper-gates.yml` (`hooks` job) — one not named there does not run, and its
   silence looks exactly like having nothing to say. Add the line in the same commit as the file.
4. **Prove non-vacuity by MUTATION, never by reading.** An assertion you cannot see fail is an
   assertion you have not tested. `skill-checks.mjs` (then `skills.harness.mjs`) shipped its first draft with a record-block
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
