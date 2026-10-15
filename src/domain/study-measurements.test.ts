/**
 * The study registry above its studies (`src/domain/study-registry.ts`): the author's requirements,
 * the measurements a study belongs to, and each study's plan. Both halves: a registry whose
 * measurements, approvals and plans hold together is silent; each defect is reported once, with a
 * text that stands alone. A registry without the new keys is judged as before.
 */
import { describe, expect, it } from "vitest";
import {
  PLAN_FILE,
  judgeStudies,
  planTemplate,
  planText,
  studyMessage,
  withIndex,
  type Measurement,
  type PlanState,
  type Study,
  type StudyInput,
  type StudyPlan,
  type StudyRegistry,
} from "./study-registry.ts";

const study = (over: Partial<Study> = {}): Study => ({
  id: "P1-S01",
  folder: "P1-S01-census",
  title: "Census of rules",
  question: "How many rules can a linter check?",
  kind: "measurement",
  status: "running",
  date: "2026-10-15",
  in_paper: "no",
  ...over,
});

const AUTHOR_CHECK = {
  by: "A. Author",
  date: "2026-10-14",
  quote: "These are the rules I meet. Go.",
} as const;

const APPROVAL = {
  by: "A. Author",
  date: "2026-10-12",
  quote: "This is the one.",
} as const;

const PLAN: StudyPlan = {
  question: "How many rules can a linter check?",
  population: {
    source: "every rule found in the crawl of 2026-10-01",
    size: 4210,
    draw: { method: "census" },
  },
  arms: [],
  primary_outcome: "the share of rules a linter can check",
  author_check: AUTHOR_CHECK,
};

const HEADLINE: Measurement = {
  id: "M1",
  title: "Rule census",
  role: "headline",
  approval: APPROVAL,
  requirements: ["R1"],
};

/** A registry with an author, one requirement, the headline measurement and its one study. */
const reg = (over: Partial<StudyRegistry> = {}): StudyRegistry => ({
  prefix: "P1",
  author: "A. Author",
  requirements: [
    {
      id: "R1",
      text: "Every sample is a random draw from all rules found, no filter by difficulty.",
      date: "2026-10-10",
      source: "chat",
    },
  ],
  measurements: [HEADLINE],
  studies: [study({ measurement: "M1", plan: PLAN_FILE })],
  ...over,
});

const read = (plan: StudyPlan): PlanState => ({ kind: "read", plan });

/** A `repro/` that holds every row's folder and plan, its index in sync, then `over`. */
const input = (
  r: StudyRegistry,
  over: Partial<StudyInput> = {},
): StudyInput => ({
  folders: r.studies.map((s) => s.folder),
  registry: { kind: "read", registry: r },
  readme: withIndex("# Reproduction index\n", r),
  existingResults: new Set(),
  plans: new Map(
    r.studies.flatMap((s) =>
      s.plan === undefined ? [] : [[`${s.folder}/${s.plan}`, read(PLAN)]],
    ),
  ),
  ...over,
});

const findings = (r: StudyRegistry, over: Partial<StudyInput> = {}) =>
  judgeStudies(input(r, over));

describe("measurements and plans — silent", () => {
  it("on a headline measurement approved by the author, its study's plan checked by the author", () => {
    expect(findings(reg())).toEqual([]);
  });

  it("on a registry without the new keys: a row's `measurement` is a field of its own, as before", () => {
    const r: StudyRegistry = {
      prefix: "P1",
      studies: [study({ measurement: "census", measurement_title: "Census" })],
    };
    expect(findings(r)).toEqual([]);
  });

  it("on a registry with no author: any approval stands", () => {
    const { author, ...r } = reg();
    expect(author).toBeDefined();
    expect(findings(r)).toEqual([]);
  });

  it("on a baseline measurement with no approval, and a study of it with no plan", () => {
    const r = reg({
      measurements: [
        HEADLINE,
        { id: "M2", title: "Baseline linter", role: "baseline" },
      ],
      studies: [
        study({ measurement: "M1", plan: PLAN_FILE }),
        study({ id: "P1-S02", folder: "P1-S02-base", measurement: "M2" }),
      ],
    });
    expect(findings(r)).toEqual([]);
  });

  it("on a designing study whose plan is the template, in a headline measurement", () => {
    const r = reg({
      studies: [
        study({ status: "designing", measurement: "M1", plan: PLAN_FILE }),
      ],
    });
    const plans = new Map([
      [`P1-S01-census/${PLAN_FILE}`, read(planTemplate())],
    ]);
    expect(findings(r, { plans })).toEqual([]);
  });

  it("on a dropped study of a headline measurement with no plan", () => {
    const r = reg({
      studies: [
        study({ measurement: "M1", plan: PLAN_FILE }),
        study({
          id: "P1-S02",
          folder: "P1-S02-pilot",
          status: "dropped",
          measurement: "M1",
        }),
      ],
    });
    expect(findings(r)).toEqual([]);
  });
});

