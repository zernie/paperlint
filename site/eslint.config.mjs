// site/'s own lint: typed TypeScript, React's hook rules, Next's rules, and Tailwind class names
// held to the design tokens of src/app/styles/globals.css. The repository root's eslint.config.mjs
// ignores site/; test/lint/eslint.test.ts proves this config fires and stays quiet.
import path from "node:path";
import js from "@eslint/js";
import nextPlugin from "@next/eslint-plugin-next";
import reactHooks from "eslint-plugin-react-hooks";
import tailwind from "eslint-plugin-tailwindcss";
import { defineConfig } from "eslint/config";
import * as R from "remeda";
import tseslint from "typescript-eslint";

/** The one CSS entry the class-name rules read the theme from, resolved from this file. */
const cssConfigPath = path.join(
  import.meta.dirname,
  "src/app/styles/globals.css",
);

/** A plugin's preset with every "warn" raised to "error": a warning nobody fails on is a dead check. */
const strict = (config) => ({
  ...config,
  rules: R.mapValues(config.rules ?? {}, (level) =>
    level === "warn" ? "error" : level,
  ),
});

export default defineConfig([
  {
    // test/lint/fixtures/ holds planted defects; test/lint/eslint.test.ts lints them on purpose.
    ignores: [
      ".next/",
      "out/",
      "coverage/",
      "next-env.d.ts",
      "test/lint/fixtures/",
    ],
  },
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  // Linted without type information: the config files import untyped plugins, and
  // CLAUDE.md.spec.ts imports vigiles from the repository root's install (site/tsconfig.json
  // leaves it out, so `next build` does not need the root's node_modules).
  {
    files: ["**/*.mjs", "CLAUDE.md.spec.ts"],
    ...tseslint.configs.disableTypeChecked,
  },
  strict(reactHooks.configs.flat.recommended),
  strict(nextPlugin.configs["core-web-vitals"]),
  {
    ...strict(tailwind.configs.recommended),
    settings: { tailwindcss: { cssConfigPath } },
    rules: {
      ...strict(tailwind.configs.recommended).rules,
      // No `w-[13px]`, `text-[#fff]`: a size or a colour is a token in globals.css.
      "tailwindcss/no-arbitrary-value": "error",
      // No `bg-red-500`: Tailwind's palette is cleared, so a class outside the theme is unknown.
      "tailwindcss/no-custom-classname": "error",
      "tailwindcss/classnames-order": "error",
    },
  },
]);
