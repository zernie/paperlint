<!-- vigiles:sha256:35cb814eec608ef3 compiled from eslint-rules/CLAUDE.md.spec.ts -->

# CLAUDE.md

## `eslint-rules/`

The rules this package ships. Loaded when working under `eslint-rules/`; the rules for every change
are in the root `CLAUDE.md`. Each requirement below names what holds it; the reasoning lives in
that file's header.

## What a new rule ships with, and what holds it

| requirement | held by |
| --- | --- |
| **Both halves** (root `CLAUDE.md`), for every registered rule | `src/rule-cases.test.ts` fails on a registered rule with no cases |
| **One rule, one requirement**: two checks with different reasons to switch them off are two rules | review |
| **A venue requirement is validated on real accepted papers** of that venue, built to PDF, with the ground truth established independently | review; the papers are in `fixtures/real-papers/accepted/README.md` |
| **Quiet on correct real papers**: every rule runs over the 6 accepted papers and the 108 arXiv preprints of `fixtures/real-papers/preprints/README.md`, and a finding not in a paper's baseline fails the test. Read each new finding and decide: a real defect in the paper → re-record the baseline and say so in the PR; a false alarm → fix the rule, never the baseline. | `fixtures/real-papers.test.ts` |
| **Its page**, `docs/rules/<group>/<rule>.md`, and `meta.docs.url` pointing at it | `src/rule-docs.test.ts`; its `AWAITING_PAGE` list only shrinks |
| **Loud on an empty input set**: a rule that matched no files must not report like one that passed | `scripts/rules-see-files.mjs`, per rule and not per glob, in `npm run check` |

The page's sections: What it catches · Why · Examples (failing / passing) · Options / preset fields ·
What it does not check · How to fix. Its row in `docs/rules.md` is one line linking there.

## A rule that judges prose

A rule, or a skill criterion, that judges a paper's prose is held to five principles. Without them
the checks push every paper toward a blog post.

1. **Two-sided**: a floor as well as a ceiling, or the distance to accepted papers of the target
   venue. A set of ceilings alone converges on clipped, unsignposted prose.
2. **Rules count, skills judge.** Countable on the parse tree → a lint rule; needs reading (register,
   genre, whether a claim changed strength) → a skill criterion.
3. **The model reader is the venue's reviewer**, including one who skims the abstract, the
   introduction and the conclusion.
4. **Thresholds are calibrated, not borrowed**: set with the same counter on the accepted papers,
   never taken from a figure measured by a different counter.
5. **A rewrite is accepted on what reviewers see**: the combined count of every surface form of a
   tic, plus a check that no claim was softened or strengthened.

## Rules

### A Rule Id Names Its Subject

**Guidance only** — A rule id is `<family>/<rule>`: one slash, kebab-case, as ESLint's `plugin/rule`. The family is the folder or record the rule judges (`paper/`, `repro/`, `cycle/`, `corpus/`), never the kind of check and never a venue; a new family only when no existing one judges that subject. The same check keeps the same name in every family: `allowed-files-only` for a folder's whitelist of names, `record` for a record file read against its schema, `layout` for a folder's shape. So related rules sort together and a reader who knows one family can guess another's rule. The rule's page is `docs/rules/<family>/<rule>.md`, held by `src/rule-docs.test.ts`. The author asked for this on 2026-11-24.

### Lint Rule Over Script

**Guidance only** — A check over a syntax tree is a lint rule, not a script. It fires in the editor on save, gets the AST for free, and has a suppression syntax people already know. A script is for corpus-wide questions — index connectivity, ratios across many files. When the work has to run a program, a script may do the work and write facts to a JSON file, and a rule judges that file: the verdict still lands in the engine.

### The Config Decides Where A Rule Runs

**Guidance only** — A NEW decision about which files a rule runs on goes into the config, not into the rule. A rule judges its own subject wherever it is turned on; whether it applies to a paper at a given stage is a rule block the lint config builds (`paperRuleBlocks` in `src/cli.ts`): `files`, `ignores`, or a rule set to `off`, where a later block wins, as in ESLint. Example: a finished paper (accepted, camera-ready frozen) has its text and build rules turned off by `src/settled-paper.ts`, and no rule reads its cycles for that (#583, #553). Two older decisions still live inside rules and are not a precedent: `phase` set to `porting` silences the venue rules from inside them (`src/venue-rules.ts`), and the anonymity rules go quiet on an accepted cycle (`effectiveBlind`, `src/domain/cycle.ts`); #599 decides whether they move. The author decided this on 2026-11-23.

### A Rule Is Configured The Eslint Way

**Guidance only** — Provisional, pending #599 (the author is not sure it is right). A rule's own switches (what to require, a threshold, a file to compare) come from its options where it is turned on: `["warn", { … }]`. A new rule is not on by default and silent until some key of `paperlint.json` is declared: that hides a check behind a setting nobody sees in the rule list. A fact several rules share about a paper (its venue, cycles, artifact, talk) reaches them through ESLint's `settings`, filled once by `buildConfig` from `paperlint.json`; a rule does not open `paperlint.json` itself. A rule whose subject IS `paperlint.json` (it validates the config) is exempt. Where an outside service varies (an artifact host, a portal), the rule reads a file of facts a command wrote and never the service; the services are adapters behind a port, as `src/ports/submission-portal.ts` and `src/adapters/hotcrp/` are, and eslint-plugin-import's `settings["import/resolver"]` is the ESLint precedent. About 25 existing rules predate this; #599 decides whether to move them, narrow this rule, or drop it and allow a rule to read `paperlint.json`. The author proposed this on 2026-11-21.
