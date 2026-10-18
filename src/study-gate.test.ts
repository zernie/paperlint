/**
 * `paperlint studies gate <paper-dir> <id>` (`src/study-gate.ts`) on papers held in memory, git a
 * stand-in: 0 once the decision is committed as it stands, 1 with the reason otherwise — and 0 for a
 * study whose run waits on nothing, saying why.
 */
import { expect, it } from "vitest";
import type { StudyMode } from "./domain/study-mode.ts";
import { planText, registryText } from "./domain/study-registry.ts";
import {
  DATE,
  DECIDED,
  DIR,
  ROW,
  S,
  SHA,
  planOf,
  studies,
  tree,
} from "../test/study-tree.ts";
const DECISION = `${DIR}/repro/P1-S01-outcome/decision.md`;
const decided = (mode: StudyMode = DECIDED) => tree({}, planOf(mode));

it("open once the decision is committed as it stands: exit 0 with its commit and date", () => {
  const r = studies(
    "gate",
    decided(),
    {},
    {
      git: { [DECISION]: { kind: "committed", commit: SHA, date: DATE } },
    },
  );
  // Guards: the line a runner's log keeps, and the exit code `gate && run` reads.
  expect([r.code, r.log, r.err]).toEqual([
    0,
    [
      `P1-S01: the decision repro/P1-S01-outcome/decision.md is committed in ${SHA} (${DATE}); the run may start.`,
    ],
    [],
  ]);
});

it("closed while the decision is uncommitted, changed since its commit, or unknown to git", () => {
  const gate = (state: Parameters<typeof studies>[3]) =>
    studies("gate", decided(), {}, state);
  // Guards: each reason the run must wait is said, exit 1.
  expect(
    [
      gate({}),
      gate({ git: { [DECISION]: { kind: "changed", commit: SHA } } }),
      gate({
        git: { [DECISION]: { kind: "unknown", why: "git is not installed" } },
      }),
    ].map((r) => [r.code, r.err]),
  ).toEqual([
    [
      1,
      [
        "P1-S01: the decision repro/P1-S01-outcome/decision.md is not committed; the run waits for it. Write the decision there, commit it, then run this again.",
      ],
    ],
    [
      1,
      [
        `P1-S01: the decision repro/P1-S01-outcome/decision.md has changed since its last commit, ${SHA}; the run waits for the decision as committed. Commit it, then run this again.`,
      ],
    ],
    [
      1,
      [
        "P1-S01: git could not say whether the decision repro/P1-S01-outcome/decision.md is committed: git is not installed.",
      ],
    ],
  ]);
});

it("refuses a plan that names no decision file, or one its own outputs match", () => {
  // Guards: a gate on nothing, or on a file the run itself produces, is no gate.
  expect([
    studies("gate", decided({ ...DECIDED, decision: { file: " ", note: "n" } }))
      .err,
    studies("gate", decided({ ...DECIDED, outputs: ["*.md"] })).err,
  ]).toEqual([
    [
      "P1-S01: its plan.json is a draft — `mode.decision.file` is empty; the run waits for a ready plan. Fill it in, then run this again.",
    ],
    [
      "P1-S01: its decision repro/P1-S01-outcome/decision.md is matched by its output `*.md`; a decision cannot be what its own run produces.",
    ],
  ]);
});

it("an exploratory study's run waits on nothing: exit 0, saying so", () => {
  // Guards: the runner may call gate on every study; the answer names the mode.
  expect(
    studies("gate", decided({ kind: "exploratory", reason: "a first look" })),
  ).toMatchObject({
    code: 0,
    log: [
      "P1-S01 is exploratory (a first look): it has no gate, and its results are reported as exploratory.",
    ],
  });
});

it("refuses a study that declares no mode, and one whose row names a folder outside repro/", () => {
  // Guards: a measurement with no mode is not gated by default — it is refused until it says how;
  // and a row naming `../x` is never read through, so no file outside the paper decides the gate.
  expect(
    [
      studies("gate", tree({}, planOf(undefined))),
      studies(
        "gate",
        tree(
          {
            [`${DIR}/x/plan.json`]: JSON.stringify(planOf(DECIDED)),
          },
          planOf(DECIDED),
          { ...ROW, folder: "../x" },
        ),
      ),
    ].map((r) => [r.code, r.err]),
  ).toEqual([
    [
      1,
      [
        "P1-S01 declares no mode in papers/example: the plan its row names in papers/example/repro/studies.json is missing, does not parse, or has no `mode`. Lint the paper (`npx paperlint lint`) to see why.",
      ],
    ],
    [
      1,
      [
        "P1-S01: its row names the folder `../x`, which is not one folder inside papers/example/repro/; nothing is read through it. Give the row its own folder's name.",
      ],
    ],
  ]);
});

