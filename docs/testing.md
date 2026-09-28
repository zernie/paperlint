# Testing

The one map of the kinds of test in this repository: what each answers, where it lives, what it
may touch, and how to run it. The rules that apply to every kind are at the end.

## Which kind do I need?

| you are testing                                                                               | kind            |
| --------------------------------------------------------------------------------------------- | --------------- |
| a pure function: a parser, a decision, a formatter                                            | **unit**        |
| a use case or an adapter that reaches the disk, a process, the network or the clock           | **integration** |
| what an agent sees or does: a hook's decision, a skill's contract                             | **harness**     |
| the package as someone else gets it: the tarball installed elsewhere, a real TeX build, a PDF | **e2e**         |

When in doubt between unit and integration: if the function takes a port (`Files`,
`CheckReferences`, `RunProcess`, …) or calls `fetch`, it is integration.

## Unit — vitest, pure functions

- **Answers:** does this function return the right value for this input?
- **Lives:** beside the module, `<module>.test.ts`. A test that IMPORTS a `.mjs` module stays
  `<module>.test.mjs` until that module moves to TypeScript (#78): TypeScript has no types to check
  it against, and `allowJs` was measured to break a dozen existing `@ts-expect-error` imports. A
  test that only runs a `.mjs` script as a process has nothing to import and is `.test.ts` already.
- **May touch:** nothing. No disk, no network, no process, no clock.
- **Example:** `src/domain/lookup-cache.test.ts` — the reference cache's parse, serialize and key
  functions, each refusal compared as a whole value.

## Integration — vitest, with fakes through the ports

- **Answers:** does this use case or adapter do the right thing with the world it talks to?
- **Lives:** beside the module, named like a unit test.
- **May touch:** a temp directory (`useTempDir` and `writeTree` in `test/support.ts`), a child
  process of this repository's own scripts (`runNode`). Never the real network.
- **How fakes get in:** through the seams the code already has.
  - a port the use case takes: `memoryFiles` and `scriptedProcess` in `src/adapters/memory/`, a
    `CheckReferences` function, a `MeasureGeometry`;
  - `fetch`, stubbed with `vi.stubGlobal` and routed by URL, which also records every request made;
  - a clock or a pause, passed in (`referencesChecker({ today })`) or run under `vi.useFakeTimers`.
- **Example:** `src/adapters/references/index.test.ts` — the reference checker over a fake
  `fetch`: a cold run stores every answer, a warm run makes no request at all (the recorded list of
  requests is empty), an edited entry asks only for itself.
- **A rule through real ESLint is integration, not e2e:** `src/rule-cases.test.ts` reads every rule
  the registry holds (`rulePlugins`) and runs each through `paperlint lint --json` in-process on a
  small paper tree — the CLI's own config, the `tex/latex` language, `loc`, message templating. Each
  rule needs a case that reports (id, severity, line) and one that stays silent; a registered rule
  without cases fails the test by name. A `_build/` file a rule reads is planted, not built.

## Harness — vigiles, the agent-facing surface only

- **Answers:** what does an agent see or cause? A hook's allow or deny on a given input, what a
  skill's contract promises.
- **Lives:** `<surface>.harness.mjs` beside what it tests; it imports `runHook`, `runHarnessTest`
  or `runEval` from vigiles. Harnesses written before this rule that import none of the three are
  frozen in `scripts/harness-api.frozen.json`, which only shrinks (`scripts/harness-api.test.ts`,
  #77). A new test of anything else is a unit or integration test.
- **Asserts through** `lib/check.mjs`: `const check = createChecker();` then
  `check(label, cond, detail)`. A failure prints the label and the detail, every call is counted.
  Do not define a local `check`.
- **Example:** `hooks/hooks.harness.ts`.
- **Skills are tested through vigiles**, not a bespoke runner: a home-grown runner here once printed
  byte-identical "clean" verdicts for three skills that had never loaded.

## End-to-end — `test/e2e/<area>/*.e2e.ts`

- **Answers:** does the package work once it is somewhere else? The tarball installed into another
  tree, a real `pdflatex` build, the PDF's fonts measured.
- **May touch:** everything a user's machine has, except the network: a citation service is a
  counting fake `fetch` even here (`test/e2e/tex/build.e2e.ts`).
- **Types:** the runs import the built modules from `dist/` (the shipped path is the point), so
  their types are the declarations `tsc` emits — `npm run build` before type-checking them.
- **Where:** a directory per environment the tests need — `test/e2e/install/` (npm and pnpm),
  `test/e2e/tex/` (TeX Live) — each a vitest project that finds `*.e2e.ts` by its glob. A new e2e
  file needs no list anywhere. Helpers beside them are named without `.e2e.ts`.
- **A missing tool:** `missing(what, present)` from `test/e2e/need.ts` → `describe.skipIf`. Locally
  the tests are reported skipped; with `CI` set they fail.
- **A build fixture:** a folder in `fixtures/build-e2e/` with its own `expect.json`; no test code.
- **What each run proves, and when a change owes one:** [`e2e.md`](e2e.md).

## Running

```bash
npx vitest run <file or folder>   # unit and integration tests
npx vigiles test <file>           # one harness
npm test                          # unit and integration (vitest project `unit`), then every harness
npm run coverage                  # the same under c8, failing below the thresholds in .c8rc.json
npm run test:e2e                  # every end-to-end run
npm run test:e2e:install          # the package packed and installed under npm and pnpm
npm run test:e2e:tex              # real TeX Live: toolchain, builds of every fixture, banal
npm run check                     # every gate CI runs, and the list of what it does not reproduce
```

While editing, run the tests you touched, `npx tsc --noEmit`, `npx eslint <files>` and
`npm run fmt:check`. **Before every push, run `npm run check` and read its exit code** — the
coverage gate cannot be judged from one file.

⚠️ **Not `vigiles test .`**, and never drop `--min=1` from `npm test`. Measured 2026-09-11:

| form                   | what happens                                                                | exit  |
| ---------------------- | --------------------------------------------------------------------------- | ----- |
| `vigiles test .`       | `.` is read as a FILE — `ERR_UNSUPPORTED_DIR_IMPORT`, uncaught, runner dies | **0** |
| `vigiles test`         | `No **/*.harness.{mjs,cjs,js,mts,cts,ts} files found.`                      | **0** |
| `vigiles test --min=1` | names the empty match and fails                                             | **1** |

`--min=1` is the only thing between "every test passed" and "no test ran". vitest exits 1 when no
file matches, and it transpiles without type-checking, so `npm run check` runs
`tsc -p tsconfig.test.json` as its own gate.

## Rules for every kind

1. **Red first.** Run a new test on the code before the change and watch it fail at its own
   assertion. A test that has only ever been green is indistinguishable from one that cannot fail.
   Never add a file that patches source to prove a test can fail.
2. **Assert the whole value** — `assert.deepEqual`, `expect(x).toEqual(…)` on the entire result,
   not a substring or one field. A substring passes on output that is wrong everywhere else. The
   exception is prose whose wording is not the subject; say so in a comment.
3. **Test what the code does, never what its source says.** A test that reads a source file (a
   `.mjs`, a `SKILL.md`, a README, a config) and asserts it contains some text restates the file:
   rewording turns it red while a real regression stays green. Assert a return value, a run's output
   and exit code, what landed on disk, the requests made. Text is the subject only when it is the
   output — a message the program prints, a file it generates.
4. **No test touches the real network.** A service is a fake `fetch` or a fake port. A test that
   passes only while Crossref or DBLP answers is not a test of this package.
5. **Coverage is 100% on lines, statements, functions and branches**, enforced by `npm run coverage`
   in `npm run check` and CI. c8 reads `NODE_V8_COVERAGE`, so a CLI a test spawns is measured too,
   unless the test hands the child a fresh `env` without it. vitest runs in the `threads` pool with
   native `import` (`vitest.config.ts` says why), and the run preloads `test/coverage-src.ts`, which
   answers every import of `dist/*.js` with `src/*.ts`, so no module is measured twice.
6. **No `c8 ignore`, and no guard deleted to reach 100%.** An effect a test cannot reach — a race, a
   permission root is never denied, a broken install, a 270 MB download — is made injectable and the
   test passes a fake. A precondition about an argument becomes the signature. A guard whose input can
   really occur stays, with the test that reaches it. `scripts/coverage-config.test.ts` fails on any
   coverage-ignore comment and pins `.c8rc.json`'s `exclude` list.
7. **Say what an assertion guards** in a comment directly above it (`// Guards: …`).
