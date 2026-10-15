/**
 * The schema of `repro/studies.json`: the text a registry is parsed from, the extra fields a row keeps,
 * and every way a file can fail to be a registry — refused with the reasons, never read as one.
 */
import { describe, expect, it } from "vitest";
import {
  planTemplate,
  planText,
  registryText,
  type StudyRegistry,
} from "../../domain/study-registry.ts";
import { studyRegistryCodec } from "./index.ts";

const parse = studyRegistryCodec.parse;

const ROW = {
  id: "P1-S01",
  folder: "P1-S01-baseline",
  title: "Baseline pass rate",
  question: "How often does the agent pass?",
  kind: "measurement",
  status: "done",
  date: "2026-10-15",
  result: "41 of 60 pass",
  result_file: "results.tsv",
  superseded_by: "P1-S02",
  in_paper: "yes",
} as const;

const text = (v: unknown): string => JSON.stringify(v);
const withRow = (row: Readonly<Record<string, unknown>>): string =>
  text({ prefix: "P1", studies: [row] });

describe("parsing a studies.json", () => {
  it("a registry parses to itself, and what registryText writes parses back", () => {
    const registry: StudyRegistry = { prefix: "P1", studies: [ROW] };
    expect(parse(text(registry))).toEqual({ ok: true, registry });
    expect(parse(registryText(registry))).toEqual({ ok: true, registry });
  });

  it("the optional fields may be absent", () => {
    const { result, result_file, superseded_by, ...row } = ROW;
    expect([result, result_file, superseded_by]).toHaveLength(3);
    expect(parse(withRow(row))).toEqual({
      ok: true,
      registry: { prefix: "P1", studies: [row] },
    });
  });

  it("🔴 a row's extra fields are kept, whatever they hold", () => {
    const row = {
      ...ROW,
      role: "counted",
      frame: { population: 4210 },
      rules_under_test: ["a", "b"],
      author_check: null,
    };
    expect(parse(withRow(row))).toEqual({
      ok: true,
      registry: { prefix: "P1", studies: [row] },
    });
  });

  it("an empty registry parses", () => {
    expect(parse(text({ prefix: "AB2", studies: [] }))).toEqual({
      ok: true,
      registry: { prefix: "AB2", studies: [] },
    });
  });
});

describe("refusing what is not a registry", () => {
  it("text that is not JSON", () => {
    expect(parse("{ prefix: P1")).toEqual({ ok: false, why: "not JSON" });
  });

  it.each([
    [
      "no prefix",
      { studies: [] },
      "prefix: Invalid input: expected string, received undefined",
    ],
    [
      "a prefix of another shape",
      { prefix: "p1", studies: [] },
      "prefix: a capital letter, then capitals or digits (P1)",
    ],
    [
      "an unknown top-level key",
      { prefix: "P1", studies: [], studys: [] },
      '(top): Unrecognized key: "studys"',
    ],
    [
      "studies not a list",
      { prefix: "P1", studies: {} },
      "studies: Invalid input: expected array, received object",
    ],
  ])("%s", (_why, v, why) => {
    expect(parse(text(v))).toEqual({ ok: false, why });
  });
});

describe("refusing a row that is not a study", () => {
  it.each([
    [
      "kind",
      "benchmark",
      'studies.0.kind: Invalid option: expected one of "measurement"|"spike"|"tooling"|"data"|"artifact"|"salvage"',
    ],
    [
      "status",
      "finished",
      'studies.0.status: Invalid option: expected one of "designing"|"running"|"done"|"stopped"|"superseded"|"dropped"',
    ],
    [
      "in_paper",
      "maybe",
      'studies.0.in_paper: Invalid option: expected one of "yes"|"no"|"registry"',
    ],
    ["date", "15.10.2026", "studies.0.date: Invalid ISO date"],
    [
      "title",
      "",
      "studies.0.title: Too small: expected string to have >=1 characters",
    ],
    [
      "result",
      41,
      "studies.0.result: Invalid input: expected string, received number",
    ],
  ])("a row whose %s is %j", (field, value, why) => {
    expect(parse(withRow({ ...ROW, [field]: value }))).toEqual({
      ok: false,
      why,
    });
  });

  it("every reason, joined", () => {
    const { question, ...row } = ROW;
    expect(question).toBeDefined();
    expect(parse(text({ prefix: 1, studies: [row] }))).toEqual({
      ok: false,
      why: "prefix: Invalid input: expected string, received number; studies.0.question: Invalid input: expected string, received undefined",
    });
  });
});

/** A registry with every key above the studies. */
const FULL = {
  prefix: "P1",
  author: "A. Author",
  requirements: [
    {
      id: "R1",
      text: "Every sample is a random draw from all rules found.",
      date: "2026-10-10",
      source: "chat",
    },
  ],
  measurements: [
    {
      id: "M1",
      title: "Rule census",
      rq: "RQ1",
      role: "headline",
      approval: {
        by: "A. Author",
        date: "2026-10-12",
        quote: "This is the one.",
        source: "review comment",
      },
      requirements: ["R1"],
      frame: "all rules found",
    },
    { id: "M2", title: "Baseline", role: "baseline" },
  ],
  studies: [{ ...ROW, measurement: "M1", plan: "plan.json" }],
};

