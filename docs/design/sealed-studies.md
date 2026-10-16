# Study modes: decide first, blind, exploratory — design

## Why

A study's outcomes are computed by an automated runner in the same workspace where the people
deciding its inputs work: which runs count, which units are excluded, whether a veto applies, whether
the drawn sample is approved. If those decisions can be made — or changed — after an outcome has been
seen, the decision can follow the result. Until now nothing in the repository recorded which came
first, and "blind" was an honour system: plaintext results sat in the tree.

What is needed:

1. every measurement says how its outcomes are kept from the decisions on its inputs, and none can
   say nothing;
2. the default needs no key: the decision is recorded first, the run starts after, and anyone can
   re-check the order;
3. when the outputs must exist before the decision, they are encrypted at rest from the moment they
   are written, anyone can seal, only a key holder can unseal, and only after the recorded decision;
4. after unsealing, anyone can verify the plaintext is the one sealed — no swap after the decision;
5. a study that is neither is declared exploratory, with its reason, and reported as such.

## What is decided

### 1. One mode per measurement, in its plan

A study's `plan.json` holds one `mode`, a union on its `kind` (`src/domain/study-mode.ts`):

```json
{ "mode": { "kind": "decide_before_run",
            "outputs": ["out/**", "RESULTS.md"],
            "decision": { "file": "repro/P1-S03-x/decision.md", "note": "exclusions and veto" } } }

{ "mode": { "kind": "blind",
            "outputs": ["out/**", "RESULTS.md"],
            "recipients": ["age1…"],
            "unseal_after": { "file": "research/exclusions.md", "note": "exclusions frozen" } } }

{ "mode": { "kind": "exploratory", "reason": "a first look at the logs, to find the question" } }
```

- **Exactly one, by construction.** The modes are one discriminated union, each variant closed: a
  second mode's key in the same object is an unknown key, an unknown `kind` is refused, and there is
  no separate `blind` or `exploratory` field that could sit beside another. This is the parser's
  (`src/adapters/study-registry/`), not a later check.
- **None is not ready.** The parser is told the study's `kind` (from its row). A `measurement`'s plan
  without a mode is a **draft** naming `mode` among its empty texts, like an empty `question`: legal
  while the study is `designing`, reported by `repro/study-registered` (`bad-plan`, `unfilled`) once
  it runs, and a parse error when the author's check is already on it (the author approved an
  incomplete plan). A spike, a tool, a data set, an artifact or a salvage may omit it.
- **The default is written for you.** `paperlint studies new` writes a measurement's plan with
  `decide_before_run`, its decision file named (`repro/<folder>/decision.md`), its outputs and note
  left to fill — a draft until they are. The decision file itself is NOT created: an empty
  placeholder that got committed would open the gate on nothing.
- **Paths.** `outputs` are globs relative to the study's folder, inside it, never the study's own
  files (`sealed.json`, `README.md`, `*.age`). A decision `file` is relative to the **paper's**
  folder, so it may live beside the study or anywhere in the paper (`research/decisions.md`); it may
  not leave the paper or be a ciphertext. Whether a decision inside the study's folder is matched by
  an output glob needs the folder, which the plan does not hold: the rules report it
  (`decision-is-output`) and the commands refuse it.
- **Empty texts of a mode** — no outputs yet, an empty decision file or note, an empty reason — are a
  draft's empty texts, named field by field (`mode.outputs`, `mode.decision.file`, …).

### 2. Decide first (default) vs seal (when outputs must exist before the decision)

|                      | decide first (`decide_before_run`)                                         | blind (`blind`)                                                                                                  |
| -------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| when                 | the decisions on the inputs can be made before the run                     | the outputs must exist before the decision (a run too long or costly to wait for, a decision that needs the run) |
| key                  | none                                                                       | an age key pair; the public half in the plan                                                                     |
| what the runner does | `studies gate <paper> <id> && run`                                         | run, then `studies seal <paper> <id>` at once                                                                    |
| what proves order    | git: every output's first commit descends from the decision's first commit | the manifest's hashes committed before the key is used; unsealing refused until the decision is committed        |
| what lint checks     | `repro/outputs-before-decision`                                            | `repro/blind-plaintext`                                                                                          |
| what a reviewer runs | `paperlint lint` on a full clone                                           | `paperlint studies verify` (no key)                                                                              |

Decide first is the default because it needs nothing anyone could lose, leak or have to trust: no key
exists, so no one can have read an outcome early through one.

### 3. `paperlint studies gate <paper-dir> <id>`

Exit 0 only if the decision file exists and is committed as it stands (git's last commit for it, and
nothing changed since), printing the commit and its date; exit 1 saying why otherwise (not
committed, changed since its commit, git unable to answer, no decision file named, a decision its
own outputs match). A runner calls it first:

```sh
npx paperlint studies gate papers/my-paper P1-S03 && ./run.sh
```