describe("measurements — a row's measurement, and a measurement's studies", () => {
  it("a row naming a measurement that is not in `measurements`", () => {
    const r = reg({
      studies: [
        study({ measurement: "M1", plan: PLAN_FILE }),
        study({ id: "P1-S02", folder: "P1-S02-pilot", measurement: "M9" }),
      ],
    });
    expect(findings(r)).toEqual([
      { problem: "unknown-measurement", id: "P1-S02", measurement: "M9" },
    ]);
  });

  it("a measurement no row names", () => {
    const r = reg({
      measurements: [
        HEADLINE,
        { id: "M2", title: "Replication", role: "baseline" },
      ],
    });
    expect(findings(r)).toEqual([
      { problem: "empty-measurement", measurement: "M2" },
    ]);
  });

  it("a measurement that must meet a requirement the registry does not hold", () => {
    const r = reg({
      measurements: [{ ...HEADLINE, requirements: ["R1", "R7"] }],
    });
    expect(findings(r)).toEqual([
      { problem: "unknown-requirement", measurement: "M1", requirement: "R7" },
    ]);
  });

  it("requirements named when the registry holds none", () => {
    const { requirements, ...r } = reg();
    expect(requirements).toBeDefined();
    expect(findings(r)).toEqual([
      { problem: "unknown-requirement", measurement: "M1", requirement: "R1" },
    ]);
  });
});

describe("measurements — a headline's approval", () => {
  it("a headline measurement with no approval", () => {
    const { approval, ...m } = HEADLINE;
    expect(approval).toBeDefined();
    expect(findings(reg({ measurements: [m] }))).toEqual([
      {
        problem: "headline-approval",
        measurement: "M1",
        why: "missing",
        author: "A. Author",
      },
    ]);
  });

  it("a headline measurement with no approval, in a registry with no author", () => {
    const { approval, ...m } = HEADLINE;
    const { author, ...r } = reg({ measurements: [m] });
    expect([approval, author]).toHaveLength(2);
    expect(findings(r)).toEqual([
      {
        problem: "headline-approval",
        measurement: "M1",
        why: "missing",
        author: null,
      },
    ]);
  });

  it("a headline measurement approved by someone other than the author", () => {
    const m = { ...HEADLINE, approval: { ...APPROVAL, by: "an agent" } };
    expect(findings(reg({ measurements: [m] }))).toEqual([
      {
        problem: "headline-approval",
        measurement: "M1",
        why: "not-author",
        by: "an agent",
        author: "A. Author",
      },
    ]);
  });
});

describe("plans — the file a row names", () => {
  it("a plan that is not there", () => {
    expect(findings(reg(), { plans: new Map() })).toEqual([
      { problem: "bad-plan", id: "P1-S01", path: PLAN_FILE, why: "missing" },
    ]);
  });

  it("a running study of a headline measurement whose row names no plan", () => {
    const r = reg({ studies: [study({ measurement: "M1" })] });
    expect(findings(r)).toEqual([
      {
        problem: "author-check",
        id: "P1-S01",
        measurement: "M1",
        status: "running",
        why: "no-plan",
      },
    ]);
  });

  it("a plan outside the study's folder", () => {
    const r = reg({
      studies: [study({ measurement: "M1", plan: "../plan.json" })],
    });
    expect(findings(r)).toEqual([
      {
        problem: "bad-plan",
        id: "P1-S01",
        path: "../plan.json",
        why: "outside",
      },
    ]);
  });

  it("a plan that is not of the schema", () => {
    const r = reg({ studies: [study({ plan: PLAN_FILE })], measurements: [] });
    const plans = new Map<string, PlanState>([
      [
        `P1-S01-census/${PLAN_FILE}`,
        { kind: "unreadable", why: "question: required" },
      ],
    ]);
    expect(findings(r, { plans })).toEqual([
      {
        problem: "bad-plan",
        id: "P1-S01",
        path: PLAN_FILE,
        why: "unreadable",
        reasons: "question: required",
      },
    ]);
  });

  it("a study that has run on a plan with empty fields", () => {
    const r = reg({
      studies: [study({ status: "done", result: "x", plan: PLAN_FILE })],
      measurements: [],
    });
    const plans = new Map([
      [`P1-S01-census/${PLAN_FILE}`, read(planTemplate())],
    ]);
    expect(findings(r, { plans })).toEqual([
      { problem: "no-result", id: "P1-S01", missing: ["result_file"] },
      {
        problem: "bad-plan",
        id: "P1-S01",
        path: PLAN_FILE,
        why: "unfilled",
        fields: [
          "question",
          "population.source",
          "population.draw.method",
          "primary_outcome",
        ],
        status: "done",
      },
    ]);
  });

  it("an old prereg.json as the plan: read as the plan, and reported for its name", () => {
    const r = reg({
      studies: [study({ measurement: "M1", plan: "prereg.json" })],
    });
    expect(findings(r)).toEqual([
      { problem: "legacy-plan", id: "P1-S01", path: "prereg.json" },
    ]);
  });
});

