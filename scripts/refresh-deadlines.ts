#!/usr/bin/env node
/**
 * `npm run refresh-deadlines [-- --presets <dir>] [-- --summary <file.md>]` — the entry of the
 * scheduled refresh of the shipped presets' deadlines (`.github/workflows/deadlines.yml`). It reads
 * the command line and the clock, wires the adapters, and runs the use case in
 * `src/refresh-deadlines.ts`; the comparison is `src/domain/deadline-refresh.ts`, the JSONC
 * rewriting `src/adapters/jsonc/`.
 *
 * The npm script runs it with `--conditions=paperlint-source`, so it needs no `dist/`: the job
 * installs with `--ignore-scripts` and builds nothing. `scripts/refresh-deadlines.test.ts` runs that
 * npm script under `test/no-dist.ts` on every pull request.
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isMain } from "../skills/paper-pipeline/scripts/consumer.mjs";
import { hotcrpDeadlines } from "../src/adapters/hotcrp/index.ts";
import { jsoncPresets } from "../src/adapters/jsonc/index.ts";
import { presetFilesIn } from "../src/adapters/node/index.ts";
import { runRefresh } from "../src/refresh-deadlines.ts";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

/** `--presets <dir>` and `--summary <file>` from the command line. */
export function argsOf(argv: readonly string[]): {
  readonly presets: string;
  readonly summary: string | null;
} {
  const value = (flag: string): string | null => {
    const i = argv.indexOf(flag);
    return i === -1 ? null : (argv[i + 1] ?? null);
  };
  return {
    presets: value("--presets") ?? join(ROOT, "presets"),
    summary: value("--summary"),
  };
}

/** Where the pull request's body is written: the `--summary` file, or nowhere. */
export const summaryWriter = (
  path: string | null,
): ((text: string) => void) | null =>
  path === null
    ? null
    : (text) => {
        writeFileSync(path, text);
      };

// `isMain`, not a comparison with `file://${argv[1]}`: that is false through a symlink (consumer.mjs).
if (isMain(import.meta.url)) {
  const args = argsOf(process.argv.slice(2));
  const summary = args.summary;
  process.exit(
    await runRefresh({
      presets: presetFilesIn(args.presets),
      portal: (site) => hotcrpDeadlines({ url: site }),
      rewriter: jsoncPresets,
      // The clock is read here, at the edge: the day a reading was taken.
      today: new Date().toISOString().slice(0, 10),
      log: console.log,
      summary: summaryWriter(summary),
    }),
  );
}
