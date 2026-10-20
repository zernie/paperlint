#!/usr/bin/env node
/**
 * `npm run refresh-deadlines [-- --presets <dir>] [-- --summary <file.md>]`, which
 * .github/workflows/deadlines.yml runs from source (no `dist/`). The composition root: the command
 * line, the files, the clock, and HotCRP's adapter plugged into the port `refresh.ts` reads.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { hotcrpDeadlines } from "#src/adapters/hotcrp/index";
import { presetsDir } from "#src/package-dirs";
import { isMain } from "../../skills/paper-pipeline/scripts/consumer.mjs";
import { runRefresh, type PresetFiles } from "./refresh.ts";

/** `--presets <dir>` and `--summary <file>`; a flag without a value is no value. */
export function argsOf(argv: readonly string[]) {
  const value = (flag: string): string | null =>
    argv.includes(flag) ? (argv[argv.indexOf(flag) + 1] ?? null) : null;
  return {
    presets: value("--presets") ?? presetsDir(),
    summary: value("--summary"),
  };
}

/** The `*.jsonc` presets in `dir`, on disk. */
export const presetsIn = (dir: string): PresetFiles => ({
  names: readdirSync(dir)
    .filter((f) => f.endsWith(".jsonc"))
    .toSorted(),
  read: (name) => readFileSync(join(dir, name), "utf8"),
  write: (name, text) => {
    writeFileSync(join(dir, name), text);
  },
  path: (name) => join(dir, name),
});

/** Where the pull request's body is written: the `--summary` file, or nowhere. */
export const summaryTo = (path: string | null) =>
  path === null
    ? null
    : (text: string) => {
        writeFileSync(path, text);
      };

// `isMain`, not a comparison with `file://${argv[1]}`: that is false through a symlink (consumer.mjs).
if (isMain(import.meta.url)) {
  const args = argsOf(process.argv.slice(2));
  process.exit(
    await runRefresh({
      presets: presetsIn(args.presets),
      portal: (site) => hotcrpDeadlines({ url: site }),
      today: new Date().toISOString().slice(0, 10), // the clock, read at the edge
      log: console.log,
      summary: summaryTo(args.summary),
    }),
  );
}