describe("plans — the author's check of a headline measurement's study", () => {
  it("a running study of a headline measurement whose plan has no author_check", () => {
    const { author_check, ...plan } = PLAN;
    expect(author_check).toBeDefined();
    const plans = new Map([[`P1-S01-census/${PLAN_FILE}`, read(plan)]]);
    expect(findings(reg(), { plans })).toEqual([
      {
        problem: "author-check",
        id: "P1-S01",
        measurement: "M1",
        status: "running",
        why: "missing",
      },
    ]);
  });

  it("an author_check of null, as the template writes it, is none", () => {
    const plans = new Map([
      [`P1-S01-census/${PLAN_FILE}`, read({ ...PLAN, author_check: null })],
    ]);
    expect(judgeStudies(input(reg(), { plans })).map((f) => f.problem)).toEqual(
      ["author-check"],
    );
  });

  it("an author_check by someone other than the author", () => {
    const plans = new Map([
      [
        `P1-S01-census/${PLAN_FILE}`,
        read({ ...PLAN, author_check: { ...AUTHOR_CHECK, by: "an agent" } }),
      ],
    ]);
    expect(findings(reg(), { plans })).toEqual([
      {
        problem: "author-check",
        id: "P1-S01",
        measurement: "M1",
        status: "running",
        why: "not-author",
        by: "an agent",
        author: "A. Author",
      },
    ]);
  });

  it("a plan that cannot be read is reported once, as a plan", () => {
    const plans = new Map<string, PlanState>([
      [`P1-S01-census/${PLAN_FILE}`, { kind: "unreadable", why: "not JSON" }],
    ]);
    expect(judgeStudies(input(reg(), { plans })).map((f) => f.problem)).toEqual(
      ["bad-plan"],
    );
  });
});

describe("planTemplate and planText", () => {
  it("every field present, its value to fill, and author_check null", () => {
    expect(planTemplate()).toEqual({
      question: "",
      population: { source: "", size: null, draw: { method: "", seed: null } },
      arms: [],
      primary_outcome: "",
      author_check: null,
    });
  });

  it("is JSON, two-space indented, with a final newline", () => {
    expect(planText(PLAN)).toBe(`${JSON.stringify(PLAN, null, 2)}\n`);
  });
});

