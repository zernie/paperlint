/**
 * SKILL SCRIPTS E2E: every script a shipped `SKILL.md` runs, run from the unpacked tarball with NO
 * `node_modules` anywhere — the shape of a Claude Code plugin copy, which is the tarball without its
 * dependencies.
 *
 * 🔴 WHY THE TARBALL AND NOT THE CHECKOUT. In this repository every import resolves: `zod`, `remeda`
 * and `@unified-latex/*` sit in `node_modules`, `#src/…` maps to the sources. A plugin copy has none
 * of that, so a script that is fine here dies there with `ERR_MODULE_NOT_FOUND` before it reads its
 * arguments. Only a run from the unpacked tarball can see that.
 *
 * 🔴 WHAT "RUNS" MEANS. Each command is started with no arguments and empty stdin, from an empty
 * directory, and its whole result (exit code, stdout, stderr) must equal the result of the same
 * script's SOURCE run here, where its dependencies resolve. So the packed script reached its own
 * argument handling and printed its own usage or refusal — not a loader error, and not a second
 * module's output (a bundle that ran another module's `main` too would print more).
 *
 * The commands are read from the SKILL.md files inside the tarball, so a new skill command is
 * measured without editing this file. Each must be spelled `node ${CLAUDE_SKILL_DIR}/…`: a path
 * relative to the working directory, or through the consumer's `.claude/skills/`, resolves in one of
 * the three places a skill runs (this checkout, a consumer's `node_modules`, a plugin copy) and not
 * in the others.
 *
 *   npm run test:e2e:install        PAPERLINT_E2E_KEEP=1 keeps the unpacked copy for a look
 */
import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { printed } from "../../../src/domain/text.ts";
import { check } from "../need.ts";

const ROOT = dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url)))));
const KEEP = process.env.PAPERLINT_E2E_KEEP === "1";
const SKILL_DIR_VAR = "${CLAUDE_SKILL_DIR}/";

/** One script a skill runs: the skill, the path as SKILL.md spells it, and that path in a copy. */
interface Command {
  readonly skill: string;
  readonly spelled: string;
  /** The path below the package root, e.g. `skills/argument-arc/scripts/headings.js`. */
  readonly inPackage: string;
}

/** What a run printed and how it ended: the whole value the comparison is made on. */
interface Run {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

/**
 * The `node <path>` commands in one SKILL.md, each path resolved below the package root the way
 * the agent resolves it: `${CLAUDE_SKILL_DIR}/…` and a bare `scripts/…` from the skill's own
 * directory, `.claude/skills/…` from the skills directory the consumer's links point into.
 */
function commandsOf(skill: string, body: string): readonly Command[] {
  return [...body.matchAll(/\bnode\s+(\S+\.m?js)\b/g)].map((m) => {
    const spelled = m[1] ?? "";
    const inPackage = spelled.startsWith(SKILL_DIR_VAR)
      ? join("skills", skill, spelled.slice(SKILL_DIR_VAR.length))
      : spelled.startsWith(".claude/skills/")
        ? join("skills", spelled.slice(".claude/skills/".length))
        : join("skills", skill, spelled);
    return { skill, spelled, inPackage };
  });
}

/** Every distinct command the shipped skills run, sorted by its path in the package. */
function shippedCommands(pkg: string): readonly Command[] {
  const skills = join(pkg, "skills");
  const all = readdirSync(skills)
    .filter((name) => existsSync(join(skills, name, "SKILL.md")))
    .flatMap((name) =>
      commandsOf(name, readFileSync(join(skills, name, "SKILL.md"), "utf8")),
    );
  const byPath = new Map(all.map((c) => [`${c.skill} ${c.spelled}`, c]));
  return [...byPath.values()].sort((a, b) =>
    a.inPackage.localeCompare(b.inPackage),
  );
}

/**
 * The source a shipped script is built from, in this checkout: `x.js` comes from `x.ts` or
 * `x.mjs` beside it, and a script with neither is its own source.
 */
function sourceOf(inPackage: string): string {
  const stem = join(ROOT, inPackage.replace(/\.m?js$/, ""));
  return (
    [`${stem}.ts`, `${stem}.mjs`].find(existsSync) ?? join(ROOT, inPackage)
  );
}

/**
 * Run `file` with no arguments and empty stdin, from `cwd`. The environment keeps PATH and HOME
 * only, so no NODE_PATH or NODE_OPTIONS from the calling shell can lend the run a module.
 */
function runFrom(cwd: string, args: readonly string[]): Run {
  const r = spawnSync(process.execPath, args, {
    cwd,
    input: "",
    encoding: "utf8",
    timeout: 60_000,
    env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "" },
  });
  return {
    status: r.status,
    stdout: printed(r.stdout),
    stderr: printed(r.stderr),
  };
}

