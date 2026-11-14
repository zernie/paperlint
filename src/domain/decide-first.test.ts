/**
 * What `repro/outputs-before-decision` decides from git's facts (`src/domain/decide-first.ts`): silent
 * on outputs that came after the decision, loud on each output that did not, on outputs with no
 * decision committed, on a decision the outputs match, and on a history it cannot read.
 */
import { expect, it } from "vitest";
import {
  firstOutputAfter,
  judgeOrder,
  orderMessage,
  type DecideFirstStudy,
  type OrderFinding,
  type PlanThen,
} from "./decide-first.ts";
import type { PlanGates } from "./study-gates.ts";

const D = { commit: "d".repeat(40), date: "2026-10-16T10:00:00+05:00" };
const A = { commit: "a".repeat(40), date: "2026-10-16T11:00:00+05:00" };

const STUDY: DecideFirstStudy = {
  id: "P1-S01",
  folder: "P1-S01-x",
  plan: "plan.json",
  mode: {
    kind: "decide_before_run",
    outputs: ["out/**", "RESULTS.md"],
    decision: { file: "repro/P1-S01-x/decision.md", note: "exclusions" },
  },
  tree: ["plan.json", "README.md", "decision.md", "RESULTS.md", "notes.txt"],
  facts: {
    kind: "read",
    decision: D,
    decisionDeleted: false,
    files: [
      { path: "decision.md", ...D, order: "same" },
      { path: "plan.json", ...D, order: "same" },
      { path: "RESULTS.md", ...A, order: "after" },
      { path: "notes.txt", ...D, order: "same" },
    ],
  },
};

it("silent when every output entered history after the decision; the study's own files never count", () => {
  // Guards: the clean history — and the decision and the plan, committed together, are no outputs.
  expect(judgeOrder(STUDY)).toEqual([]);
});

it("an output in the decision's commit, or not after it, deleted or not, is one finding each", () => {
  const facts = {
    kind: "read",
    decision: D,
    decisionDeleted: false,
    files: [
      { path: "RESULTS.md", ...D, order: "same" },
      { path: "out/gone.csv", ...A, order: "not-after" },
    ],
  } as const;
  // Guards: loud on each defect, the deleted early output included.
  expect(judgeOrder({ ...STUDY, facts })).toEqual([
    {
      problem: "output-before-decision",
      id: "P1-S01",
      folder: "P1-S01-x",
      path: "RESULTS.md",
      role: "output",
      output: D,
      decision: D,
      same: true,
    },
    {
      problem: "output-before-decision",
      id: "P1-S01",
      folder: "P1-S01-x",
      path: "out/gone.csv",
      role: "output",
      output: A,
      decision: D,
      same: false,
    },
  ]);
});

it("an output in the tree while the decision was never committed", () => {
  // Guards: the run started before any decision existed in history.
  expect(
    judgeOrder({
      ...STUDY,
      facts: {
        kind: "read",
        decision: null,
        decisionDeleted: false,
        files: [],
      },
    }),
  ).toEqual([
    {
      problem: "undecided-output",
      id: "P1-S01",
      folder: "P1-S01-x",
      path: "RESULTS.md",
      role: "output",
      decision: "repro/P1-S01-x/decision.md",
    },
  ]);
});

it("an output committed and since deleted, while the decision was never committed, still counts", () => {
  // Guards: history is the evidence — an output that existed before any decision is not erased by
  // deleting it; each path is said once, whether it is in the tree, in history, or both.
  expect(
    judgeOrder({
      ...STUDY,
      tree: ["plan.json", "README.md", "RESULTS.md"],
      facts: {
        kind: "read",
        decision: null,
        decisionDeleted: false,
        files: [
          { path: "plan.json", ...D, order: "not-after" },
          { path: "out/gone.csv", ...A, order: "not-after" },
          { path: "RESULTS.md", ...A, order: "not-after" },
        ],
      },
    }).map((f) => (f.problem === "undecided-output" ? f.path : f.problem)),
  ).toEqual(["RESULTS.md", "out/gone.csv"]);
});

