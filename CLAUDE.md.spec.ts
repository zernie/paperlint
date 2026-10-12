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

    "Where the other rules live": prose`| when you are… | read | holds |
| --- | --- | --- |
| writing a lint rule, or a check that judges prose | [\`eslint-rules/CLAUDE.md\`](eslint-rules/CLAUDE.md) | lint rule over script, what holds each requirement of a new rule, the five writing principles |
| writing or changing a hook | [\`hooks/CLAUDE.md\`](hooks/CLAUDE.md) | how hooks ship, and what was rejected |
| writing or changing a skill | [\`skills/CLAUDE.md\`](skills/CLAUDE.md) | how skills ship |
| in \`src/\` | [\`src/CLAUDE.md\`](src/CLAUDE.md) | the two layer axes |
| thinking of a Claude Code plugin | [\`plugin/CLAUDE.md\`](plugin/CLAUDE.md) | why there is none, and what must be measured to bring it back |
| changing CI, Dependabot or the release | [\`.github/CLAUDE.md\`](.github/CLAUDE.md) | cost, Dependabot cadence, release from the PR title |
| writing a test | [\`docs/testing.md\`](docs/testing.md), [\`docs/e2e.md\`](docs/e2e.md) | which kind of test, fakes, the e2e triggers |`,

    "Before every push": prose`${cmd("npm run check")}, exit code read without a pipe. Red first · assert the whole value · no test touches the real network · 100% coverage, no \`c8 ignore\`. In a container without TeX Live, only the TeX e2e gate fails, and it says so; \`npx paperlint toolchain\` installs it.`,

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
    "installing-paperlint-is-smooth": guidance(
      "The target is `npm i` plus one command; any further manual step is a paperlint defect, except a choice that really belongs to the user, named when it is asked. An automatic step that can fail silently is worse than an explicit one.",
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
    "new-code-is-functional": enforce(
      "eslint/functional/no-let",
      "In `src/`, `eslint-rules/` and `lib/`, tests and harnesses aside: no `let`, no mutation, no loop, read-only types; collections through [Remeda](https://remedajs.com/). `functional/immutable-data`, `functional/no-loop-statements` and `functional/prefer-immutable-types` hold the rest, and `eslint-suppressions.json` (old code) may only shrink.",
    ),
  },
});