For a blind study it exits 0 and says to seal; for an exploratory one it exits 0 and says it has no
gate. A study that declares no mode is refused.

### 4. `repro/outputs-before-decision` — the proof of order a reviewer can re-run

An error, reported on `PIPELINE-STATUS.md`. For each decide-first study: every output whose first
commit is not a strict descendant of the decision file's first commit (earlier, on another line of
history, or in the same commit) is a finding; deleted outputs count. An output in the tree while the
decision was never committed is a finding. A shallow clone, and a history git cannot read, are
findings that say so — never a pass.

**Why a lint rule may ask git here.** Rules in `eslint-rules/` may not run git
(`eslint.config.mjs`, `GIT_IN_A_RULE`): a pinned sha is deleted by a squash or a gc, and a shallow CI
checkout has none. This rule pins no sha; it asks the history the checkout has for an order. A squash
merge keeps that order when the decision was merged before the run — which is the decide-first
workflow — and a shallow checkout is named by the rule (`fetch-depth: 0`).

### 5. Blind: `seal`, `verify`, `unseal`, `repro/blind-plaintext`

- **Crypto is the age CLI, driven, never implemented** (`src/adapters/age/`). `seal` pipes each output
  to `age -r <recipient>…` and refuses a ciphertext whose header lacks one X25519 stanza per
  recipient. Only native X25519 recipients (`age1` and 58 characters) are accepted. Without age, the
  commands stop and name how to install it.
- **`sealed.json`**, written only by the commands: per file the plaintext's sha256 and size, the
  ciphertext's sha256, `sealed_at`; and `unsealed`, `null` or `{ "at", "gate": { "file", "commit",