describe("the keys above the studies: author, requirements, measurements", () => {
  it("a registry with all of them parses to itself, a measurement's extra fields kept", () => {
    expect(parse(text(FULL))).toEqual({ ok: true, registry: FULL });
  });
});

describe("refusing what is not a measurement, a requirement or a plan path", () => {
  it.each([
    [
      "a role that is neither",
      { ...FULL, measurements: [{ id: "M1", title: "x", role: "main" }] },
      'measurements.0.role: Invalid option: expected one of "headline"|"baseline"',
    ],
    [
      "an approval without the author's words",
      {
        ...FULL,
        measurements: [
          {
            id: "M1",
            title: "x",
            role: "headline",
            approval: { by: "A", date: "2026-10-12" },
          },
        ],
      },
      "measurements.0.approval.quote: Invalid input: expected string, received undefined",
    ],
    [
      "a requirement with a key of its own",
      { ...FULL, requirements: [{ ...FULL.requirements[0], note: "x" }] },
      'requirements.0: Unrecognized key: "note"',
    ],
    [
      "a row's plan that is not a path",
      { ...FULL, studies: [{ ...ROW, plan: true }] },
      "studies.0.plan: Invalid input: expected string, received boolean",
    ],
  ])("refuses %s", (_why, v, why) => {
    expect(parse(text(v))).toEqual({ ok: false, why });
  });
});

/** A filled plan of a seeded draw, with keys of the paper's own in `extra`. */
const parsePlan = studyRegistryCodec.parsePlan;
const PLAN = {
  question: "How many rules can a linter check?",
  population: {
    source: "the crawl of 2026-10-01",
    draw: { kind: "seeded", method: "random", seed: 7 },
  },
  arms: [{ name: "with the linter" }, { name: "without" }],
  primary_outcome: "the share of rules checked",
  author_check: { by: "A. Author", date: "2026-10-14", quote: "Go." },
  extra: { hypotheses: ["H1"], draw_script: "tools/draw.py" },
};

/** `PLAN` with `over` merged in, as the text of a file. */
const planWith = (over: Readonly<Record<string, unknown>>): string =>
  JSON.stringify({ ...PLAN, ...over });

describe("parsing a study's plan: ready or draft", () => {
  it("a filled plan is ready, its `extra` kept as it is", () => {
    expect(parsePlan(JSON.stringify(PLAN))).toEqual({
      kind: "ready",
      plan: PLAN,
    });
  });

  it("a census draws all: no seed", () => {
    const census = {
      ...PLAN,
      population: {
        source: "every rule found",
        draw: { kind: "all", method: "census" },
      },
      arms: [],
    };
    expect(parsePlan(JSON.stringify(census))).toEqual({
      kind: "ready",
      plan: census,
    });
  });

  it("the template studies new writes is a draft of a census, naming every empty text", () => {
    expect(planTemplate().population.draw).toEqual({ kind: "all", method: "" });
    expect(parsePlan(planText(planTemplate()))).toEqual({
      kind: "draft",
      plan: planTemplate(),
      empty: [
        "question",
        "population.source",
        "population.draw.method",
        "primary_outcome",
      ],
    });
  });

  it("a text of white space only is empty", () => {
    const plan = { ...PLAN, primary_outcome: "  ", author_check: null };
    expect(parsePlan(JSON.stringify(plan))).toEqual({
      kind: "draft",
      plan,
      empty: ["primary_outcome"],
    });
  });
});

describe("parsing a study's plan: no contradictory state", () => {
  it.each([
    [
      "an author_check on a draft: the author approved a plan with empty texts",
      planWith({ question: "", primary_outcome: " " }),
      "author_check: is set, and the plan leaves `question`, `primary_outcome` empty — the author approves a complete plan: fill them, or set author_check to null",
    ],
    [
      "a seeded draw without its seed",
      planWith({
        population: {
          source: "x",
          draw: { kind: "seeded", method: "random" },
        },
      }),
      "population.draw.seed: Invalid input",
    ],
    [
      "a seeded draw whose seed is null",
      planWith({
        population: {
          source: "x",
          draw: { kind: "seeded", method: "random", seed: null },
        },
      }),
      "population.draw.seed: Invalid input",
    ],
    [
      "a draw of all that carries a seed",
      planWith({
        population: {
          source: "x",
          draw: { kind: "all", method: "census", seed: 7 },
        },
      }),
      'population.draw: Unrecognized key: "seed"',
    ],
    [
      "a draw of no known kind",
      planWith({
        population: { source: "x", draw: { method: "census" } },
      }),
      "population.draw.kind: Invalid discriminator value. Expected 'seeded' | 'all'",
    ],
  ])("refuses %s", (_why, t, why) => {
    expect(parsePlan(t)).toEqual({ kind: "unreadable", why });
  });
});

