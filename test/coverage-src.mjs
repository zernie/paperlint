/**
 * Preloaded by `npm run coverage` (NODE_OPTIONS=--import) in every process of the run: any import
 * that resolves to the compiled `dist/<path>.js` is answered with `src/<path>.ts` instead, which
 * Node runs by stripping types.
 *
 * WHY: without it each TypeScript module was measured TWICE — once as `src/*.ts` (vitest and the
 * harnesses import it directly) and once as `dist/*.js` remapped through tsc's source maps (the
 * CLI, spawned as `bin/paperlint.mjs`). The two copies place the same branch or function at
 * slightly different columns, so istanbul keeps both: lines merge (a line takes the higher count),
 * but branches and functions do not, and an arm the tests DID run in one copy stayed red in the
 * other. Measured on src/facts-file.ts: 88 branch entries for the file's ~45 real branches, with
 * `66:11` listed twice. One copy per module makes a red arm mean an unrun arm.
 *
 * The compiled output is still what ships and what CI runs everywhere else (`npm test` on macOS,
 * the build-e2e job through `bin/paperlint.mjs`); only the measured run reads the source.
 */
import { register } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isMainThread } from "node:worker_threads";

const self = fileURLToPath(import.meta.url);
// The run starts with a path relative to the repository root; a descendant may run elsewhere
// (a test's temp directory), so the preload is re-stated absolute for everything spawned below.
process.env.NODE_OPTIONS = (process.env.NODE_OPTIONS ?? "")
  .split(/\s+/)
  .filter((o) => o && !o.endsWith("coverage-src.mjs"))
  .concat(`--import=${self}`)
  .join(" ");

// Main threads only. vitest runs its test files in worker threads, and a loader registered there
// gives each file its own copy of `vitest` — every suite then reports "No test suite found".
// Those files import `src/*.ts` directly and need no redirect; the processes they spawn get one.
if (isMainThread)
  register(
    "data:text/javascript," +
      encodeURIComponent(
        `import { existsSync } from "node:fs";
       import { fileURLToPath } from "node:url";
       const DIST = ${JSON.stringify(new URL("../dist/", import.meta.url).href)};
       const SRC = ${JSON.stringify(new URL("../src/", import.meta.url).href)};
       export async function resolve(specifier, context, next) {
         const r = await next(specifier, context);
         if (!r.url.startsWith(DIST) || !r.url.endsWith(".js")) return r;
         const src = SRC + r.url.slice(DIST.length, -".js".length) + ".ts";
         return existsSync(fileURLToPath(src)) ? { url: src, shortCircuit: true } : r;
       }`,
      ),
    pathToFileURL(self),
  );