it("a history it cannot read, and a decision the outputs match, are said", () => {
  const clash = {
    ...STUDY,
    mode: { ...STUDY.mode, outputs: ["**/*.md"] },
  };
  // Guards: no git and a shallow clone are findings, never a pass; the clash comes first.
  expect([
    judgeOrder({
      ...STUDY,
      facts: { kind: "unknown", why: "git is not installed" },
    }),
    judgeOrder({ ...clash, facts: { kind: "shallow" } }),
  ]).toEqual([
    [{ problem: "no-history", id: "P1-S01", why: "git is not installed" }],
    [
      {
        problem: "decision-is-output",
        id: "P1-S01",
        file: "repro/P1-S01-x/decision.md",
        glob: "**/*.md",
      },
      { problem: "shallow", id: "P1-S01" },
    ],
  ]);
});

it("a decision committed and since deleted is reported, and no order is judged against it", () => {
  // Guards: outputs that came after a decision that no longer stands are not passed on it.
  expect(
    judgeOrder({
      ...STUDY,
      facts: {
        kind: "read",
        decision: D,
        decisionDeleted: true,
        files: [{ path: "RESULTS.md", ...A, order: "after" }],
      },
    }),
  ).toEqual([
    {
      problem: "decision-deleted",
      id: "P1-S01",
      file: "repro/P1-S01-x/decision.md",
    },
  ]);
});

it("a decision that names a directory is reported, and no history is judged", () => {
  // Guards: the outputs of such a study are never passed on a directory's commits.
  expect(
    judgeOrder({ ...STUDY, facts: { kind: "not-a-file", what: "directory" } }),
  ).toEqual([
    {
      problem: "decision-not-file",
      id: "P1-S01",
      file: "repro/P1-S01-x/decision.md",
      what: "directory",
    },
  ]);
});

it("a decision behind a linked directory is reported with the link, and no history is judged", () => {
  // Guards: git records a path through a link as what lies behind the link.
  expect(
    judgeOrder({
      ...STUDY,
      facts: { kind: "linked", link: "repro/P1-S01-x/sub" },
    }),
  ).toEqual([
    {
      problem: "decision-linked",
      id: "P1-S01",
      file: "repro/P1-S01-x/decision.md",
      link: "repro/P1-S01-x/sub",
    },
  ]);
});

const PAGE =
  "\nRule repro/outputs-before-decision: https://github.com/zernie/paperlint/blob/main/docs/rules/repro/outputs-before-decision.md";

/** One finding of every problem, the decision's first. */
const ALL: readonly OrderFinding[] = [
  {
    problem: "decision-is-output",
    id: "P1-S01",
    file: "repro/P1-S01-x/decision.md",
    glob: "**/*.md",
  },
  { problem: "decision-deleted", id: "P1-S01", file: "repro/d.md" },
  {
    problem: "decision-not-file",
    id: "P1-S01",
    file: "repro/p",
    what: "special file",
  },
  {
    problem: "decision-not-file",
    id: "P1-S01",
    file: "repro/d",
    what: "directory",
  },
  {
    problem: "decision-not-file",
    id: "P1-S01",
    file: "repro/l.md",
    what: "symbolic link",
  },
  {
    problem: "decision-linked",
    id: "P1-S01",
    file: "repro/sub/d.md",
    link: "repro/sub",
  },
  { problem: "no-history", id: "P1-S01", why: "git is not installed" },
  { problem: "shallow", id: "P1-S01" },
  {
    problem: "undecided-output",
    id: "P1-S01",
    folder: "P1-S01-x",
    path: "RESULTS.md",
    role: "output",
    decision: "repro/P1-S01-x/decision.md",
  },
  {
    problem: "output-before-decision",
    id: "P1-S01",
    folder: "P1-S01-x",
    path: "RESULTS.md",
    role: "output",
    output: D,
    decision: D,
    same: true,
  },
  {
    problem: "output-before-decision",
    id: "P1-S01",
    folder: "P1-S01-x",
    path: "RESULTS.md",
    role: "output",
    output: A,
    decision: D,
    same: false,
  },
];

