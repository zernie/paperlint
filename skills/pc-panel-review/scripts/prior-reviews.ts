#!/usr/bin/env node
/**
 * prior-reviews — whether the panel's prior-reviews seat must sit, and its points file
 * (`prior-reviews-core.ts`); this file only runs it. A consumer runs the compiled `prior-reviews.js`
 * (Node strips no types under node_modules).
 *
 * Usage: node prior-reviews.js <paper-dir>
 */
import { nodeFiles } from "#src/adapters/node/index";
import { main } from "./prior-reviews-core.ts";

process.exitCode = main(
  process.argv.slice(2),
  { files: nodeFiles },
  {
    out: (s) => process.stdout.write(s),
    err: (s) => process.stderr.write(s),
  },
);
