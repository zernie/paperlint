# End-to-end tests

There are <!-- count:e2e -->2 of them: `test/e2e/install.mjs` and `test/e2e/build.mjs`. Both are
part of `npm run check`, so nobody has to remember to call them. `npm run test:e2e` runs just the
two of them, install first; if the install e2e fails or is skipped, the build e2e does not run.

This page says what they prove, what they deliberately do not, and when a change owes a new one.

## The line between a harness and an end-to-end run

Most of this package is tested by harnesses, described in [`CONTRIBUTING.md`](../CONTRIBUTING.md):
a rule is handed a file with a defect and must find it, then a clean file and must stay silent.
That is the right shape for a rule, and it cannot answer a different kind of question.

A harness runs **in this repository's process, against this repository's working tree**. It
imports the module directly. Every path resolves, every dependency is already installed, and the
file it reads is the file in `git`. An end-to-end run exists because all three of those are
assumptions that stop holding the moment somebody else installs the package.

| question                                                                             | answered by                                               |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| does this rule find this defect, and stay quiet otherwise                            | harness                                                   |
| does the CLI pick the right script, with the right interpreter                       | harness (`src/build.harness.mjs` substitutes `spawnSync`) |
| does the tarball, installed into a tree that is not this one, contain what it claims | **e2e**                                                   |
| do the paths written inside a skill resolve where the package actually lands         | **e2e**                                                   |
| did a PDF come out, and is it typeset in the fonts the venue requires                | **e2e**                                                   |

The third and fourth rows are the ones a harness cannot reach even in principle: the defect only
exists once the code is somewhere else.

## `test/e2e/install.mjs` — the package, installed

`test/e2e/install.mjs`. It runs `npm pack`, then installs the resulting tarball into a fresh
temporary tree, **under npm and under pnpm separately**, and drives the installed binary:

- the install itself finishes
- `rpp --help` answers with zero
- `rpp init` declares the papers directory in `package.json`, and does _not_ leave a second
  carrier `rpp.json` behind
- `rpp init` finishes with zero — its doctor found no discrepancy
- `rpp init` wires the hooks into `.claude/settings.json` — the same commands `hooks.json`
  publishes, once each — and says they need `npm install` in a fresh clone; a second `init`
  leaves that file byte-identical
- `rpp lint` passes the staged corpus
- `rpp new demo` scaffolds a paper from the templates that shipped in the tarball, its own lint is
  clean, and `rpp lint` stays clean with it in the corpus
- `hooks.json` arrived and parses, and every hook command named in it resolves to a file
- every skill arrived, and every script path named inside a skill resolves **in the consumer**

The last two rows are the reason this file exists. A skill is a markdown document with paths in
it; nothing in this repository's own test run would notice that those paths only work here.

🔴 **Two package managers, not one, and it is not belt-and-braces.** The wiring addresses the
runtime from the project root, and pnpm does not put transitive dependencies at the root. A layout
that works under npm can be dead under pnpm with no error anywhere. The same run also launches the
binary **directly** rather than through `node <path>`: under npm `.bin` holds a symlink, under
pnpm a shell wrapper, and calling `node bin` measures the caller's habit instead of the package.

## `test/e2e/build.mjs` — a real `pdflatex`

`test/e2e/build.mjs`. It copies `fixtures/build-e2e/` — four papers — into a temporary tree,
points a config at it, and runs `rpp build --all`. Then it measures the artifacts with `pdffonts`:

| fixture     | what it is there to prove                                                                                                                                    |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `acmart`    | a real `\documentclass{acmart}` source builds, and the PDF carries the class's **own** font families — not one family of the silent substitution             |
| `fallback`  | the same document with the fonts missing still **builds green**, and is **rejected** by the font check. The failure is in the artifact, not in the exit code |
| `no-script` | a paper with no build script is named separately, not silently counted as built                                                                              |
| `broken`    | a failing build is reported as failed, with its exit code, and the run as a whole is a failure                                                               |

The `fallback` row is the point of the whole file. `acmart.cls` checks for `libertine.sty`,
`zi4.sty` and `newtxmath.sty`, and failing to find any of them sets `\@ACM@newfontsfalse` and
typesets the paper in Computer Modern. The build is green, the PDF looks fine, the metrics differ,
and therefore so does the pagination. A submitted paper went out that way. **An exit code cannot
see it, so the content of the artifact is what gets measured.**

## Skips are declared, never silent

A clone without TeX Live genuinely cannot run the build e2e; a machine without pnpm cannot run
half of the install e2e. Each says so and exits **77** — the skip code vigiles' own runner uses —
not zero, and `npm run check` reports it as `SKIPPED — not run, not passed`. In CI the same absence
means a broken environment, so `--strict` turns the skip into a failure.

A skipped step and a passed one look identical in a CI interface. That is the class this whole
package is written against, so it is not allowed to happen inside it either.

## When a change owes an e2e

Not every change does. The trigger is countable — ask whether the change touches something that is
**only true after installation**:

- a new file or directory that has to arrive on the consumer's disk (a skill, a hook, a template)
- a path written inside a document rather than resolved by a module loader
- anything read through `package.json` fields — `bin`, `files`, `exports`
- a new external program the pipeline shells out to
- a new artifact the pipeline produces whose **content** can be wrong while the exit code is zero

If none of those apply, a harness beside the changed module is the right test, and an e2e run
would only make the suite slower without making it stricter.

## What these two do NOT cover

Named here on purpose: a test suite that does not say where it stops is read as covering
everything.

- **macOS and Windows.** Both runs are Linux-only here. `npm run check` prints the CI jobs it
  cannot reproduce, and `macos` is one of them.
- **The rules, on a real document.** `fixtures/real-markdown-paper/` holds a published article and
  a recorded baseline of what the rules say about it. That is a **lint** fixture, driven by a
  harness — it does not go through the installed package. Wiring it into the install corpus is
  open work, not something already done.
- **The skills as behaviour.** The install run proves a skill arrived and that its paths resolve.
  Whether the agent then does the right thing with it is a different measurement, and it belongs
  to the harness tier of `vigiles`, not here.
- **Registry publication.** `npm pack` produces the same tarball `npm publish` would upload, so
  the packlist is covered; the registry round-trip is not.

## The corpus

`stageCorpus()` in `test/e2e/install.mjs` writes a small paper by hand — a declared stage, its
PDF, its byte counts, the cross-check between them — and copies `fixtures/build-e2e/acmart` beside
it so the LaTeX rules see LaTeX rather than a placeholder.

⚠️ **Every line of that corpus was written by somebody who already knew which rule would read it.**
It keeps the stage machinery honest and it cannot tell you anything about false positives. That is
what the real-article fixture is for, and why the two tiers are not substitutes.
