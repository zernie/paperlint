import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// site/'s own tests: the pure logic in src/ and the lint gates in test/. The repository root's
// vitest does not collect site/ (its vitest.config.ts EXCLUDE).
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    // The lint tests start ESLint with type information and Steiger's CLI: seconds, not milliseconds.
    testTimeout: 60_000,
    coverage: {
      provider: "v8",
      // Measured: the pure logic, every model segment and the shared helpers. The UI (React
      // components, shadcn's files in src/shared/ui, app/ and the pages) is not: nothing here
      // renders it, and a line count of JSX says nothing about whether the page is right.
      // A slice's index.ts is its public API and only re-exports what is measured beside it.
      include: ["src/**/model/**", "src/shared/lib/**"],
      exclude: ["**/*.test.ts", "**/index.ts"],
      reporter: ["text", "json-summary"],
      thresholds: {
        lines: 100,
        branches: 100,
        functions: 100,
        statements: 100,
      },
    },
  },
});
