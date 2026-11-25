#!/usr/bin/env node
/**
 * Regenerates the JSON Schema of a paper's revision-plan.json from the plan's parser
 * (`src/adapters/revision-plan`) into the file it is given. `npm run schema:revision-plan` writes the
 * shipped one (`SCHEMA_FILE`); a test fails until the committed file is the one this writes.
 *
 * Usage: node revision-plan-schema.ts <output-file>
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { revisionPlanSchemaText } from "#src/adapters/revision-plan/index";

const [out, ...rest] = process.argv.slice(2);
if (out === undefined || rest.length > 0) {
  process.stderr.write("usage: node revision-plan-schema.ts <output-file>\n");
  process.exitCode = 2;
} else writeFileSync(resolve(out), revisionPlanSchemaText());
