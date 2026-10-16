/**
 * A measurement decided before its run, through the real binary (`bin/paperlint.mjs`) in a real git
 * repository in a scratch directory — the default mode, end to end:
 *
 *   - `studies new` writes the decide-first plan;
 *   - `studies gate` refuses while the decision is uncommitted, and opens once it is, with its commit;
 *   - outputs committed after the decision: `repro/outputs-before-decision` is silent;
 *   - an output committed with the decision, or in a shallow clone: the rule says so.
 *
 *   npm run test:e2e:studies
 */
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { commit, git, initRepo } from "../../git-repo.ts";
import { missing } from "../need.ts";

const ROOT = dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url)))));
const BIN = join(ROOT, "bin", "paperlint.mjs");
const base = realpathSync(mkdtempSync(join(tmpdir(), "paperlint-decide-e2e-")));
afterAll(() => {
  rmSync(base, { recursive: true, force: true });
});

const has = (program: string): boolean =>
  spawnSync(program, ["--version"], { encoding: "utf8" }).status === 0;
const SKIP = missing("git", has("git"), "install git");

/** `paperlint <args>` in `cwd`. */
const paperlint = (cwd: string, args: readonly string[]) => {
  const r = spawnSync(process.execPath, [BIN, ...args], {
    cwd,
    encoding: "utf8",
  });
  return { status: r.status, out: r.stdout, err: r.stderr };
};

const LintReport = z.array(
  z.object({
    messages: z.array(
      z.object({ ruleId: z.string().nullable(), message: z.string() }),
    ),
  }),
);

/** The first line of each `repro/outputs-before-decision` message of `paperlint lint` in `cwd`. */
const orderFindings = (cwd: string): readonly string[] =>
  LintReport.parse(JSON.parse(paperlint(cwd, ["lint", "--json"]).out)).flatMap(
    (f) =>
      f.messages
        .filter((m) => m.ruleId === "repro/outputs-before-decision")
        .map((m) => m.message.split("\n")[0] ?? ""),
  );

const T = (h: number): string =>
  `2026-10-16T${String(h).padStart(2, "0")}:00:00+05:00`;
const STUDY = "papers/example/repro/P1-S01-outcome";

/** A project with one measurement registered by `studies new`, its plan filled; committed at 09:00. */
const project = (name: string): string => {
  const dir = join(base, name);
  initRepo(dir);
  const files = {
    "package.json": "{}\n",
    "papers/example/PIPELINE-STATUS.md": "---\nstages: []\n---\n# status\n",
    "papers/example/paper.tex":
      "\\documentclass{article}\n\\begin{document}\nx\n\\end{document}\n",
    "papers/example/repro/README.md": "# Reproduction index\n",
    "papers/example/repro/studies.json": '{ "prefix": "P1", "studies": [] }\n',
  };
  commit(dir, files, T(8), "the paper");
  expect(
    paperlint(dir, ["studies", "new", "papers/example", "Outcome"]).status,
  ).toBe(0);
  const planPath = join(dir, STUDY, "plan.json");
  const plan = z
    .looseObject({ mode: z.looseObject({ decision: z.looseObject({}) }) })
    .parse(JSON.parse(readFileSync(planPath, "utf8")));
  writeFileSync(
    planPath,
    `${JSON.stringify(
      {
        ...plan,
        question: "Does the hint help?",
        population: {
          source: "tasks",
          draw: { kind: "all", method: "census" },
        },
        primary_outcome: "pass rate",
        mode: {
          ...plan.mode,
          outputs: ["RESULTS.md"],
          decision: { ...plan.mode.decision, note: "exclusions" },
        },
      },
      null,
      2,
    )}\n`,
  );
  commit(dir, {}, T(9), "the study");
  return dir;
};

describe.skipIf(SKIP)(
  "decide first, through the real binary in a real git repository",
  () => {
    it("studies new writes the decide-first mode, its decision file named", () => {
      const dir = project("new");
      // Guards: the default mode is written for every new measurement.
      expect(
        z
          .object({ mode: z.unknown() })
          .parse(
            JSON.parse(readFileSync(join(dir, STUDY, "plan.json"), "utf8")),
          ).mode,
      ).toEqual({
        kind: "decide_before_run",
        outputs: ["RESULTS.md"],
        decision: {
          file: "repro/P1-S01-outcome/decision.md",
          note: "exclusions",
        },
      });
    });

    it("the gate is shut until the decision is committed, then opens with its commit; outputs after it lint clean", () => {
      const dir = project("gate");
      const gate = () =>
        paperlint(dir, ["studies", "gate", "papers/example", "P1-S01"]);
      const shut = gate();
      writeFileSync(join(dir, STUDY, "decision.md"), "exclude run 7\n");
      const written = gate();
      const sha = commit(dir, {}, T(10), "the decision");
      const open = gate();
      commit(dir, { [`${STUDY}/RESULTS.md`]: "41 of 60\n" }, T(11), "the run");
      // Guards: exit 1 until committed (a written but uncommitted decision included), then 0 naming the commit.
      expect([
        shut.status,
        written.status,
        open.status,
        open.out.trim(),
      ]).toEqual([
        1,
        1,
        0,
        `P1-S01: the decision repro/P1-S01-outcome/decision.md is committed in ${sha} (${T(10)}); the run may start.`,
      ]);
      // Guards: the order in history is the declared one — silent.
      expect(orderFindings(dir)).toEqual([]);
      const registry = join(dir, "papers/example/repro/studies.json");
      writeFileSync(
        registry,
        readFileSync(registry, "utf8").replace(
          '"in_paper": "no"',
          '"in_paper": "yes"',
        ),
      );
      const md = paperlint(dir, ["studies", "methods", "papers/example"]);
      const head = git(dir, ["rev-parse", "HEAD"]).trim();
      // Guards: the methods text names the decision's and the first output's commits, from the same history.
      expect([md.status, md.out.trim().split("\n")[2]]).toEqual([
        0,
        `| P1-S01 | Outcome | decided before its run | \`${sha.slice(0, 12)}\` (2026-10-16) | \`${head.slice(0, 12)}\` (2026-10-16) | \`npx paperlint lint papers/example\` |`,
      ]);
    });
  },
);

describe.skipIf(SKIP)(
  "decide first — the history the rule cannot accept",
  () => {
    it("an output committed with the decision is reported; a shallow clone is named", () => {
      const dir = project("same");
      commit(
        dir,
        {
          [`${STUDY}/decision.md`]: "d\n",
          [`${STUDY}/RESULTS.md`]: "41 of 60\n",
        },
        T(10),
        "both at once",
      );
      const shallow = join(base, "shallow");
      git(base, ["clone", "-q", "--depth", "1", `file://${dir}`, shallow]);
      // Guards: one commit holding both says nothing of which came first — loud; depth 1 is not judged.
      expect(orderFindings(dir).map((m) => m.split(",")[0])).toEqual([
        "`repro/P1-S01-outcome/RESULTS.md`",
      ]);
      expect(orderFindings(shallow)).toEqual([
        "`P1-S01` is decided before its run, and this clone is shallow: every file's first commit is the clone's first, so the order of decision and outputs cannot be read. What to do: fetch the whole history (`git fetch --unshallow`; in GitHub Actions, `actions/checkout` with `fetch-depth: 0`).",
      ]);
    });
  },
);
