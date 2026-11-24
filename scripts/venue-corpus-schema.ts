#!/usr/bin/env node
/**
 * Regenerates `skills/study-accepted-papers/papers.schema.json` from the record's parser
 * (`src/adapters/venue-corpus`). Run as `npm run schema:venue-corpus` after the parser changes; a test
 * fails until the committed file is the one this writes.
 *
 * Usage: node venue-corpus-schema.ts [<output-file>]   (default: the shipped file)
 */
import { writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  SCHEMA_FILE,
  venueCorpusSchemaText,
} from "#src/adapters/venue-corpus/index";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const [out] = process.argv.slice(2);
writeFileSync(
  out === undefined ? join(root, SCHEMA_FILE) : resolve(out),
  venueCorpusSchemaText(),
);
