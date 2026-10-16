/**
 * `repro/outputs-before-decision` (`src/outputs-before-decision-rule.ts`) over a REAL git repository
 * in a scratch directory, the files read from disk and the history from git: silent on a study whose
 * outputs entered history after its decision, loud on each output that did not, on an output while
 * the decision is uncommitted; and only on `PIPELINE-STATUS.md`.
 */
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { gitHistory } from "./adapters/git/index.ts";
import {
  nodeFiles,
  nodeListDir,
  nodeListEntries,
  spawnProcess,
} from "./adapters/node/index.ts";
import { studyRegistryCodec } from "./adapters/study-registry/index.ts";
import type { StudyMode } from "./domain/study-mode.ts";
import { planText, registryText } from "./domain/study-registry.ts";
import { outputsBeforeDecisionRules } from "./outputs-before-decision-rule.ts";
import { commit, initRepo } from "../test/git-repo.ts";
import { useTempDir } from "../test/support.ts";
import { ROW, planOf } from "../test/study-tree.ts";

const root = useTempDir("outputs-before-decision-");
const DECIDED: StudyMode = {
  kind: "decide_before_run",
  outputs: ["out/**", "RESULTS.md"],
  decision: { file: "repro/P1-S01-outcome/decision.md", note: "exclusions" },
};
const S = "p/repro/P1-S01-outcome";
const PAPER = {
  "p/PIPELINE-STATUS.md": "# status\n",
  "p/repro/studies.json": registryText({ prefix: "P1", studies: [ROW] }),
  [`${S}/README.md`]: "# outcome\n",
  [`${S}/plan.json`]: planText(planOf(DECIDED)),
};
const T = (h: number): string =>
  `2026-10-16T${String(h).padStart(2, "0")}:00:00+05:00`;

/** The rule's message ids over the paper in `repo`, reached through `file`. */
const lint = (repo: string, file = "p/PIPELINE-STATUS.md"): string[] => {
  const rule = outputsBeforeDecisionRules({
    files: nodeFiles,
    listDir: nodeListDir,
    entries: nodeListEntries,
    codec: studyRegistryCodec,
    git: gitHistory(spawnProcess(), { PATH: String(process.env.PATH) }),
  })["outputs-before-decision"];
  const ids: string[] = [];
  rule
    .create({
      filename: join(repo, file),
      sourceCode: { getLocFromIndex: () => ({ line: 1, column: 0 }) },
      report: (d) => ids.push(d.messageId),
    })
    .root?.();
  return ids;
};

it("silent when the decision was committed first and the outputs after it", () => {
  const repo = join(root, "clean");
  initRepo(repo);
  commit(repo, PAPER, T(9));
  commit(repo, { [`${S}/decision.md`]: "exclude run 7\n" }, T(10));
  commit(
    repo,
    { [`${S}/RESULTS.md`]: "41 of 60\n", [`${S}/out/a.csv`]: "1\n" },
    T(11),
  );
  // Guards: the correct history — and the rule speaks only on PIPELINE-STATUS.md.
  expect([lint(repo), lint(repo, "p/paper.tex")]).toEqual([[], []]);
});

it("loud on each output committed with or before the decision, and on outputs with no decision", () => {
  const repo = join(root, "early");
  initRepo(repo);
  commit(repo, { ...PAPER, [`${S}/out/early.csv`]: "1\n" }, T(9));
  commit(
    repo,
    { [`${S}/decision.md`]: "d\n", [`${S}/RESULTS.md`]: "x\n" },
    T(10),
  );
  // Guards: one finding per output — the earlier one and the one in the decision's own commit.
  expect(lint(repo)).toEqual([
    "output-before-decision",
    "output-before-decision",
  ]);
  const none = join(root, "undecided");
  initRepo(none);
  commit(none, PAPER, T(9));
  commit(none, { [`${S}/RESULTS.md`]: "x\n" }, T(10));
  // Guards: an output while the decision has never been committed.
  expect(lint(none)).toEqual(["undecided-output"]);
});

it("never reads through a row whose folder leads outside repro/: no study, so no question to git", () => {
  const repo = join(root, "escaping");
  initRepo(repo);
  // The row names `../outside`; a plan and an output sit there, outside `repro/`.
  commit(
    repo,
    {
      ...PAPER,
      "p/repro/studies.json": registryText({
        prefix: "P1",
        studies: [{ ...ROW, folder: "../outside" }],
      }),
      "p/outside/plan.json": planText(planOf(DECIDED)),
      "p/outside/RESULTS.md": "41 of 60\n",
    },
    T(9),
  );
  // Guards: an output outside the paper's `repro/` is no study's; `repro/study-registered` names the row.
  expect(lint(repo)).toEqual([]);
});

it("loud on an output committed and then deleted while the decision was never committed", () => {
  const repo = join(root, "deleted");
  initRepo(repo);
  commit(repo, { ...PAPER, [`${S}/RESULTS.md`]: "41 of 60\n" }, T(9));
  commit(repo, { [`${S}/RESULTS.md`]: null }, T(10));
  // Guards: the tree is clean now, and history still shows a result that came before any decision.
  expect(lint(repo)).toEqual(["undecided-output"]);
});

it("loud on a decision that names a directory: git's answer for it is no decision's commit", () => {
  const repo = join(root, "directory");
  initRepo(repo);
  const dir = "repro/P1-S01-outcome/decisions";
  commit(
    repo,
    {
      ...PAPER,
      [`${S}/plan.json`]: planText(
        planOf({ ...DECIDED, decision: { file: dir, note: "n" } }),
      ),
      [`p/${dir}/a.md`]: "exclude run 7\n",
    },
    T(9),
  );
  commit(repo, { [`${S}/RESULTS.md`]: "41 of 60\n" }, T(10));
  // Guards: the order is never read from a directory's history — the plan is reported instead.
  expect(lint(repo)).toEqual(["decision-not-file"]);
});

it("lists a symlink in the study's folder as a file, never following it: a loop or a link outside", () => {
  const repo = join(root, "links");
  initRepo(repo);
  mkdirSync(join(repo, "outside"), { recursive: true });
  writeFileSync(join(repo, "outside", "RESULTS.md"), "not this study's\n");
  commit(repo, PAPER, T(9));
  commit(repo, { [`${S}/decision.md`]: "exclude run 7\n" }, T(10));
  symlinkSync(".", join(repo, S, "loop"));
  symlinkSync(join(repo, "outside"), join(repo, S, "ext"));
  commit(repo, { [`${S}/RESULTS.md`]: "41 of 60\n" }, T(11));
  // Guards: a link to its own folder would recurse forever, and one outside would bring a foreign
  // `RESULTS.md` into the study; both are entries git itself stores as links.
  expect(lint(repo)).toEqual([]);
});
