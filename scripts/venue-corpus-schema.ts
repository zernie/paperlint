#!/usr/bin/env node
/**
 * Regenerates the JSON Schema of a venue corpus's papers.json from the record's parser
 * (`src/adapters/venue-corpus`) into the file it is given. `npm run schema:venue-corpus` writes the
 * shipped one (`SCHEMA_FILE`); a test fails until the committed file is the one this writes.
 *
 * Usage: node venue-corpus-schema.ts <output-file>
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { venueCorpusSchemaText } from "#src/adapters/venue-corpus/index";

const [out, ...rest] = process.argv.slice(2);
if (out === undefined || rest.length > 0) {
  process.stderr.write("usage: node venue-corpus-schema.ts <output-file>\n");
  process.exitCode = 2;
} else writeFileSync(resolve(out), venueCorpusSchemaText());
