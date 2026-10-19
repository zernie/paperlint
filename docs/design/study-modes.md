# Study modes: decide first, or exploratory — design

## Why

A study's outcomes are computed by an automated runner in the same workspace where the people
deciding its inputs work: which runs count, which units are excluded, whether a veto applies, whether
the drawn sample is approved. If those decisions can be made — or changed — after an outcome has been
seen, the decision can follow the result, and nothing in the repository says which came first.

What is needed:

1. every measurement says how its outcomes are kept from the decisions on its inputs, and none can
   say nothing;
2. the default needs no key and no outside service: the decision is recorded first, the run starts
   after, and anyone with the repository can re-check the order;
3. a study that cannot work that way is declared exploratory, with its reason, and reported as such;
4. the paper's Methods and its reviewers read each study's mode, decision commit and first output
   from one generated place, not from prose someone keeps in sync by hand.

## What is decided

### 1. One mode per measurement, in its plan

A study's `plan.json` holds one `mode`, a union on its `kind` (`src/domain/study-mode.ts`):

```json
{ "mode": { "kind": "decide_before_run",
            "outputs": ["out/**", "RESULTS.md"],
            "decision": { "file": "repro/P1-S03-x/decision.md", "note": "exclusions and veto" } } }

{ "mode": { "kind": "exploratory", "reason": "a first look at the logs, to find the question" } }
```

- **Exactly one, by construction.** The modes are one discriminated union, each variant closed: a
  second mode's key in the same object is an unknown key, and an unknown `kind` is refused. This is
  the parser's (`src/adapters/study-registry/`), not a later check.
- **None is not ready.** The parser is told the study's `kind` (from its row). A `measurement`'s plan
  without a mode is a **draft** naming `mode` among its empty texts, like an empty `question`: legal
  while the study is `designing`, reported by `repro/study-registered` (`bad-plan`, `unfilled`) once
  it runs, and a parse error when the author's check is already on it (the author approved an
  incomplete plan). A spike, a tool, a data set, an artifact or a salvage may omit it.
- **The default is written for you.** `paperlint studies new` writes a measurement's plan with
  `decide_before_run`, its decision file named (`repro/<folder>/decision.md`), its outputs and note
  left to fill — a draft until they are. The decision file itself is NOT created: an empty
  placeholder that got committed would open the gate on nothing.
- **Paths.** `outputs` are globs relative to the study's folder, inside it, never the study's
  `README.md`. A decision `file` is relative to the **paper's** folder, so it may live beside the
  study or anywhere in the paper (`research/decisions.md`); it may not leave the paper, and it is a
  file's path — names joined by `/`, none empty, `.` or `..` — so `.` (the paper itself) or a path
  ending in `/` cannot be written. A name that is a directory on disk is the gate's to refuse and the
  rule's to report (`decision-not-file`): git answers for a directory with the commits of anything
  under it. Whether a
  decision inside the study's folder is matched by an output glob needs the folder, which the plan
  does not hold: the rule reports it (`decision-is-output`) and the gate refuses it.
- **Empty texts of a mode** — no outputs yet, an empty decision file or note, an empty reason — are a
  draft's empty texts, named field by field (`mode.outputs`, `mode.decision.file`, …).

### 2. `paperlint studies gate <paper-dir> <id>`

Exit 0 only if the decision file exists and is committed as it stands (git's last commit for it, and
nothing changed since), printing the commit and its date; exit 1 saying why otherwise (not
committed, changed since its commit, committed and since deleted — not in HEAD, though `git log -1`
names the deleting commit and the tree is clean — git unable to answer, no decision file named, a
decision that is a directory, a decision its own outputs match). A runner calls it first:

```sh
npx paperlint studies gate papers/my-paper P1-S03 && ./run.sh
```

For an exploratory study it exits 0 and says it has no gate. A study that declares no mode, whose
plan is still a draft, or whose id two rows of the registry share (the gate answers for exactly one
study), is refused.

