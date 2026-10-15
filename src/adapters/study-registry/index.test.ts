/**
 * The schema of `repro/studies.json`: the text a registry is parsed from, the extra fields a row keeps,
 * and every way a file can fail to be a registry — refused with the reasons, never read as one.
 */
import { describe, expect, it } from "vitest";
import {
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
    ["no prefix", { studies: [] }, "prefix: Invalid input: expected string, received undefined"],
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

  it.each([
    ["kind", "benchmark", 'studies.0.kind: Invalid option: expected one of "measurement"|"spike"|"tooling"|"data"|"artifact"|"salvage"'],
    ["status", "finished", 'studies.0.status: Invalid option: expected one of "designing"|"running"|"done"|"stopped"|"superseded"|"dropped"'],
    ["in_paper", "maybe", 'studies.0.in_paper: Invalid option: expected one of "yes"|"no"|"registry"'],
    ["date", "15.10.2026", "studies.0.date: Invalid ISO date"],
    ["title", "", "studies.0.title: Too small: expected string to have >=1 characters"],
    ["result", 41, "studies.0.result: Invalid input: expected string, received number"],
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
