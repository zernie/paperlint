/**
 * The JSON Schema `study-accepted-papers` ships for `papers.json`: generated from the parser, so the
 * fields an editor or a skill reads are the ones the record is judged by.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  SCHEMA_FILE,
  venueCorpusJsonSchema,
  venueCorpusSchemaText,
} from "./index.ts";

describe("venueCorpusJsonSchema — the shipped schema file", () => {
  const SHIPPED = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../../",
    SCHEMA_FILE,
  );

  it("🔴 is the generated schema, byte for byte", () => {
    // Guards: the schema the skill points at never drifts from the parser that judges the record.
    expect(
      readFileSync(SHIPPED, "utf8"),
      `${SCHEMA_FILE} is stale: regenerate it with \`npm run schema:venue-corpus\``,
    ).toBe(venueCorpusSchemaText());
  });

  it("🔴 says the parser checks what a schema cannot, and names the record's fields", () => {
    const schema = z
      .looseObject({
        description: z.string(),
        properties: z.looseObject({}),
      })
      .parse(venueCorpusJsonSchema());
    expect(schema.description).toContain("papers.json");
    expect(schema.description).toContain("corpus-licences.js");
    expect(Object.keys(schema.properties)).toEqual([
      "venue",
      "editions",
      "papers",
      "rebuild",
    ]);
  });
});
