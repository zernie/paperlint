/**
 * cold-read-diff — the PAID tier for what the skill DOES, not how its text is worded: run it with a
 * real model on a paper with two changed paragraphs and score, over several trials, the outcomes
 * #405 and #301 asked for.
 *
 *   - the paper is not edited, nothing rebuilds it, and no reader is run as `claude -p`;
 *   - exactly two readers are started, on sonnet, in the background;
 *   - each reader's prompt holds the changed paragraphs and nothing else — not an unchanged
 *     neighbour, not the file's name;
 *   - a report is written under `reviews/`;
 *   - the whole run ends within 6 minutes (5 per reader, run in parallel, plus the extract).
 *
 * Whether a reader then used a tool is not scored: "use no tools" is an instruction, not a fence,
 * by the owner's choice (#460).
 *
 * The fixture is a git repository: a `SessionStart` hook commits the base paper and puts the edit
 * on top, because the skill reads `git diff`. The skill is installed through a throwaway plugin
 * whose `skills/cold-read-diff` LINKS to this directory, not a copy: the extractor imports
 * `#src/*`, which resolves only from inside the package.
 *
 * ⚠️ Written with the change; its rates are UNKNOWN until it is run.
 *
 * Costs money (about $0.2–0.6 a trial); not CI. Needs `npm run build` first.
 *   npx vigiles eval skills/cold-read-diff/cold-read-behaviour.eval.ts
 */
import {
  existsSync,
  mkdirSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineEval, latency, notTool } from "vigiles";
import type { Check, RunContext } from "vigiles/eval";
import { z } from "zod";

const SKILL_DIR = dirname(fileURLToPath(import.meta.url));

/** The throwaway plugin the run installs; made by `skipIf`, so nothing is written at import. */
const PLUGIN_DIR = join(
  realpathSync(tmpdir()),
  "paperlint-cold-read-behaviour-plugin",
);

const UNCHANGED = "Coding agents read a rules file before every task.";
const CHANGED_1 =
  "The state to remove is therefore not the rule but its claim about itself.";
const CHANGED_2 = "Three answers, all of them after the fact.";
const CHANGED = [CHANGED_1, CHANGED_2];

const BASE = `\\documentclass{article}
\\begin{document}
\\section{Introduction}
${UNCHANGED} The file tells the agent which commands to run.

We measure how often an agent follows each rule in such a file.

\\section{Conclusion}
Rules files are widely used, and agents follow most of what they say.
\\end{document}
`;

const EDITED = BASE.replace(
  "We measure how often an agent follows each rule in such a file.",
  `% TODO tighten\n${CHANGED_1} Across 40 repositories, agents followed 71\\% of them.`,
).replace(
  "Rules files are widely used, and agents follow most of what they say.",
  `${CHANGED_2} The agent turns out not to be the weak link.`,
);

/** Commit the base paper, then put the edit on top: the diff the skill reads. */
const SETUP = [
  "git init -q",
  "cp paper.tex .edited.tex",
  "cp base.tex paper.tex",
  "git add paper.tex",
  "git -c user.name=eval -c user.email=eval@example.invalid commit -qm base",
  "mv .edited.tex paper.tex",
  "rm base.tex",
].join(" && ");

/** What an Agent dispatch is called with, as far as these checks read it. */
const AgentInput = z.object({
  prompt: z.string().catch(""),
  model: z.string().optional().catch(undefined),
  run_in_background: z.boolean().optional().catch(undefined),
});

const agentCalls = (ctx: RunContext): z.infer<typeof AgentInput>[] =>
  ctx.toolCalls
    .filter((c) => c.name === "Agent")
    .map((c) => AgentInput.parse(c.input));

/** A check over the run that the stock vocabulary cannot say. */
const check = (
  kind: string,
  holds: (ctx: RunContext) => boolean,
  what: string,
): Check<RunContext> => ({
  kind,
  eval: (ctx) => {
    const pass = holds(ctx);
    return { pass, score: pass ? 1 : 0, message: pass ? what : `NOT: ${what}` };
  },
  toJSON: () => ({ kind, what }),
});

const PAPER = /paper\.tex$/;

export default defineEval({
  skipIf: () => {
    if (!existsSync(join(SKILL_DIR, "scripts", "cold-read.js")))
      return "scripts/cold-read.js is not built: run `npm run build` first";
    mkdirSync(join(PLUGIN_DIR, ".claude-plugin"), { recursive: true });
    mkdirSync(join(PLUGIN_DIR, "skills"), { recursive: true });
    writeFileSync(
      join(PLUGIN_DIR, ".claude-plugin", "plugin.json"),
      '{ "name": "paperlint-eval", "version": "0.0.0" }\n',
    );
    if (!existsSync(join(PLUGIN_DIR, "skills", "cold-read-diff")))
      symlinkSync(
        SKILL_DIR,
        join(PLUGIN_DIR, "skills", "cold-read-diff"),
        "dir",
      );
    return undefined;
  },
  measure: {
    pluginDir: PLUGIN_DIR,
    fixture: { "paper.tex": EDITED, "base.tex": BASE },
    settings: {
      hooks: {
        SessionStart: [{ hooks: [{ type: "command", command: SETUP }] }],
      },
    },
    task: "/paperlint-eval:cold-read-diff paper.tex — the venue is a software-engineering workshop.",
    allowedTools: ["Bash", "Read", "Write", "Agent", "Glob", "Grep"],
    trials: 3,
    timeoutMs: 8 * 60_000,
    checks: [
      notTool("Edit", { file_path: PAPER }),
      notTool("Write", { file_path: PAPER }),
      notTool("Bash", { command: /claude\s+-p/ }),
      notTool("Bash", { command: /pdflatex|latexmk|lualatex|xelatex/ }),
      check(
        "paper-unchanged",
        (ctx) => ctx.sh("cat paper.tex") === EDITED.trim(),
        "paper.tex is byte-for-byte the edit the run started from",
      ),
      check(
        "two-background-sonnet-readers",
        (ctx) =>
          agentCalls(ctx).filter(
            (a) => a.model === "sonnet" && a.run_in_background === true,
          ).length === 2,
        "exactly two Agent dispatches, each model sonnet and run_in_background",
      ),
      check(
        "readers-get-only-the-diff",
        (ctx) =>
          agentCalls(ctx).length > 0 &&
          agentCalls(ctx).every(
            (a) =>
              CHANGED.every((s) => a.prompt.includes(s)) &&
              !a.prompt.includes(UNCHANGED) &&
              !a.prompt.includes("paper.tex"),
          ),
        "every reader's prompt holds both changed paragraphs, no unchanged one, and no file name",
      ),
      check(
        "report-written",
        (ctx) => /cold-read-diff\.md/.test(ctx.sh("ls reviews")),
        "a cold-read-diff report is written under reviews/",
      ),
      latency({ maxMs: 6 * 60_000 }),
    ],
  },
});
