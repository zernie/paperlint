# Paper sources: independent refutation

Review of `docs/design/paper-sources.md` at `9593b1c` (branch `claude/paper-sources-design`),
2026-10-06. Everything below was read from the code at that commit or measured in this container.
**No TeX is installed here** (`which pdflatex bibtex lualatex tectonic` prints nothing), so no claim
that needs a TeX run was re-measured. Those claims are marked where they come up.

## Verdict: DOES NOT HOLD

Most of the design holds up: one owner for Q1/Q2/Q3, a discriminated union for the bibliography,
one dead-span list, a static answer checked against a recorded one, and a rule that keeps the class
from growing back. The part it rests on most does not hold. That part is §3.3's decision table and
the policy "check what TeX reads, and report `bib/inline-shadowed`". The table has no row for a
`.bib` that TeX itself wrote from the block on an earlier build. So after one `paperlint build`,
every paper whose block has no `[overwrite]` is reported as `shadowed`, even when the file holds the
same text as the block. That covers 7 of the repo's 8 build fixtures that use `filecontents`, and
both `paper-typography` fixtures. The decision also reads a file that is not tracked by git. So for
the same commit, the answer is `embedded` on a fresh CI checkout and `shadowed` on a working copy
that has been built. Lint verdicts then depend on the machine, and findings point into a generated
file that `render-paper` tells authors to gitignore. Q2 has to be decided again before the module is
built on it. The rest of the findings are changes, not blockers.

## Findings

### 1. Every built paper becomes `shadowed`. The table cannot tell a stale file from TeX's own output. (blocks the design)

**Claim attacked:** §3.3. In the row `declared · block · no [overwrite] · file exists → shadowed`,
the block is reported as "not what TeX reads".

**Evidence.**

- The build runs pdflatex in the paper directory, with no `-output-directory`:
  `src/build.ts:338-341` (`spawnOptions`: `cwd: ctx.paperDir`) and `:316-323` (`pdflatexArgs`). So
  on the first pass, `\begin{filecontents*}{refs.bib}` writes `<paper>/refs.bib`.