it("refuses a command line without the study's id, or with an argument too many", () => {
  // Guards: exit 2 is the command line's, never the paper's state.
  expect(
    [
      studies("gate", decided(), { title: undefined }),
      studies("gate", decided(), { extra: ["P1-S02"] }),
    ].map((r) => [r.code, r.err]),
  ).toEqual([
    [
      2,
      [
        "studies gate needs the study's id: npx paperlint studies gate <paper-dir> <id>",
      ],
    ],
    [
      2,
      [
        "studies gate takes the paper's folder and one id — `P1-S02` is one argument too many",
      ],
    ],
  ]);
});

it("a plan it cannot read through declares no mode: no registry, a plan outside its folder, a NUL, not JSON", () => {
  const noMode = (t: Readonly<Record<string, string>>) =>
    studies("gate", t).err[0]?.split(":")[0];
  const withoutRegistry = Object.fromEntries(
    Object.entries(decided()).filter(([k]) => !k.endsWith("studies.json")),
  );
  // Guards: each is refused as declaring no mode — none is read past, none opens the gate.
  expect([
    noMode(tree({}, planOf(DECIDED), { ...ROW, plan: "../plan.json" })),
    noMode(tree({}, planOf(DECIDED), { ...ROW, plan: "a\0b.json" })),
    noMode({ ...decided(), [`${DIR}/repro/P1-S01-outcome/plan.json`]: "{" }),
  ]).toEqual(Array(3).fill("P1-S01 declares no mode in papers/example"));
  // …and a registry that is not there has no row for the id: its own refusal, not a mode's.
  expect(noMode(withoutRegistry)).toBe("P1-S01");
});

it("refuses an id no row of the registry carries, saying so and what to do: exit 1", () => {
  const r = studies("gate", decided(), { title: "P1-S09" });
  // Guards: an id that is not in the registry is not a study that "declares no mode".
  expect([r.code, r.log, r.err]).toEqual([
    1,
    [],
    [
      "P1-S09: no row of papers/example/repro/studies.json carries this id. Use an id from the registry, or register the study with `npx paperlint studies new`, then run this again.",
    ],
  ]);
});

it("refuses a decision that names a directory, whatever git says of it", () => {
  const dir = "repro/P1-S01-outcome/decisions";
  const r = studies(
    "gate",
    tree(
      { [`${DIR}/${dir}/a.md`]: "exclude run 7\n" },
      planOf({ ...DECIDED, decision: { file: dir, note: "n" } }),
    ),
    {},
    {
      git: {
        [`${DIR}/${dir}`]: { kind: "committed", commit: SHA, date: DATE },
      },
    },
  );
  // Guards: git answers for a directory with the last commit under it — never a decision as committed.
  expect([r.code, r.err]).toEqual([
    1,
    [
      `P1-S01: its decision ${dir} is a directory, not a file; the run cannot be gated on it. Name the decision file in \`mode.decision.file\`.`,
    ],
  ]);
});

it("closed when the decision was committed and then deleted: it is not in HEAD", () => {
  const r = studies(
    "gate",
    decided(),
    {},
    { git: { [DECISION]: { kind: "deleted", commit: SHA } } },
  );
  // Guards: a decision deleted in a later commit leaves a clean tree, and still gates nothing.
  expect([r.code, r.err]).toEqual([
    1,
    [
      `P1-S01: the decision repro/P1-S01-outcome/decision.md is not in HEAD: it was deleted in ${SHA}; the run waits for a decision that stands. Restore it, commit it, then run this again.`,
    ],
  ]);
});

it("refuses a plan that is still a draft: a mode is no decision until its plan is ready", () => {
  const r = studies(
    "gate",
    decided({ ...DECIDED, outputs: [] }),
    {},
    { git: { [DECISION]: { kind: "committed", commit: SHA, date: DATE } } },
  );
  const blankReason = studies(
    "gate",
    decided({ kind: "exploratory", reason: " " }),
  );
  const twoEmpty = studies(
    "gate",
    decided({
      ...DECIDED,
      outputs: [],
      decision: { ...DECIDED.decision, note: "" },
    }),
  );
  // Guards: a draft names no outputs to keep from the decision, and an exploratory plan with no
  // reason is no declaration; the gate opens on a ready plan only, whatever its mode.
  expect([
    [r.code, r.err],
    [blankReason.code, blankReason.err],
    [twoEmpty.code, twoEmpty.err],
  ]).toEqual([
    [
      1,
      [
        "P1-S01: its plan.json is a draft — `mode.outputs` is empty; the run waits for a ready plan. Fill it in, then run this again.",
      ],
    ],
    [
      1,
      [
        "P1-S01: its plan.json is a draft — `mode.reason` is empty; the run waits for a ready plan. Fill it in, then run this again.",
      ],
    ],
    [
      1,
      [
        "P1-S01: its plan.json is a draft — `mode.outputs`, `mode.decision.note` are empty; the run waits for a ready plan. Fill it in, then run this again.",
      ],
    ],
  ]);
});

