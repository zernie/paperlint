// Compiled to CLAUDE.md by `npx vigiles compile CLAUDE.md.spec.ts`. Edit THIS file, never the
// markdown: `vigiles lint` fails on a CLAUDE.md whose bytes no longer match its stamp.
//
// The root file loads on every turn, so it holds only what applies to any change here. A rule for
// one kind of work is in the nested CLAUDE.md of its folder, each compiled from its own spec.
import {
  cmd,
  enforce,
  file,
  guidance,
  instructionFile,
  prose,
} from "vigiles/spec";

export default instructionFile({
  target: ["CLAUDE.md", "AGENTS.md"],
  sections: {
    paperlint: prose`Machine-checkable gates for writing a research paper in git, extracted from a private knowledge base.

This file loads on every turn, so it holds only what applies to **any** change here. A rule that applies to one kind of work lives in that folder's \`CLAUDE.md\`, which loads when a file there is read or edited (table below); a fact a machine checks lives beside that check. Every \`CLAUDE.md\` here is compiled from the \`CLAUDE.md.spec.ts\` beside it: edit the spec, then ${cmd("npx vigiles compile")}. What broke is in ${file("docs/incidents.md")}; the measurements behind the rules are in [git](https://github.com/zernie/paperlint/blob/b4a3dc3a81d436186f41db2d69b65fd93f1af3b6/CLAUDE.md#L62-L199).`,

    "🎯 THE GOAL, in one sentence": prose`**Move every paper-writing convention a machine can decide OUT of prose and INTO an engine that fails the build** — and keep everything else honestly labelled as prose. The engine is ESLint. The unit of progress is "one more verdict decided by the engine instead of by a hand-written script".

\`\`\`
 prose in a guideline   →   hand-written script   →   ESLint rule in the engine
 rots silently              runs, but is OURS         editor-time · free AST · suppressible
\`\`\`

🔴 **A hand-written script is a WAYPOINT, not a destination.** A new one is allowed only when the engine genuinely cannot express the check, and "cannot" means MEASURED. A rule is an ordinary JS module and may call \`execFileSync("git", …)\` or read a sibling file. When the work has to run a program, **a script PRODUCES facts into a JSON file, and ESLint JUDGES that file.**

**A real consumer dogfoods this package on every CI run**, so a breaking change here turns a paper pipeline red somewhere else the same day. CI runs on every pull request (${file(".github/workflows/ci.yml")}). Counts of rules, skills and hooks: measure with \`git ls-files\`.`,

    "First command in a fresh container": prose`${cmd("npm install")} — not optional: \`vigiles\` is a real dependency, and every harness, spec and hook resolves through it. Without it, failures look like broken code rather than a missing install.`,

    "Claude Code and Codex": prose`Keep the repository instructions and maintainer skills available in both tools. This spec builds both \`CLAUDE.md\` and \`AGENTS.md\`. Use the table below for folder-specific instructions.

Claude Code loads \`add-venue\` from \`.claude/skills/\` and Codex loads it from \`.agents/skills/\`. Edit ${file(".claude/skills/add-venue/SKILL.md.spec.ts")} and run ${cmd("npx vigiles compile .claude/skills/add-venue/SKILL.md.spec.ts")} followed by ${cmd("npm run sync:skills")} to regenerate both copies. The sync command uses Rulesync and needs Node 22.22 or later. Commit the generated Markdown with the spec. CI checks the Codex copy during ${cmd("npm run fmt:check")}.`,

    "Where the other rules live": prose`| when you are… | read | holds |
| --- | --- | --- |
| writing a lint rule, or a check that judges prose | [\`eslint-rules/CLAUDE.md\`](eslint-rules/CLAUDE.md) | lint rule over script, what holds each requirement of a new rule, the five writing principles |
| writing or changing a hook | [\`hooks/CLAUDE.md\`](hooks/CLAUDE.md) | how hooks ship, and what was rejected |
| writing or changing a skill | [\`skills/CLAUDE.md\`](skills/CLAUDE.md) | how skills ship |
| in \`src/\` | [\`src/CLAUDE.md\`](src/CLAUDE.md) | the two layer axes |
| thinking of a Claude Code plugin | [\`plugin/CLAUDE.md\`](plugin/CLAUDE.md) | why there is none, and what must be measured to bring it back |
| working on the website, paperlint.dev | [\`site/CLAUDE.md\`](site/CLAUDE.md) | the design the author chose, and what the page may claim |
| changing CI, Dependabot or the release | [\`.github/CLAUDE.md\`](.github/CLAUDE.md) | cost, Dependabot cadence, release from the PR title |
| writing a test | [\`docs/testing.md\`](docs/testing.md), [\`docs/e2e.md\`](docs/e2e.md) | which kind of test, fakes, the e2e triggers |`,

    "Before leaving draft and before merge": prose`While drafting, run ${cmd("npm run test:changed")} and ${cmd("npm run lint")}, and push \`wip:\` commits to the draft. ${cmd("npm run test:changed")} runs only the tests that import what the branch changed (109 s, measured; a change to \`package.json\` or the vitest config runs them all, 159 s with the report), then prints the changed files that are not at 100% coverage, with their uncovered lines: read it before leaving draft. It is a report, not a gate, because some lines are reached only by the harnesses or e2e suites it does not run (${file("scripts/test.ts")}). Leave draft once both pass and any review asked for on the draft (a Codex review, for one) has nothing left to fix: leaving draft starts CI, every later push to the ready PR runs it again, and every gate of ${cmd("npm run check")} has a CI job (${file("scripts/check.harness.ts")}), so CI is the gate. On red CI, fix it on the branch and push; merge on green CI at the current head. Run ${cmd("npm run check")} locally to debug one gate, or when ${file("scripts/check.ts")} itself changes (2026-11-08: 11 full local runs, ~127 min, each followed by a CI run that repeated it). ${cmd("npm run lint")} caches (\`node_modules/.cache/eslint/\`, 45 s → 3 s warm): a cached file is not re-judged when only a file it reads or imports changed (a preset, the build facts, an imported type), so a result that looks stale is checked with \`rm -rf node_modules/.cache/eslint\`; CI starts without the cache. Red first · assert the whole value · no test touches the real network · 100% coverage, no \`c8 ignore\`. In a container without TeX Live, only the TeX e2e gate fails, and it says so; \`npx paperlint toolchain\` installs it.`,

    Commits: prose`Conventional-commit subject, body says what was MEASURED, not what was intended. A number in a commit message that no command produced is the thing this repo exists to make impossible.

**The subject is also the release**: semantic-release reads the squash commit, which is the PR title. \`feat:\` → minor, \`fix:\` or \`perf:\` → patch, \`!\` or a \`BREAKING CHANGE:\` footer → major,
\`docs:\` \`chore:\` \`ci:\` \`test:\` \`refactor:\` → no release. ${file(".github/workflows/pr-title.yml")} rejects a title without a conventional prefix.`,
  },

  rules: {
    "mechanism-goes-to-vigiles": guidance(
      "A file that names nothing local — no rule or fixture of ours — is machinery, and belongs in [vigiles](https://github.com/zernie/vigiles); data stays here.",
    ),
    "measure-before-calling-it-impossible": guidance(
      `"It can't be done in the engine" must be MEASURED, not assumed. Each of these was stated confidently on 2026-09-16 and fell to a single command:

| the claim | what one command showed |
| --- | --- |
| "a lint rule can't know a git date, so this stays a script" | a rule is plain JS; \`execFileSync("git", …)\` is legal in it, and its real costs are solvable |
| "we need our own glob expander" | \`fs.globSync\` ships in Node 22 and returned the identical set |
| "the tool can't run a file that config excludes" | it can, and says so: \`matches exclude … — running because you named it\` |

Before writing machinery, **run the thing you are about to replace and paste its output.**`,
    ),
    "do-not-describe-what-you-have-not-opened": guidance(
      "Every factual claim in a document meant for strangers is checked against the disk in the same pass that writes it.",
    ),
    "no-glob-or-regex-in-a-block-comment": guidance(
      "🔴 An asterisk followed by a slash ends the comment wherever it appears. In a block comment, prose describes the pattern and never quotes it; exact characters go in code or a line comment.",
    ),
    "measure-the-defect-before-the-fix": guidance(
      'Read "this is quick" as a warning. Show the defect (output, or a quoted line), name the layer and channel (more than one is a conversation, not a commit), and spend an adversarial pass on forks and on anything that goes outward.',
    ),
    "show-a-checks-whole-flow": guidance(
      "When a change adds or changes a gate (a plan field, a lint rule, a result check), show the author the whole flow in English as a diagram before building it: each stage, who writes it, which rule checks it, when it fires, what turns red, and what the machine cannot see. The author asked for this format (2026-11-01).",
    ),
    "split-a-pull-request-over-1000-lines": guidance(
      "A pull request stays at most about 1000 changed lines (`git diff --shortstat origin/main`, tests and docs included), so the author can skim all of it. A feature asked for while a PR is open goes in a new PR, not into the open one. Larger work is split into PRs that each stand on their own. The author asked for this after a 7000-line PR (2026-11-01).",
    ),
    "keep-the-loop-short-and-known": guidance(
      "The time from a change to its merge is a cost the author pays; keep it measured and shrinking. (1) Before starting, write the loop's estimate in minutes: edit, the fast tests, CI, the author's answer. (2) Answer each question with the cheapest check that settles it: one test file, then `npm run test:changed`, then CI. (3) Give every wait its wake-up: run the job in the background so it reports back, or set a check-in for when it should be done. (4) While a job runs, do the next piece of work: in a second git worktree, or the design of the next pull request. (5) At the end, put the estimate beside the clock, name the step that took longest, and propose one change that shortens it next time. Measured 2026-11-08: 11.4 h for five pull requests, ~3.5 h of it waiting on CI runs that had already finished.",
    ),
    "installing-paperlint-is-smooth": guidance(
      "The target is one command, `npx paperlint init`; any further manual step is a paperlint defect, except a choice that really belongs to the user, named when it is asked. An automatic step that can fail silently is worse than an explicit one.",
    ),
    "the-default-set-is-what-the-venue-decides": guidance(
      "paperlint is built for working scientists, so what is on by default must be very reliable. A check ships on by default only when the venue's own text decides it (page limit, template, anonymity, required sections, dates), when a desk reject or a broken build does (an undefined reference, a missing citation, a forbidden font), or when it holds for every paper whatever the venue (a universal fact, not a taste). Everything that flags the writing is opt-in: writing-preference rules (length caps, density, structure, register, style proxies), the skills and the hooks, and anything a careful author could dispute; its docs page says opt-in. A real author who installs paperlint should get no default finding they could reasonably disagree with. A rule moves into the default set only with evidence that a venue requires it, that it causes desk rejects, or that it holds for every paper. The same holds for what `paperlint init` installs: the build, the venue presets and the default-set rules, nothing opinionated; skills and hooks only on request (#510). The first named set, `paperlint:writing`, turns the writing rules on in one line (`src/rule-sets.ts`, `docs/optional-rules.md`); more sets, like ESLint's `recommended` and `strict`, are planned (#524). The author decided this on 2026-11-17, after a length cap set to error on a consumer paper forced its abstract into compression, and widened it on 2026-11-19.",
    ),
    "an-optional-tool-stays-out-of-the-way": guidance(
      'Everything opt-in (a rule off by default, a set, a command that wraps an outside service, a skill, a hook) is judged by how little it costs an author who does not use it, and one who does it their own way. Off means silent: no finding, no notice, no prompt. Turned on and missing what it needs, it says so once, naming the one command or setting that answers it. It works with the author\'s own tool: a wrapper (an upload, a portal) writes the same documented file the author could write by hand or by script, and the rule reads that file, not the wrapper. Lint never calls the network. Nothing opt-in fails a build or blocks a submission; it warns. The author asked for this on 2026-11-21: "good DX, as long as it stays optional" and "not being annoying".',
    ),
    "the-linter-is-the-core": guidance(
      "paperlint is one instrument, and its lint rules are the core: deterministic, checked on every build. Skills and hooks are opt-in and less reliable, so they sit on top of the linter and never compete with it. Where a lint rule decides something (a count, a threshold, a required section), a skill or hook names the rule id and does not restate its number, apply a different one, or tell the author to do the opposite; a hook never changes what `paperlint lint` reports. A skill or hook that duplicates or contradicts a rule is a defect in the skill or hook, never in the rule. The author decided this on 2026-11-19.",
    ),
    "skills-only-shrink": guidance(
      "Deterministic checks beat judgement, so the LLM layer only shrinks: fewer skills, fewer hooks, shorter skills. Every instruction in a skill moves down this ladder as far as it can go: (1) a lint rule, when the engine can decide it; (2) a tested script (a file in the skill's `scripts/` with tests of both halves) whose output the skill reads, when it needs a program but no reader; (3) the skill's own text, only for a judgement a reader must make. History, rationale and examples go to `docs/`, not into the skill. A pull request that adds a skill or grows one names each instruction that stayed on rung 3 and why it cannot go lower; \"it is easier as prose\" is not a reason. The author decided this on 2026-11-19, after an audit measured the 29 skills at about 7% mechanical words, 46% procedure and 22% history.",
    ),
    "every-check-has-both-halves": guidance(
      "Every check — lint rule, script, hook, harness — fires on a planted defect AND stays quiet on a clean fixture, and the test goes red before the fix lands. A check only ever seen quiet is indistinguishable from a dead one.",
      { details: file("docs/testing.md") },
    ),
    "never-the-callers-cwd": guidance(
      "No program this package ships (`bin/`, `lib/`, hooks, skill scripts) depends on the directory it is started from: resolve from `git rev-parse --show-toplevel` or from the module's own location.",
    ),
    "one-module-knows-where-paperlint-is-installed": guidance(
      "Lint rules, skills, hooks and scripts never compute where paperlint is installed: the package's own data comes from `src/package-dirs.ts`, the consumer's side from `skills/paper-pipeline/scripts/consumer.mjs`. `port/js-install-path` and `port/md-install-path` flag a literal.",
      { details: file("eslint-rules/install-path-literals.ts") },
    ),
    "prior-art-before-a-command-or-a-channel": guidance(
      'Before adding a CLI command or changing a delivery channel (skill links, hook wiring, the composite action, the npm package), read how comparable tools did it. "We need another command for X" has, in every tool examined, been the CONFIG not declaring something.',
      { details: file("docs/prior-art/README.md") },
    ),
    "browser-tests-find-by-data-test": enforce(
      "eslint/playwright/no-raw-locators",
      "A browser test finds an element only by `getByTestId` on `data-test`, and reads its values from the JSON in `data-test-meta`, never from CSS classes or visible text; content text is compared with the fixture's value. The older browser tests sit in `eslint-suppressions.json`, which may only shrink.",
      { details: file("docs/testing.md") },
    ),
    "new-code-is-functional": enforce(
      "eslint/functional/no-let",
      "In `src/`, `eslint-rules/` and `lib/`, tests and harnesses aside: no `let`, no mutation, no loop, read-only types; collections through [Remeda](https://remedajs.com/). `functional/immutable-data`, `functional/no-loop-statements` and `functional/prefer-immutable-types` hold the rest, and `eslint-suppressions.json` (old code) may only shrink.",
    ),
  },
});
