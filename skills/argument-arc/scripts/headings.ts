#!/usr/bin/env node
/**
 * headings — every heading of a paper, in order (`headings-core.ts`); this file only runs it. A
 * consumer runs the compiled `headings.js` (Node strips no types under node_modules).
 *
 * Usage: node headings.js <paper.tex>
 */
import { latexReader } from "#src/adapters/latex/index";
import { nodeFiles } from "#src/adapters/node/index";
import { sourcesCodec } from "#src/adapters/sources-record/index";
import { main } from "./headings-core.ts";

process.exitCode = main(
  process.argv.slice(2),
  { files: nodeFiles, latex: latexReader, codec: sourcesCodec },
  {
    out: (s) => process.stdout.write(s),
    err: (s) => process.stderr.write(s),
  },
);