"date" } }` — there is no `sealed: true` flag that could disagree, and an unsealing cannot be
  written down without the commit it waited for.
- **`seal <paper-dir> <id>`** encrypts every output to `<file>.age`, then writes the manifest, then
  removes the plaintexts — the order a crash survives. Idempotent; refuses a changed result (the
  sealed one stands; replacing it is a deliberate `git rm` of the `.age`), an unsealed study, changed
  recipients, an unreadable manifest, and a first seal that matches nothing.
- **`verify <paper-dir> <id>`**, no key: every ciphertext against its recorded sha256 — age has no
  signature, anyone holding the public key can encrypt something else, and only a hash recorded
  before unsealing tells them apart — and once unsealed, every plaintext's sha256 and size.
- **`unseal <paper-dir> <id> --identity <file>`** refuses unless the `unseal_after` decision is
  committed as it stands and `sealed.json` is committed as it stands (the hashes were public before
  the key was used); it decrypts every file, checks every ciphertext and plaintext against the
  manifest, and writes nothing unless all hold; then the plaintexts, and `unsealed` with the gate's
  commit and date.
- **`repro/blind-plaintext`** (error): each plaintext an output matches while the manifest is not
  unsealed, an unreadable manifest, and a decision the outputs would seal.

### 6. Key custody is the user's choice

`unseal` takes a standard age identity file and holds no policy on where it lives — a person's
machine, a hardware key through an age plugin's identity file, a secret store that writes it to a
private temporary file. The package ships no workflow that unseals and reads no identity from the
environment. **Decide first needs no key at all**, which is why it is the default.

### 7. Legacy plans

A plan still named `prereg.json` is parsed by its loose legacy schema, which never asks for a mode,
and `repro/study-plan-name` keeps warning that it moves to `plan.json` — where the strict parser asks
for one. So an old paper keeps linting as before until it renames the file. A `plan.json` written by
the release before modes existed, for a measurement, reads as a draft whose empty text is `mode`:
silent while the study is `designing`, reported once it runs, and an unreadable plan when the
author's check is already on it (the message names `mode`). Adding one line — usually the
decide-first mode — is the migration.

### 8. The paper side: what the text says of each study's mode

A study's mode is only half the guarantee; the other half is that the paper does not say more than
the mode allows. Before this, the writing and review skills never mentioned the registry, a
pre-registration or the word exploratory, and nothing tied a number in `paper.tex` to the study that
produced it.

- **`paperlint studies methods <paper-dir> [--format md|tex]`**, read-only: for every study the
  paper reports (`in_paper: "yes"`), its mode, its decision's first commit and date, the first commit
  of any of its outputs, and the command that re-checks it (`npx paperlint lint` for the order,
  `npx paperlint studies verify <paper> <id>` for a sealed study). `md` is a table for the artifact's
  README; `tex` is one sentence per study the author adapts for Methods, TeX's special characters
  escaped. Derived each time from the plans, the manifests and git; there is no copy to keep in sync.
- **The link from text to study is a comment**, `% study: P1-S03` on a line of the paragraph
  (several ids separated by commas), read off the parse tree (`LatexReader.studyMarks`). paperlint
  had no number-to-study link before; this is the smallest one: invisible in the PDF, no macro to
  define, no second registry — it names an id the registry already holds. A paragraph's extent is
  its TeX paragraph (blank line to blank line), so the comment may sit on its own line inside it.
- **`paper/study-mode-claim`, an error**: a linked paragraph calls its study pre-registered,
  preregistered, decided before, blind or blinded, and the study is exploratory, declares no mode,
  or is decided first but its history does not show the decision first; and a link to an id the
  registry does not hold. The overclaim is the dangerous direction, so it is the error.
- **`paper/study-mode-stated`, a warning**: a linked paragraph states a number from an exploratory
  study and never says "exploratory". Two rules, because ESLint sets the level per rule.
- **The skills read the registry through `studies methods`, never by hand**: `draft-paper` (Methods
  states each study's mode and decision commit; results paragraphs carry their `% study:` link),
  `harden-paper` and `pc-panel-review` (every confirmatory claim rests on a study decided first or
  run blind; the opposite is a soundness finding), `tighten-paper` (the mode sentence is never cut
  for length), `osf-artifact-upload` and `camera-ready` (the artifact ships the plans, decision files,
  manifests and the verify commands, with the whole history).
- **Not judged**: a paragraph with no link, claims in other words ("registered in advance"), and
  whether a linked number really comes from that study.

### 9. Why: confirmatory vs exploratory, and venues that review the plan first

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

  This is the distinction the modes encode: decided first or blind is prediction; exploratory is
  postdiction, legitimate when it is labelled.

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
  beside it only when they are justified. The modes, the order rule and `studies methods` give a
  paper the same evidence in its own repository: what was fixed before the run, with its commit,
  and what was exploratory, with its reason.

## Where each part lives

| part                                                         | file                                                                                  | layer   |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------- | ------- |
| the modes, what is an output, which decision a mode waits on | `src/domain/study-mode.ts`                                                            | domain  |
| the order judge and its messages                             | `src/domain/decide-first.ts`                                                          | domain  |
| the manifest, what is sealable, seal steps, the blind judge  | `src/domain/sealed-study.ts`                                                          | domain  |
| the schemas of `mode` and `sealed.json`; readiness by kind   | `src/adapters/study-registry/`                                                        | adapter |
| git: committed state, first commits, ancestry, shallow       | `src/adapters/git/`                                                                   | adapter |
| age: encrypt, decrypt, header check                          | `src/adapters/age/`                                                                   | adapter |
| what the app asks of git, of a sealer, of removing a file    | `src/ports/git-history.ts`, `src/ports/sealer.ts`, `src/ports/remove-file.ts`         | port    |
| the two rules                                                | `src/outputs-before-decision-rule.ts`, `src/blind-plaintext-rule.ts`                  | app     |
| `gate`, `seal`, `verify`, `unseal`                           | `src/study-gate.ts`, `src/sealed-studies.ts`, `src/unseal-study.ts`, `src/studies.ts` | app     |
| wiring: git with PATH and HOME, age with PATH, the clock     | `src/cli.ts`                                                                          | root    |

## Prior art

The two papers are cited from memory and were not re-read for this note; the tools' behaviour was
checked against their own documentation and, for age, against the CLI (1.1.1).

| what                                                                                | what we take                                                                              | what we do not                                                     |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Blind analysis in physics (Klein & Roodman, _Annu. Rev. Nucl. Part. Sci._ 55, 2005) | the result is hidden until the analysis choices are frozen; unblinding is a recorded step | their hiding methods (offsets, scrambled labels) — ours are files  |
| MacCoun & Perlmutter, "Hide results to seek the truth", _Nature_ 526, 2015          | blinding as a defence against choosing the analysis by its outcome, beyond physics        | —                                                                  |
| Pre-registration (OSF, AsPredicted)                                                 | the decision fixed in a timestamped record before the outcome is seen; here, a commit     | an outside registry: the repository's history is the record        |
| Commit-then-reveal (hash commitments)                                               | the manifest's sha256 published before the plaintext; verifying is recomputing it         | salted commitments: the ciphertext already hides the plaintext     |
| age and SOPS (which can encrypt to age recipients)                                  | public-key file encryption with small keys and a stable format                            | SOPS's per-value encryption: results are whole files               |
| git-crypt, git-secret                                                               | encrypted files committed to git                                                          | transparent decryption on checkout: the workspace must not decrypt |

## What it does not check

- What a decision says. The gate is that it is committed, not its content.
- A decision amended after the outputs: `repro/outputs-before-decision` orders FIRST commits; later
  edits of the decision are in its history but not reported.
- That nobody ran a decide-first study before its decision and kept the outputs out of git, or
  decrypted a blind study early with the key. The rules and commands keep plaintext and early
  outputs out of the repository and its history, not out of a person's hands.
- Files outside the study's folder as outputs: outputs are relative to it by construction.