it("each finding's message: what is wrong, what to do, the rule's page", () => {
  // Guards: the whole text a person reads, for every problem.
  expect(ALL.map(orderMessage)).toEqual([
    "The decision of `P1-S01`, `repro/P1-S01-x/decision.md`, is matched by its output `**/*.md`: the decision would be one of the files its own run produces. What to do: keep the decision out of the outputs — a file the globs do not match, or one elsewhere in the paper — and set `mode.decision.file`." +
      PAGE,
    "The decision of `P1-S01`, `repro/d.md`, was committed and then deleted: it is not in HEAD, so the study has no decision its outputs could follow. What to do: restore the decision file as it was decided and commit it — never write a new one after the outputs; if the decision no longer holds, declare the study `exploratory` with the reason." +
      PAGE,
    "The decision of `P1-S01`, `repro/p`, is a special file, not a file: git tracks only regular files, so no order can be read from it. What to do: name the decision file itself in `mode.decision.file`." +
      PAGE,
    "The decision of `P1-S01`, `repro/d`, is a directory, not a file: git answers for a directory with the commits of anything under it, so no order can be read from it. What to do: name the decision file itself in `mode.decision.file`." +
      PAGE,
    "The decision of `P1-S01`, `repro/l.md`, is a symbolic link, not a file: git records the link, not the file it points to, so no order can be read from it. What to do: name the decision file itself in `mode.decision.file`." +
      PAGE,
    "The decision of `P1-S01`, `repro/sub/d.md`, passes through the symbolic link `repro/sub`: git records the link, not the files behind it, so no order can be read from it. What to do: name a decision file that lies in real directories in `mode.decision.file`." +
      PAGE,
    "`P1-S01` is decided before its run, and git's history is the proof of that order, but git could not answer: git is not installed. What to do: lint the paper inside its git repository, with git installed." +
      PAGE,
    "`P1-S01` is decided before its run, and this clone is shallow: every file's first commit is the clone's first, so the order of decision and outputs cannot be read. What to do: fetch the whole history (`git fetch --unshallow`; in GitHub Actions, `actions/checkout` with `fetch-depth: 0`)." +
      PAGE,
    "`repro/P1-S01-x/RESULTS.md` is an output of `P1-S01` — in the tree, or in its history — and the study is decided before its run, but its decision `repro/P1-S01-x/decision.md` was never committed. What to do: write and commit the decision, check it with `npx paperlint studies gate <paper-dir> P1-S01`, then run the study again; if the output was made before any decision, declare the study `exploratory` with the reason. Deleting the output does not undo it: history keeps it." +
      PAGE,
    `\`repro/P1-S01-x/RESULTS.md\`, an output of \`P1-S01\`, entered history in ${"d".repeat(12)} (${D.date}), the very commit that first recorded its decision, ${"d".repeat(12)} (${D.date}). The study is declared decided before its run, and its history does not show that order. What to do: if the decision really came first, nothing in this history can prove it — declare the study \`exploratory\` with the reason, or run it again after the decision; never rewrite the history to make it pass.` +
      PAGE,
    `\`repro/P1-S01-x/RESULTS.md\`, an output of \`P1-S01\`, entered history in ${"a".repeat(12)} (${A.date}), not after the commit that first recorded its decision, ${"d".repeat(12)} (${D.date}). The study is declared decided before its run, and its history does not show that order. What to do: if the decision really came first, nothing in this history can prove it — declare the study \`exploratory\` with the reason, or run it again after the decision; never rewrite the history to make it pass.` +
      PAGE,
  ]);
});

// ── a plan v2's gates against the plan at the first output ──────────────────────────────────────

const GATES: PlanGates = {
  we_lose_if: { result: "share", below: 0.2 },
  second_check: [{ step: "fits", min_kappa: 0.6 }],
  self_test: "none",
  funnel: ["no linter rule"],
  recall_audit: "none",
};
const OUT = { path: "RESULTS.md", ...A, order: "after" as const };
const withGates = (
  then: PlanThen,
  now: PlanGates = GATES,
): DecideFirstStudy => ({
  ...STUDY,
  gates: { now, output: OUT, then },
});

it("the first output after the decision is the one the gates are held to; none while none followed it", () => {
  // Guards: the study's own files and outputs not after the decision are not it.
  expect([
    firstOutputAfter(
      STUDY,
      STUDY.facts.kind === "read" ? STUDY.facts.files : [],
    ),
    firstOutputAfter(STUDY, [{ path: "RESULTS.md", ...D, order: "same" }]),
  ]).toEqual([OUT, null]);
});

