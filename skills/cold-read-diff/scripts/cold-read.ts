#!/usr/bin/env node
/**
 * cold-read — the changed paragraphs of a paper diff, as the LaTeX source the cold read's
 * readers are given. Everything it does is in `cold-read-core.ts`; this file only runs it. A consumer runs
 * the compiled `cold-read.js` (Node strips no types under node_modules).
 *
 * Usage: node cold-read.js <paper.tex> [--base=REV] [--max=N]
 */
import { messageOf } from "#src/domain/text";
import { main } from "./cold-read-core.ts";

try {
  process.exitCode = main(process.argv.slice(2));
} catch (e) {
  process.stderr.write(`cold read: ${messageOf(e)}\n`);
  process.exitCode = 2;
}
