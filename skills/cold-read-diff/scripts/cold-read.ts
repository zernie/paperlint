#!/usr/bin/env node
/**
 * cold-read — the cold read of a paper diff, as the process a caller starts in the background.
 * Everything it does is in `cold-read-core.ts`; this file only runs it. A consumer runs the
 * compiled `cold-read.js` (Node strips no types under node_modules).
 *
 * Usage: node cold-read.js <paper.tex> [--base=REV] [--venue=NAME] [--out=PATH]
 *                          [--macros=FILE.json] [--max=N]
 */
import { main } from "./cold-read-core.ts";

try {
  process.exitCode = await main(process.argv.slice(2));
} catch (e) {
  process.stderr.write(
    `cold read: ${e instanceof Error ? e.message : String(e)}\n`,
  );
  process.exitCode = 2;
}
