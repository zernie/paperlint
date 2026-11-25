#!/usr/bin/env node
/**
 * revision-plan — what a paper's `revision-plan.json` says is left before it is submitted
 * (`revision-plan-core.ts`); this file only runs it. A consumer runs the compiled `revision-plan.js`
 * (Node strips no types under node_modules).
 *
 * Usage: node revision-plan.js <paper-dir>
 */
import { nodeFiles } from "#src/adapters/node/index";
import { revisionPlanCodec } from "#src/adapters/revision-plan/index";
import { presetsDir } from "#src/package-dirs";
import { main } from "./revision-plan-core.ts";

process.exitCode = main(
  process.argv.slice(2),
  { files: nodeFiles, codec: revisionPlanCodec, venuesDir: presetsDir() },
  {
    out: (s) => process.stdout.write(s),
    err: (s) => process.stderr.write(s),
  },
);
