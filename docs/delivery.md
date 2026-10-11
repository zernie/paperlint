# Delivery — how this repo's contents reach a consumer

Moved verbatim from `CLAUDE.md` on 2026-10-11: the root file keeps the conclusions, this file keeps the
measurements behind them.

> ⚠️ **Outdated on 2026-10-11, kept as the record:** `vigiles` is now a regular `dependency` in
> `package.json` (no `peerDependencies`, not a devDependency), and `.github/dependabot.yml` runs
> **monthly**, not daily. The sections on the vigiles pin and on Dependabot below describe the state
> when they were written.

Measured 2026-09-11 unless a section says otherwise.

Three channels, each measured on a fixture rather than assumed. The consumer here is the
private knowledge base this was extracted from; nothing below is specific to it.

## Skills ship as `skills/`, and the consumer SYMLINKS them

**Do not move skills to `.claude/skills/` inside this repo.** They live in `skills/`
(`SHIPPED_SKILLS_DIR` in `skills/paper-pipeline/scripts/consumer.mjs`, read by the linker and the
install e2e), which is the standard layout. An ecosystem scan of 855 npm packages (by published
tarball, not repository) found **336 shipping `skills/<n>/SKILL.md` against 15 shipping `.claude/skills/`** — 22 : 1. The
top of the market is entirely on `skills/`: `@vitejs/devtools-kit` (330 896 downloads/wk),
`@slidev/cli` (56 809), `anthropics/skills` (175 673 stars).

**The consumer's side is a symlink per skill, made by `paperlint init` (`src/link-skills.ts`):**

```
<consumer>/.claude/skills/<name>  ->  node_modules/paperlint/skills/<name>
```

⚠️ The skill's name in the listing comes from the **link directory's name**, not from
`name:` in the frontmatter — so the link must be named exactly as the skill.

⚠️ Do NOT rely on a consumer picking `.claude/skills/` up out of `node_modules` on its own.
It does happen — such a directory is an ordinary nested one — but only **lazily and
silently**, the first time the agent happens to read a file inside that package. A symlink
loads at startup, deterministically. Measured both ways on claude 2.1.268.

## Hooks ship as `.mjs`, NEVER as `.hook.ts`

Measured on a fixture — one hook, four locations, both halves (an input that must be denied
and one that must pass), exit code taken without a pipe:

| hook location                                         | deny input              | allow input                 |
| ----------------------------------------------------- | ----------------------- | --------------------------- |
| `node_modules/<pkg>/.claude/hooks/probe.hook.**mjs**` | RC=2, fires             | RC=0, silent                |
| symlink into `node_modules`, `.mjs`                   | RC=2, fires             | RC=0, silent                |
| local control, `.mjs`                                 | RC=2, fires             | RC=0, silent                |
| `node_modules/<pkg>/.claude/hooks/probe.hook.**ts**`  | RC=2 `cannot be loaded` | **RC=2 `cannot be loaded`** |

The last row is not "it blocks the dangerous thing" — it fails to load and therefore blocks
**everything**, including `echo hi`. A consumer in that state cannot run any Bash command,
and the one command that would repair it is also Bash.

⇒ **The package ships `.mjs`** — the consumer gets something that loads.

(Not established: _why_ the TypeScript loader refuses a path inside `node_modules`. The real
cause is swallowed by a `catch` in vigiles' `hook-runtime.js`, and calling `loadHookProgram`
directly measures a different load path — it fails even on the control. Knowing _that_ is
enough to choose the carrier.)

### 🔴 CORRECTED 2026-09-12, when the first three hooks actually moved: THERE IS NO `.hook.ts` TWIN

This section used to promise «the `.hook.ts` source lives HERE and is typechecked HERE; the
package ships the compiled `.mjs`». Shipping the first three hooks retired that plan, and the
reason is worth keeping: **a twin can drift from its build, and nothing would notice.** One file
cannot.

What the twin was for was the CAPABILITY CHECK — `vigiles compile` refuses a hook that imports
anything but `vigiles/hook`, because the import list _is_ the capability surface. That check is a
function, `checkHookImports`, and `hooks/hooks.harness.ts` runs it over every shipped
`.hook.mjs` directly. Same check, applied to the artifact that actually executes, with no second
file to keep in step. What is lost is `tsc` on the hook body and the typed `e.ctx` — named here
rather than left as an omission.

