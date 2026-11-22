import { defineConfig } from "vitest/config";

// site/'s browser tests: Chromium on the exported page in out/, so they run after `next build`
// (`npm run test:browser`), outside `npm run test` and its coverage of the pure logic.
export default defineConfig({
  test: {
    include: ["test/browser/**/*.browser.ts"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
