#!/usr/bin/env node
/**
 * SHIM. The real CLI lives in `src/*.ts` and builds to `dist/`; this file stays put and
 * remains JavaScript deliberately.
 *
 * 🔴 WHY NOT MOVE `bin` TO `dist/cli.js`. This path is a PUBLIC CONTRACT, and it already has
 * two consumers outside the package:
 *   1. `plugin/hooks/hooks.json` calls
 *        node "${CLAUDE_PROJECT_DIR}/node_modules/research-paper-pipeline/bin/rpp.mjs" hook <name>
 *      — the hook wiring was fixed exactly because it addressed a file the consumer did not have;
 *      changing it the next day would be the same class of error;
 *   2. README documents `import { buildConfig } from "research-paper-pipeline/bin/rpp.mjs"`.
 * A move would cost both, and yield zero: a file name says nothing about what language it is in.
 *
 * 🔴 AND WHY THE FAILURE HERE IS LOUD. A consumer who installed the package from the registry
 * has `dist/` in the tarball ready — this IS MEASURED (`npm pack --dry-run`: 16 files `dist/*`), and
 * it is kept by the `files` allowlist in the manifest. The list is not for show: without the `files` field,
 * npm used `.gitignore` as the exclusion list, and `dist/` in it would eject the build from the package —
 * 376 files became 360, and the consumer got exactly this refusal. The check stays for two cases where
 * `dist/` can genuinely be missing: a clone before `npm run build` and installing the package as a git
 * dependency with `--ignore-scripts` (so `prepare` does not run). Without it, both would yield `ERR_MODULE_NOT_FOUND`
 * from deep in the loader: a message about a file the consumer did not write, and no hint what to do.
 */
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const dist = new URL("../dist/cli.js", import.meta.url);
if (!existsSync(fileURLToPath(dist))) {
  process.stderr.write(
    `research-paper-pipeline: not built — ${fileURLToPath(dist)} missing.\n` +
      `The package is written in TypeScript; in the registry tarball \`dist/\` already lies built, so\n` +
      `you reach here from a repository clone or a git dependency installed with\n` +
      `\`--ignore-scripts\` (so the \`prepare\` step is skipped).\n` +
      `In a clone: \`npm run build\`. For a git dependency: reinstall without \`--ignore-scripts\`.\n`,
  );
  process.exit(2);
}
export * from "../dist/cli.js";
const { run, isMain } = await import("../dist/cli.js");
// The question is about THIS file, not `dist/cli.js`: `bin` is the target of a symlink from
// `node_modules/.bin`, and `isMain` can compare it to the real path. For `cli.js` itself
// the answer is now always "no" — it is imported, not invoked.
if (isMain(import.meta.url)) process.exit(await run(process.argv.slice(2)));