it("gates as they stood at the first output are silent; each one changed since is a finding", () => {
  const moved: PlanGates = {
    ...GATES,
    we_lose_if: { result: "share", below: 0.1 },
    funnel: ["no linter rule", "clone failed"],
    recall_audit: { n_files: 50, min_recall: 0.5 },
  };
  const at = {
    id: "P1-S01",
    folder: "P1-S01-x",
    plan: "plan.json",
    output: OUT,
  };
  // Guards: deep equality, not identity; one finding per changed gate, in the gates' order.
  expect([
    judgeOrder(withGates({ kind: "gates", gates: structuredClone(GATES) })),
    judgeOrder(withGates({ kind: "gates", gates: GATES }, moved)),
  ]).toEqual([
    [],
    [
      {
        problem: "gates-changed",
        ...at,
        gate: "we_lose_if",
        then: { result: "share", below: 0.2 },
        now: { result: "share", below: 0.1 },
      },
      {
        problem: "gates-changed",
        ...at,
        gate: "funnel",
        then: ["no linter rule"],
        now: ["no linter rule", "clone failed"],
      },
      {
        problem: "gates-changed",
        ...at,
        gate: "recall_audit",
        then: "none",
        now: { n_files: 50, min_recall: 0.5 },
      },
    ],
  ]);
});

it("no gates at the first output is a finding with its reason; a history git cannot read is said", () => {
  const at = {
    id: "P1-S01",
    folder: "P1-S01-x",
    plan: "plan.json",
    output: OUT,
  };
  expect([
    judgeOrder(withGates({ kind: "no-gates", why: "absent" })),
    judgeOrder(withGates({ kind: "unknown", why: "fatal: x" })),
  ]).toEqual([
    [{ problem: "gates-not-fixed", ...at, why: "absent" }],
    [{ problem: "no-history", id: "P1-S01", why: "fatal: x" }],
  ]);
});

it("the gates' messages: which gate, then and now, the output's commit, and what to do", () => {
  const at = {
    id: "P1-S01",
    folder: "P1-S01-x",
    plan: "plan.json",
    output: OUT,
  };
  const when = `\`RESULTS.md\`, entered history in ${"a".repeat(12)} (${A.date})`;
  const fix =
    "What to do: run the study again now that the plan v2 is committed; if the outputs must stand, declare the study `exploratory` with the reason.";
  // Guards: the whole text for each finding and each reason.
  expect(
    [
      {
        problem: "gates-changed" as const,
        ...at,
        gate: "we_lose_if" as const,
        then: { result: "share", below: 0.2 },
        now: { result: "share", below: 0.1 },
      },
      ...(["absent", "v1", "unreadable"] as const).map((why) => ({
        problem: "gates-not-fixed" as const,
        ...at,
        why,
      })),
    ].map(orderMessage),
  ).toEqual([
    `The gate \`we_lose_if\` in the plan of \`P1-S01\`, \`repro/P1-S01-x/plan.json\`, was {"result":"share","below":0.2} when its first output, ${when}, and is {"result":"share","below":0.1} now. A gate is fixed before the run: moved after a result exists, it can only follow the result. What to do: put the gate back as it was; if it was wrong, say so in the paper and run the study again under the corrected plan — never edit the history to make it pass.` +
      PAGE,
    `The plan of \`P1-S01\`, \`repro/P1-S01-x/plan.json\`, was not in history yet when its first output, ${when}: its gates were not fixed before the run. ${fix}` +
      PAGE,
    `The plan of \`P1-S01\`, \`repro/P1-S01-x/plan.json\`, was a plan v1, which declares no gates, when its first output, ${when}: its gates were not fixed before the run. ${fix}` +
      PAGE,
    `The plan of \`P1-S01\`, \`repro/P1-S01-x/plan.json\`, was no plan paperlint could read when its first output, ${when}: its gates were not fixed before the run. ${fix}` +
      PAGE,
  ]);
});

// ── self-checks are not results (issue #483) ─────────────────────────────────────────────────────

