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
 * Measured 2026-11-10, 3 trials a run. This skill: every check 100%. The skill as it was on main
 * (`context: fork`), two runs: the paper edited in 2 of 3 and then 0 of 3; the two readers started
 * in the background on sonnet in 1 of 3 (second run, which read subagent calls); no report in any
 * — and `assert` fails it (exit 1).
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
import { assertRates, defineEval, latency } from "vigiles";
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

/**
 * Every tool call of the run: the session's own and each subagent's (`ctx.subagents`). A forked
 * skill is a subagent, so what it does (start readers, edit the paper) is only seen here.
 */
const allCalls = (ctx: RunContext): RunContext["toolCalls"] => [
  ...ctx.toolCalls,
  ...(ctx.subagents ?? []).flatMap((s) => s.toolCalls),
];

const agentCalls = (ctx: RunContext): z.infer<typeof AgentInput>[] =>
  allCalls(ctx)
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

/** The two input fields these checks read off a tool call; anything else is dropped. */
const ToolInput = z.object({
  file_path: z.string().catch(""),
  command: z.string().catch(""),
});

const inputsOf = (
  ctx: RunContext,
  names: readonly string[],
): z.infer<typeof ToolInput>[] =>
  allCalls(ctx)
    .filter((c) => names.includes(c.name))
    .map((c) => ToolInput.parse(c.input));

/** A TeX build, by the program that runs it. */
const BUILDERS = ["pdflatex", "latexmk", "lualatex", "xelatex"];

export default defineEval<"measure">({
  // Every check on every trial: these are outcomes the skill promises, not rates to trade off.
  assert: (report) => {
    assertRates(report, { min: 1 });
  },
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
      check(
        "paper-not-written",
        (ctx) =>
          !inputsOf(ctx, ["Edit", "MultiEdit", "Write"]).some((i) =>
            i.file_path.endsWith("paper.tex"),
          ),
        "no Edit, MultiEdit or Write on paper.tex",
      ),
      check(
        "no-rebuild-no-claude-p",
        (ctx) =>
          !inputsOf(ctx, ["Bash"]).some(
            (i) =>
              i.command.includes("claude -p") ||
              BUILDERS.some((b) => i.command.includes(b)),
          ),
        `no Bash command runs \`claude -p\` or a TeX build (${BUILDERS.join(", ")})`,
      ),
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
        (ctx) =>
          ctx
            .sh("ls reviews")
            .split("\n")
            .some((name) => name.endsWith("-cold-read-diff.md")),
        "a cold-read-diff report is written under reviews/",
      ),
      latency({ maxMs: 6 * 60_000 }),
    ],
  },
});
