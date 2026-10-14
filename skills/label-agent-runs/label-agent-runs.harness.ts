/**
 * label-agent-runs — the agent-facing tier. Does an agent that loads this skill get a label tool
 * it can call, at the path the skill names, with the result the skill promises?
 *
 * Runs the REAL `claude` CLI against a SCRIPTED MOCK MODEL (`runHarnessTest`): $0, no API key.
 * The script: activate the skill, then — through the Bash tool, as §2 and §4 tell an agent to —
 * compare two raters' label files (the report must carry kappa and the disagreement), and have a
 * pair that labels different runs refused. The commands call the COMPILED `labels.js` under the
 * skill's link, which is what runs from `node_modules` (`npm run build` makes it).
 *
 * Also, without the CLI: the shared per-skill checks (`checkSkill`). Whether the skill names only
 * subcommands the script has is not tested here: the spec interpolates them from
 * `scripts/labels-commands.ts`, so a wrong one fails `tsc`.
 *
 * What it does NOT prove: that a real model reads the uncertain runs in full. That is for
 * `label-agent-runs.eval.ts` and a real labelling pass.
 */
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { runHarnessTest, skip, type ToolCall } from "vigiles";
import { createChecker } from "../../lib/check.ts";
import { checkSkill } from "../../lib/skill-checks.mjs";
import { observeAgentCli } from "#lib/agent-cli-version";
import { claudeDir } from "#src/package-dirs";
import { COMMANDS } from "./scripts/labels-commands.ts";

const check = createChecker();

await checkSkill("label-agent-runs");

// ── Through the real CLI: agreement, as the skill tells an agent to compute it ───────────
const LINK = join(claudeDir(), "skills", "label-agent-runs");
const cli = observeAgentCli({ spawnSync });
if (!cli.present) skip(`label-agent-runs effects: ${cli.note}`);

const row = (cell: string, label: string): string =>
  `cli\tm1\t${cell}\t${label}`;
const file = (...rows: string[]): string =>
  ["agent\tmodel\tcell\tlabel", ...rows, ""].join("\n");
const l = `node ${LINK}/scripts/labels.js`;
const r = await runHarnessTest({
  pluginDir: claudeDir(),
  // bubblewrap is absent here; the code loaded is this repository's own `.claude`.
  sandbox: false,
  transcript: true,
  timeoutMs: 180_000,
  prompt: "the second rater is done — compute agreement on the run labels",
  allowedTools: ["Skill", "Bash"],
  files: {
    "rater-a.tsv": file(
      row("u1/control/1", "solved"),
      row("u2/control/1", "deferred"),
      row("u3/control/1", "solved"),
    ),
    "rater-b.tsv": file(
      row("u1/control/1", "solved"),
      row("u2/control/1", "solved"),
      row("u3/control/1", "solved"),
    ),
    "other.tsv": file(row("u9/control/1", "solved")),
  },
  model: [
    { tool: "Skill", input: { skill: "label-agent-runs" } },
    {
      tool: "Bash",
      input: { command: `${l} ${COMMANDS.agree} rater-a.tsv rater-b.tsv` },
    },
    {
      tool: "Bash",
      input: { command: `${l} ${COMMANDS.agree} rater-a.tsv other.tsv` },
    },
    { text: "done" },
  ],
});

const shown = (c: ToolCall | undefined): string =>
  c ? c.resultText.slice(0, 400) : "never called";
/** Did this call run, with this error flag, and print every one of `parts`? */
const ran = (
  c: ToolCall | undefined,
  isError: boolean,
  parts: readonly string[],
): boolean =>
  c !== undefined &&
  c.isError === isError &&
  parts.every((p) => c.resultText.includes(p));

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
    reached.includes("The automatic classifier is a pre-sort, not a label"),
    `${String(r.modelRequests.length)} requests`,
  );
  const [same, different] = r.toolCalls.filter((c) => c.name === "Bash");
  check(
    "agreement is reported with kappa and the disagreement",
    ran(same, false, [
      "agreement 2/3",
      "cohen kappa 0.000",
      "disagree cli m1 u2/control/1: deferred | solved",
    ]),
    shown(same),
  );
  check(
    "raters who labelled different runs are refused",
    ran(different, true, ["label different cells"]),
    shown(different),
  );
  console.log(
    `✓ label-agent-runs [effects]: skill activated; agreement reported, mismatched raters refused.\n  CLI: ${cli.note}`,
  );
} finally {
  r.cleanup();
}
