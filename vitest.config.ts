import { defineConfig } from "vitest/config";

// Plain unit tests (`*.test.ts`). Agent tests (`*.harness.*`) run under `vigiles test`, not here.
// vitest exits 1 when no file matches, so an empty run is never a pass.
export default defineConfig({
  test: {
    // 🔴 TWO SETTINGS SO THAT `c8 npm test` SEES WHAT vitest RUNS (measured 2026-09-26: under the
    // defaults a module imported only by a *.test.ts, scripts/layer-legacy-frozen.ts, reported 0%
    // while its tests passed, and `c8 vitest run` alone reported 0 lines covered in total).
    //
    // `pool: "threads"` — the default `forks` pool ends its child processes without a normal exit,
    // so Node never writes their NODE_V8_COVERAGE file. Worker threads write theirs on teardown:
    // the same one-file run gave 0 coverage files naming the module under forks and 1 under threads.
    //
    // `viteModuleRunner: false` — native `import` instead of Vite's module runner, which evaluates
    // a TRANSFORMED copy of each module whose offsets do not match the file on disk. Native import
    // strips TypeScript types in place (whitespace-preserving), so V8's offsets are the file's.
    // Nothing here uses `vi.mock` or `import.meta.vitest`, the features the runner exists for.
    pool: "threads",
    experimental: { viteModuleRunner: false },
    include: ["**/*.test.ts", "**/*.test.mjs"],
    // `test/fixtures/` holds files that are LINTED, not run: the layer fixtures include `*.test.ts`
    // cases because a test file is one of the categories the layer rules classify.
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.tmp*/**",
      ".claude/**",
      "test/fixtures/**",
    ],
  },
});