/** The line of a run's stderr that names what happened, for the table: a loader's `Error [...]`, or the first. */
const firstLine = (r: Run): string => {
  const lines = r.stderr.split("\n");
  return (lines.find((l) => l.startsWith("Error")) ?? lines[0] ?? "")
    .replaceAll("|", "\\|")
    .slice(0, 90);
};

// realpathSync: on macOS `/var` is a link to `/private/var`, and a refusal that prints the working
// directory prints the resolved one.
const work = realpathSync(
  mkdtempSync(join(tmpdir(), "paperlint-skill-scripts-")),
);
const copy = join(work, "copy");
const empty = join(work, "empty");

beforeAll(() => {
  const packed = execFileSync(
    "npm",
    ["pack", "--silent", "--pack-destination", work],
    { cwd: ROOT, encoding: "utf8" },
  )
    .trim()
    .split("\n")
    .pop();
  // `split` always returns at least one element, so this names a case that cannot occur.
  if (packed === undefined) throw new Error("npm pack printed nothing");
  mkdirSync(copy);
  mkdirSync(empty);
  execFileSync("tar", ["xzf", join(work, packed), "-C", copy]);
  rmSync(join(work, packed));
});

afterAll(() => {
  if (KEEP) console.log(`(PAPERLINT_E2E_KEEP) the copy was kept: ${work}`);
  else rmSync(work, { recursive: true, force: true });
});

describe("the scripts the skills run, from a copy with no node_modules", () => {
  it("every one reaches its own argument handling, as its source does here", () => {
    const pkg = join(copy, "package");
    // Guards: the copy really has no dependencies, so a pass cannot come from a stray install.
    expect(existsSync(join(pkg, "node_modules"))).toBe(false);
    const commands = shippedCommands(pkg);
    // Guards: the scan found commands at all; zero would make every check below vacuous.
    expect(commands.length).toBeGreaterThan(0);
    const rows = commands.map((c) => {
      const packedRun = runFrom(empty, [join(pkg, c.inPackage)]);
      const sourceRun = runFrom(empty, [
        "--conditions=paperlint-source",
        sourceOf(c.inPackage),
      ]);
      return { c, packedRun, sourceRun };
    });
    console.log(
      [
        "| script | packed: exit, stderr | source here: exit |",
        "| --- | --- | --- |",
        ...rows.map(
          ({ c, packedRun, sourceRun }) =>
            `| ${c.inPackage} | ${String(packedRun.status)}, ${firstLine(packedRun)} | ${String(sourceRun.status)} |`,
        ),
      ].join("\n"),
    );
    for (const { c, packedRun, sourceRun } of rows) {
      // Guards: the command runs wherever the skill is, not only from one working directory.
      check(
        `${c.skill}: \`node ${c.spelled}\` is spelled from \${CLAUDE_SKILL_DIR}`,
        c.spelled.startsWith(SKILL_DIR_VAR),
      );
      // Guards: the packed script ends exactly as its source does: same code, same output.
      check(
        `${c.inPackage} from the copy ends as its source does here`,
        JSON.stringify(packedRun) === JSON.stringify(sourceRun),
        `copy: ${JSON.stringify(packedRun).slice(0, 400)} · source: ${JSON.stringify(sourceRun).slice(0, 400)}`,
      );
    }
  });
});
