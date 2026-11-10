#!/usr/bin/env node
/**
 * cold-read — the cold read's command: the readers' prompts, and the report from their answers.
 * Everything it does is in `cold-read-core.ts` and `cold-read-report.ts`; this file only runs it.
 * A consumer runs the compiled `cold-read.js` (Node strips no types under node_modules).
 *
 * Usage: node cold-read.js <paper.tex> [--venue=NAME] [--base=REV] [--macros=FILE.json] [--max=N]
 *        node cold-read.js report <paper.tex> --engineer=FILE|none --reviewer=FILE|none [--out=PATH] [same flags]
 */
import { main } from "./cold-read-core.ts";

try {
  process.exitCode = main(process.argv.slice(2));
} catch (e) {
  process.stderr.write(
    `cold read: ${e instanceof Error ? e.message : String(e)}\n`,
  );
  process.exitCode = 2;
}