### 3. `repro/outputs-before-decision` — the proof of order a reviewer can re-run

An error, reported on `PIPELINE-STATUS.md`. For each decide-first study: every output whose first
commit is not a strict descendant of the decision file's first commit (earlier, on another line of
history, or in the same commit) is a finding; deleted outputs count. An output in the tree or in history while the
decision was never committed is a finding, and so is a decision committed and since deleted
(`decision-deleted`): it is not in HEAD, so no order is judged against it. A shallow clone, and a
history git cannot read, are
findings that say so — never a pass. The study's folder is walked without following a symbolic link
(`ListEntries`, `src/ports/list-entries.ts`): a link is one entry, as git stores it, so a link to the
folder itself cannot loop the walk and one outside brings no foreign file into the study.

**Why a lint rule may ask git here.** Rules in `eslint-rules/` may not run git
(`eslint.config.mjs`, `GIT_IN_A_RULE`): a pinned sha is deleted by a squash or a gc, and a shallow CI
checkout has none. This rule pins no sha; it asks the history the checkout has for an order. A squash
merge keeps that order when the decision was merged before the run — which is the decide-first
workflow — and a shallow checkout is named by the rule (`fetch-depth: 0`).

### 4. The index carries each study's mode

`repro/README.md`'s study index (`paperlint studies index`, docs/design/study-registry.md) has three
columns for this (`src/domain/index-columns.ts`):

| column         | cell                                                                                                                         |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `mode`         | `decide_before_run`, `exploratory: <reason>`, or `—` for a study whose plan has none                                         |
| `decision`     | the decision file's first commit (12 characters) and its date (`, deleted since` when it is not in HEAD), or `not committed` |
| `first output` | the first commit of the oldest output and its date, or `none`                                                                |

A sample row:

```markdown
| id     | title   | status | result   | in paper | mode              | decision                | first output            | folder                             |
| ------ | ------- | ------ | -------- | -------- | ----------------- | ----------------------- | ----------------------- | ---------------------------------- |
| P1-S01 | Outcome | done   | 41 of 60 | yes      | decide_before_run | 3f2a9c1d7e40 2026-10-14 | 8b51e0aa42c9 2026-10-15 | [P1-S01-outcome/](P1-S01-outcome/) |
```

- **The mode is compared, the commits are not.** The mode comes from the plan, which is in the tree,
  so `repro/study-registered` reports an index whose mode column is not the plan's. The two commits
  are what git's history said when `studies index` last ran: a squash merge or a rebase gives the
  same files new commits, and a shallow CI clone has none to read, so the lint never compares those
  two columns — comparing them would turn every squash merge red. `studies index` rewrites the README
  whenever any column moved, and in a shallow clone writes `unknown (shallow clone)`. The order
  itself is `repro/outputs-before-decision`'s to judge, not the table's.
