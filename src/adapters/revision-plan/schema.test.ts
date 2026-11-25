/**
 * The JSON Schema `paper-pipeline` ships for `revision-plan.json`: generated from the parser, so the
 * fields an editor or a skill reads are the ones the plan is judged by.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
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
