import { defineConfig } from "vitest/config";

// Unit tests (`*.test.ts`, project `unit`) and the end-to-end runs (`*.e2e.ts`, one project per
// environment they need). Agent tests (`*.harness.*`) run under `vigiles test`, not here.
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
    // `test/fixtures/` holds files that are LINTED, not run: the layer fixtures include `*.test.ts`
    // cases because a test file is one of the categories the layer rules classify.
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.tmp*/**",
      ".claude/**",
      "test/fixtures/**",
    ],
    // One project per environment a test needs. A new e2e file is found by its directory and its
    // `.e2e.ts` suffix — no list of files exists in package.json, scripts/check.ts or CI.
    projects: [
      {
        extends: true,
        test: { name: "unit", include: ["**/*.test.ts", "**/*.test.mjs"] },
      },
      // The package as users install it: `npm pack`, then npm and pnpm. Needs both managers.
      {
        extends: true,
        test: {
          name: "e2e-install",
          // One file at a time: each e2e drives real processes that are slow and share a machine.
          fileParallelism: false,
          include: ["test/e2e/install/**/*.e2e.ts"],
          testTimeout: 10 * 60_000,
          hookTimeout: 10 * 60_000,
        },
      },
      // A real TeX Live: paperlint's own toolchain, builds, banal. Needs `paperlint toolchain`.
      {
        extends: true,
        test: {
          name: "e2e-tex",
          // One file at a time: the builds and `paperlint toolchain` share one TeX Live tree.
          fileParallelism: false,
          include: ["test/e2e/tex/**/*.e2e.ts"],
          testTimeout: 20 * 60_000,
          hookTimeout: 20 * 60_000,
        },
      },
    ],
  },
});
