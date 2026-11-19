// Feature-Sliced Design, checked by Steiger over src/ (`npm run lint`). Proven to fire by
// test/lint/steiger.test.ts on a planted violation, and to stay quiet on this tree. A .mjs file:
// the plugin's published types import @steiger/toolkit, which it does not install (0.8.2).
import fsd from "@feature-sliced/steiger-plugin";
import { defineConfig } from "steiger";

export default defineConfig([
  ...fsd.configs.recommended,
  {
    // A one-page site: every widget, feature and entity has exactly one consumer, the home page,
    // by construction, so "merge it into its one consumer" would fold the whole page into one file.
    // Back on when a second page exists.
    files: ["./src/widgets/**", "./src/features/**", "./src/entities/**"],
    rules: { "fsd/insignificant-slice": "off" },
  },
]);
