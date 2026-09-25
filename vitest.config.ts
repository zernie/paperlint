import { defineConfig } from "vitest/config";

// Plain unit tests (`*.test.ts`). Agent tests (`*.harness.*`) run under `vigiles test`, not here.
// vitest exits 1 when no file matches, so an empty run is never a pass.
export default defineConfig({
  test: {
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