/** Each new finding, and the head of the text it is reported with. */
const MESSAGES = [
  [
    { problem: "unknown-measurement", id: "P1-S02", measurement: "M9" },
    "`repro/studies.json`: the row `P1-S02` names the measurement `M9`, which is not in `measurements`. What to do: add the measurement to `measurements`, or correct the row's `measurement`.",
  ],
  [
    { problem: "empty-measurement", measurement: "M2" },
    '`repro/studies.json`: no row names the measurement `M2`, and a measurement is made of studies. What to do: set `"measurement": "M2"` on the rows of its studies, or remove the measurement.',
  ],
  [
    { problem: "unknown-requirement", measurement: "M1", requirement: "R7" },
    "`repro/studies.json`: the measurement `M1` must meet the requirement `R7`, which is not in `requirements`. What to do: add the requirement — the author's words verbatim in `text`, with its `date` and `source` — or correct the measurement's `requirements`.",
  ],
  [
    {
      problem: "headline-approval",
      measurement: "M1",
      why: "missing",
      author: "A. Author",
    },
    "`repro/studies.json`: the measurement `M1` is a `headline` one and has no `approval`. What to do: record the approval of A. Author, the registry's `author` — `by`, `date`, and their words in `quote` — or make it a `baseline`.",
  ],
  [
    {
      problem: "headline-approval",
      measurement: "M1",
      why: "missing",
      author: null,
    },
    "`repro/studies.json`: the measurement `M1` is a `headline` one and has no `approval`. What to do: record the author's approval — `by`, `date`, and their words in `quote` — or make it a `baseline`.",
  ],
  [
    {
      problem: "headline-approval",
      measurement: "M1",
      why: "not-author",
      by: "an agent",
      author: "A. Author",
    },
    "`repro/studies.json`: the measurement `M1` is a `headline` one, and its `approval` is by an agent, not by the registry's `author`, A. Author. What to do: only the author approves a headline measurement; record their own approval.",
  ],
  [
    { problem: "bad-plan", id: "P1-S01", path: "plan.json", why: "missing" },
    "`repro/studies.json`: the `plan` of `P1-S01`, `plan.json`, is not a file in its folder. What to do: write the plan there (its fields are on the rule's page), or correct the row's `plan`.",
  ],
  [
    { problem: "bad-plan", id: "P1-S01", path: "../plan.json", why: "outside" },
    "`repro/studies.json`: the `plan` of `P1-S01`, `../plan.json`, is outside its folder. What to do: keep the plan in the study's folder, as `plan.json`, and name it relative to the folder.",
  ],
  [
    {
      problem: "bad-plan",
      id: "P1-S01",
      path: "plan.json",
      why: "unreadable",
      reasons: "question: required",
    },
    "The plan of `P1-S01`, `plan.json` in its folder, is not a study plan: question: required. What to do: give it the fields on the rule's page — `question`, `population`, `arms`, `primary_outcome`.",
  ],
  [
    {
      problem: "bad-plan",
      id: "P1-S01",
      path: "plan.json",
      why: "unfilled",
      fields: ["question", "primary_outcome"],
      status: "running",
    },
    "The plan of `P1-S01`, `plan.json` in its folder, leaves `question` and `primary_outcome` empty, and the study is `running`: a plan is written before the runs. What to do: fill them in, or set the study back to `designing`.",
  ],
  [
    {
      problem: "author-check",
      id: "P1-S01",
      measurement: "M1",
      status: "running",
      why: "no-plan",
    },
    "`P1-S01` is `running` in the headline measurement `M1`, and its row names no plan to hold the author's check of the drawn units. What to do: write its plan (`plan.json` in its folder, named in the row's `plan`) with `author_check` — `by`, `date`, and the author's words in `quote`.",
  ],
  [
    {
      problem: "author-check",
      id: "P1-S01",
      measurement: "M1",
      status: "running",
      why: "missing",
    },
    "`P1-S01` is `running` in the headline measurement `M1`, and its plan has no `author_check`. What to do: show the author the drawn units, then record their answer in the plan's `author_check` — `by`, `date`, and their words in `quote`.",
  ],
  [
    {
      problem: "author-check",
      id: "P1-S01",
      measurement: "M1",
      status: "running",
      why: "not-author",
      by: "an agent",
      author: "A. Author",
    },
    "`P1-S01` is `running` in the headline measurement `M1`, and the `author_check` in its plan is by an agent, not by the registry's `author`, A. Author. What to do: only the author approves the drawn units of a headline measurement; record their own answer.",
  ],
] as const;

describe("studyMessage — the new findings stand alone", () => {
  const RULE =
    "Rule repro/study-registered: https://github.com/zernie/paperlint/blob/main/docs/rules/repro/study-registered.md";

  it.each(MESSAGES)("%j", (finding, head) => {
    expect(studyMessage(finding)).toBe(`${head}\n${RULE}`);
  });

  it("a plan under its old name names plan.json, and its own rule", () => {
    expect(
      studyMessage({
        problem: "legacy-plan",
        id: "P1-S01",
        path: "prereg.json",
      }),
    ).toBe(
      "The plan of `P1-S01` is `prereg.json`, its old name; it is read as the plan. What to do: rename it to `plan.json` in the study's folder (`git mv`) and set the row's `plan` to `plan.json`.\nRule repro/study-plan-name: https://github.com/zernie/paperlint/blob/main/docs/rules/repro/study-plan-name.md",
    );
  });
});
