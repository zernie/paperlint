# CLAUDE.md — research-paper-pipeline

Machine-checkable gates for writing a research paper in git. Extracted from a private
knowledge base; **nothing has been extracted yet** — see `README.md` for what this is meant
to become and `idei/paper-pipeline-extraction/05-plan-perenosa-2026-09-10.md` in that base
for the staged plan.

## First command in a fresh container

```bash
npm install
```

Not optional and not "when something breaks": `vigiles` is a real dependency, and every
harness, spec and hook resolves through it. A container where `npm install` never ran fails
in ways that look like broken code rather than a missing install.

## The four rules that decide what may live here

**1. Mechanism goes to vigiles, data stays here.** A file that names nothing local — no rule
of ours, no fixture of ours — is machinery, and machinery belongs in
[vigiles](https://github.com/zernie/vigiles). Ask it in two steps: is this mechanism or data?
If mechanism — does it know about *this* domain? If not, it is not ours.

**2. A check over an AST is a LINT RULE, not a script.** If it walks `.ts`/`.js`/`.tex` and
looks at declarations, names or nodes, write an ESLint rule: it fires in the editor on save,
gets the AST for free, and has a suppression syntax people already know. Scripts are for
corpus-wide questions — index connectivity, ratios across many files — not for one file's
nodes.

**3. Every check needs BOTH halves, or it is not tested.** It must FIRE on a planted defect
and stay QUIET on a clean fixture. A check that has only been seen quiet is
indistinguishable from a dead one — silence is its success state. Prove the fire half with a
mutation, and assert the patch actually landed before trusting a green run.

**4. `exit 0` with empty output is NOT "clean".** A rule whose glob matched no files reports
exactly like a rule that passed. Any rule shipped here must be loud when its input set is
empty. This is the specific defect that blocks stage 1 of the plan: in the source base a
fresh clone yields RC=0, 652 findings, zero errors — because 19 rules saw no files at all.

## Distribution — no `smh init`, and that is a measured decision (2026-09-10)

Considered: a `research-paper-pipeline init` command that installs the ESLint config and the
Claude plugin in one shot, the way `vigiles init` does. **Rejected for now**, and the reason is
worth keeping so it is not reopened.

**What makes `vigiles init` earn its existence** — read from its own implementation, not guessed:

```
Scanning linters and project files...
  <linter>: <N> rules
✓ Generated .vigiles/generated.d.ts
✓ Generated .vigiles/schema.json (YAML-LSP frontmatter schema)
```

It **generates artifacts by measuring the repo it lands in** — TypeScript types for the rules
*that project* actually has. That is work no template can do, so a command is the only way to do it.

**This repo has nothing of that shape yet.** Five rules, no per-project configuration, nothing to
derive from the host repo. An `init` here would copy files — and copying files is exactly what the
two standard channels already do, for free:

| what ships | standard channel | user's side |
|---|---|---|
| skills | `.claude-plugin/marketplace.json` + `plugin.json` | `/plugin marketplace add <owner>/<repo>` then `/plugin install` |
| ESLint rules | an npm package | `npm i -D <pkg>` + a few lines in `eslint.config.mjs` |

Both are measured, not assumed: `vigiles` and `Imbad0202/academic-research-skills` (47k stars) both
ship `.claude-plugin/marketplace.json`, and ARS advertises install as two commands.

🔴 **The condition that would flip this decision:** the moment something must be *derived* from the
host repo — detecting the venue/format of the paper and enabling the matching rule set, or reading
an existing `.tex` to decide what to check. That is generation by measurement, and it is what a
command is for. Until then, a hand-written `init` is work that npm and the plugin marketplace are
already doing.

## Delivery — how this repo's contents reach a consumer (measured 2026-09-11)

Three channels, each measured on a fixture rather than assumed. The consumer here is the
private knowledge base this was extracted from; nothing below is specific to it.

### Skills ship as `skills/`, and the consumer SYMLINKS them

**Do not move skills to `.claude/skills/` inside this repo.** `plugin.json` points at
`./skills/` and that is the correct, standard layout — `plugins-reference.md` is explicit:

> **Correct structure**: Components must be at the plugin root, not inside `.claude-plugin/`.
> Only `plugin.json` belongs in `.claude-plugin/`.

An ecosystem scan of 855 npm packages (by published tarball, not repository) found
**336 shipping `skills/<n>/SKILL.md` against 15 shipping `.claude/skills/`** — 22 : 1. The
top of the market is entirely on `skills/`: `@vitejs/devtools-kit` (330 896 downloads/wk),
`@slidev/cli` (56 809), `anthropics/skills` (175 673 stars).

🔴 **And the wrong layout fails SILENTLY.** With `skills: "./.claude/skills"` the official
`claude plugin validate` prints `✔ Validation passed` and checks **zero** skills — no
`Validating skill:` line, exit 0 ([claude-code#87004](https://github.com/anthropics/claude-code/issues/87004)).
The same files under `./skills` produce a real finding. That is rule 4 of this file
(`exit 0` with empty output is not "clean") landing in someone else's tool.

**The consumer's side is a symlink per skill:**

```
<consumer>/.claude/skills/<name>  ->  node_modules/research-paper-pipeline/skills/<name>
```

⚠️ The skill's name in the listing comes from the **link directory's name**, not from
`name:` in the frontmatter — so the link must be named exactly as the skill.

⚠️ Do NOT rely on a consumer picking `.claude/skills/` up out of `node_modules` on its own.
It does happen — such a directory is an ordinary nested one — but only **lazily and
silently**, the first time the agent happens to read a file inside that package. A symlink
loads at startup, deterministically. Measured both ways on claude 2.1.268.

### Hooks ship as `.mjs`, NEVER as `.hook.ts`

Measured on a fixture — one hook, four locations, both halves (an input that must be denied
and one that must pass), exit code taken without a pipe:

| hook location | deny input | allow input |
|---|---|---|
| `node_modules/<pkg>/.claude/hooks/probe.hook.**mjs**` | RC=2, fires | RC=0, silent |
| symlink into `node_modules`, `.mjs` | RC=2, fires | RC=0, silent |
| local control, `.mjs` | RC=2, fires | RC=0, silent |
| `node_modules/<pkg>/.claude/hooks/probe.hook.**ts**` | RC=2 `cannot be loaded` | **RC=2 `cannot be loaded`** |

The last row is not "it blocks the dangerous thing" — it fails to load and therefore blocks
**everything**, including `echo hi`. A consumer in that state cannot run any Bash command,
and the one command that would repair it is also Bash.

⇒ **The `.hook.ts` source lives HERE and is typechecked HERE; the package ships the compiled
`.mjs`.** Type safety moves to the producer's side, which is where it belongs; the consumer
gets something that loads.

(Not established: *why* the TypeScript loader refuses a path inside `node_modules`. The real
cause is swallowed by a `catch` in vigiles' `hook-runtime.js`, and calling `loadHookProgram`
directly measures a different load path — it fails even on the control. Knowing *that* is
enough to choose the carrier.)

### `vigiles` is a devDependency, and its pin is TIED to the consumer's

`vigiles/hook` resolves **upward** from a hook inside a package — measured:

```
resolve OK -> <consumer>/node_modules/vigiles/dist/hook.js
```

So this package needs no copy of its own at the consumer's runtime; it needs `vigiles` only
for its own `vigiles test` and `vigiles compile`. That is `devDependencies`, which `npm i` of
a dependency does not install. Putting it in `dependencies` risks npm installing a **second**
copy under `node_modules/research-paper-pipeline/node_modules/vigiles` whenever the ranges
drift — two runtimes, two sets of stamps and state.

🔴 **Therefore the pin here and the pin in the consumer move TOGETHER, in one pass.** A major
mismatch means a hook compiled by one version is executed by another: the stamp does not
verify, the hook does not load, and `PreToolUse` refuses every command. That already happened
in the consumer on 2026-09-10 (25.1.0 -> 27.1.4) and cost real recovery work.

```bash
npm ls vigiles    # prints `invalid` when what is installed does not satisfy the manifest
```

## Cost

This is a **private** repository, so its GitHub Actions minutes come out of the account-wide
3000/month shared with every other private repo. Public repos are free; private ones are not.
Decide the budget **before** the first workflow file, not after the first bill. Until then
there is no CI here, and that is deliberate.

## Testing

```bash
npx vigiles test .          # every harness on disk
npx vigiles test <file>     # one harness
```

Skills, if and when they arrive, are tested **through vigiles** — a colocated
`<skill>.harness.mjs` beside the skill. Not through a bespoke script: a home-grown runner
here once printed confident, byte-identical "clean" verdicts for three different skills that
had never loaded.

## `npm test` is RED until stage 2, deliberately

The script is `vigiles test --min=1`. With no harness on disk yet that exits 1:

```
✗ vigiles test: --min=1 but only 0 test file(s) matched — evals never executed
  (check the paths/globs, or that the run was reached).
```

That is the correct state for a repo whose whole premise is rule 4. Do **not** "fix" it by
dropping `--min`; it goes green the moment the first harness lands.

🔴 **Two ways this command lies if written differently, both measured 2026-09-11:**

| form | what happens | exit |
|---|---|---|
| `vigiles test .` | `.` is read as a FILE — `ERR_UNSUPPORTED_DIR_IMPORT`, uncaught, runner dies | **0** |
| `vigiles test` | `No **/*.harness.{mjs,cjs,js,mts,cts,ts} files found.` | **0** |
| `vigiles test --min=1` | names the empty match and fails | **1** |

The first row is the worse one: the runner crashed with a stack trace and still reported
success. `package.json` shipped `vigiles test .` from the initial scaffold until this was
measured — so the repo's own test command had never once executed a test, and said nothing.

## Commits

Conventional-commit subject, body says what was MEASURED, not what was intended. A number in
a commit message that no command produced is the thing this repo exists to make impossible.
