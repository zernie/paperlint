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

## Commits

Conventional-commit subject, body says what was MEASURED, not what was intended. A number in
a commit message that no command produced is the thing this repo exists to make impossible.