⚠️ **`checkHookImports` IS A TEXT REGEX, so it counts an import-shaped sentence in a COMMENT.**
Measured 2026-09-12: the check failed on `paper-edit-guard.hook.mjs`'s own docblock, which quoted
a rejected import while explaining why it was rejected. Do not loosen the check to make prose
fit — it is the same check any future `compile`/`lint` pass applies to the shipped file. Describe
a forbidden import in words instead of writing one.

### 🔴 AND NOT A THIN SPEC IN THE CONSUMER EITHER — measured, and it is the form that looks right

The obvious alternative is a small `.hook.ts` in the consumer that pulls the decision logic out of
this package. It RUNS — deny input RC=2 with the reason, allow input RC=0 and silent — and it
cannot be maintained:

```
$ npx vigiles compile
✗ .vigiles/hooks/probe.hook.ts — hook program uses capabilities outside `vigiles/hook`:
  <pkg>/hooks/decide.mjs — only the sanctioned API is allowed (capability = API surface).
```

`compile` is also what writes the tamper-evident stamp, so a hook it refuses **can never be
re-stamped** — and the runtime fails CLOSED on a stamp that no longer matches its source:

```
vigiles: hook … does not match its compiled stamp (tampered).
… the way out is a FILE WRITE, not a command — this refusal blocks the recompile too.
```

Measured end to end: editing such a file makes the gate refuse `echo hi`, and the only steady
state is clearing the stamp to `{}` and running permanently unstamped. Shipping the whole program
keeps the stamp question from arising (no sidecar ⇒ no check) and pins the source by lockfile
integrity instead — stronger than a local stamp, since a consumer cannot hand-edit an installed
tree without the next install reverting it.

### How a consumer wires a shipped hook

`.claude/settings.json`, one block per hook, pointing straight into the install — no symlink and
no compile step on the consumer's side:

```json
{
  "type": "command",
  "command": "node \"$CLAUDE_PROJECT_DIR/node_modules/vigiles/dist/cli.js\" hook-runtime run-program \"$CLAUDE_PROJECT_DIR/node_modules/paperlint/hooks/paper-edit-guard.hook.mjs\""
}
```

⚠️ **A shipped hook cannot import a sibling module of this package** — capability closure being
the point — so the papers-root resolver is spelled out in all three hook files. Duplication that
cannot be removed is CHECKED instead: part VII of the harness compares the captured values
against each other, rather than grepping for a literal (a substring search finds the same text in
the prose _about_ the value one line above it).

## `vigiles` is a devDependency, and its pin is TIED to the consumer's

`vigiles/hook` resolves **upward** from a hook inside a package — measured:

```
resolve OK -> <consumer>/node_modules/vigiles/dist/hook.js
```

So this package needs no copy of its own at the consumer's runtime; it needs `vigiles` only
for its own `vigiles test` and `vigiles compile`. That is `devDependencies`, which `npm i` of
a dependency does not install. Putting it in `dependencies` risks npm installing a **second**
copy under `node_modules/paperlint/node_modules/vigiles` whenever the ranges
drift — two runtimes, two sets of stamps and state.

🔴 **THE PARAGRAPH ABOVE WAS TRUE AND THE INSTALL DID THE OPPOSITE — measured 2026-09-17.**
`devDependencies` is not the only entry naming `vigiles`: `peerDependencies` names it too, and
**npm 7+ installs peers automatically**. So every consumer got it anyway, together with its
transitive weight. `npm pack`, then install the tarball into an empty project:

|                                                         | packages | `du -sm node_modules` |
| ------------------------------------------------------- | -------: | --------------------: |
| peer as declared before                                 |      188 |            **142 MB** |
| `peerDependenciesMeta: { vigiles: { optional: true } }` |      164 |             **56 MB** |

The 86 MB are `@ast-grep/napi` (51 MB) and `typescript` (23 MB), pulled through `vigiles` — and
paid for by a consumer who only wants the ESLint rules and never loads a hook.

