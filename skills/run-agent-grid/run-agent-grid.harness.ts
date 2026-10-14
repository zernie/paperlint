/**
 * run-agent-grid — the agent-facing tier. Does an agent that loads this skill get a guard it can
 * actually call, at the path the skill names, with the result the skill promises?
 *
 * Runs the REAL `claude` CLI against a SCRIPTED MOCK MODEL (`runHarnessTest`): $0, no API key.
 * The script: activate the skill, then — through the Bash tool, as an agent following §5 would —
 * take the lock on a working-copy root, have a second driver refused while the first holds it,
 * and release it. The commands use the skill directory as `${CLAUDE_SKILL_DIR}` resolves for a
 * consumer: the skill's link under `.claude/skills/`, and the COMPILED `grid-guard.js` there,
 * which is what runs from `node_modules` (`npm run build` makes it; `npm run check` builds first).
 *
 * Also, without the CLI: the shared per-skill checks (`checkSkill`). Whether the skill names only
 * subcommands the guard has is not tested here: the spec interpolates them from
 * `scripts/grid-guard-commands.ts`, so a wrong one fails `tsc`.
 *
 * What it does NOT prove: that a real model follows the order of the gates. That is a
 * probabilistic question for `run-agent-grid.eval.ts` and a real grid.
 */
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { runHarnessTest, skip, type ToolCall } from "vigiles";
import { createChecker } from "../../lib/check.ts";
import { checkSkill } from "../../lib/skill-checks.mjs";
import { observeAgentCli } from "#lib/agent-cli-version";
import { claudeDir } from "#src/package-dirs";
import { COMMANDS } from "./scripts/grid-guard-commands.ts";

const check = createChecker();

await checkSkill("run-agent-grid");

// ── Through the real CLI: the lock, as the skill tells an agent to take it ────────────────
const SKILL_LINK = join(claudeDir(), "skills", "run-agent-grid");
const cli = observeAgentCli({ spawnSync });
if (!cli.present) skip(`run-agent-grid effects: ${cli.note}`);

const g = `node ${SKILL_LINK}/scripts/grid-guard.js`;
// The holder's pid is this harness: alive for the whole run, so the second driver must be refused.
// `--attached`: a Bash call of an agent session is not a detached driver, and this run is short —
// the detachment refusal itself is pinned in `scripts/grid-guard.test.ts`.
const LOCK = `${g} ${COMMANDS.lock} wc --owner driver-a --pid ${String(process.pid)} --attached`;
const r = await runHarnessTest({
  pluginDir: claudeDir(),
  // bubblewrap is absent here; the code loaded is this repository's own `.claude`.
  sandbox: false,
  transcript: true,
  timeoutMs: 180_000,
  prompt:
    "we are about to start the paid grid — take the lock on the working copy",
  allowedTools: ["Skill", "Bash"],
  files: { "README.md": "grid working directory\n" },
  model: [
    { tool: "Skill", input: { skill: "run-agent-grid" } },
    { tool: "Bash", input: { command: LOCK } },
    {
      tool: "Bash",
      input: {
        command: `${g} ${COMMANDS.lock} wc --owner driver-b --attached`,
      },
    },
    {
      tool: "Bash",
      input: { command: `${g} ${COMMANDS.release} wc --owner driver-a` },
    },
    { text: "done" },
  ],
});

/** Did this call run, with this error flag, and print what `re` matches? */
const ran = (c: ToolCall | undefined, isError: boolean, re: RegExp): boolean =>
  c !== undefined && c.isError === isError && re.test(c.resultText);
const shown = (c: ToolCall | undefined): string =>
  c ? c.resultText.slice(0, 300) : "never called";

try {
  const activation = r.toolCalls.find((c) => c.name === "Skill");
  check(
    "the skill activated",
    activation !== undefined && !activation.isError,
    shown(activation),
  );
  const reached = r.modelRequests
    .map((q) => [q.system, ...q.messages.map((m) => m.text)].join("\n"))
    .join("\n");
  check(
    "the skill body reached the model",
    reached.includes(
      "The order — each gate is passed before the next phase starts",
    ),
    `${String(r.modelRequests.length)} requests`,
  );
  const bash = r.toolCalls.filter((c) => c.name === "Bash");
  const [take, second, give] = bash;
  check("three Bash calls ran", bash.length === 3, String(bash.length));
  check(
    "the first driver takes the lock",
    ran(take, false, /locked \S+wc\.lock for driver-a/),
    shown(take),
  );
  check(
    "a second driver is refused while the first lives",
    ran(second, true, /wc\.lock is held by driver-a/),
    shown(second),
  );
  check(
    "the owner releases it",
    ran(give, false, /released \S+wc\.lock/),
    shown(give),
  );
  console.log(
    `✓ run-agent-grid [effects]: skill activated; lock taken, second driver refused, released.\n  CLI: ${cli.note}`,
  );
} finally {
  r.cleanup();
}
