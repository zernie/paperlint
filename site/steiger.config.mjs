// Feature-Sliced Design, checked by Steiger over src/ (`npm run lint`). Proven to fire by
// test/lint/steiger.test.ts on a planted violation, and to stay quiet on this tree. A .mjs file:
// the plugin's published types import @steiger/toolkit, which it does not install (0.8.2).
import fsd from "@feature-sliced/steiger-plugin";
import { defineConfig } from "steiger";

export default defineConfig([
  ...fsd.configs.recommended,
  {
    // Next's routes in app/ import from src/, and Steiger reads only src/: a slice used only by a
    // route reads as unreferenced. Back on once the pages live in src/pages.
    files: ["./src/entities/**"],
    rules: { "fsd/insignificant-slice": "off" },
  },
]);
