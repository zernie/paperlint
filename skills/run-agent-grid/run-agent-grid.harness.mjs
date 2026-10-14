/**
 * run-agent-grid — the agent-facing tier. Does an agent that loads this skill get a guard it can
 * actually call, at the path the skill names, with the result the skill promises?
 *
 * Runs the REAL `claude` CLI against a SCRIPTED MOCK MODEL (`runHarnessTest`): $0, no API key.
 * The script: activate the skill, then — through the Bash tool, as an agent following §5 would —
 * take the lock on a working-copy root, have a second driver refused while the first holds it,
 * and release it. The commands use the skill directory as `${CLAUDE_SKILL_DIR}` resolves for a
 * consumer: the skill's link under `.claude/skills/`.
 *
 * Also, without the CLI: the shared per-skill checks (`checkSkill`), and every guard command the
 * skill and its references instruct names a subcommand the guard knows — a renamed subcommand
 * would otherwise leave the skill instructing a command that only prints usage.
 *
 * What it does NOT prove: that a real model follows the order of the gates. That is a
 * probabilistic question for `run-agent-grid.eval.mjs` and a real grid.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runHarnessTest, skip } from "vigiles";
import { createChecker } from "../../lib/check.ts";
import { checkSkill } from "../../lib/skill-checks.mjs";
import { observeAgentCli } from "#lib/agent-cli-version";

const HERE = dirname(fileURLToPath(import.meta.url));
const check = createChecker();
const GUARD = join(HERE, "scripts", "grid-guard.mjs");

await checkSkill("run-agent-grid");

// ── 1. Every instructed guard command names a subcommand the guard knows ─────────────────────
const texts = ["SKILL.md", "references/registry-and-ledger.md"].map((f) =>
  readFileSync(join(HERE, f), "utf8"),
);
const instructed = [
  ...new Set(
    texts.flatMap((t) =>
      [...t.matchAll(/grid-guard\.mjs (\S+)/g)].map((m) => m[1]),
    ),
  ),
].filter((s) => /^[a-z-]+$/.test(s));
check(
  "the skill instructs the guard's commands",
  instructed.length >= 6,
  `found ${JSON.stringify(instructed)}`,
);
for (const sub of instructed) {
  const r = spawnSync(process.execPath, [GUARD, sub, "--owner", "x"], {
    encoding: "utf8",
  });
  // An unknown subcommand prints the usage line alone; a known one gets past the dispatch.
  check(
    `guard knows "${sub}"`,
    !/^grid-guard: usage:/.test(r.stderr),
    r.stderr.slice(0, 200),
  );
}

// ── 2. Through the real CLI: the lock, as the skill tells an agent to take it ────────────────
const REPO = (() => {
  for (let dir = HERE; ; dir = dirname(dir)) {
    if (existsSync(resolve(dir, ".claude"))) return dir;
    if (dirname(dir) === dir)
      throw new Error(`no root with a .claude directory above ${HERE}`);
  }
})();
const SKILL_LINK = join(REPO, ".claude", "skills", "run-agent-grid");
const cli = observeAgentCli({ spawnSync });
if (!cli.present) skip(`run-agent-grid effects: ${cli.note}`);

const g = `node ${SKILL_LINK}/scripts/grid-guard.mjs`;
// The holder's pid is this harness: alive for the whole run, so the second driver must be refused.
const LOCK = `${g} lock wc --owner driver-a --pid ${String(process.pid)}`;
const r = await runHarnessTest({
  pluginDir: join(REPO, ".claude"),
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
    { tool: "Bash", input: { command: `${g} lock wc --owner driver-b` } },
    { tool: "Bash", input: { command: `${g} release wc --owner driver-a` } },
    { text: "done" },
  ],
});

try {
  const calls = r.toolCalls;
  const activation = calls.find((c) => c.name === "Skill");
  check(
    "the skill activated",
    Boolean(activation) && !activation.isError,
    activation ? activation.resultText : "no Skill call",
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
  const bash = calls.filter((c) => c.name === "Bash");
  const [take, second, give] = bash;
  check("three Bash calls ran", bash.length === 3, String(bash.length));
  check(
    "the first driver takes the lock",
    Boolean(take) &&
      !take.isError &&
      /locked \S+wc\.lock for driver-a/.test(take.resultText),
    take ? take.resultText.slice(0, 300) : "",
  );
  check(
    "a second driver is refused while the first lives",
    Boolean(second) &&
      second.isError &&
      /wc\.lock is held by driver-a/.test(second.resultText),
    second ? second.resultText.slice(0, 300) : "",
  );
  check(
    "the owner releases it",
    Boolean(give) &&
      !give.isError &&
      /released \S+wc\.lock/.test(give.resultText),
    give ? give.resultText.slice(0, 300) : "",
  );
  console.log(
    `✓ run-agent-grid [effects]: skill activated; lock taken, second driver refused, released.\n  CLI: ${cli.note}`,
  );
} finally {
  r.cleanup();
}
