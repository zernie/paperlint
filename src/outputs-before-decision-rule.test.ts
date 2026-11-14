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
  nodeListEntries,
  spawnProcess,
} from "./adapters/node/index.ts";
import { studyRegistryCodec } from "./adapters/study-registry/index.ts";
import type { StudyMode } from "./domain/study-mode.ts";
import { PLAN_V2 } from "./domain/study-gates.ts";
import { planText, registryText } from "./domain/study-registry.ts";
import { outputsBeforeDecisionRules } from "./outputs-before-decision-rule.ts";
import type { GitOrder } from "./ports/git-history.ts";
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
const lint = (
  repo: string,
  file = "p/PIPELINE-STATUS.md",
  git: GitOrder = gitHistory(spawnProcess(), {
    PATH: String(process.env.PATH),
  }),
): string[] => {
  const rule = outputsBeforeDecisionRules({
    files: nodeFiles,
    entries: nodeListEntries,
    codec: studyRegistryCodec,
    git,
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

it("loud on a decision deleted after its outputs: a decision that no longer stands decides nothing", () => {
  const repo = join(root, "decision-deleted");
  initRepo(repo);
  commit(repo, PAPER, T(9));
  commit(repo, { [`${S}/decision.md`]: "exclude run 7\n" }, T(10));
  commit(repo, { [`${S}/RESULTS.md`]: "41 of 60\n" }, T(11));
  commit(repo, { [`${S}/decision.md`]: null }, T(12));
  // Guards: the order was right once; with the decision gone from HEAD the study is reported.
  expect(lint(repo)).toEqual(["decision-deleted"]);
});

it("loud on a decision that is a symbolic link: git records the link, not the decision", () => {
  const repo = join(root, "decision-link");
  initRepo(repo);
  mkdirSync(join(repo, "p"), { recursive: true });
  writeFileSync(join(repo, "p/elsewhere.md"), "exclude run 7\n");
  mkdirSync(join(repo, S), { recursive: true });
  symlinkSync("../../elsewhere.md", join(repo, S, "decision.md"));
  commit(repo, PAPER, T(9));
  commit(repo, { [`${S}/RESULTS.md`]: "41 of 60\n" }, T(10));
  // Guards: a link committed first proves nothing of what it pointed to when the run started.
  expect(lint(repo)).toEqual(["decision-not-file"]);
});

it("never reads through a study folder that is a symbolic link", () => {
  const repo = join(root, "folder-link");
  initRepo(repo);
  const elsewhere = "p/elsewhere";
  commit(
    repo,
    {
      ...Object.fromEntries(
        Object.entries(PAPER).filter(([k]) => !k.startsWith(S)),
      ),
      [`${elsewhere}/README.md`]: "# outcome\n",
      [`${elsewhere}/plan.json`]: planText(planOf(DECIDED)),
      [`${elsewhere}/RESULTS.md`]: "41 of 60\n",
    },
    T(9),
  );
  symlinkSync("../elsewhere", join(repo, S));
  commit(repo, {}, T(10));
  // Guards: the outputs behind the link are not this paper's study; nothing is read through it.
  expect(lint(repo)).toEqual([]);
});

it("a plan that is a symbolic link declares no mode: the order of its study is not judged", () => {
  const repo = join(root, "plan-link");
  initRepo(repo);
  mkdirSync(join(repo, "p/elsewhere"), { recursive: true });
  writeFileSync(join(repo, "p/elsewhere/plan.json"), planText(planOf(DECIDED)));
  mkdirSync(join(repo, S), { recursive: true });
  symlinkSync("../../elsewhere/plan.json", join(repo, S, "plan.json"));
  commit(
    repo,
    {
      ...Object.fromEntries(
        Object.entries(PAPER).filter(([k]) => k !== `${S}/plan.json`),
      ),
      [`${S}/RESULTS.md`]: "41 of 60\n",
    },
    T(9),
  );
  commit(repo, { [`${S}/decision.md`]: "exclude run 7\n" }, T(10));
  // Guards: read through the link, the plan is a decide-first one and its output precedes its
  // decision (`output-before-decision`); a link is read through by nothing, so the study declares no mode.
  expect(lint(repo)).toEqual([]);
});

it("loud on a decision under a linked directory: git records the link, not the files behind it", () => {
  const repo = join(root, "decision-dir-link");
  initRepo(repo);
  mkdirSync(join(repo, "p/elsewhere"), { recursive: true });
  writeFileSync(join(repo, "p/elsewhere/decision.md"), "exclude run 7\n");
  const file = "repro/P1-S01-outcome/sub/decision.md";
  commit(
    repo,
    {
      ...PAPER,
      [`${S}/plan.json`]: planText(
        planOf({ ...DECIDED, decision: { file, note: "n" } }),
      ),
    },
    T(9),
  );
  symlinkSync("../../elsewhere", join(repo, S, "sub"));
  commit(repo, {}, T(10));
  commit(repo, { [`${S}/RESULTS.md`]: "41 of 60\n" }, T(11));
  // Guards: the decision file exists, and is committed as a path through a link; the order proof
  // would be read from the link's history. The study is reported instead.
  expect(lint(repo)).toEqual(["decision-linked"]);
});

// ── a plan v2's gates are fixed before the first output ─────────────────────────────────────────

/** A ready plan v2 of the decide-first study, losing below `below`, its question `question`. */
const v2 = (below: number, question = "Does the hint help?"): string =>
  planText({
    ...planOf({ ...DECIDED, we_lose_if: { result: "share", below } }),
    question,
    $schema: PLAN_V2,
    second_check: [{ step: "fits", min_kappa: 0.6 }],
    self_test: "none",
    funnel: ["no linter rule"],
    recall_audit: "none",
  });
const V2_PAPER = { ...PAPER, [`${S}/plan.json`]: v2(0.2) };

/** The decided history: the paper with its plan, then the decision, then an output. */
const decidedRun = (
  name: string,
  first: Readonly<Record<string, string>> = V2_PAPER,
): string => {
  const repo = join(root, name);
  initRepo(repo);
  commit(repo, first, T(9));
  commit(repo, { [`${S}/decision.md`]: "exclude run 7\n" }, T(10));
  commit(repo, { [`${S}/RESULTS.md`]: "41 of 60\n" }, T(11));
  return repo;
};

it("loud when a gate of a plan v2 changed after the first output: the threshold cannot follow the result", () => {
  const repo = decidedRun("gate-moved");
  commit(repo, { [`${S}/plan.json`]: v2(0.1) }, T(12));
  expect(lint(repo)).toEqual(["gates-changed"]);
});

it("loud when the plan v2 entered history only after the first output: its gates were not fixed before it", () => {
  const repo = decidedRun(
    "gate-late",
    Object.fromEntries(
      Object.entries(V2_PAPER).filter(([k]) => k !== `${S}/plan.json`),
    ),
  );
  commit(repo, { [`${S}/plan.json`]: v2(0.2) }, T(12));
  expect(lint(repo)).toEqual(["gates-not-fixed"]);
});

it("silent when the gates stand as they were at the first output, even if other text of the plan changed", () => {
  const same = decidedRun("gate-same");
  const reworded = decidedRun("gate-reworded");
  commit(
    reworded,
    { [`${S}/plan.json`]: v2(0.2, "Do the hints help?") },
    T(12),
  );
  const v1 = decidedRun("gate-v1", PAPER);
  commit(v1, { [`${S}/plan.json`]: planText(planOf(DECIDED)) + "\n" }, T(12));
  // Guards: an unchanged plan; a non-gate edit; a plan v1, which has no gates to freeze.
  expect([lint(same), lint(reworded), lint(v1)]).toEqual([[], [], []]);
});

it("loud when the plan at the first output was a v1 or no plan at all, and says why when git cannot show it", () => {
  const v1 = decidedRun("gate-was-v1", PAPER);
  commit(v1, { [`${S}/plan.json`]: v2(0.2) }, T(12));
  const garbled = decidedRun("gate-was-garbled", {
    ...V2_PAPER,
    [`${S}/plan.json`]: "{ not json",
  });
  commit(garbled, { [`${S}/plan.json`]: v2(0.2) }, T(12));
  const real = gitHistory(spawnProcess(), { PATH: String(process.env.PATH) });
  const blind = {
    ...real,
    fileAt: () => ({ kind: "unknown", why: "git show failed" }) as const,
  };
  expect([
    lint(v1),
    lint(garbled),
    lint(decidedRun("gate-blind"), undefined, blind),
  ]).toEqual([["gates-not-fixed"], ["gates-not-fixed"], ["no-history"]]);
});

it("asks nothing of the gates while no output followed the decision, or no order could be read", () => {
  const waiting = join(root, "gate-waiting");
  initRepo(waiting);
  commit(waiting, V2_PAPER, T(9));
  commit(waiting, { [`${S}/decision.md`]: "exclude run 7\n" }, T(10));
  const dir = "repro/P1-S01-outcome/decisions";
  const unread = join(root, "gate-unread");
  initRepo(unread);
  commit(
    unread,
    {
      ...V2_PAPER,
      [`${S}/plan.json`]: v2(0.2).replace(
        '"file": "repro/P1-S01-outcome/decision.md"',
        `"file": "${dir}"`,
      ),
      [`p/${dir}/a.md`]: "exclude run 7\n",
    },
    T(9),
  );
  commit(unread, { [`${S}/RESULTS.md`]: "41 of 60\n" }, T(10));
  // Guards: a plan v2 whose study has not run yet; one whose history yields no order is reported
  // for that alone, never for gates it could not compare.
  expect([lint(waiting), lint(unread)]).toEqual([[], ["decision-not-file"]]);
});

// ── a self-check is not a result (issue #483) ───────────────────────────────────────────────────

/**
 * A ready plan v2 whose outputs are everything under `data/`, losing below `below`; `checks` names
 * the harness's self-check apart, when given.
 */
const checkedPlan = (below: number, checks?: readonly string[]): string =>
  planText({
    ...planOf({
      ...DECIDED,
      outputs: ["data/**"],
      ...(checks === undefined ? {} : { checks }),
      we_lose_if: { result: "share", below },
    }),
    $schema: PLAN_V2,
    second_check: "none",
    self_test: "none",
    funnel: "none",
    recall_audit: "none",
  });

/** The paper with `plan`, the decision, then `steps` in order, one commit each from 11:00. */
const history = (
  name: string,
  plan: string,
  steps: readonly Readonly<Record<string, string>>[],
  early: Readonly<Record<string, string>> = {},
): string => {
  const repo = join(root, name);
  initRepo(repo);
  commit(repo, { ...PAPER, [`${S}/plan.json`]: plan, ...early }, T(9));
  commit(repo, { [`${S}/decision.md`]: "exclude run 7\n" }, T(10));
  steps.forEach((files, i) => {
    commit(repo, files, T(11 + i));
  });
  return repo;
};

const GATE = { [`${S}/data/gate.json`]: '{"reproduced": 1071, "of": 1071}\n' };
const SCORES = { [`${S}/data/scores.json`]: '{"share": 0.31}\n' };

it("silent when the gate moved after a self-check but before the first result; loud without `checks`", () => {
  const steps = (plan: string) => [GATE, { [`${S}/plan.json`]: plan }, SCORES];
  const checks = ["data/gate.json"];
  const named = history(
    "check-then-amend",
    checkedPlan(0.2, checks),
    steps(checkedPlan(0.1, checks)),
  );
  const unnamed = history(
    "check-unnamed",
    checkedPlan(0.2),
    steps(checkedPlan(0.1)),
  );
  // Guards: the report's timeline — the harness check landed, the threshold was amended, then the
  // scores. Named in `checks`, the check is no result; left unnamed it reads as the first output.
  expect([lint(named), lint(unnamed)]).toEqual([[], ["gates-changed"]]);
});

it("loud when the gate moved after a real result, the self-check named or not", () => {
  const checks = ["data/gate.json"];
  const repo = history("result-then-amend", checkedPlan(0.2, checks), [
    SCORES,
    GATE,
    { [`${S}/plan.json`]: checkedPlan(0.1, checks) },
  ]);
  // Guards: `checks` moves the date to the first result, never past it.
  expect(lint(repo)).toEqual(["gates-changed"]);
});

it("loud on a self-check committed before its decision: it is held to the decision like an output", () => {
  const repo = history(
    "check-before-decision",
    checkedPlan(0.2, ["data/gate.json"]),
    [SCORES],
    GATE,
  );
  // Guards: a check run before the decision is reported, the result after it is not.
  expect(lint(repo)).toEqual(["output-before-decision"]);
});

// ── the gates at the first result are read alone ───────────────────────────────────────────────

/** `plan`'s text with a draw kind the schema does not know (`census`): the plan fails, its gates do not. */
const badDraw = (plan: string): string =>
  plan.replace('"kind": "all"', '"kind": "census"');

it("silent when the plan at the first result failed the schema elsewhere but declared these gates", () => {
  const repo = history("gates-in-a-bad-plan", badDraw(checkedPlan(0.2)), [
    SCORES,
    { [`${S}/plan.json`]: checkedPlan(0.2) },
  ]);
  // Guards: the plan committed first is no plan to the strict parser (before #483 this read as
  // `gates-not-fixed`), yet its gates came before the result; the draw fixed since is no gate.
  expect([
    studyRegistryCodec.parsePlan(badDraw(checkedPlan(0.2)), "measurement").kind,
    lint(repo),
  ]).toEqual(["unreadable", []]);
});

it("loud when such a plan's gate moved since, and when the gate itself could not be read there", () => {
  const moved = history(
    "gates-in-a-bad-plan-moved",
    badDraw(checkedPlan(0.2)),
    [SCORES, { [`${S}/plan.json`]: checkedPlan(0.1) }],
  );
  const unreadable = history(
    "gate-unreadable-then",
    checkedPlan(0.2).replace('"funnel": "none"', '"funnel": []'),
    [SCORES, { [`${S}/plan.json`]: checkedPlan(0.2) }],
  );
  // Guards: reading the gates alone never passes a moved gate, nor one that was not of its schema.
  expect([lint(moved), lint(unreadable)]).toEqual([
    ["gates-changed"],
    ["gates-not-fixed"],
  ]);
});