- **The skills read the table.** `draft-paper` writes the Methods sentence from it (decided before
  the run, the decision's commit and date; exploratory studies labelled with their reason);
  `harden-paper` and `pc-panel-review` check that every confirmatory claim rests on a
  `decide_before_run` study whose decision commit precedes its first output, and flag a
  "pre-registered" or "decided before" claim the table does not support; `tighten-paper` keeps that
  sentence; `osf-artifact-upload` and `camera-ready` ship each plan, its decision file and the index,
  with the whole history. Each regenerates the index first, so the commits are this checkout's.

### 5. Reads stay inside the paper

**What these checks guard against.** paperlint's checks guard against accidents and honest
mistakes — a run started before the decision was committed, a decision edited or deleted afterwards,
a path typed wrong — not against an author who controls the repository's history and sets out to
forge it. The path rules below exist to keep every read inside the paper, so a mistyped row cannot
make a command or a rule read, judge or write files that belong to nothing in it.

Every command and rule that reads a study's folder — `studies gate`, `studies index` and `new`,
`repro/outputs-before-decision`, and `repro/study-registered`'s reads of plans and result files —
goes through one reader, `studyFolder` (`src/study-folder.ts`), built once per run from the paper's
folder over `ListEntries`, which does not follow links. It decides first whether a row's folder may
be entered at all (`refusal`): its `folder` is one folder directly inside `repro/` (`isFolderName`:
not empty, not `.` or `..`, no separator or NUL) and not a symbolic link. Such a row is never read
through: `studies index` and `new` refuse the registry, the gate refuses the study, the order rule
treats it as no study, and `repro/study-registered` reads its plan and results as missing.

A plan's path is held inside its folder by the registry rule's own `isInside`, the same on every
platform (a backslash is refused outright). The reader walks the path one component at a time, and a
plan or a result file whose path passes through a symbolic link — the file itself, or a directory
above it — is never read. The gate refuses it naming the link, the order rule treats the study as
declaring no mode, and `repro/study-registered` reports it (`bad-plan`, `result-file`) with the link.

The decision file is held inside the paper by the schema (`staysInside`) and is judged by the same
walk (`decisionEntry`, `entryAt`): every component of its path must be a real directory and the last
a regular file. A directory or a symbolic link as the file itself is refused by the gate and reported
by the rule (`decision-not-file`); a symbolic link above the file is refused naming that link
(`decision-linked`).

The plan reads, the result-file existence checks and the decision's path check take a `StudyFolder`
and not `Files`, so a read that follows a link is not what those readers are handed. A study's
outputs are listed through it too (`StudyFolder.list`).

Only a **ready** plan's mode decides anything: the gate refuses a draft, naming its empty fields, and
the order rule judges no draft — a draft may name no outputs, or an empty decision file.

### 6. Legacy plans

A plan still named `prereg.json` is parsed by its loose legacy schema, which never asks for a mode,
and `repro/study-plan-name` keeps warning that it moves to `plan.json` — where the strict parser asks
for one. So an old paper keeps linting as before until it renames the file. A `plan.json` written by
the release before modes existed, for a measurement, reads as a draft whose empty text is `mode`:
silent while the study is `designing`, reported once it runs, and an unreadable plan when the
author's check is already on it (the message names `mode`). Adding one line — usually the
decide-first mode — is the migration. An index generated before the mode columns existed is out of
sync until `paperlint studies index` regenerates it.

### 7. Why: confirmatory vs exploratory, and venues that review the plan first

Read for this note (2026-10-16):

- Nosek, Ebersole, DeHaven, Mellor, "The preregistration revolution", _PNAS_ 115(11):2600–2606,
  2018 (metadata and abstract from Crossref, doi:10.1073/pnas.1708274114). The abstract, verbatim:

  > Progress in science relies in part on generating hypotheses with existing observations and
  > testing hypotheses with new observations. This distinction between postdiction and prediction
  > is appreciated conceptually but is not respected in practice. Mistaking generation of
  > postdictions with testing of predictions reduces the credibility of research findings. […] An
  > effective solution is to define the research questions and analysis plan before observing the
  > research outcomes—a process called preregistration. Preregistration distinguishes analyses and
  > outcomes that result from predictions from those that result from postdictions.

  This is the distinction the modes encode: decided first is prediction; exploratory is postdiction,
  legitimate when it is labelled.

- The MSR (Mining Software Repositories) Registered Reports track, 2020 edition
  (https://2020.msrconf.org/track/msr-2020-Registered-Reports; the 2021, 2025 and 2026 editions have a
  track page at the same address, the 2019 site has none there). Quoted from the 2020 page:

  > Methods and proposed analyses are pre-registered and reviewed prior to research being conducted.

  > (MSR 2020) Phase 1: Introduction, Methods (including proposed analyses), and Pilot Data (where
  > applicable).

  > (EMSE) Phase 2: full study, after data collection and analysis.

  > Additional exploratory analyses in Phase 2 may be conducted, if they are justified.

  > Any deviation from the protocol must be justified and logged in detail to ensure replicability.

  A venue of this field already reviews the plan before the data, and accepts exploratory analyses
  beside it only when they are justified. The modes, the order rule and the index give a paper the
  same evidence in its own repository: what was fixed before the run, with its commit, and what was
  exploratory, with its reason.

## Alternatives considered

- **Encrypting the outputs until the decision (age, to a key the author holds): rejected.** It needs
  an external binary that `paperlint toolchain` does not install, and a key whose custody has no good
  home: a session in the cloud has nowhere private to keep the identity, and a key in a CI secret is
  readable by any workflow that can be edited. Decide first already proves the order from git with no
  key at all, so encryption would add a dependency and a secret to guard to buy what the history
  shows. Blind analysis in physics (Klein & Roodman, _Annu. Rev. Nucl. Part. Sci._ 55, 2005) and
  MacCoun & Perlmutter, "Hide results to seek the truth" (_Nature_ 526, 2015) — both cited from
  memory, not re-read for this note — are where the idea comes from; what is kept is that the
  decision is fixed and recorded before the outcome is seen.
- **Paragraph links (`% study: <id>` comments in `paper.tex`) checked by lint rules: rejected.** Such
  rules check only the paragraphs that carry a convention authors do not write, so an unlinked
  overclaim passes silently. The review skills check the Methods sentence and every confirmatory
  claim against the index instead, which covers the whole text.
- **A separate `studies methods` command printing the modes and commits: rejected.** The same facts
  are three columns of the `studies index` table the registry already generates; a second command
  would be a second rendering of one set of facts.
- **Comparing the decision and first-output columns in the lint: rejected.** A squash merge renames
  the commits, so the index would go stale on every merge, and a shallow CI clone cannot read them;
  the order rule judges the history directly instead (§4).
- **An outside pre-registration (OSF, AsPredicted) as the record: not required.** A timestamped
  record before the outcome is what they give; here the repository's history is that record,
  re-checkable by anyone who clones it. A paper may still register outside and cite it.

## Where each part lives

| part                                                         | file                                  | layer   |
| ------------------------------------------------------------ | ------------------------------------- | ------- |
| the modes, what is an output, which decision a mode waits on | `src/domain/study-mode.ts`            | domain  |
| the order judge and its messages                             | `src/domain/decide-first.ts`          | domain  |
| the index's mode columns and the history they show           | `src/domain/index-columns.ts`         | domain  |
| the index, which columns the lint compares, `isFolderName`   | `src/domain/study-registry.ts`        | domain  |
| the schema of `mode`; readiness by kind                      | `src/adapters/study-registry/`        | adapter |
| git: committed state, first commits, ancestry, shallow       | `src/adapters/git/`                   | adapter |
| what the app asks of git                                     | `src/ports/git-history.ts`            | port    |
| a directory's entries, links not followed                    | `src/ports/list-entries.ts`           | port    |
| the studies with a mode, and how a decision's path stands    | `src/study-modes.ts`                  | app     |
| what the study readers need of a study's folder              | `src/ports/study-folder.ts`           | port    |
| what the study readers are handed                            | `src/ports/study-deps.ts`             | port    |
| the one reader of a study's folder, links not followed       | `src/study-folder.ts`                 | app     |
| the order rule                                               | `src/outputs-before-decision-rule.ts` | app     |
| the plans and histories `studies index` and `new` write from | `src/study-index-input.ts`            | app     |
| `gate`; `new` and `index`                                    | `src/study-gate.ts`, `src/studies.ts` | app     |
| wiring: git with PATH and HOME, the clock                    | `src/cli.ts`                          | root    |

## What it does not check

- What a decision says. The gate is that it is committed, not its content.
- A decision amended after the outputs: `repro/outputs-before-decision` orders FIRST commits; later
  edits of the decision are in its history but not reported.
- That nobody ran a decide-first study before its decision and kept the outputs out of git. The rule
  keeps early outputs out of the repository's history, not out of a person's hands.
- Files outside the study's folder as outputs: outputs are relative to it by construction.
- Whether the paper's text matches the index: that is the review skills' job, not a lint rule's.