const C = { commit: "c".repeat(40), date: "2026-10-16T10:30:00+05:00" };
const CHECKED: DecideFirstStudy = {
  ...STUDY,
  mode: {
    ...STUDY.mode,
    outputs: ["data/**"],
    checks: ["data/gate.json"],
  },
  tree: ["plan.json", "README.md", "decision.md", "data/gate.json"],
  facts: {
    kind: "read",
    decision: D,
    decisionDeleted: false,
    files: [
      { path: "decision.md", ...D, order: "same" },
      { path: "plan.json", ...D, order: "same" },
      { path: "data/gate.json", ...C, order: "after" },
      { path: "data/scores.json", ...A, order: "after" },
    ],
  },
};

it("the gates are held to the first result, never to a self-check that came before it", () => {
  const files = CHECKED.facts.kind === "read" ? CHECKED.facts.files : [];
  // Guards: the harness's own check (`data/gate.json`) matches the outputs' glob and came first; the
  // plan is dated against the scored file, and with only the check in history there is no result yet.
  expect([
    firstOutputAfter(CHECKED, files),
    firstOutputAfter(CHECKED, files.slice(0, 3)),
  ]).toEqual([{ path: "data/scores.json", ...A, order: "after" }, null]);
});

it("a self-check committed with or before its decision is still reported, as a check", () => {
  const facts = {
    kind: "read",
    decision: D,
    decisionDeleted: false,
    files: [
      { path: "data/gate.json", ...D, order: "same" },
      { path: "data/scores.json", ...A, order: "after" },
    ],
  } as const;
  // Guards: a check run before its decision is as wrong as a result run before it; named as a check.
  expect([
    judgeOrder({ ...CHECKED, facts }),
    judgeOrder({
      ...CHECKED,
      facts: {
        kind: "read",
        decision: null,
        decisionDeleted: false,
        files: [],
      },
    }),
  ]).toEqual([
    [
      {
        problem: "output-before-decision",
        id: "P1-S01",
        folder: "P1-S01-x",
        path: "data/gate.json",
        role: "check",
        output: D,
        decision: D,
        same: true,
      },
    ],
    [
      {
        problem: "undecided-output",
        id: "P1-S01",
        folder: "P1-S01-x",
        path: "data/gate.json",
        role: "check",
        decision: "repro/P1-S01-x/decision.md",
      },
    ],
  ]);
});

it("a check glob carves its files out of a wider output glob: the clean history is silent", () => {
  // Guards: the plan of the report — outputs `data/**`, its check `data/gate.json` — needs no rewrite
  // of its outputs, and a check after the decision is no finding.
  expect(judgeOrder(CHECKED)).toEqual([]);
});

it("the messages of a check: before its decision, and with no decision", () => {
  // Guards: the whole text a person reads for each.
  expect(
    (
      [
        {
          problem: "output-before-decision",
          id: "P1-S01",
          folder: "P1-S01-x",
          path: "data/gate.json",
          role: "check",
          output: A,
          decision: D,
          same: false,
        },
        {
          problem: "undecided-output",
          id: "P1-S01",
          folder: "P1-S01-x",
          path: "data/gate.json",
          role: "check",
          decision: "repro/P1-S01-x/decision.md",
        },
      ] as const
    ).map(orderMessage),
  ).toEqual([
    `\`repro/P1-S01-x/data/gate.json\`, a self-check of \`P1-S01\` (\`mode.checks\`), entered history in ${"a".repeat(12)} (${A.date}), not after the commit that first recorded its decision, ${"d".repeat(12)} (${D.date}). The study is declared decided before its run, and its history does not show that order. What to do: if the decision really came first, nothing in this history can prove it — declare the study \`exploratory\` with the reason, or run it again after the decision; never rewrite the history to make it pass.` +
      PAGE,
    "`repro/P1-S01-x/data/gate.json` is a self-check of `P1-S01` (`mode.checks`) — in the tree, or in its history — and the study is decided before its run, but its decision `repro/P1-S01-x/decision.md` was never committed. What to do: write and commit the decision, check it with `npx paperlint studies gate <paper-dir> P1-S01`, then run the study again; if the self-check was made before any decision, declare the study `exploratory` with the reason. Deleting the self-check does not undo it: history keeps it." +
      PAGE,
  ]);
});