describe("parsing a study's plan: no name or fact said twice", () => {
  it.each([
    [
      "two arms of one name",
      planWith({ arms: [{ name: "a" }, { name: "b" }, { name: "a" }] }),
      "arms: more than one arm is named «a» — an arm's name is unique",
    ],
    [
      "a key in `extra` that is a field of the plan",
      planWith({ extra: { hypotheses: ["H1"], question: "x" } }),
      "extra.question: is a field of the plan itself — set it there, not in extra",
    ],
    [
      "a population size: it is derived, never stored",
      planWith({ population: { ...PLAN.population, size: 4210 } }),
      'population: Unrecognized key: "size"',
    ],
  ])("refuses %s", (_why, t, why) => {
    expect(parsePlan(t)).toEqual({ kind: "unreadable", why });
  });
});

describe("parsing a study's plan: strict at every level", () => {
  it.each([
    ["text that is not JSON", "{", "not JSON"],
    [
      "a misspelt key at the top",
      planWith({ primary_outcom: "x" }),
      '(top): Unrecognized key: "primary_outcom"',
    ],
    [
      "a misspelt key in the draw",
      planWith({
        population: {
          ...PLAN.population,
          draw: { kind: "seeded", method: "random", seed: 7, sed: 7 },
        },
      }),
      'population.draw: Unrecognized key: "sed"',
    ],
    [
      "a key of the paper's own outside `extra`",
      planWith({ hypotheses: ["H1"] }),
      '(top): Unrecognized key: "hypotheses"',
    ],
    [
      "no author_check: null is the one way to say none yet",
      planWith({ author_check: undefined }),
      "author_check: Invalid input: expected object, received undefined",
    ],
    [
      "an author_check with an empty quote",
      planWith({ author_check: { ...PLAN.author_check, quote: "" } }),
      "author_check.quote: Too small: expected string to have >=1 characters",
    ],
    [
      "an arm with a key besides its name",
      planWith({ arms: [{ name: "a", model: "m" }] }),
      'arms.0: Unrecognized key: "model"',
    ],
  ])("refuses %s", (_why, t, why) => {
    expect(parsePlan(t)).toEqual({ kind: "unreadable", why });
  });
});

/** A plan under its old name, written by hand: keys of its own, a size, no seed, no check. */
const parseLegacyPlan = studyRegistryCodec.parseLegacyPlan;
const OLD = {
  question: "How many rules can a linter check?",
  population: {
    source: "the crawl of 2026-10-01",
    about: "rules in instruction files",
    size: 4210,
    draw: { method: "random", script: "tools/draw.py" },
  },
  arms: [{ name: "with the linter", model: "m" }],
  primary_outcome: "",
  hypotheses: ["H1"],
  strata: { by: "type" },
};

describe("parsing a plan under its old name, prereg.json: loose", () => {
  it("keys of its own accepted, the top-level ones kept in `extra`; size dropped; no seed and no check: a draw of all, null", () => {
    expect(parseLegacyPlan(JSON.stringify(OLD))).toEqual({
      kind: "draft",
      plan: {
        question: "How many rules can a linter check?",
        population: {
          source: "the crawl of 2026-10-01",
          draw: { kind: "all", method: "random" },
        },
        arms: [{ name: "with the linter" }],
        primary_outcome: "",
        author_check: null,
        extra: { hypotheses: ["H1"], strata: { by: "type" } },
      },
      empty: ["primary_outcome"],
    });
  });
});

describe("parsing a plan under its old name, prereg.json: its draw", () => {
  it("a seed, and a check: a seeded draw, the check kept", () => {
    const old = {
      ...OLD,
      population: {
        source: "s",
        draw: { method: "random", seed: "a1" },
      },
      primary_outcome: "share",
      author_check: { by: "A. Author", date: "2026-10-14", quote: "Go." },
    };
    expect(parseLegacyPlan(JSON.stringify(old))).toMatchObject({
      kind: "ready",
      plan: {
        population: {
          source: "s",
          draw: { kind: "seeded", method: "random", seed: "a1" },
        },
        author_check: { by: "A. Author", date: "2026-10-14", quote: "Go." },
      },
    });
  });

  it("a seed of null is a draw of all", () => {
    const old = {
      ...OLD,
      population: { source: "s", draw: { method: "census", seed: null } },
    };
    expect(parseLegacyPlan(JSON.stringify(old))).toMatchObject({
      plan: { population: { draw: { kind: "all", method: "census" } } },
    });
  });

  it("still needs the plan's own fields", () => {
    expect(parseLegacyPlan(JSON.stringify({ hypotheses: ["H1"] }))).toEqual({
      kind: "unreadable",
      why: "question: Invalid input: expected string, received undefined; population: Invalid input: expected object, received undefined; arms: Invalid input: expected array, received undefined; primary_outcome: Invalid input: expected string, received undefined",
    });
  });

  it("text that is not JSON", () => {
    expect(parseLegacyPlan("{")).toEqual({
      kind: "unreadable",
      why: "not JSON",
    });
  });
});
