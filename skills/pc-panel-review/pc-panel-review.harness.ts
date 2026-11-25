/**
 * pc-panel-review — the agent-facing tier. Does an agent that loads this skill get step 0, and does
 * the command step 0 names run from the skill's link and print the revision plan's report?
 *
 * Runs the REAL `claude` CLI against a SCRIPTED MOCK MODEL (`runHarnessTest`): $0, no API key.
 * The script activates the skill, then runs step 0's command through the Bash tool from the link
 * `paperlint init` makes. The command reaches `../paper-pipeline/scripts/revision-plan.js`, the
 * BUNDLED script (`npm run build` makes it), which is what runs from `node_modules` or a plugin
 * copy. A wrong relative path, or a script the bundle leaves out, fails here and in no unit test.
 *
 * What it does NOT prove: that a real model runs step 0 before it reviews, or treats a finding no
 * row covers as a proposal. That is a behaviour eval, not this file.
 */
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { runHarnessTest, skip, type ToolCall } from "vigiles";
import { createChecker } from "../../lib/check.ts";
import { observeAgentCli } from "#lib/agent-cli-version";
import { claudeDir } from "#src/package-dirs";

const check = createChecker();

const LINK = join(claudeDir(), "skills", "pc-panel-review");
const cli = observeAgentCli({ spawnSync });
if (!cli.present) skip(`pc-panel-review effects: ${cli.note}`);

const PLAN = {
  cycle: "langcode-2027",
  written: "2026-11-25",
  bar: { kind: "none", why: "no corpus of this workshop yet" },
  measurement: { kind: "open" },
  remaining: [
    {
      id: "R1",
      what: "a Limitations section",
      from: { kind: "venue" },
      added: "2026-11-25",
      state: "by-rule",
      rule: "tex/required-section",
    },
    {
      id: "R2",
      what: "shorten the introduction",
      from: { kind: "author" },
      added: "2026-11-25",
      state: "todo",
    },
  ],
};
const SETTINGS = {
  cycles: [
    {
      id: "langcode-2027",
      venue: { kind: "preset", extends: "paperlint:langcode-2027" },
      opened: "2026-11-01",
      deadlines: [],
    },
  ],
};

const r = await runHarnessTest({
  pluginDir: claudeDir(),
  // bubblewrap is absent here; the code loaded is this repository's own `.claude`.
  sandbox: false,
  transcript: true,
  timeoutMs: 180_000,
  prompt: "run a PC panel review of the paper in paper/",
  allowedTools: ["Skill", "Bash"],
  files: {
    "paper/paper.tex": "\\section{Introduction}\nText.\n",
    "paper/paperlint.json": JSON.stringify(SETTINGS),
    "paper/revision-plan.json": JSON.stringify(PLAN),
  },
  model: [
    { tool: "Skill", input: { skill: "pc-panel-review" } },
    {
      tool: "Bash",
      input: {
        command: `node ${LINK}/../paper-pipeline/scripts/revision-plan.js paper`,
      },
    },
    { text: "done" },
  ],
});

const shown = (c: ToolCall | undefined): string =>
  c ? c.resultText.slice(0, 600) : "never called";

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
    "step 0 reached the model, naming the plan script beside paper-pipeline",
    reached.includes("Read the revision plan") &&
      reached.includes("/../paper-pipeline/scripts/revision-plan.js"),
    `${String(r.modelRequests.length)} requests`,
  );
  const report = r.toolCalls.find((c) => c.name === "Bash");
  const lines = report?.resultText.trim().split("\n") ?? [];
  check(
    "step 0's command ran from the link and printed the plan, the venue's scope and the stop line",
    report !== undefined &&
      !report.isError &&
      lines[0] ===
        "plan: langcode-2027, written 2026-11-25 · the current cycle" &&
      lines.some((l) => l.startsWith("scope: https://")) &&
      lines.at(-1) === "stop: not met — open R2 · paperlint lint decides R1",
    shown(report),
  );
  console.log(
    `✓ pc-panel-review [effects]: skill activated; step 0 ran the bundled revision-plan.js from the link.\n  CLI: ${cli.note}`,
  );
} finally {
  r.cleanup();
}
