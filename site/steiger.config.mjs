// Feature-Sliced Design, checked by Steiger over src/ (`npm run lint`). Proven to fire by
// test/lint/steiger.test.ts on a planted violation, and to stay quiet on this tree. A .mjs file:
// the plugin's published types import @steiger/toolkit, which it does not install (0.8.2).
import fsd from "@feature-sliced/steiger-plugin";
import { defineConfig } from "steiger";

export default defineConfig([
  ...fsd.configs.recommended,
  {
    // Two pages, and /integrations shares only the header, the footer and the copy button with
    // the home page: most widgets and entities have exactly one consumer by construction, so
    // "merge it into its one consumer" would fold the home page into one file.
    files: ["./src/widgets/**", "./src/features/**", "./src/entities/**"],
    rules: { "fsd/insignificant-slice": "off" },
  },
]);