`optional: true` is the entry that matches what this section already argues: the consumer brings
its own `vigiles` _when it uses the hooks_, and npm stops deciding that for them. Both halves
measured on the 56 MB tree: `eslint-rules/latex-language.mjs` and the skill scripts load and
run (RC=0), while
`hooks/paper-edit-guard.hook.mjs` fails with `ERR_MODULE_NOT_FOUND` — which is this contract
working, not a defect, exactly as argued below.

⚠️ The consumer in this project's own base is unaffected: it declares `vigiles` itself
(`devDependencies: ^27.2.0`), so nothing about its tree changes.

## The `.bib` parser is a dependency: the one bibtex reader

`@retorquere/bibtex-parser` is a `dependency`. It is the one reader of `.bib` text in paperlint
(`src/ports/bib-reader.ts`, adapter `src/adapters/bibtex/`): `recordedBibliography`, `bib/reachable-entry`,
the build's reference check, `extract-ref-facts` and `bib-authors` all read through it, so it can
no longer be opt-in. It costs about 15 MB of the install (9 MB itself, plus
`wink-eng-lite-web-model` and `unicode2latex`).

Where it reads differently from bibtex — bibtex has no comment syntax, so an entry behind `%` or
inside `@comment{…}` is one bibtex typesets — paperlint does not emulate bibtex: the build records
what bibtex read, and `paper/refs-checked` names the difference (docs/design/paper-sources.md §7).

🔴 **Therefore the pin here and the pin in the consumer move TOGETHER, in one pass.** A major
mismatch means a hook compiled by one version is executed by another: the stamp does not
verify, the hook does not load, and `PreToolUse` refuses every command. That already happened
in the consumer on 2026-09-10 (25.1.0 -> 27.1.4) and cost real recovery work.

```bash
npm ls vigiles    # prints `invalid` when what is installed does not satisfy the manifest
```

⚠️ **What that command does NOT tell you, and the boundary matters because the command reads
like a freshness check.** It compares what is INSTALLED against this repo's MANIFEST. It says
nothing about the registry. Measured 2026-09-16: manifest `^27.1.4`, installed `27.1.6`,
published `27.2.0` — exit code **0**, because the range is satisfied. The repo had been one
minor behind for days and every local check was green.

### Dependabot carries the half `npm ls` cannot — and its two delays STACK

That staleness is why `.github/dependabot.yml` exists here. The reasoning is worth keeping
because the obvious objection to a bot in this org is already recorded and does NOT apply:
a bot was switched off in a sibling repository for burning Actions minutes — **that
repository is private**. This one is public, minutes are free, so the objection does not
travel. If this repo is ever made private, revisit the file along with it.

🔴 **A new release does NOT wake the bot.** Two delays add up, and the second one is invisible
until you read the reference:

|                     |    default | what the docs say                                                                       |
| ------------------- | ---------: | --------------------------------------------------------------------------------------- |
| `schedule.interval` |          — | the check runs on the schedule and only on the schedule                                 |
| **`cooldown`**      | **3 days** | _"a new version is not considered for a version update until 3 days after its release"_ |

With the weekly schedule this file shipped with first, the window was **3–10 days**. It is now
`daily`, and `vigiles` is listed in `cooldown.exclude`, so for THIS package the window is one
schedule tick.

**Why `vigiles` and nothing else is exempt:** the cooldown guards against a release that gets
yanked hours later. That is a real risk for a third-party package and an empty one for our own
— we would be the ones yanking it, and we can ship several versions of it in a single day, so
a three-day hold would have the bot proposing the version from the day before yesterday.

🔴 **And the conclusion is bigger than a cadence knob: for our OWN package no bot schedule is
the primary path, because no schedule can outrun same-day releases.** The primary path is the
rule already recorded in the consumer's base — merge a PR in `vigiles`, bump every consumer in
the same pass. The bot is the backstop for the case that actually bit us: the rule named ONE
consumer while there were two, and this repo sat forgotten on `^27.1.4`.

⚠️ **What the file does not control**, recorded because the sibling repo already lost a day to
it: `dependabot.yml` configures _version_ updates only. **Security** updates are a separate
mechanism driven by advisories and a repository SETTING; their cadence cannot be changed from
this file, and deleting the file would not stop them.

Need it now rather than at the next tick: **Insights → Dependency graph → Dependabot → Check
for updates**.