it("refuses a decision or a study folder that is a symbolic link", () => {
  const committed = {
    [DECISION]: { kind: "committed", commit: SHA, date: DATE },
  } as const;
  const decisionLink = studies(
    "gate",
    { ...decided(), [DECISION]: "exclude run 7\n" },
    {},
    { git: committed, links: [DECISION] },
  );
  const folderLink = studies(
    "gate",
    decided(),
    {},
    { git: committed, links: [`${DIR}/repro/P1-S01-outcome`] },
  );
  // Guards: git records a link, not the file it points to; a linked folder leads out of `repro/`.
  expect([
    [decisionLink.code, decisionLink.err],
    [folderLink.code, folderLink.err],
  ]).toEqual([
    [
      1,
      [
        "P1-S01: its decision repro/P1-S01-outcome/decision.md is a symbolic link, not a file; the run cannot be gated on it. Name the decision file in `mode.decision.file`.",
      ],
    ],
    [
      1,
      [
        "P1-S01: its row names the folder `P1-S01-outcome`, which is not one folder inside papers/example/repro/; nothing is read through it. Give the row its own folder's name.",
      ],
    ],
  ]);
});

it("never reads a plan through a backslash: `..\\x\\plan.json` is outside the folder on Windows", () => {
  const plan = "..\\x\\plan.json";
  const r = studies(
    "gate",
    tree(
      {
        [`${DIR}/repro/P1-S01-outcome/${plan}`]: JSON.stringify(
          planOf(DECIDED),
        ),
      },
      planOf(DECIDED),
      { ...ROW, plan },
    ),
    {},
    { git: { [DECISION]: { kind: "committed", commit: SHA, date: DATE } } },
  );
  // Guards: the containment test is the registry rule's own `isInside`, the same on every platform.
  expect(r.err[0]?.split(":")[0]).toBe(
    "P1-S01 declares no mode in papers/example",
  );
});

it("refuses an id that two rows share, even when the first row is exploratory: exit 1, naming both folders", () => {
  const second = { ...ROW, folder: "P1-S01-again" };
  const t = {
    ...tree(
      {
        [`${DIR}/repro/P1-S01-again/plan.json`]: JSON.stringify(
          planOf(DECIDED),
        ),
      },
      planOf({ kind: "exploratory", reason: "a first look" }),
    ),
    [`${DIR}/repro/studies.json`]: registryText({
      prefix: "P1",
      studies: [ROW, second],
    }),
  };
  const r = studies("gate", t);
  // Guards: `gate && run` must not start on the first row's mode while a later row of the same id
  // decides before its run; lint need not have run first.
  expect([r.code, r.log, r.err]).toEqual([
    1,
    [],
    [
      "P1-S01: 2 rows of papers/example/repro/studies.json carry this id (folders `P1-S01-outcome`, `P1-S01-again`); the gate answers for exactly one study. Give each other row the next free id and rename its folder to match, then run this again.",
    ],
  ]);
});

it("refuses a plan that is a symbolic link, or sits under a linked directory, naming the link: exit 1", () => {
  const exploratory = planOf({ kind: "exploratory", reason: "a first look" });
  const asLink = studies(
    "gate",
    tree({}, exploratory),
    {},
    { links: [`${S}/plan.json`] },
  );
  const sub = { ...ROW, plan: "sub/plan.json" };
  const underLink = studies(
    "gate",
    tree({ [`${S}/sub/plan.json`]: planText(exploratory) }, exploratory, sub),
    {},
    { links: [`${S}/sub`] },
  );
  // Guards: a plan read through a link would open the gate on a file git does not store as the
  // study's; the refusal names the row, the plan, the link and the fix. The files behind the link
  // are ready exploratory plans, so a read through it would exit 0.
  expect([asLink, underLink].map((r) => [r.code, r.log, r.err])).toEqual([
    [
      1,
      [],
      [
        "P1-S01: its plan plan.json in papers/example/repro/P1-S01-outcome passes through the symbolic link `plan.json`; nothing is read through a link. Replace the link with the plan file itself, then run this again.",
      ],
    ],
    [
      1,
      [],
      [
        "P1-S01: its plan sub/plan.json in papers/example/repro/P1-S01-outcome passes through the symbolic link `sub`; nothing is read through a link. Replace the link with the plan file itself, then run this again.",
      ],
    ],
  ]);
});
