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

describe("parsing a study's plan", () => {
  const parsePlan = studyRegistryCodec.parsePlan;
  const PLAN = {
    question: "How many rules can a linter check?",
    population: {
      source: "the crawl of 2026-10-01",
      size: 4210,
      draw: { method: "random", seed: 7, script: "tools/draw.py" },
    },
    arms: [{ name: "with the linter", model: "m" }],
    primary_outcome: "the share of rules checked",
    author_check: { by: "A. Author", date: "2026-10-14", quote: "Go." },
    hypotheses: ["H1"],
  };

  it("a plan parses to itself, its extra fields kept", () => {
    expect(parsePlan(JSON.stringify(PLAN))).toEqual({ ok: true, plan: PLAN });
  });

  it("the template studies new writes parses", () => {
    expect(parsePlan(planText(planTemplate()))).toEqual({
      ok: true,
      plan: planTemplate(),
    });
  });

  it.each([
    ["text that is not JSON", "{", "not JSON"],
    [
      "no question and no draw",
      JSON.stringify({
        ...PLAN,
        question: undefined,
        population: { source: "x" },
      }),
      "question: Invalid input: expected string, received undefined; population.draw: Invalid input: expected object, received undefined",
    ],
    [
      "a size that is not a whole number",
      JSON.stringify({
        ...PLAN,
        population: { ...PLAN.population, size: 0.5 },
      }),
      "population.size: Invalid input: expected int, received number",
    ],
    [
      "an author_check with an empty quote",
      JSON.stringify({
        ...PLAN,
        author_check: { ...PLAN.author_check, quote: "" },
      }),
      "author_check.quote: Too small: expected string to have >=1 characters",
    ],
    [
      "an arm without a name",
      JSON.stringify({ ...PLAN, arms: [{ model: "m" }] }),
      "arms.0.name: Invalid input: expected string, received undefined",
    ],
  ])("refuses %s", (_why, t, why) => {
    expect(parsePlan(t)).toEqual({ ok: false, why });
  });
});
