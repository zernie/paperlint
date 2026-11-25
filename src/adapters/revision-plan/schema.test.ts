/**
 * The JSON Schema `paper-pipeline` ships for `revision-plan.json`: generated from the parser, so the
 * fields an editor or a skill reads are the ones the plan is judged by.
 */
import Ajv from "ajv";
import { omit } from "remeda";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { PLAN } from "../../../test/revision-plan-fixture.ts";
import {
  parseRevisionPlan,
  revisionPlanJsonSchema,
  revisionPlanSchemaText,
  SCHEMA_FILE,
} from "./index.ts";

describe("revisionPlanJsonSchema — the shipped schema file", () => {
  const SHIPPED = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../../",
    SCHEMA_FILE,
  );

  it("🔴 is the generated schema, byte for byte", () => {
    // Guards: the schema the skill points at never drifts from the parser that judges the plan.
    expect(
      readFileSync(SHIPPED, "utf8"),
      `${SCHEMA_FILE} is stale: regenerate it with \`npm run schema:revision-plan\``,
    ).toBe(revisionPlanSchemaText());
  });

  it("🔴 says the rule checks what a schema cannot, and names the plan's fields", () => {
    const schema = z
      .looseObject({
        description: z.string(),
        properties: z.looseObject({}),
      })
      .parse(revisionPlanJsonSchema());
    expect(schema.description).toContain("revision-plan/record");
    expect(Object.keys(schema.properties)).toEqual([
      "cycle",
      "written",
      "bar",
      "measurement",
      "remaining",
    ]);
  });
});

/**
 * ajv 6 reads draft-07, so the 2020-12 `$schema` is left out, as an editor's draft-07 validator would
 * read the file; every keyword the generated schema uses means the same in both.
 */
const schemaAccepts = (plan: unknown): boolean => {
  const schema = omit(
    z.looseObject({ $schema: z.string() }).parse(revisionPlanJsonSchema()),
    ["$schema"],
  );
  return new Ajv({ allErrors: true }).validate(schema, plan) === true;
};

const [, R2, , R4] = PLAN.remaining;
const ENOUGH = { kind: "enough", since: "2026-12-01" };
const withFinding = (file: string) => ({
  ...PLAN,
  remaining: [{ ...R2, from: { kind: "finding", file, finding: 3 } }],
});

/** Defects of a single text field: the parser refuses each, so the schema must too. */
const FIELD_DEFECTS: readonly (readonly [string, unknown])[] = [
  [
    "a whitespace-only reason",
    { ...PLAN, remaining: [{ ...R4, reason: "  " }] },
  ],
  [
    "evidence above the paper folder",
    { ...PLAN, measurement: { ...ENOUGH, evidence: "../other/notes.md" } },
  ],
  [
    "an absolute evidence path",
    { ...PLAN, measurement: { ...ENOUGH, evidence: "/home/notes.md" } },
  ],
  [
    "a drive-qualified evidence path",
    { ...PLAN, measurement: { ...ENOUGH, evidence: "C:/outside/notes.md" } },
  ],
  ["a finding file with a backslash", withFinding("reviews\\a.md")],
  ["a finding file ending at `..`", withFinding("reviews/..")],
];

describe("revisionPlanJsonSchema — validates what the parser does", () => {
  it("accepts the valid plan", () => {
    // Guards: the patterns do not refuse a plan the parser takes (the quiet half).
    expect(schemaAccepts(PLAN)).toBe(true);
    expect(schemaAccepts(withFinding("reviews/a..b.md"))).toBe(true);
  });

  it.each(FIELD_DEFECTS)("🔴 refuses %s, as the parser does", (_name, plan) => {
    // Guards: a path or text the rule would report is not green in the author's editor.
    expect(parseRevisionPlan(JSON.stringify(plan)).ok).toBe(false);
    expect(schemaAccepts(plan)).toBe(false);
  });
});
