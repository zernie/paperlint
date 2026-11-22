/**
 * rewrite-unclear — the agent-facing tier. Does an agent that loads this skill get its body, with
 * the four steps and the ten rules, from the link `paperlint init` makes?
 *
 * Runs the REAL `claude` CLI against a SCRIPTED MOCK MODEL (`runHarnessTest`): $0, no API key.
 * The script activates the skill and stops; the check reads what reached the model.
 *
 * What it does NOT prove: that a real model's rewrite is clearer, or that the description fires on
 * an author's complaint. The first is the cold reader inside the skill (step 3); the second is
 * `rewrite-unclear.eval.ts`.
 */
import { spawnSync } from "node:child_process";
import { runHarnessTest, skip } from "vigiles";
import { createChecker } from "../../lib/check.ts";
import { observeAgentCli } from "#lib/agent-cli-version";
import { claudeDir } from "#src/package-dirs";

const check = createChecker();

const cli = observeAgentCli({ spawnSync });
if (!cli.present) skip(`rewrite-unclear effects: ${cli.note}`);

const r = await runHarnessTest({
  pluginDir: claudeDir(),
  // bubblewrap is absent here; the code loaded is this repository's own `.claude`.
  sandbox: false,
  transcript: true,
  timeoutMs: 120_000,
  prompt: "this paragraph in the intro is unclear, make it simpler",
  allowedTools: ["Skill"],
  files: {
    "paper/paper.tex":
      "\\section{Introduction}\nThe cache is not the slow part; the parse is.\n",
  },
  model: [
    { tool: "Skill", input: { skill: "rewrite-unclear" } },
    { text: "done" },
  ],
});

try {
  const activation = r.toolCalls.find((c) => c.name === "Skill");
  check(
    "the skill activated",
    activation !== undefined && !activation.isError,
    activation ? activation.resultText.slice(0, 400) : "never called",
  );
  const reached = r.modelRequests
    .map((q) => [q.system, ...q.messages.map((m) => m.text)].join("\n"))
    .join("\n");
  check(
    "the skill body reached the model: the four steps and the ten rules",
    [
      "A cold reader restates it",
      "Say the claim directly",
      "The plain word over a description of it",
    ].every((s) => reached.includes(s)),
    `${String(r.modelRequests.length)} requests`,
  );
  console.log(
    `✓ rewrite-unclear [effects]: skill activated; its body reached the model.\n  CLI: ${cli.note}`,
  );
} finally {
  r.cleanup();
}
