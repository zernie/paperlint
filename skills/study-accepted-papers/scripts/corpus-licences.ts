#!/usr/bin/env node
/**
 * corpus-licences — for each paper of a venue corpus and each kind (text, PDF), the copy whose
 * licence permits keeping it, or why none does (`corpus-licences-core.ts`); this file only runs it.
 * A consumer runs the compiled `corpus-licences.js` (Node strips no types under node_modules).
 *
 * Usage: node corpus-licences.js <corpus-dir>
 */
import { nodeFiles } from "#src/adapters/node/index";
import { venueCorpusCodec } from "#src/adapters/venue-corpus/index";
import { main } from "./corpus-licences-core.ts";

process.exitCode = main(
  process.argv.slice(2),
  { files: nodeFiles, codec: venueCorpusCodec },
  {
    out: (s) => process.stdout.write(s),
    err: (s) => process.stderr.write(s),
  },
);