- On the next lint or build, `exists("refs.bib")` is true. The table gives `shadowed`, and
  `bib/inline-shadowed` fires. Nothing in §3.2–§3.3 compares the file with the block.
  `grep -n -i "identical\|same content\|equal\|compare" docs/design/paper-sources.md` finds no
  content comparison (the only hits are §3.5's file-list comparison and unrelated lines).
- How many papers this hits:
  `grep -rn "begin{filecontents" fixtures/build-e2e fixtures/paper-typography` gives 9 blocks, all
  `\begin{filecontents*}{refs.bib}` with no option: anon-ack, anon-bib, anon-author, anon-macro,
  anon-pdfauthor, aidc, anon-href, clean-paper, messy-paper. The only `[overwrite]` in the fixtures
  is `fixtures/accepted-papers/agenticdev-acm26/paper.tex:2`. §2 says "four of the build e2e
  fixtures" lack it; the count is seven.
- A plain byte comparison would not fix it either:
  - Non-starred `filecontents` writes a header comment into the file.
  - TeX drops trailing spaces from input lines, so the file it writes is not the block's bytes.

  Any "in sync" test has to normalise for both. Neither effect was measured here (no TeX).

- §5 step 1 inherits the defect. It asks that `paperSources` equal the `.fls`/`.blg` answer. For
  any fixture without `[overwrite]` and with no stale file, the static answer is `embedded` before
  the build and `shadowed` after it, so the test's result depends on when it calls the module.

**Change needed:** see finding 2. A row that compares normalised contents (`in-sync`) is the
minimum, but it does not fix finding 2.

### 2. "What TeX reads" depends on the machine. Decide Q2 from committed bytes. (blocks the design)

**Claim attacked:** §3.3's policy, and §6.1's hope that `shadowed` "would mostly fire on local
working copies".

**Evidence.**

- `skills/render-paper/SKILL.md:83-87` tells authors that the block is the source of truth, that it
  is written with `[overwrite]`, and to "Consider `.gitignore`-ing the generated `refs.bib`".
- Take a paper that follows that advice, but whose block lacks `[overwrite]`:
  - **Fresh CI checkout:** no `refs.bib`, so the block is written and the state is `embedded`.
  - **Author's working copy:** built once, so the state is `shadowed`.

  Same commit, two answers, two sets of findings. ESLint judges `paper.tex`, and the file that flips
  the verdict is neither linted nor tracked.

- In the `shadowed` state, §3.3 sends every Q2 finding to lines of `refs.bib`. That file is
  generated, possibly gitignored, and the next fresh build ignores it. An author who fixes an entry
  there changes their local PDF, while the CI build reverts the fix.
- The submitted PDF is the one built from the committed tree, which is the block. So "what the
  author edits" is the more stable answer here, not the less correct one.

**Change needed.** Make the decision a function of the committed source:

- **A static rule on `paper.tex`'s own bytes** (for example `bib/filecontents-overwrite`): a block
  without `[overwrite]` is a finding, with an autofix that adds the option. The rule is
  deterministic, safe for the ESLint cache, and already the documented convention. With it, the
  `shadowed` state never arises, and Q2 consumers read the block. That is both what the author edits
  and what TeX reads on every machine.
- **Keep `shadowed` only for the tracked case:** both the block and a git-tracked `.bib` exist, and
  they differ.
- Leave the stale local file to the post-build recorded check (§3.5).

### 3. "`bib-authors` is right 3 of 4" is a coincidence of the fixtures. (minor)

**Evidence:** `skills/verify-citations/scripts/bib-authors.mjs:57-107`. Given a directory, it takes
`paper.bib`, then the only `.bib`, then the first `.bib` in sort order, and only then falls back to
the `.tex`. It never reads `\bibliography{…}`. Two variants show how it can go wrong:

- A paper with `\bibliography{barovox}` and a leftover `refs.bib`: it picks `barovox.bib` or
  `refs.bib` by alphabet, not by declaration.
- A built v1-style paper whose `refs.bib` equals the block (finding 1): it reads the generated copy.

That it agrees with TeX in v1, v3 and v4 should not be read as evidence for its order. The design
deletes `bibTextFrom` anyway, so this only changes how §0 argues.

### 4. The `Database` union is missing states, and allows invalid ones. (needs a change)

**Claim attacked:** §3.2 / §3.3, that the union is complete and the types are "parsed once at the
boundary into types that cannot hold an invalid state" (`src/CLAUDE.md:43`).

- **Switches.** `src/adapters/latex/conditionals.ts:14-15`: "Only `\iffalse` is decided. `\iftrue`,
  `\if\venue1` and every switch made with `\newif` … both of their branches stay." The repo's own
  corpus has such a paper: `fixtures/accepted-papers/llm-splained-acsac25/paper.tex:115-145` loads
  `biblatex` three times behind `\conference`. A `\bibliography` or `\addbibresource` behind a switch
  gives several databases with no way to choose between them. The union needs an `undecided` state.
  Measured with `parseLatex` + `includesOf`: a `\newif\ifdraft\draftfalse … \ifdraft
\input{sections/parked} \fi` still lists `sections/parked`. §3.5's `sources-agree` would report
  that file on every build, on a switch the author set on purpose.
- **biblatex with biber.** The same paper uses `backend = biber` and three
  `\addbibresource{bibs/….bib}` (`paper.tex:149-151`). Biber papers write no `\bibdata` to `.aux`,
  and `paperlint build` runs only `bibtex` (`src/build.ts:409`). So §3.5's recorded databases are
  empty for these papers, and `sources-agree` would report every declared resource. A
  `recorded: unavailable (biber)` state is needed.
- **`\addbibresource[location=remote]{https://…}`.** `exists()` is false, so the state is `missing`,
  "the build will fail". That is wrong for a remote resource.
- **`[nosearch]`.** The doc quotes it (§2: "looks only in the current directory") but does not model
  it. `EmbeddedBib` carries only `overwrite`. Verified in the source:
  `latex3/latex2e base/doc/ltnews30.tex:293-297`.
- **Two search paths.** `filecontents`' existence check searches the TeX inputs path, which the
  build sets as `TEXINPUTS` (`src/build.ts:254-271`). bibtex searches `BIBINPUTS`, which the build
  does not set. If a `refs.bib` is found on `TEXINPUTS` but not by bibtex, the block is not written
  and bibtex fails. `exists(name)` merges the two paths into one.
- **`\bibliography` inside a macro definition.** For example
  `\newcommand\refs{\bibliography{refs}}`: the definition is pruned (`hidden.ts`), so before a build
  the state is `none`. That is the same "nothing to check" silence §3.2 blames on `null`. Only the
  post-build check notices.
- **Invalid states that can still be constructed:**
  - `shadowed` with `block.overwrite === true`;
  - `embedded` whose `block.writes` does not match `name`;
  - `main` stored twice (`main` and `files[0]`), so the two can disagree;
  - `lintable: boolean`, which only repeats the path's extension;
  - `role: "main"` allowed on any element of `files`.

### 5. Q3 inside the `.bib`: bibtex has no comment character, and the parser does. (needs a change)

**Claim attacked:** §3.3, "Every Q2 consumer then reads **the text TeX reads**".

**Evidence.** Measured with the repo's own parser:

```
$ node .probe.mjs   # @retorquere/bibtex-parser on "% @article{dead2020,…}\n@article{live2021,…}"
["live2021"]
```

As far as I know (not measured here), classic BibTeX ignores everything outside `@…{…}` and does not
treat `%` as a comment. A `%`-prefixed `@article` is therefore still read and can still be cited.
The repo has met this behaviour from the other side: `skills/render-paper/check-render.sh:176-177`
records that a `%` inside an entry "eats the whole record".

The ESLint projection makes the `%` lines of a `filecontents` body into comment nodes
(`eslint-rules/latex-language.ts:69, :384-392`). So three readers of one bibliography disagree about
which entries exist: bibtex, the parser, and the projection.

**Change needed:** one of two things.

- The module answers "which entries are live" the way bibtex does.
- Or there is a finding for a `%` line that starts an entry.

### 6. Inventory: sites it missed, and one row marked ✓ that is only half right. (needs a change)

**Claim attacked:** §1.3, "33 sites".

Missed:

- `skills/render-paper/check-render.sh:109-110`: a **third compile path**,
  `pdflatex -interaction=nonstopmode "$BASE.tex"` without bibtex. It also writes the `refs.bib` that
  finding 1 is about.
- `skills/render-paper/check-render.sh:207-209, :251-252`: `grep -qE '^[^%]*\\documentclass…'` on
  `paper.tex` only. This is a Q3 copy like #18 (blind to `\iffalse`, first match wins).
- `eslint-rules/latex-language.ts:372-373`: `src.indexOf("\\begin{document}")` decides where the
  preamble ends. It takes the first occurrence, even one inside a comment, `\iffalse`, verbatim or a
  `filecontents` body. §3.2's `Role: "preamble" | "body"` and §3.4's "non-prose spans (preamble)"
  rest on this answer.
- `eslint-rules/pdf-last-page-balance.ts:183`: `reportLine` takes the first `\documentclass` line.
  `llm-splained` has three behind a switch. `fixtures/accepted-papers/README.md` already records the
  same defect for `tex/template`.

Marked ✓ but only half right:

- **#29 `bibInput` (`src/build.ts:296-313`).** `\bibdata` is TeX's answer for the _names_. The
  _paths_ are paperlint's own guess: `join(paperDir, d.endsWith(".bib") ? d : `${d}.bib`)`, with no
  `BIBINPUTS` and no `kpsewhich`. For a database bibtex finds elsewhere, `bibHash` is null, and §3.5
  would compare against a resolution that is not TeX's.

Plan gap:

- `src/build.ts:46, :192` imports `@unified-latex` (#23). It is not on §4.3's allow-list and not in
  §5 step 7. So step 14's "must report zero on the tree" cannot pass as planned.

The prototype count reproduces: Appendix A run over the tracked non-test `.ts/.mjs/.js` under
`src lib hooks eslint-rules skills bin scripts` gives **58 in 28 files**. 5 of those files are
`skills/paper-pipeline/*.eval.mjs`, which Appendix B excludes. Without them the count matches the
doc's 53 in 23. §4.1's globs exclude only "tests and harnesses", so as specified the shipped rule
would also lint the evals.

### 7. Enforcement: `no-restricted-imports` has the same problem the doc rejects `no-restricted-syntax` for, and the rule skips template literals. (needs a change)

**Claims attacked:** §4.1, §3.11.

- The argument against `no-restricted-syntax` is correct. `eslint.config.mjs:446, :624, :842` set
  it in three blocks, and :850-864 is placed last to keep its options.
- §4.1 then proposes `no-restricted-imports` for `@unified-latex/*`. That rule is already set twice:
  `:798` (`{ paths: ONE_COLLECTION_LIBRARY }`) and `:813`, which restates `ONE_COLLECTION_LIBRARY`
  by hand next to `NO_SKILLS`. A third block with the new pattern would replace one of those for
  `src/`, `eslint-rules/` and `lib/`, and drop the lodash ban, unless every list is merged by hand.
  That is the cost §3.11 calls disqualifying. Put the import ban inside the custom rule too.
- Appendix A checks `Literal` and the `RegExp(…)` argument, not `TemplateLiteral`. It therefore
  misses:
  - `eslint-rules/papers.ts:145` (`` `${root}/*/paper.tex` ``);
  - `src/domain/paper-source.ts:69` (`` `${t}.tex` ``);
  - `src/build.ts:302` (`` `${d}.bib` ``).

  §4.4 names `join(dir, "paper" + ext)`, but not this more common form.

- It would flag legitimate code: `src/new-paper.ts` (scaffolding writes a new `paper.tex`, which
  asks nothing about an existing paper) is reported and is not on the allow-list.

### 8. §3.5's "local files from `paper.fls`" has no filter, and bibtex records nothing. (needs a change)

**Not measured (no TeX).** `-recorder` logs every file pdflatex opens: `.aux`, `.toc`, `.out`,
`.bbl`, every figure, `paper-guards.tex` and other inputs-path files. As far as I know it also logs
the `\IfFileExists` probe that `filecontents` makes for `refs.bib`.

"Any file TeX read that the static answer lacks" is then noisy unless the comparison is limited to
the files the static answer could contain (`.tex` reached by include). bibtex has no recorder, so
the `.bib` paths never appear in `.fls`. The Q2 half of the recorded answer is only `\bibdata`
names, plus the `.blg` `Database file #n:` lines if they are read.

What helps: if `.fls` does record an `OUTPUT refs.bib` line when the block is written, it would
decide `embedded` vs `shadowed` exactly. That fits finding 2 better than any static check of the
file on disk. Measure it before relying on it.

### 9. Layering: an ESLint rule calling the app use case becomes a composition root. (needs a change)

**Claim attacked:** §3.6, row `eslint-rules/*.ts → #src/paper-sources`.

Today no rule in `eslint-rules/` imports an app module. `eslint-rules/paper-context.ts` receives
`bodyFiles`' answer through `settings`, and `src/cli.ts` computes it: the root builds the adapters
and wires the ports (`src/CLAUDE.md:22`). `paperSources(dir, deps)` has "no I/O defaults"
(`src/CLAUDE.md:20`), so a rule that calls it must build `nodeFiles` and `latexReader` itself, and
would parse the whole paper and its includes again per rule and per file.

Follow the `paper-context` precedent: compute once in the root and carry the value in `settings`.
Or memoise by directory and hashes.

Minor and arguable: `decideBibliography` encodes the LaTeX kernel's `filecontents` behaviour. Under
`src/CLAUDE.md:10-14` ("Axis A … a file belongs to an adapter when it would change if `<tool>`
disappeared"), that is adapter knowledge, not domain.

### 10. Hooks: the harness part the plan relies on has moved, and `.bib` in the guard goes past its stated purpose. (needs a change)

- **Where the duplicate check lives.** `hooks/hooks.harness.ts:595-606` is part VII, and it is now a
  comment only: "That duplication is checked in `lib/paper-config.harness.mjs`". That harness
  compares constant values (`lib/paper-config.harness.mjs:38-47, :95-121`); it does not test
  behaviour. The plan itself is feasible: hooks already `export const` (for example
  `hooks/paper-edit-guard.hook.mjs:111-153`, `export const papersRoot`), so `isSourcePath` can be
  exported and run against a case table. But §3.6's "part VII already checks copied constants" is
  stale, and the case table belongs in `lib/paper-config.harness.mjs` next to the other copies.
  Otherwise it repeats the scope mistake recorded at `hooks.harness.ts:601-606`.
- **`.bib` in the edit guard.** The guard's stated purpose (`paper-edit-guard.hook.mjs:368-375`) is
  "to stop a paper's PROSE being edited past the PostToolUse checks". No such check reads a `.bib`.
  With `.bib` added to the argv leg (`MUTATORS`, `:319-328`), `cp ~/Downloads/library.bib
papers/p1/refs.bib` and `mv` of a bibliography are denied. That is ordinary work: exporting from a
  reference manager.
- **Generated files.** `isSourcePath` would also claim the `refs.bib` that pdflatex generates from
  the block (finding 1). That file is a build product, not a source.
- **Already covered.** The redirect leg already denies `>` into any file under the root
  (`redirectsInto`, `:299-309`).

So the real gain is `sed -i` on a tracked `.bib`. Weigh that against the denials.

### 11. Declared checks: the build-fails rule contradicts the doc's own principle and the references precedent. (needs a change)

**Claim attacked:** §3.9, "`paperlint build` exits non-zero when an `error` check failed".

**Evidence.**

- §3.11 rejects running checks from lint with "The build runs, records; lint judges the record".
- The references step, the precedent §3.9 copies, is "OPTIONAL and NEVER FAILING" (`src/build.ts:569-570`).
- `docs/prior-art/nondeterministic-checks.md` says a check whose verdict can change without the file
  changing must not block. Two of the proposed checks are exactly that: a results gate that runs a
  reproduction, and `pdf/link-resolves`, which uses the network (§3.9 gives it no severity policy).

Make the build record the outcome and let `paperlint lint` (or the CI entry point) fail on it, which
matches `blocking-vs-advisory.md` point 2.

A second gap: a check runs with `cwd` = the paper directory, after `measure`, with no sandbox. It
can rewrite `_build/paper.facts.json`, `references.json`, or a `tables/*.tex` (a reproduction script
that regenerates tables is the common case). "A check cannot change how the paper is compiled" is
true, but it can still change what the rules judge. Hash the sources and facts before and after
each check and report a check that changed them.

The #59 / `IGNORED_SCRIPTS` attack failed; see below.

### 12. `prose.json` reference numbers from `paper.aux` are token lists, not numbers. (minor)

**Not measured.** The first group of `\newlabel{…}{{…}…}` is whatever TeX wrote, for example:

- `\relax`-prefixed values;
- hyperref's five-field form;
- cleveref's extra `@cref` labels with `[section][2][3]3.2`;
- formatted subfigure or `enumerate` labels.

§3.8 should say how a `number` is rendered from it, which labels are skipped, and that
`@cref` twins are ignored.

### 13. Migration: "one PR" crosses every layer, and the semver list misses user-visible changes. (needs a change)

- §5 touches lint rules, skills, hooks, a new build step, the settings schema, two JSON schemas,
  shell→TS rewrites, and five or more new rules, each with a docs page and accepted-paper
  validation. Root `CLAUDE.md` rule 9.2 says: "More than one [layer or channel] is a conversation,
  not a commit."
- Putting all of it inside #171 (already at review round 5) so that it rides on `8be391b` /
  `ecea877` / `aa009ec` (verified: all three are `feat!`) ties a large design to a release-note
  convenience.
- A natural split, each part green on its own:
  1. module + Q2 consumers (with finding 2's decision);
  2. Q3 projection;
  3. hooks;
  4. build facts and declared checks;
  5. enforcement.
- **Not listed in §5's semver section:**
  - the guard denying commands it allows today (finding 10);
  - `status-gates` firing on more paths;
  - `-recorder` writing `paper.fls` into every paper directory. The build runs in place, and this
    repo's `.gitignore` (and probably a consumer's) does not list `*.fls`, so every built paper gets
    a new untracked file (rule 11).
- Step 1's "red: the module does not exist" commits a failing e2e test. That is fine if steps 1–4
  land together, but the per-step "green" claim does not hold for that commit. Step 1's assertion
  is also time-dependent (finding 1).

## Attacks that failed

- **`filecontents` semantics.** The LaTeX News 30 quote is real (`ltnews30.tex:283-297`), including
  `[force]` and `[nosearch]`. The design's reading of the kernel is right; the defect is in what it
  builds on top of it (findings 1 and 2).
- **The parse tree's `\iffalse` cut against awkward input**, measured with `parseLatex`,
  `includesOf` and `headingsOf`:
  - a parked half-figure (`\iffalse \begin{figure} … \fi`) keeps the following `\section` and
    `\input`;
  - the `{\iffalse}\fi` brace trick keeps the following text;
  - `\verb|50%|` stays one `verb` node over offsets 45–55, and the text after it survives.

  I found no realistic, error-free construct where the tree's spans and a blanking projection would
  disagree. The ones I found (`\fi` inside verbatim inside `\iffalse`) are TeX errors anyway.

- **The `no-restricted-syntax` rejection** (§3.11) is correct as stated.
- **The prototype's counts reproduce** (finding 6 explains the difference).
- **`checks` vs #59.** The design follows #59's "declared as data" and `IGNORED_SCRIPTS` stays
  intact. `docs/configuration.md:450-453` is about scripts that replace the build, and a declared
  check does not. No new verb is proposed, which is consistent with `multi-mode-tools.md`.
- **The `feat!` commits #171 is said to carry exist** (`git log -1` on each).
- **Hooks importing a function copy is feasible**: the shipped hooks already have named exports
  alongside `export default`.

## Where my own review may be wrong

- **No TeX in this container.** These were not measured:
  - that `filecontents` without `[overwrite]` leaves a file written by an _earlier pass of the same
    block_ alone (it follows from the quoted kernel rule, but I did not run it);
  - the header and trailing-space differences (finding 1);
  - what `-recorder` logs for `\IfFileExists` and for a written `filecontents` file (finding 8);
  - the `\newlabel` forms (finding 12);
  - every ✓/✗ in the design's §1.4 tables. I did not re-run them.
- **BibTeX and `%` (finding 5)** is from memory of BibTeX's behaviour, not from a bibtex run. The
  parser half was measured.
- **Finding 2** assumes some consumers gitignore the generated `refs.bib`, as `render-paper`
  advises. I could not see the consumer project's papers or `.gitignore`. If every consumer commits
  `refs.bib`, finding 2 shrinks to finding 1.
- **Not read:** the Codex comments on PR #171 (4198299174, 4198299188), the consumer's sweep hook,
  and the old per-paper build script that §3.9's six checks come from. Findings on §3.9–§3.10 judge
  the design text only.
- **Hooks and the full test suite** were not run.
- **Finding 9's domain-vs-adapter point** is a reading of `src/CLAUDE.md` Axis A that the author
  may reasonably read the other way, since the domain already holds `tex-document.ts`.
